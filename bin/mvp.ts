#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InspectorAssistStack } from '../lib/mvp-stack';

const app = new cdk.App();
new InspectorAssistStack(app, 'InspectorAssistStack', {
  env: {
    account: '631124976146',
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  budgetThreshold: 200,
  alertEmail: process.env.ALERT_EMAIL || 'alerts@example.com',
});
