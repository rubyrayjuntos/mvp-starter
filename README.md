# InspectorAssist MVP - CDK Starter

Scaffold for the InspectorAssist AWS serverless MVP.

Contents:
- CDK TypeScript stack skeleton (Cognito, S3, DynamoDB, Lambdas, API Gateway, Step Functions)
- GitHub Actions workflows (OIDC deploy templates)
- Prompt templates for Bedrock and test harness
- Sample fetch script to download public inspection PDFs for prompt tuning

Notes:
- You must provide an AWS account ID to create the OIDC trust role in your AWS account.
- Default region: us-east-1
- Default budget alert: $200/month
