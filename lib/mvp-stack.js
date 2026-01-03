"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectorAssistStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const lambdaNodejs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const apigateway = __importStar(require("aws-cdk-lib/aws-apigateway"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const budgets = __importStar(require("aws-cdk-lib/aws-budgets"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const path = __importStar(require("path"));
class InspectorAssistStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const budgetThreshold = props?.budgetThreshold || 200;
        const alertEmail = props?.alertEmail || 'alerts@example.com';
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
                    allowedOrigins: ['*'], // Restrict in production
                    allowedHeaders: ['*'],
                    maxAge: 3000,
                },
            ],
        });
        uploadsBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject', 's3:GetBucketLocation', 's3:ListBucket'],
            resources: [uploadsBucket.bucketArn, uploadsBucket.arnForObjects('*')],
            principals: [new iam.ServicePrincipal('textract.amazonaws.com')],
        }));
        uploadsBucket.addToResourcePolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [uploadsBucket.arnForObjects('textract-output/*')],
            principals: [new iam.ServicePrincipal('textract.amazonaws.com')],
        }));
        // ============================================================
        // DynamoDB Table for reports
        // ============================================================
        const reportsTable = new dynamodb.Table(this, 'ReportsTable', {
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            pointInTimeRecovery: true,
        });
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
        textractHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['textract:*'],
            resources: ['*'],
        }));
        // S3 trigger for Textract handler
        uploadsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(textractHandler), { prefix: 'uploads/', suffix: '.pdf' });
        // Extract Issues Handler - triggered by Textract SNS, invokes Bedrock
        const extractIssuesHandler = new lambdaNodejs.NodejsFunction(this, 'ExtractIssuesHandler', {
            ...lambdaDefaults,
            entry: path.join(__dirname, '..', 'src', 'lambda', 'extract-issues.ts'),
            handler: 'handler',
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            environment: {
                REPORTS_TABLE: reportsTable.tableName,
                BEDROCK_MODEL_ID: 'amazon.titan-text-express-v1',
            },
            bundling: {
                commandHooks: {
                    beforeBundling(inputDir, outputDir) {
                        return [`cp -r ${inputDir}/prompts ${outputDir}/prompts`];
                    },
                    afterBundling() {
                        return [];
                    },
                    beforeInstall() {
                        return [];
                    },
                },
            },
        });
        reportsTable.grantReadWriteData(extractIssuesHandler);
        extractIssuesHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['textract:GetDocumentTextDetection'],
            resources: ['*'],
        }));
        extractIssuesHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: ['*'],
        }));
        textractTopic.addSubscription(new snsSubscriptions.LambdaSubscription(extractIssuesHandler));
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
                    beforeBundling(inputDir, outputDir) {
                        return [`cp -r ${inputDir}/prompts ${outputDir}/prompts`];
                    },
                    afterBundling() {
                        return [];
                    },
                    beforeInstall() {
                        return [];
                    },
                },
            },
        });
        reportsTable.grantReadWriteData(negotiationPlanHandler);
        negotiationPlanHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: ['*'],
        }));
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
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
            },
        });
        const authOptions = {
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
    }
}
exports.InspectorAssistStack = InspectorAssistStack;
