#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InspectorAssistStack } from '../lib/mvp-stack';

const app = new cdk.App();

// Development Environment - Basic setup
new InspectorAssistStack(app, 'InspectorAssist-Dev', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  budgetThreshold: 50,
  alertEmail: 'dev-alerts@example.com',
  allowedOrigins: ['http://localhost:3000', 'https://localhost:3000'],
});

// Staging Environment - Enhanced features
new InspectorAssistStack(app, 'InspectorAssist-Staging', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  budgetThreshold: 200,
  alertEmail: 'staging-alerts@example.com',
  allowedOrigins: ['https://staging.example.com'],
  enableVpc: true,
  enableCloudFront: true,
});

// Production Environment - Full features
new InspectorAssistStack(app, 'InspectorAssist-Prod', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-east-1' // Primary region
  },
  budgetThreshold: 1000,
  alertEmail: 'ops@example.com',
  allowedOrigins: ['https://app.example.com'],
  enableVpc: true,
  enableCloudFront: true,
  enableDynamoDbAutoScaling: true,
  enableCrossRegionBackup: true,
});

// Disaster Recovery Environment
new InspectorAssistStack(app, 'InspectorAssist-DR', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: 'us-west-2' // DR region
  },
  budgetThreshold: 500,
  alertEmail: 'ops@example.com',
  allowedOrigins: ['https://app.example.com'],
  enableVpc: true,
  enableDynamoDbAutoScaling: true,
});
