#!/bin/bash

echo "========================================="
echo "Testing New Upload with Improved AI"
echo "========================================="
echo ""

USER_POOL_ID="us-east-1_AtZZVRIjO"
USER_POOL_CLIENT_ID="4o9paj64knm94ctrqclc38a5ke"
API_URL="https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="TestPass123!"
BUCKET="inspectorassiststack-uploadsbucket5e5e9b64-ts9gsfjb1zyk"

echo "Step 1: Authenticating..."
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $USER_POOL_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=$TEST_EMAIL,PASSWORD=$TEST_PASSWORD \
  --output json 2>&1)

ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')
echo "✓ Authenticated"
echo ""

echo "Step 2: Getting upload URL..."
UPLOAD_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"Baker-Sample_Report.pdf","contentType":"application/pdf"}' \
  "$API_URL/v1/reports/upload")

REPORT_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.reportId')
UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.uploadUrl')

echo "✓ Upload URL obtained"
echo "  Report ID: $REPORT_ID"
echo ""

echo "Step 3: Uploading sample PDF..."
curl -s -X PUT \
  -H "Content-Type: application/pdf" \
  --upload-file "samples/Baker-Sample_Report.pdf" \
  "$UPLOAD_URL"

echo "✓ PDF uploaded to S3"
echo ""

echo "Step 4: Waiting for processing (this takes ~30-60 seconds)..."
echo "  - Textract will extract text from PDF"
echo "  - Claude AI will analyze and extract issues"
echo ""

for i in {1..12}; do
    sleep 5
    STATUS=$(aws dynamodb get-item \
      --table-name InspectorAssistStack-ReportsTable282F2283-MH2879UVD2SJ \
      --key "{\"PK\":{\"S\":\"REPORT#$REPORT_ID\"},\"SK\":{\"S\":\"METADATA\"}}" \
      --output json 2>/dev/null | jq -r '.Item.status.S')
    
    echo "  [$i] Status: $STATUS"
    
    if [ "$STATUS" == "COMPLETED" ]; then
        echo ""
        echo "✓ Processing complete!"
        break
    elif [ "$STATUS" == "ERROR" ]; then
        echo ""
        echo "✗ Processing failed"
        aws dynamodb get-item \
          --table-name InspectorAssistStack-ReportsTable282F2283-MH2879UVD2SJ \
          --key "{\"PK\":{\"S\":\"REPORT#$REPORT_ID\"},\"SK\":{\"S\":\"METADATA\"}}" \
          --output json | jq '.Item.error'
        exit 1
    fi
done

echo ""
echo "Step 5: Retrieving extracted issues..."
ISSUES=$(aws dynamodb get-item \
  --table-name InspectorAssistStack-ReportsTable282F2283-MH2879UVD2SJ \
  --key "{\"PK\":{\"S\":\"REPORT#$REPORT_ID\"},\"SK\":{\"S\":\"METADATA\"}}" \
  --output json | jq '.Item.issues')

echo "$ISSUES" | jq -r '.L[] | .M | "- \(.Issue.S): \(.Defect.S) at \(.Location.S) (Severity: \(.Severity.S))"'

ISSUE_COUNT=$(echo "$ISSUES" | jq '.L | length')
echo ""
echo "✓ Extracted $ISSUE_COUNT issues"
echo ""

echo "Step 6: Generating negotiation plan..."
PLAN_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"context":"First-time homebuyer, budget-conscious, pre-approved for $350k","style":"balanced"}' \
  "$API_URL/v1/reports/$REPORT_ID/plan")

echo "$PLAN_RESPONSE" | jq -r '.negotiationPlan' | head -50

echo ""
echo "========================================="
echo "Test Complete!"
echo "Report ID: $REPORT_ID"
echo "========================================="
