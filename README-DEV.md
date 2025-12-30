Developer notes

1) To run unit tests locally:
   npm install
   npm test

2) To fetch samples locally:
   chmod +x scripts/fetch-samples.sh
   ./scripts/fetch-samples.sh

3) To deploy via GitHub Actions OIDC:
   - Create IAM role `GitHubActionsOIDCRole` in your AWS account with trust policy for `token.actions.githubusercontent.com` and attach least-privilege policies for CDK deploy.
   - Add `AWS_ACCOUNT_ID` as a secret in this repo.

4) Bedrock access:
   - Confirm your AWS account has Bedrock access in us-east-1; update prompts and environment variables in CDK accordingly.

5) PII redaction: pipeline includes an optional Comprehend PII step; set tenant flag to opt-in.
