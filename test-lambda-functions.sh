#!/bin/bash

echo "========================================="
echo "Testing Lambda Functions"
echo "========================================="
echo ""

# Get Lambda function names
UPLOAD_HANDLER=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `UploadHandler`)].FunctionName' --output text)
GET_REPORT_HANDLER=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `GetReportHandler`)].FunctionName' --output text)
TEXTRACT_HANDLER=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `TextractHandler`)].FunctionName' --output text)
EXTRACT_ISSUES_HANDLER=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `ExtractIssuesHandler`)].FunctionName' --output text)
NEGOTIATION_PLAN_HANDLER=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `NegotiationPlanHandler`)].FunctionName' --output text)

echo "Found Lambda Functions:"
echo "  - Upload Handler: $UPLOAD_HANDLER"
echo "  - Get Report Handler: $GET_REPORT_HANDLER"
echo "  - Textract Handler: $TEXTRACT_HANDLER"
echo "  - Extract Issues Handler: $EXTRACT_ISSUES_HANDLER"
echo "  - Negotiation Plan Handler: $NEGOTIATION_PLAN_HANDLER"
echo ""

# Test each Lambda function configuration
echo "1. Testing Upload Handler Configuration..."
aws lambda get-function --function-name $UPLOAD_HANDLER --query 'Configuration.{State:State,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' --output table
echo ""

echo "2. Testing Get Report Handler Configuration..."
aws lambda get-function --function-name $GET_REPORT_HANDLER --query 'Configuration.{State:State,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' --output table
echo ""

echo "3. Testing Textract Handler Configuration..."
aws lambda get-function --function-name $TEXTRACT_HANDLER --query 'Configuration.{State:State,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' --output table
echo ""

echo "4. Testing Extract Issues Handler Configuration..."
aws lambda get-function --function-name $EXTRACT_ISSUES_HANDLER --query 'Configuration.{State:State,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' --output table
echo ""

echo "5. Testing Negotiation Plan Handler Configuration..."
aws lambda get-function --function-name $NEGOTIATION_PLAN_HANDLER --query 'Configuration.{State:State,Runtime:Runtime,Timeout:Timeout,Memory:MemorySize}' --output table
echo ""

echo "========================================="
echo "Lambda Function Tests Complete"
echo "========================================="
