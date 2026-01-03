# Suggest Commands for InspectorAssist

## Project Setup
- `npm install`: Install dependencies.

## Deployment
- `npm run deploy`: Deploys the infrastructure to the current AWS environment.
- `npm run synth`: Generates the AWS CloudFormation template.

## Testing
- `npm test`: Runs unit tests with Jest.
- `npx ts-node test-pipeline.ts`: Triggers an end-to-end test of the PDF processing pipeline.
- `npx ts-node test-negotiation.ts <reportId>`: Tests the negotiation plan generation for a specific report.
- `npx ts-node check-status.ts <reportId>`: Checks the status of a report in DynamoDB.

## Development
- `npm run build`: Compiles TypeScript.
- `npm run watch`: Compiles TypeScript in watch mode.
