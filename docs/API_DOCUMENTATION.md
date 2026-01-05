# InspectorAssist - API Documentation

## Overview

The InspectorAssist API provides endpoints for uploading property inspection documents, retrieving processed reports with extracted issues, and generating negotiation plans. All endpoints require authentication via AWS Cognito JWT tokens.

## Base URL
```
https://api.inspectorassist.com/v1
```

## Authentication

All API endpoints require a valid JWT token obtained from AWS Cognito User Pool.

### Authentication Header
```http
Authorization: Bearer <jwt-token>
```

### Token Acquisition
```javascript
// Using AWS Amplify
import { Auth } from 'aws-amplify';

const token = (await Auth.currentSession()).getIdToken().getJwtToken();
```

## Endpoints

### 1. Upload Document

Generate a presigned URL for uploading inspection documents to S3.

**Endpoint**: `POST /v1/reports/upload`

**Request Body**:
```json
{
  "fileName": "inspection-report.pdf",
  "fileSize": 1048576
}
```

**Request Schema**:
```typescript
interface UploadRequest {
  fileName: string;    // Original filename (must end with .pdf)
  fileSize: number;    // File size in bytes (max 50MB)
}
```

**Response**:
```json
{
  "reportId": "123e4567-e89b-12d3-a456-426614174000",
  "uploadUrl": "https://s3.amazonaws.com/bucket/uploads/123e4567-e89b-12d3-a456-426614174000.pdf?X-Amz-Algorithm=...",
  "expiresIn": 3600
}
```

**Response Schema**:
```typescript
interface UploadResponse {
  reportId: string;    // Unique identifier for the report
  uploadUrl: string;   // Presigned S3 URL for file upload
  expiresIn: number;   // URL expiration time in seconds
}
```

**Usage Example**:
```javascript
// 1. Get upload URL
const uploadResponse = await fetch('/v1/reports/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileName: 'inspection-report.pdf',
    fileSize: file.size
  })
});

const { reportId, uploadUrl } = await uploadResponse.json();

// 2. Upload file to S3
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: {
    'Content-Type': 'application/pdf'
  }
});
```

**Error Responses**:
- `400 Bad Request`: Invalid file name or size
- `401 Unauthorized`: Missing or invalid JWT token
- `413 Payload Too Large`: File size exceeds limit

---

### 2. Get Report

Retrieve a processed inspection report with extracted issues.

**Endpoint**: `GET /v1/reports/{reportId}`

**Path Parameters**:
- `reportId` (string): UUID of the report

**Response**:
```json
{
  "reportId": "123e4567-e89b-12d3-a456-426614174000",
  "fileName": "inspection-report.pdf",
  "fileSize": 1048576,
  "status": "COMPLETED",
  "uploadedAt": "2024-01-01T12:00:00.000Z",
  "updatedAt": "2024-01-01T12:05:30.000Z",
  "issues": [
    {
      "defect": "Roof leak",
      "location": "Master bedroom ceiling",
      "action": "Repair",
      "severity": "High",
      "description": "Water stains visible on ceiling indicating active leak"
    },
    {
      "defect": "Electrical outlet",
      "location": "Kitchen GFCI",
      "action": "Replace",
      "severity": "Medium", 
      "description": "GFCI outlet not functioning properly"
    }
  ],
  "negotiationPlan": "# Strategic Negotiation Plan\n\n## Critical Issues\n..."
}
```

**Response Schema**:
```typescript
interface ReportResponse {
  reportId: string;
  fileName: string;
  fileSize: number;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  uploadedAt: string;      // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp
  issues?: Issue[];        // Present when status is COMPLETED
  negotiationPlan?: string; // Present if plan has been generated
}

interface Issue {
  defect: string;          // Type of issue found
  location: string;        // Where the issue is located
  action: 'Repair' | 'Replace' | 'Further Evaluation';
  severity: 'Low' | 'Medium' | 'High';
  description: string;     // Detailed description of the issue
}
```

**Status Values**:
- `UPLOADED`: Document uploaded, processing not started
- `PROCESSING`: OCR and AI analysis in progress
- `COMPLETED`: Processing finished, issues extracted
- `ERROR`: Processing failed

**Error Responses**:
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Report ID does not exist
- `403 Forbidden`: User does not own this report

---

### 3. Generate Negotiation Plan

Create a strategic negotiation plan based on extracted issues.

**Endpoint**: `POST /v1/reports/{reportId}/plan`

**Path Parameters**:
- `reportId` (string): UUID of the report

**Request Body**:
```json
{
  "context": "First-time buyer in competitive market",
  "style": "collaborative"
}
```

**Request Schema**:
```typescript
interface NegotiationRequest {
  context: string;  // Buyer situation and market context
  style: string;    // Negotiation approach: "collaborative", "assertive", "diplomatic"
}
```

