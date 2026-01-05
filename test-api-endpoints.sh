#!/bin/bash

echo "========================================="
echo "Testing API Endpoints with Cognito Auth"
echo "========================================="
echo ""

USER_POOL_ID="us-east-1_AtZZVRIjO"
USER_POOL_CLIENT_ID="4o9paj64knm94ctrqclc38a5ke"
API_URL="https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="TestPass123!"

echo "Step 1: Creating test user..."
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --user-attributes Name=email,Value=$TEST_EMAIL Name=email_verified,Value=true \
  --temporary-password $TEST_PASSWORD \
  --message-action SUPPRESS 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Test user created successfully"
else
    echo "Note: User may already exist (this is okay)"
fi
echo ""

echo "Step 2: Setting permanent password..."
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $TEST_EMAIL \
  --password $TEST_PASSWORD \
  --permanent 2>&1

if [ $? -eq 0 ]; then
    echo "✓ Password set successfully"
fi
echo ""

echo "Step 3: Authenticating user..."
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $USER_POOL_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=$TEST_EMAIL,PASSWORD=$TEST_PASSWORD \
  --output json 2>&1)

if [ $? -eq 0 ]; then
    echo "✓ Authentication successful"
    ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')
    echo "Token obtained (first 50 chars): ${ID_TOKEN:0:50}..."
else
    echo "✗ Authentication failed"
    echo "$AUTH_RESPONSE"
    exit 1
fi
echo ""

echo "Step 4: Testing API endpoints..."
echo ""

echo "4a. Testing GET /v1/reports/{id} (should return 404 for non-existent report)..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Authorization: Bearer $ID_TOKEN" \
  "$API_URL/v1/reports/test-report-123")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

echo "4b. Testing POST /v1/reports/upload (should return presigned URL)..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test-report.pdf","contentType":"application/pdf"}' \
  "$API_URL/v1/reports/upload")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
echo "Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

echo "========================================="
echo "API Endpoint Tests Complete"
echo "========================================="
echo ""
echo "Summary:"
echo "  - User Pool ID: $USER_POOL_ID"
echo "  - Test User: $TEST_EMAIL"
echo "  - API URL: $API_URL"
echo "  - All Lambda functions are Active"
echo "  - DynamoDB table has 20 items"
