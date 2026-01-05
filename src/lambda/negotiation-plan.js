"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_bedrock_runtime_1 = require("@aws-sdk/client-bedrock-runtime");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const prompts_1 = require("./prompts");
const circuit_breaker_1 = require("./utils/circuit-breaker");
const business_metrics_1 = require("./utils/business-metrics");
const bedrock = new client_bedrock_runtime_1.BedrockRuntimeClient({});
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const bedrockCircuitBreaker = new circuit_breaker_1.CircuitBreaker(3, 30000);
const TABLE = process.env.REPORTS_TABLE;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const promptTemplate = prompts_1.NEGOTIATION_PLAN_PROMPT;
const handler = async (event) => {
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
        const getResult = await ddb.send(new lib_dynamodb_1.GetCommand({
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
            return await bedrock.send(new client_bedrock_runtime_1.InvokeModelCommand({
                modelId: MODEL_ID,
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify(payload),
            }));
        });
        const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
        const plan = isTitan ? responseBody.results[0].outputText : responseBody.content[0].text;
        // Save plan to DynamoDB
        await ddb.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLE,
            Item: {
                ...report,
                negotiationPlan: plan,
                negotiationStyle: style,
                updatedAt: new Date().toISOString()
            }
        }));
        // Record business metrics
        await business_metrics_1.BusinessMetrics.recordNegotiationPlanGenerated(plan.length);
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
    }
    catch (error) {
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
exports.handler = handler;
