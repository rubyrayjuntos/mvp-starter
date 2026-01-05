import { APIGatewayProxyHandler } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NEGOTIATION_PLAN_PROMPT } from './prompts';
import { CircuitBreaker } from './utils/circuit-breaker';
import { BusinessMetrics } from './utils/business-metrics';

const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bedrockCircuitBreaker = new CircuitBreaker(3, 30000);
const TABLE = process.env.REPORTS_TABLE!;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

const promptTemplate = NEGOTIATION_PLAN_PROMPT;

export const handler: APIGatewayProxyHandler = async (event) => {
    const reportId = event.pathParameters?.id;

    if (!reportId) {
        return {
            statusCode: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({ error: 'Missing reportId' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { context = '', style = 'balanced' } = body;

        // Get extracted issues from DynamoDB
        const getResult = await ddb.send(new GetCommand({
            TableName: TABLE,
            Key: { PK: `REPORT#${reportId}`, SK: 'METADATA' }
        }));

        const report = getResult.Item;
        if (!report) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({ error: 'Report not found' })
            };
        }

        if (report.status !== 'COMPLETED' || !report.issues) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({ error: 'Issues not yet extracted' })
            };
        }

        // Invoke Bedrock for negotiation plan
        const prompt = promptTemplate
            .replace('{{ISSUES}}', JSON.stringify(report.issues, null, 2))
            .replace('{{CONTEXT}}', context)
            .replace('{{STYLE}}', style);

        const isTitan = MODEL_ID.includes('titan');
        const payload = isTitan ? {
            inputText: prompt,
            textGenerationConfig: {
                maxTokenCount: 4096,
                temperature: 0.7,
                topP: 1
            }
        } : {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2000,
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
        const plan = isTitan ? responseBody.results[0].outputText : responseBody.content[0].text;

        // Save plan to DynamoDB
        await ddb.send(new PutCommand({
            TableName: TABLE,
            Item: {
                ...report,
                negotiationPlan: plan,
                negotiationStyle: style,
                updatedAt: new Date().toISOString()
            }
        }));

        // Record business metrics
        await BusinessMetrics.recordNegotiationPlanGenerated(plan.length);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({ reportId, negotiationPlan: plan })
        };
    } catch (error) {
        console.error('Error generating plan:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({ error: 'Failed to generate negotiation plan' })
        };
    }
};
