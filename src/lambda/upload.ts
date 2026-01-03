import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const s3 = new S3Client({});
const BUCKET = process.env.UPLOADS_BUCKET!;

interface UploadRequest {
    filename: string;
    contentType?: string;
}

interface UploadResponse {
    reportId: string;
    uploadUrl: string;
    expiresIn: number;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Parse request body
        const body: UploadRequest = JSON.parse(event.body || '{}');

        if (!body.filename) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
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
        const reportId = randomUUID();
        const key = `uploads/${reportId}/${body.filename}`;

        // Create presigned URL
        const command = new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ContentType: body.contentType || 'application/pdf',
        });

        const expiresIn = 900; // 15 minutes
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn });

        const response: UploadResponse = {
            reportId,
            uploadUrl,
            expiresIn,
        };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
        };
    } catch (error) {
        console.error('Upload handler error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
