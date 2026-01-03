import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.REPORTS_TABLE!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const reportId = event.pathParameters?.id;

        if (!reportId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Report ID is required' }),
            };
        }

        const result = await ddb.send(
            new GetCommand({
                TableName: TABLE,
                Key: {
                    PK: `REPORT#${reportId}`,
                    SK: 'METADATA',
                },
            })
        );

        if (!result.Item) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Report not found' }),
            };
        }

        const report = result.Item;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reportId: report.reportId,
                status: report.status,
                createdAt: report.createdAt,
                updatedAt: report.updatedAt,
                issues: report.issues || null,
                negotiationPlan: report.negotiationPlan || null,
                negotiationStyle: report.negotiationStyle || null,
            }),
        };
    } catch (error) {
        console.error('Get report error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
