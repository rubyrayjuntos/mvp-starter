import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

export interface InspectorAssistStackProps extends cdk.StackProps {
  budgetThreshold?: number;
  alertEmail?: string;
  allowedOrigins?: string[];
  enableVpc?: boolean;
  enableCloudFront?: boolean;
  enableDynamoDbAutoScaling?: boolean;
  enableCrossRegionBackup?: boolean;
}

export class InspectorAssistStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: InspectorAssistStackProps) {
    super(scope, id, props);

    const budgetThreshold = props?.budgetThreshold || 200;
    const alertEmail = props?.alertEmail || 'alerts@example.com';
    const allowedOrigins = props?.allowedOrigins || ['http://localhost:3000', 'https://localhost:3000'];
    const enableVpc = props?.enableVpc || false;
    const enableCloudFront = props?.enableCloudFront || false;
    const enableDynamoDbAutoScaling = props?.enableDynamoDbAutoScaling || false;
    const enableCrossRegionBackup = props?.enableCrossRegionBackup || false;

    // ============================================================
    // VPC Configuration (Optional)
    // ============================================================
    let vpc: ec2.IVpc | undefined;
    let vpcSubnets: ec2.SubnetSelection | undefined;

    if (enableVpc) {
      vpc = new ec2.Vpc(this, 'InspectorAssistVpc', {
        maxAzs: 2,
        natGateways: 1, // Cost optimization - single NAT gateway
        subnetConfiguration: [
          {
            cidrMask: 24,
            name: 'Public',
            subnetType: ec2.SubnetType.PUBLIC,
          },
          {
            cidrMask: 24,
            name: 'Private',
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          },
        ],
      });

      vpcSubnets = {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      };

      // VPC Endpoints for AWS services (cost optimization)
      vpc.addGatewayEndpoint('S3Endpoint', {
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });

      vpc.addGatewayEndpoint('DynamoDBEndpoint', {
        service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      });
    }

