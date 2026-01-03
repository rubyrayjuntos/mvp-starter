# InspectorAssist CDK

This project contains the AWS CDK infrastructure for the InspectorAssist application.

## Local Development with LocalStack

To deploy the infrastructure to a local LocalStack container, you need to have Docker and LocalStack running.

### Prerequisites

*   Node.js and npm
*   Docker
*   LocalStack

### Setup

1.  Install the project dependencies:

    ```bash
    npm install
    ```

2.  Deploy the CDK stack to LocalStack:

    ```bash
    npm run deploy
    ```

This will create the necessary S3 buckets, DynamoDB tables, and other resources in your local environment.