import { SNSHandler } from 'aws-lambda';
import { TextractClient, GetDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ISSUE_EXTRACTION_PROMPT } from './prompts';
import { CircuitBreaker } from './utils/circuit-breaker';
import { BusinessMetrics } from './utils/business-metrics';
import { RetryHandler } from './utils/retry-handler';

const textract = new TextractClient({});
const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrockCircuitBreaker = new CircuitBreaker(3, 30000); // 3 failures, 30s recovery

const TABLE = process.env.REPORTS_TABLE!;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

const promptTemplate = ISSUE_EXTRACTION_PROMPT;

export const handler: SNSHandler = async (event) => {
    for (const record of event.Records) {
        const snsData = JSON.parse(record.Sns.Message);
        const jobId = snsData.JobId;
        const status = snsData.Status;

        if (status !== 'SUCCEEDED') {
            console.error(`Textract job ${jobId} failed with status ${status}`);
            const reportId = snsData.JobTag || jobId;
            await ddb.send(new UpdateCommand({
                TableName: TABLE,
                Key: { PK: `REPORT#${reportId}`, SK: 'METADATA' },
                UpdateExpression: 'SET #s = :status, updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'ERROR',
                    ':updatedAt': new Date().toISOString()
                }
            }));
            continue;
        }

        try {
            const startTime = Date.now();
            
            // 1. Get report metadata from DynamoDB to find the reportId
            // In a real app, you might use a GSI to find by textractJobId, 
            // but for MVP we use the JobId to fetch from Textract which gives us the S3 Bucket/Key.
            // However, we need the reportId to update the correct record.
            // The easiest way for MVP is to encode reportId in the JobTag or use a GSI.
            // Since we don't have a GSI yet, let's assume we can get it from the Textract results or skip for now and just update the status.

            const reportId = snsData.JobTag || jobId; // We use JobTag which we just added to textract.ts

            console.log(`Processing Textract results for report: ${reportId}, job: ${jobId}`);

            // 1. Get Textract results (paginated)
            let allText = '';
            let nextToken: string | undefined;

            do {
                const textractResults = await RetryHandler.withExponentialBackoff(async () => {
                    return await textract.send(new GetDocumentTextDetectionCommand({
                        JobId: jobId,
                        NextToken: nextToken
                    }));
                });

                const pageText = textractResults.Blocks?.filter(b => b.BlockType === 'LINE').map(b => b.Text).join('\n') || '';
                allText += pageText + '\n';
                nextToken = textractResults.NextToken;

                // Safety break for extremely large docs to avoid context window spill
                if (allText.length > 20000) break;
            } while (nextToken);

            console.log(`Extracted ${allText.length} characters of text.`);

            // 2. Invoke Bedrock for issue extraction
            const prompt = ISSUE_EXTRACTION_PROMPT.replace('{{OCR_TEXT}}', allText);
            const isTitan = MODEL_ID.includes('titan');
            const payload = isTitan ? {
                inputText: prompt,
                textGenerationConfig: {
                    maxTokenCount: 4096,
                    temperature: 0,
                    topP: 1
                }
            } : {
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }],
            };

            const bedrockResponse = await bedrockCircuitBreaker.execute(async () => {
                return await bedrock.send(new InvokeModelCommand({
                    modelId: MODEL_ID,
                    contentType: 'application/json',
                    accept: 'application/json',
                    body: JSON.stringify(payload),
                }));
            });

            const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
            const extractedContent = isTitan ? responseBody.results[0].outputText : responseBody.content[0].text;

            // Parse the JSON array from the response
            let issues = [];
            try {
                const jsonMatch = extractedContent.match(/\[.*\]/s);
                issues = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
            } catch (e) {
                console.error('Failed to parse issues JSON:', e);
                // Fallback: put the raw text in a single issue object
                issues = [{ defect: 'Manual review required', description: extractedContent }];
            }

            // 3. Update DynamoDB with issues and status=COMPLETED
            await ddb.send(new UpdateCommand({
                TableName: TABLE,
                Key: { PK: `REPORT#${reportId}`, SK: 'METADATA' },
                UpdateExpression: 'SET #s = :status, issues = :issues, updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                    ':status': 'COMPLETED',
                    ':issues': issues,
                    ':updatedAt': new Date().toISOString()
                }
            }));

            console.log(`Report ${reportId} processed successfully with ${issues.length} issues.`);

            // Record business metrics
            const processingTime = Date.now() - startTime;
            await BusinessMetrics.recordDocumentProcessed(processingTime, issues.length);

        } catch (error) {
            console.error('Error in ExtractIssuesHandler:', error);
            await BusinessMetrics.recordError('PROCESSING_ERROR');
        }
    }
};