    // ============================================================
    // SNS Topics for Notifications
    // ============================================================
    const alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      displayName: 'InspectorAssist Alerts',
    });

    const textractTopic = new sns.Topic(this, 'TextractNotificationTopic', {
      displayName: 'Textract Job Notifications',
    });

    // ============================================================
    // S3 Bucket for uploads and generated PDFs
    // ============================================================
    const uploadsBucket = new s3.Bucket(this, 'UploadsBucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: allowedOrigins,
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:GetBucketLocation', 's3:ListBucket'],
        resources: [uploadsBucket.bucketArn, uploadsBucket.arnForObjects('*')],
        principals: [new iam.ServicePrincipal('textract.amazonaws.com')],
      })
    );
    uploadsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject'],
        resources: [uploadsBucket.arnForObjects('textract-output/*')],
        principals: [new iam.ServicePrincipal('textract.amazonaws.com')],
      })
    );

    // S3 Lifecycle Policies for Cost Optimization
    uploadsBucket.addLifecycleRule({
      id: 'OptimizeStorage',
      enabled: true,
      prefix: 'uploads/',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: cdk.Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(90),
        },
      ],
      expiration: cdk.Duration.days(365), // Delete after 1 year
    });

    uploadsBucket.addLifecycleRule({
      id: 'CleanupTextractOutput',
      enabled: true,
      prefix: 'textract-output/',
      expiration: cdk.Duration.days(30), // Textract output only needed short-term
    });

    uploadsBucket.addLifecycleRule({
      id: 'CleanupIncompleteUploads',
      enabled: true,
      abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
    });

    // Cross-region backup bucket (optional)
    if (enableCrossRegionBackup) {
      const backupBucket = new s3.Bucket(this, 'BackupBucket', {
        bucketName: `${uploadsBucket.bucketName}-backup-${this.region}`,
        encryption: s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        versioned: true,
        lifecycleRules: [
          {
            id: 'BackupRetention',
            enabled: true,
            expiration: cdk.Duration.days(2555), // 7 years for compliance
            transitions: [
              {
                storageClass: s3.StorageClass.GLACIER,
                transitionAfter: cdk.Duration.days(30),
              },
              {
                storageClass: s3.StorageClass.DEEP_ARCHIVE,
                transitionAfter: cdk.Duration.days(90),
              },
            ],
          },
        ],
      });

      // Cross-region replication (requires manual setup of destination region)
      new cdk.CfnOutput(this, 'BackupBucketName', { 
        value: backupBucket.bucketName,
        description: 'Backup bucket for cross-region replication'
      });
    }

    // ============================================================
    // DynamoDB Table for reports
    // ============================================================
    const reportsTable = new dynamodb.Table(this, 'ReportsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: enableDynamoDbAutoScaling ? dynamodb.BillingMode.PROVISIONED : dynamodb.BillingMode.PAY_PER_REQUEST,
      readCapacity: enableDynamoDbAutoScaling ? 5 : undefined,
      writeCapacity: enableDynamoDbAutoScaling ? 5 : undefined,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // Auto-scaling configuration for predictable workloads
    if (enableDynamoDbAutoScaling) {
      const readScaling = reportsTable.autoScaleReadCapacity({
        minCapacity: 5,
        maxCapacity: 100,
      });

      readScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });

      const writeScaling = reportsTable.autoScaleWriteCapacity({
        minCapacity: 5,
        maxCapacity: 100,
      });

      writeScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
        scaleInCooldown: cdk.Duration.seconds(300),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });
    }

    // ============================================================
    // Cognito User Pool
    // ============================================================
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
      },
    });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // ============================================================
    // IAM Role for Textract SNS Notifications
    // ============================================================
    const textractSnsRole = new iam.Role(this, 'TextractSnsRole', {
      assumedBy: new iam.ServicePrincipal('textract.amazonaws.com'),
    });
    textractTopic.grantPublish(textractSnsRole);

    // ============================================================
    // Lambda Functions
    // ============================================================
    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      ...(vpc && { vpc, vpcSubnets }),
    };

    // Upload Handler - generates presigned URLs
    const uploadHandler = new lambdaNodejs.NodejsFunction(this, 'UploadHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'upload.ts'),
      handler: 'handler',
      environment: {
        UPLOADS_BUCKET: uploadsBucket.bucketName,
      },
    });
    uploadsBucket.grantPut(uploadHandler);

    // Textract Handler - triggered by S3 upload, starts Textract job
    const textractHandler = new lambdaNodejs.NodejsFunction(this, 'TextractHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'textract.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      environment: {
        REPORTS_TABLE: reportsTable.tableName,
        UPLOADS_BUCKET: uploadsBucket.bucketName,
        TEXTRACT_SNS_TOPIC_ARN: textractTopic.topicArn,
        TEXTRACT_SNS_ROLE_ARN: textractSnsRole.roleArn,
      },
    });
    reportsTable.grantWriteData(textractHandler);
    uploadsBucket.grantRead(textractHandler);
    textractHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['textract:*'],
        resources: ['*'],
      })
    );

    // S3 trigger for Textract handler
    uploadsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(textractHandler),
      { prefix: 'uploads/', suffix: '.pdf' }
    );

    // Extract Issues Handler - triggered by Textract SNS, invokes Bedrock
    const extractIssuesHandler = new lambdaNodejs.NodejsFunction(this, 'ExtractIssuesHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'extract-issues.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      reservedConcurrentExecutions: 10,
      environment: {
        REPORTS_TABLE: reportsTable.tableName,
        BEDROCK_MODEL_ID: 'amazon.titan-text-express-v1',
      },
      bundling: {
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [`cp -r ${inputDir}/prompts ${outputDir}/prompts`];
          },
          afterBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          },
        },
      },
    });
    reportsTable.grantReadWriteData(extractIssuesHandler);
    
    // Grant CloudWatch metrics permissions
    extractIssuesHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'InspectorAssist/Business'
          }
        }
      })
    );
    extractIssuesHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['textract:GetDocumentTextDetection'],
        resources: [`arn:aws:textract:${this.region}:${this.account}:*`],
      })
    );
    extractIssuesHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-text-express-v1`,
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`
        ],
      })
    );

    // Dead Letter Queue for failed SNS processing
    const extractIssuesDLQ = new sqs.Queue(this, 'ExtractIssuesDLQ', {
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    textractTopic.addSubscription(new snsSubscriptions.LambdaSubscription(extractIssuesHandler, {
      deadLetterQueue: extractIssuesDLQ,
    }));

    // Negotiation Plan Handler - API endpoint
    const negotiationPlanHandler = new lambdaNodejs.NodejsFunction(this, 'NegotiationPlanHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'negotiation-plan.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      environment: {
        REPORTS_TABLE: reportsTable.tableName,
        BEDROCK_MODEL_ID: 'amazon.titan-text-express-v1',
      },
      bundling: {
        commandHooks: {
          beforeBundling(inputDir: string, outputDir: string): string[] {
            return [`cp -r ${inputDir}/prompts ${outputDir}/prompts`];
          },
          afterBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          },
        },
      },
    });
    reportsTable.grantReadWriteData(negotiationPlanHandler);
    
    // Grant CloudWatch metrics permissions
    negotiationPlanHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'InspectorAssist/Business'
          }
        }
      })
    );
    
    negotiationPlanHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // Get Report Handler - API endpoint
    const getReportHandler = new lambdaNodejs.NodejsFunction(this, 'GetReportHandler', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '..', 'src', 'lambda', 'get-report.ts'),
      handler: 'handler',
      environment: {
        REPORTS_TABLE: reportsTable.tableName,
      },
    });
    reportsTable.grantReadData(getReportHandler);

    // ============================================================
    // API Gateway
    // ============================================================
    const api = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: 'InspectorAssist API',
      deployOptions: {
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const authOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const v1 = api.root.addResource('v1');
    const reports = v1.addResource('reports');

    // POST /v1/reports/upload
    const uploadResource = reports.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadHandler), authOptions);

    // GET /v1/reports/{id}
    const reportById = reports.addResource('{id}');
    reportById.addMethod('GET', new apigateway.LambdaIntegration(getReportHandler), authOptions);

    // POST /v1/reports/{id}/plan
    const planResource = reportById.addResource('plan');
    planResource.addMethod('POST', new apigateway.LambdaIntegration(negotiationPlanHandler), authOptions);

    // ============================================================
    // CloudFront Distribution (Optional)
    // ============================================================
    let distribution: cloudfront.Distribution | undefined;
    
    if (enableCloudFront) {
      distribution = new cloudfront.Distribution(this, 'ApiDistribution', {
        defaultBehavior: {
          origin: new origins.RestApiOrigin(api),
          cachePolicy: new cloudfront.CachePolicy(this, 'ApiCachePolicy', {
            cachePolicyName: 'InspectorAssist-API-Cache',
            defaultTtl: cdk.Duration.minutes(5),
            maxTtl: cdk.Duration.hours(1),
            minTtl: cdk.Duration.seconds(0),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        additionalBehaviors: {
          '/v1/reports/upload': {
            origin: new origins.RestApiOrigin(api),
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // No caching for uploads
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
          '/v1/reports/*/plan': {
            origin: new origins.RestApiOrigin(api),
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // No caching for plan generation
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          },
        },
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Cost optimization
      });
    }

    // ============================================================
    // CloudWatch Alarms (1 per Lambda)
    // ============================================================
    const lambdas = [
      { name: 'Upload', fn: uploadHandler },
      { name: 'Textract', fn: textractHandler },
      { name: 'ExtractIssues', fn: extractIssuesHandler },
      { name: 'NegotiationPlan', fn: negotiationPlanHandler },
      { name: 'GetReport', fn: getReportHandler },
    ];

    lambdas.forEach(({ name, fn }) => {
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        alarmDescription: `${name} Lambda errors`,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));
    });

    // Dead Letter Queue Alarm
    const dlqAlarm = new cloudwatch.Alarm(this, 'ExtractIssuesDLQAlarm', {
      metric: extractIssuesDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Messages in Extract Issues DLQ',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // Advanced CloudWatch Alarms
    const highLatencyAlarm = new cloudwatch.Alarm(this, 'HighLatencyAlarm', {
      metric: new cloudwatch.MathExpression({
        expression: 'AVG([m1, m2, m3])',
        usingMetrics: {
          m1: extractIssuesHandler.metricDuration(),
          m2: negotiationPlanHandler.metricDuration(),
          m3: getReportHandler.metricDuration(),
        },
      }),
      threshold: 30000, // 30 seconds
      evaluationPeriods: 2,
      alarmDescription: 'High average Lambda duration',
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    highLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // Business metrics alarms
    const lowProcessingVolumeAlarm = new cloudwatch.Alarm(this, 'LowProcessingVolumeAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'InspectorAssist/Business',
        metricName: 'DocumentsProcessed',
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      }),
      threshold: 1,
      evaluationPeriods: 4, // 4 hours with no processing
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      alarmDescription: 'No documents processed in 4 hours',
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    lowProcessingVolumeAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertsTopic));

    // ============================================================
    // CloudWatch Dashboard
    // ============================================================
    const dashboard = new cloudwatch.Dashboard(this, 'InspectorAssistDashboard', {
      dashboardName: 'InspectorAssist-Operations',
    });

    // Business Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Documents Processed',
        left: [
          new cloudwatch.Metric({
            namespace: 'InspectorAssist/Business',
            metricName: 'DocumentsProcessed',
            statistic: 'Sum',
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Processing Performance',
        left: [
          new cloudwatch.Metric({
            namespace: 'InspectorAssist/Business',
            metricName: 'ProcessingTime',
            statistic: 'Average',
          }),
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'InspectorAssist/Business',
            metricName: 'IssuesExtracted',
            statistic: 'Average',
          }),
        ],
        width: 12,
      })
    );

    // Lambda Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: lambdas.map(({ fn }) => fn.metricErrors()),
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: lambdas.map(({ fn }) => fn.metricDuration()),
        width: 12,
      })
    );

    // ============================================================
    // AWS Budget Alert ($200/month, 80% threshold)
    // ============================================================
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'InspectorAssist-Monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: budgetThreshold,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: alertsTopic.topicArn,
            },
          ],
        },
      ],
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UploadsBucketName', { value: uploadsBucket.bucketName });
    new cdk.CfnOutput(this, 'ReportsTableName', { value: reportsTable.tableName });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'AlertsTopicArn', { value: alertsTopic.topicArn });
    new cdk.CfnOutput(this, 'DashboardUrl', { 
      value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL'
    });
    
    if (distribution) {
      new cdk.CfnOutput(this, 'CloudFrontUrl', { 
        value: `https://${distribution.distributionDomainName}`,
        description: 'CloudFront distribution URL'
      });
    }
    
    if (enableVpc && vpc) {
      new cdk.CfnOutput(this, 'VpcId', { 
        value: vpc.vpcId,
        description: 'VPC ID for Lambda functions'
      });
    }
  }
}
