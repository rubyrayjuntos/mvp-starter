# InspectorAssist - Documentation Index

## Project Overview

**InspectorAssist** is an AI-powered property inspection analysis platform that automates the extraction of issues from inspection reports and generates strategic negotiation plans for real estate transactions.

## Documentation Structure

### 📋 Design Documents

#### [System Design Document](./SYSTEM_DESIGN.md)
Comprehensive overview of the InspectorAssist architecture, including:
- High-level system architecture and data flow
- Core components and AWS services integration
- Security architecture and operational excellence
- Performance characteristics and scaling considerations
- Future enhancement roadmap

#### [Technical Architecture Document](./TECHNICAL_ARCHITECTURE.md)
Detailed technical specifications covering:
- Lambda function specifications and configurations
- Infrastructure components and AWS service setup
- Security implementation and IAM roles
- Monitoring, observability, and error handling
- Development workflow and CI/CD pipeline

### 🧪 Testing Strategy

#### [Property Testing Strategy](./PROPERTY_TESTING.md)
Comprehensive property-based testing approach including:
- Core system properties and invariants
- AI processing validation and consistency checks
- Data integrity and API contract properties
- Performance and security property validation
- Test execution strategy and monitoring

### 📚 API Reference

#### [API Documentation](./API_DOCUMENTATION.md)
Complete API reference with:
- Authentication and authorization details
- Endpoint specifications with request/response schemas
- Error handling and rate limiting
- SDK examples in multiple languages
- Testing tools and examples

## Quick Start Guide

### 1. Prerequisites
- AWS Account with appropriate permissions
- Node.js 18.x or later
- AWS CLI configured
- Docker (for local development)

### 2. Installation
```bash
# Clone repository
git clone https://github.com/your-org/mvp-starter.git
cd mvp-starter

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### 3. Deployment
```bash
# Deploy to AWS
npm run deploy

# Outputs will include:
# - API Gateway URL
# - Cognito User Pool details
# - S3 bucket names
```

### 4. Frontend Setup
```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Configure API endpoint
# Update main.ts with your API Gateway URL

# Start development server
npm run dev
```

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Client    │───▶│   API Gateway    │───▶│   Lambda Fns    │
│   (TypeScript)  │    │   (REST API)     │    │   (Node.js)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Cognito Auth   │    │   DynamoDB      │
                       │   (User Mgmt)    │    │   (Reports)     │
                       └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐            │
│   S3 Bucket     │───▶│   AWS Textract   │────────────┘
│   (Documents)   │    │   (OCR Service)  │
└─────────────────┘    └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   AWS Bedrock    │
                       │   (AI Analysis)  │
                       └──────────────────┘
```

## Key Features

### 🔍 Document Processing
- **OCR Integration**: AWS Textract for accurate text extraction
- **AI Analysis**: AWS Bedrock for intelligent issue identification
- **Async Processing**: SNS-driven pipeline for scalability

### 🤖 AI-Powered Analysis
- **Issue Extraction**: Categorized property defects with severity levels
- **Negotiation Planning**: Strategic advice based on extracted issues
- **Customizable Context**: Tailored recommendations for different scenarios

### 🔒 Security & Compliance
- **Authentication**: AWS Cognito User Pool integration
- **Data Encryption**: End-to-end encryption for documents and data
- **Access Control**: IAM-based permissions with least privilege

### 📊 Monitoring & Operations
- **Real-time Alerts**: CloudWatch alarms for system health
- **Cost Management**: Budget alerts and resource optimization
- **Distributed Tracing**: AWS X-Ray for performance monitoring

## Development Workflow

### Local Development
```bash
# Start LocalStack for local AWS services
docker run -d -p 4566:4566 localstack/localstack

# Deploy to local environment
npm run deploy:local

# Run tests
npm run test

# Watch for changes
npm run watch
```

### Testing Strategy
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Property-based tests
npm run test:property

# End-to-end tests
npm run test:e2e
```

### Deployment Pipeline
```bash
# Development environment
npm run deploy:dev

# Staging environment
npm run deploy:staging

# Production environment
npm run deploy:prod
```

## Configuration

### Environment Variables
```typescript
interface EnvironmentConfig {
  // AWS Configuration
  AWS_REGION: string;
  BEDROCK_MODEL_ID: string;
  
  // Application Settings
  BUDGET_THRESHOLD: number;
  ALERT_EMAIL: string;
  
  // Feature Flags
  ENABLE_WEBHOOKS: boolean;
  ENABLE_BATCH_PROCESSING: boolean;
}
```

### CDK Context
```json
{
  "budgetThreshold": 200,
  "alertEmail": "alerts@example.com",
  "environment": "production"
}
```

## Troubleshooting

### Common Issues

#### 1. Lambda Function Timeouts
```bash
# Check CloudWatch logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/InspectorAssist"

# Increase timeout in CDK stack
timeout: cdk.Duration.minutes(5)
```

#### 2. Textract Processing Failures
```bash
# Check Textract job status
aws textract get-document-text-detection --job-id <job-id>

# Verify S3 permissions for Textract service
```

#### 3. Bedrock Model Access
```bash
# Verify model access in region
aws bedrock list-foundation-models --region us-east-1

# Check IAM permissions for bedrock:InvokeModel
```

### Monitoring Commands
```bash
# View recent Lambda errors
aws logs filter-log-events \
  --log-group-name "/aws/lambda/InspectorAssist-ExtractIssuesHandler" \
  --filter-pattern "ERROR"

# Check API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace "AWS/ApiGateway" \
  --metric-name "Count" \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

## Contributing

### Code Standards
- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Automatic code formatting
- **Jest**: Unit and integration testing

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation as needed
4. Submit PR with clear description
5. Address review feedback
6. Merge after approval

### Release Process
1. Update version in `package.json`
2. Create release notes
3. Tag release in Git
4. Deploy to production
5. Monitor deployment health

## Support

### Documentation
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Textract Developer Guide](https://docs.aws.amazon.com/textract/)
- [AWS Bedrock User Guide](https://docs.aws.amazon.com/bedrock/)

### Community
- [GitHub Issues](https://github.com/your-org/mvp-starter/issues)
- [Discussions](https://github.com/your-org/mvp-starter/discussions)
- [Wiki](https://github.com/your-org/mvp-starter/wiki)

### Professional Support
- AWS Support Plans
- Architecture Review Sessions
- Performance Optimization Consulting

---

*Documentation Version: 1.0*  
*Last Updated: January 4, 2026*  
*Generated from codebase analysis*
