import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class InspectorAssistStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for uploads and generated PDFs
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // DynamoDB table for reports
    const reportsTable = new dynamodb.Table(this, 'ReportsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });

    // Example Lambda for upload (presigned URL)
    const uploadHandler = new lambda.Function(this, 'UploadHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'upload.handler',
      code: lambda.Code.fromAsset('src/lambda'),
      environment: {
        UPLOADS_BUCKET: uploadsBucket.bucketName
      }
    });

    uploadsBucket.grantPut(uploadHandler);

    // Example Lambda for processing pipeline trigger
    const processHandler = new lambda.Function(this, 'ProcessHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'process.handler',
      code: lambda.Code.fromAsset('src/lambda'),
      environment: {
        REPORTS_TABLE: reportsTable.tableName
      }
    });

    reportsTable.grantReadWriteData(processHandler);

    // API Gateway
    const api = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: 'InspectorAssist API'
    });

    const upload = api.root.addResource('v1').addResource('reports').addResource('upload');
    upload.addMethod('POST', new apigateway.LambdaIntegration(uploadHandler));

    // IAM policy notes for Textract/Bedrock/Comprehend access to be added to processing lambdas

    // CloudWatch Alarms and Budget resources should be added by Ops

    // Outputs
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'ReportsTableName', { value: reportsTable.tableName });
  }
}
