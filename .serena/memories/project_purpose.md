# InspectorAssist Project Purpose

InspectorAssist is an AI-powered application designed to analyze home inspection reports.
This repository contains the AWS CDK infrastructure and Lambda function source code.

The main objective is to automate the extraction of defect issues from PDF inspection reports and generate professional negotiation plans using Amazon Bedrock.

## Key Features
- PDF upload to S3 via presigned URLs.
- Asynchronous Textract processing for OCR.
- LLM-based issue extraction from OCR text (Amazon Bedrock).
- Professional negotiation plan generation (Amazon Bedrock).
- Secured by Amazon Cognito.
