"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_textract_1 = require("@aws-sdk/client-textract");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const textract = new client_textract_1.TextractClient({});
const ddb = lib_dynamodb_1.DynamoDBDocumentClient.from(new client_dynamodb_1.DynamoDBClient({}));
const TABLE = process.env.REPORTS_TABLE;
const handler = async (event) => {
    for (const record of event.Records) {
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        // Extract reportId from key (uploads/{reportId}/{filename})
        const keyParts = key.split('/');
        if (keyParts.length < 3 || keyParts[0] !== 'uploads') {
            console.log(`Skipping non-upload key: ${key}`);
            continue;
        }
        const reportId = keyParts[1];
        console.log(`Starting Textract for report ${reportId}, bucket: ${bucket}, key: ${key}`);
        try {
            // Start async Textract job
            const textractResponse = await textract.send(new client_textract_1.StartDocumentTextDetectionCommand({
                DocumentLocation: {
                    S3Object: {
                        Bucket: bucket,
                        Name: key,
                    },
                },
                JobTag: reportId,
                NotificationChannel: process.env.TEXTRACT_SNS_TOPIC_ARN
                    ? {
                        SNSTopicArn: process.env.TEXTRACT_SNS_TOPIC_ARN,
                        RoleArn: process.env.TEXTRACT_SNS_ROLE_ARN,
                    }
                    : undefined,
            }));
            const jobId = textractResponse.JobId;
            console.log(`Textract job started: ${jobId}`);
            // Store initial report record in DynamoDB
            await ddb.send(new lib_dynamodb_1.PutCommand({
                TableName: TABLE,
                Item: {
                    PK: `REPORT#${reportId}`,
                    SK: 'METADATA',
                    reportId,
                    status: 'PROCESSING',
                    textractJobId: jobId,
                    s3Key: key,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            }));
            console.log(`Report ${reportId} saved with status PROCESSING`);
        }
        catch (error) {
            console.error(`Error processing ${key}:`, error);
            // Store error state
            await ddb.send(new lib_dynamodb_1.PutCommand({
                TableName: TABLE,
                Item: {
                    PK: `REPORT#${reportId}`,
                    SK: 'METADATA',
                    reportId,
                    status: 'ERROR',
                    error: String(error),
                    s3Key: key,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            }));
            throw error;
        }
    }
};
exports.handler = handler;
