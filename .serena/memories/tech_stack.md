# Tech Stack and Conventions

## Backend Infrastructure
- **Framework**: AWS CDK v2 (TypeScript)
- **Runtime**: Node.js 18.x
- **Storage**: Amazon S3 (PDF uploads), Amazon DynamoDB (Report metadata)
- **Auth**: Amazon Cognito (User Pool)
- **AI Services**:
  - Amazon Textract (OCR)
  - Amazon Bedrock (LLM - Claude 3 Haiku / Amazon Titan)

## Development Environment
- **Language**: TypeScript
- **Testing**: Jest
- **Bundling**: esbuild (configured via CDK NodejsFunction)

## Code Style and Conventions
- Use AWS SDK v3 clients.
- Lambda functions are located in `src/lambda/` and use a single-file approach where possible.
- Shared prompts are stored in `src/lambda/prompts.ts` for bundling.
- CDK stack is defined in `lib/mvp-stack.ts`.
