#!/bin/bash

echo "========================================="
echo "Testing Full API Workflow"
echo "========================================="
echo ""

USER_POOL_ID="us-east-1_AtZZVRIjO"
USER_POOL_CLIENT_ID="4o9paj64knm94ctrqclc38a5ke"
API_URL="https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="TestPass123!"

echo "Step 1: Authenticating..."
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $USER_POOL_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=$TEST_EMAIL,PASSWORD=$TEST_PASSWORD \
  --output json 2>&1)

ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')
echo "✓ Authenticated successfully"
echo ""

echo "Step 2: Testing POST /v1/reports/upload with valid request..."
UPLOAD_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test-inspection-report.pdf","contentType":"application/pdf"}' \
  "$API_URL/v1/reports/upload")

echo "$UPLOAD_RESPONSE" | jq '.'
REPORT_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.reportId')
UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.uploadUrl')
echo ""

if [ "$REPORT_ID" != "null" ]; then
    echo "✓ Upload URL generated successfully"
    echo "  Report ID: $REPORT_ID"
    echo ""
    
    echo "Step 3: Testing GET /v1/reports/{id} with the new report ID..."
    GET_RESPONSE=$(curl -s \
      -H "Authorization: Bearer $ID_TOKEN" \
      "$API_URL/v1/reports/$REPORT_ID")
    
    echo "$GET_RESPONSE" | jq '.'
    echo ""
    
    echo "Step 4: Checking existing completed reports..."
    # Get a report that has issues extracted
    COMPLETED_REPORT=$(aws dynamodb scan \
      --table-name InspectorAssistStack-ReportsTable282F2283-MH2879UVD2SJ \
      --filter-expression "#s = :status" \
      --expression-attribute-names '{"#s":"status"}' \
      --expression-attribute-values '{":status":{"S":"COMPLETED"}}' \
      --max-items 1 \
      --output json 2>/dev/null | jq -r '.Items[0].reportId.S')
    
    if [ "$COMPLETED_REPORT" != "null" ] && [ -n "$COMPLETED_REPORT" ]; then
        echo "Found completed report: $COMPLETED_REPORT"
        echo ""
        
        echo "Step 5: Testing POST /v1/reports/{id}/plan..."
        PLAN_RESPONSE=$(curl -s -X POST \
          -H "Authorization: Bearer $ID_TOKEN" \
          -H "Content-Type: application/json" \
          -d '{"context":"First-time homebuyer, budget-conscious","style":"balanced"}' \
          "$API_URL/v1/reports/$COMPLETED_REPORT/plan")
        
        echo "$PLAN_RESPONSE" | jq '.'
    else
        echo "No completed reports found to test negotiation plan"
    fi
else
    echo "✗ Failed to generate upload URL"
fi

echo ""
echo "========================================="
echo "Full Workflow Test Complete"
echo "========================================="
