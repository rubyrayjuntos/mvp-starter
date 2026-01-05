#!/usr/bin/env node
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
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const mvp_stack_1 = require("../lib/mvp-stack");
const app = new cdk.App();
// Development Environment - Basic setup
new mvp_stack_1.InspectorAssistStack(app, 'InspectorAssist-Dev', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    },
    budgetThreshold: 50,
    alertEmail: 'dev-alerts@example.com',
    allowedOrigins: ['http://localhost:3000', 'https://localhost:3000'],
});
// Staging Environment - Enhanced features
new mvp_stack_1.InspectorAssistStack(app, 'InspectorAssist-Staging', {
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
new mvp_stack_1.InspectorAssistStack(app, 'InspectorAssist-Prod', {
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
new mvp_stack_1.InspectorAssistStack(app, 'InspectorAssist-DR', {
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
