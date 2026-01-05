# InspectorAssist - Technical Architecture Document

## Component Architecture

### Lambda Function Specifications

#### 1. Upload Handler (`upload.ts`)
**Purpose**: Generate presigned S3 URLs for secure document uploads

**Runtime Configuration**:
- Runtime: Node.js 18.x
- Memory: 256 MB
- Timeout: 30 seconds
- Tracing: AWS X-Ray enabled

**Input/Output**:
```typescript
interface UploadRequest {
  fileName: string;
  fileSize: number;
}

interface UploadResponse {
  reportId: string;
  uploadUrl: string;
  expiresIn: number;
}
```

**Key Operations**:
1. Generate UUID for report ID
2. Create presigned S3 PUT URL (1-hour expiry)
3. Initialize DynamoDB record with UPLOADED status
4. Return upload URL to client

**IAM Permissions**:
- `s3:PutObject` on uploads bucket
- `dynamodb:PutItem` on reports table

#### 2. Textract Handler (`textract.ts`)
**Purpose**: Initiate OCR processing when documents are uploaded

**Runtime Configuration**:
- Runtime: Node.js 18.x
- Memory: 256 MB
- Timeout: 60 seconds
- Trigger: S3 object creation (prefix: `uploads/`, suffix: `.pdf`)

**Processing Flow**:
1. Extract report ID from S3 object key
2. Start Textract asynchronous text detection job
3. Configure SNS notification for job completion
4. Update DynamoDB status to PROCESSING
5. Store Textract job ID for tracking

**IAM Permissions**:
- `textract:StartDocumentTextDetection`
- `s3:GetObject` on uploads bucket
- `dynamodb:UpdateItem` on reports table
- `sns:Publish` on Textract notification topic

#### 3. Extract Issues Handler (`extract-issues.ts`)
**Purpose**: Process Textract results and extract property issues using AI

**Runtime Configuration**:
- Runtime: Node.js 18.x
- Memory: 512 MB
- Timeout: 5 minutes
- Trigger: SNS message from Textract completion

**AI Processing Pipeline**:
1. Receive SNS notification with Textract job ID
2. Retrieve paginated text detection results
3. Concatenate all text blocks (max 20,000 chars)
4. Invoke Bedrock with issue extraction prompt
5. Parse AI response into structured issue objects
6. Update DynamoDB with extracted issues

**Prompt Template**:
```typescript
const ISSUE_EXTRACTION_PROMPT = `
Extract all issues and defects from the following property inspection report text. 
Group them by category (e.g., Roof, Plumbing, Electrical).
For each issue, describe:
- The specific defect
- Its location  
- The recommended action (e.g., Repair, Replace, Further Evaluation)
- Severity (Low, Medium, High)

Format the output as a clean JSON array of objects.

OCR TEXT:
{{OCR_TEXT}}
`;
```

**IAM Permissions**:
- `textract:GetDocumentTextDetection`
- `bedrock:InvokeModel`
- `dynamodb:UpdateItem` on reports table

#### 4. Negotiation Plan Handler (`negotiation-plan.ts`)
**Purpose**: Generate strategic negotiation advice based on extracted issues

**Runtime Configuration**:
- Runtime: Node.js 18.x
- Memory: 512 MB
- Timeout: 2 minutes
- Trigger: API Gateway POST request

**Input Parameters**:
```typescript
interface NegotiationRequest {
  context: string;  // e.g., "First-time buyer, competitive market"
  style: string;    // e.g., "collaborative", "aggressive"
}
```

**Processing Logic**:
1. Fetch report issues from DynamoDB
2. Construct negotiation prompt with issues and context
3. Invoke Bedrock for strategy generation
4. Store generated plan in DynamoDB
5. Return formatted Markdown response

**IAM Permissions**:
- `bedrock:InvokeModel`
- `dynamodb:GetItem` and `UpdateItem` on reports table

#### 5. Get Report Handler (`get-report.ts`)
**Purpose**: Retrieve processed reports with issues and negotiation plans

**Runtime Configuration**:
- Runtime: Node.js 18.x
- Memory: 256 MB
- Timeout: 30 seconds
- Trigger: API Gateway GET request

**Response Format**:
```typescript
interface ReportResponse {
  reportId: string;
  fileName: string;
  status: ReportStatus;
  uploadedAt: string;
  issues?: Issue[];
  negotiationPlan?: string;
  updatedAt: string;
}
```

## Data Flow Architecture

### 1. Document Upload Flow
```
Client → API Gateway → Upload Lambda → S3 Presigned URL
                    ↓
                DynamoDB (UPLOADED status)
```

### 2. Processing Flow
```
S3 Upload Event → Textract Lambda → AWS Textract Service
                                 ↓
                            SNS Notification
                                 ↓
                         Extract Issues Lambda → AWS Bedrock
                                              ↓
                                         DynamoDB (COMPLETED status)
```

### 3. Report Retrieval Flow
```
Client → API Gateway → Get Report Lambda → DynamoDB → Response
```

### 4. Negotiation Planning Flow
```
Client → API Gateway → Negotiation Lambda → DynamoDB (fetch issues)
                                         ↓
                                    AWS Bedrock (generate plan)
                                         ↓
                                    DynamoDB (store plan)
```

## Infrastructure Components

### AWS Services Configuration

#### S3 Bucket (`UploadsBucket`)
```typescript
const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  versioned: true,
  cors: [{
    allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
    allowedOrigins: ['*'],
    allowedHeaders: ['*'],
    maxAge: 3000,
  }],
});
```

**Directory Structure**:
- `uploads/` - User uploaded documents
- `textract-output/` - Textract processing results
- `generated-reports/` - Final processed reports

