"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const crypto_1 = require("crypto");
const s3 = new client_s3_1.S3Client({});
const BUCKET = process.env.UPLOADS_BUCKET;
const handler = async (event) => {
    try {
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        if (!body.filename) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'OPTIONS,POST',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                body: JSON.stringify({ error: 'filename is required' }),
            };
        }
        // Validate file extension
        if (!body.filename.toLowerCase().endsWith('.pdf')) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Only PDF files are supported' }),
            };
        }
        // Generate unique report ID
        const reportId = (0, crypto_1.randomUUID)();
        const key = `uploads/${reportId}/${body.filename}`;
        // Create presigned URL
        const command = new client_s3_1.PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: body.contentType || 'application/pdf',
        });
        const expiresIn = 900; // 15 minutes
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn });
        const response = {
            reportId,
            uploadUrl,
            expiresIn,
        };
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('Upload handler error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization'
            },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
