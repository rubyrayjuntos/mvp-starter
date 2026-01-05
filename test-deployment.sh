#!/bin/bash

# Test Deployment Script for InspectorAssist

echo "========================================="
echo "Testing InspectorAssist Deployment"
echo "========================================="
echo ""

# Load deployment info
API_URL="https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod/"
UPLOADS_BUCKET="inspectorassiststack-uploadsbucket5e5e9b64-ts9gsfjb1zyk"
REPORTS_TABLE="InspectorAssistStack-ReportsTable282F2283-MH2879UVD2SJ"
USER_POOL_ID="us-east-1_AtZZVRIjO"
USER_POOL_CLIENT_ID="4o9paj64knm94ctrqclc38a5ke"

echo "1. Testing S3 Bucket..."
aws s3 ls s3://$UPLOADS_BUCKET 2>&1
if [ $? -eq 0 ]; then
    echo "✓ S3 Bucket exists and is accessible"
else
    echo "✗ S3 Bucket test failed"
fi
echo ""

echo "2. Testing DynamoDB Table..."
aws dynamodb describe-table --table-name $REPORTS_TABLE --query 'Table.{Name:TableName,Status:TableStatus,ItemCount:ItemCount}' --output table 2>&1
if [ $? -eq 0 ]; then
    echo "✓ DynamoDB Table exists and is accessible"
else
    echo "✗ DynamoDB Table test failed"
fi
echo ""

echo "3. Testing Cognito User Pool..."
aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID --query 'UserPool.{Id:Id,Name:Name,Status:Status}' --output table 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Cognito User Pool exists and is accessible"
else
    echo "✗ Cognito User Pool test failed"
fi
echo ""

echo "4. Testing API Gateway endpoint..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" $API_URL
echo ""

echo "5. Listing Lambda Functions..."
aws lambda list-functions --query 'Functions[?contains(FunctionName, `InspectorAssistStack`)].FunctionName' --output table 2>&1
echo ""

echo "========================================="
echo "Deployment Test Complete"
echo "========================================="