#### DynamoDB Table (`ReportsTable`)
```typescript
const reportsTable = new dynamodb.Table(this, 'ReportsTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  pointInTimeRecovery: true,
});
```

**Access Patterns**:
- Get report by ID: `PK = REPORT#{id}, SK = METADATA`
- Future: Query by user: `GSI1PK = USER#{userId}`
- Future: Query by status: `GSI2PK = STATUS#{status}`

#### Cognito User Pool
```typescript
const userPool = new cognito.UserPool(this, 'UserPool', {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  autoVerify: { email: true },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: false,
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
});
```

#### API Gateway Configuration
```typescript
const api = new apigateway.RestApi(this, 'ApiGateway', {
  restApiName: 'InspectorAssist API',
  deployOptions: {
    tracingEnabled: true,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
  },
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
});
```

**Endpoint Structure**:
```
/v1/reports/
├── upload (POST) - Generate upload URL
├── {id} (GET) - Get report details
└── {id}/plan (POST) - Generate negotiation plan
```

## Security Implementation

### Authentication Flow
1. User registers/signs in via Cognito User Pool
2. Cognito returns JWT access token
3. Client includes token in Authorization header
4. API Gateway validates token with Cognito Authorizer
5. Lambda functions receive validated user context

### IAM Role Architecture
```typescript
// Textract SNS Role
const textractSnsRole = new iam.Role(this, 'TextractSnsRole', {
  assumedBy: new iam.ServicePrincipal('textract.amazonaws.com'),
});

// Lambda Execution Roles (auto-generated by CDK)
// - Basic execution role for CloudWatch Logs
// - Service-specific permissions via grants
```

### Data Encryption
- **S3**: Server-side encryption (SSE-S3)
- **DynamoDB**: Encryption at rest (AWS managed keys)
- **API Gateway**: TLS 1.2 for data in transit
- **Lambda**: Environment variables encrypted with KMS

## Monitoring & Observability

### CloudWatch Alarms
```typescript
lambdas.forEach(({ name, fn }) => {
  const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
    metric: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
    alarmDescription: `${name} Lambda errors`,
  });
  errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));
});
```

### Distributed Tracing
- **AWS X-Ray**: Enabled on all Lambda functions and API Gateway
- **Trace Correlation**: Request IDs propagated through the system
- **Performance Monitoring**: End-to-end latency tracking

### Logging Strategy
```typescript
const lambdaDefaults = {
  runtime: lambda.Runtime.NODEJS_18_X,
  tracing: lambda.Tracing.ACTIVE,
  logRetention: logs.RetentionDays.ONE_MONTH,
};
```

## Cost Optimization

### Budget Management
```typescript
new budgets.CfnBudget(this, 'MonthlyBudget', {
  budget: {
    budgetName: 'InspectorAssist-Monthly',
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: budgetThreshold, // $200 default
      unit: 'USD',
    },
  },
  notificationsWithSubscribers: [{
    notification: {
      notificationType: 'ACTUAL',
      comparisonOperator: 'GREATER_THAN',
      threshold: 80, // 80% of budget
      thresholdType: 'PERCENTAGE',
    },
    subscribers: [{
      subscriptionType: 'SNS',
      address: alertsTopic.topicArn,
    }],
  }],
});
```

### Resource Optimization
- **DynamoDB**: Pay-per-request billing mode
- **Lambda**: Right-sized memory allocation (256-512 MB)
- **S3**: Lifecycle policies for old documents
- **Textract**: Batch processing to reduce API calls

## Error Handling & Resilience

### Lambda Error Patterns
```typescript
export const handler = async (event) => {
  try {
    // Main processing logic
    return successResponse(result);
  } catch (error) {
    console.error('Handler error:', error);
    
    // Update status to ERROR in DynamoDB
    await updateReportStatus(reportId, 'ERROR');
    
    // Return appropriate HTTP error
    return errorResponse(error.message, 500);
  }
};
```

### Retry Mechanisms
- **AWS SDK**: Built-in exponential backoff
- **Textract**: Automatic retry for transient failures
- **Bedrock**: Circuit breaker pattern for rate limits
- **DynamoDB**: Conditional writes to prevent conflicts

### Dead Letter Queues
- **SNS**: Failed message handling for Textract notifications
- **Lambda**: Async invocation error handling
- **Monitoring**: CloudWatch alarms for DLQ messages

## Performance Optimization

### Lambda Cold Start Mitigation
```typescript
// Reuse connections outside handler
const textract = new TextractClient({});
const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  // Handler logic uses pre-initialized clients
};
```

### Memory Allocation Strategy
- **Upload Handler**: 256 MB (I/O bound)
- **Textract Handler**: 256 MB (API calls)
- **Extract Issues**: 512 MB (AI processing)
- **Negotiation Plan**: 512 MB (AI processing)
- **Get Report**: 256 MB (data retrieval)

### Caching Strategy
- **API Gateway**: Response caching for GET endpoints
- **Lambda**: Connection pooling for AWS services
- **DynamoDB**: Eventually consistent reads where appropriate

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm run test

# Deploy to AWS
npm run deploy
```

### Testing Strategy
- **Unit Tests**: Jest for Lambda function logic
- **Integration Tests**: AWS SDK mocking with aws-sdk-mock
- **E2E Tests**: Postman/Newman for API testing
- **Load Tests**: Artillery for performance validation

### CI/CD Pipeline
```yaml
# GitHub Actions workflow
name: Deploy InspectorAssist
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run deploy
```

---

*Document Version: 1.0*  
*Last Updated: January 4, 2026*  
*Generated from codebase analysis*