**Response**:
```json
{
  "negotiationPlan": "# Strategic Negotiation Plan\n\n## Executive Summary\n\nBased on the inspection findings, this plan prioritizes the most critical issues while maintaining a collaborative approach suitable for a competitive market.\n\n## Critical Issues Requiring Immediate Attention\n\n### 1. Roof Leak (High Priority)\n- **Issue**: Water damage visible in master bedroom ceiling\n- **Estimated Cost**: $2,500 - $4,000\n- **Negotiation Strategy**: Request immediate repair or equivalent credit\n- **Rationale**: Safety concern and potential for additional damage\n\n### 2. Electrical Safety (Medium Priority)\n- **Issue**: Non-functioning GFCI outlet in kitchen\n- **Estimated Cost**: $150 - $300\n- **Negotiation Strategy**: Bundle with other electrical items\n- **Rationale**: Code compliance and safety\n\n## Recommended Negotiation Approach\n\n1. **Lead with Safety**: Emphasize health and safety concerns\n2. **Provide Documentation**: Reference specific inspection report sections\n3. **Offer Solutions**: Suggest repair vs. credit options\n4. **Maintain Flexibility**: Be prepared to prioritize most critical items\n\n## Talking Points for Your Agent\n\n- \"The inspection revealed several items that need attention before closing\"\n- \"We'd like to work together to address these concerns\"\n- \"Safety items like the roof leak need immediate attention\"\n\n## Fallback Positions\n\n- If seller refuses all repairs: Request $3,000 credit for critical items\n- If partial agreement: Prioritize roof leak and electrical safety\n- If market is very competitive: Focus only on safety-related issues\n\n---\n\n*This plan is generated based on inspection findings and should be reviewed with your real estate agent and attorney.*"
}
```

**Response Schema**:
```typescript
interface NegotiationResponse {
  negotiationPlan: string;  // Markdown-formatted negotiation strategy
}
```

**Error Responses**:
- `400 Bad Request`: Invalid context or style parameters
- `401 Unauthorized`: Missing or invalid JWT token
- `404 Not Found`: Report ID does not exist
- `409 Conflict`: Report processing not completed yet
- `403 Forbidden`: User does not own this report

---

## Error Handling

### Standard Error Response Format
```json
{
  "error": "Error message description",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req-123e4567-e89b-12d3-a456-426614174000"
}
```

### Common Error Codes
- `INVALID_TOKEN`: JWT token is malformed or expired
- `INSUFFICIENT_PERMISSIONS`: User lacks required permissions
- `RESOURCE_NOT_FOUND`: Requested resource does not exist
- `PROCESSING_ERROR`: Internal processing failure
- `RATE_LIMIT_EXCEEDED`: Too many requests from client
- `FILE_TOO_LARGE`: Uploaded file exceeds size limit
- `INVALID_FILE_TYPE`: File type not supported

## Rate Limiting

API requests are rate limited per user:
- **Upload**: 10 requests per minute
- **Get Report**: 100 requests per minute  
- **Generate Plan**: 5 requests per minute

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1640995200
```

## Webhooks (Future Feature)

Subscribe to report processing events:

```json
{
  "event": "report.completed",
  "reportId": "123e4567-e89b-12d3-a456-426614174000",
  "timestamp": "2024-01-01T12:05:30.000Z",
  "data": {
    "issueCount": 5,
    "processingTimeMs": 45000
  }
}
```

## SDK Examples

### JavaScript/TypeScript
```typescript
class InspectorAssistClient {
  constructor(private token: string, private baseUrl: string) {}

  async uploadDocument(fileName: string, file: File): Promise<string> {
    // Get upload URL
    const uploadResponse = await this.request('POST', '/reports/upload', {
      fileName,
      fileSize: file.size
    });

    // Upload to S3
    await fetch(uploadResponse.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' }
    });

    return uploadResponse.reportId;
  }

  async getReport(reportId: string): Promise<ReportResponse> {
    return this.request('GET', `/reports/${reportId}`);
  }

  async generatePlan(reportId: string, context: string, style: string): Promise<string> {
    const response = await this.request('POST', `/reports/${reportId}/plan`, {
      context,
      style
    });
    return response.negotiationPlan;
  }

  private async request(method: string, path: string, body?: any) {
    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  }
}
```

### Python
```python
import requests
import json
from typing import Dict, Any

class InspectorAssistClient:
    def __init__(self, token: str, base_url: str):
        self.token = token
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def upload_document(self, file_name: str, file_size: int) -> Dict[str, Any]:
        response = requests.post(
            f'{self.base_url}/v1/reports/upload',
            headers=self.headers,
            json={'fileName': file_name, 'fileSize': file_size}
        )
        response.raise_for_status()
        return response.json()

    def get_report(self, report_id: str) -> Dict[str, Any]:
        response = requests.get(
            f'{self.base_url}/v1/reports/{report_id}',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

    def generate_plan(self, report_id: str, context: str, style: str) -> str:
        response = requests.post(
            f'{self.base_url}/v1/reports/{report_id}/plan',
            headers=self.headers,
            json={'context': context, 'style': style}
        )
        response.raise_for_status()
        return response.json()['negotiationPlan']
```

## Testing

### Postman Collection
A Postman collection is available for API testing:
```json
{
  "info": {
    "name": "InspectorAssist API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{jwt_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "https://api.inspectorassist.com"
    }
  ]
}
```

### cURL Examples
```bash
# Upload document
curl -X POST https://api.inspectorassist.com/v1/reports/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName": "test.pdf", "fileSize": 1048576}'

# Get report
curl -X GET https://api.inspectorassist.com/v1/reports/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer $JWT_TOKEN"

# Generate negotiation plan
curl -X POST https://api.inspectorassist.com/v1/reports/123e4567-e89b-12d3-a456-426614174000/plan \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"context": "First-time buyer", "style": "collaborative"}'
```

---

*API Version: 1.0*  
*Last Updated: January 4, 2026*  
*Generated from codebase analysis*
