import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import fs from 'fs';
import path from 'path';

const userPoolId = "us-east-1_AtZZVRIjO";
const clientId = "4o9paj64knm94ctrqclc38a5ke";
const apiUrl = "https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod/";
const email = "testuser@example.com";
const password = "Password123!";

const cognito = new CognitoIdentityProviderClient({});

async function test() {
    console.log("--- 1. Authenticating ---");
    const authResponse = await cognito.send(new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    }));

    const idToken = authResponse.AuthenticationResult?.IdToken;
    if (!idToken) throw new Error("Could not get ID Token");
    console.log("Successfully authenticated.");

    console.log("\n--- 2. Getting Presigned Upload URL ---");
    const uploadResponse = await fetch(`${apiUrl}v1/reports/upload`, {
        method: 'POST',
        headers: {
            'Authorization': idToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename: "Baker-Sample_Report.pdf" })
    });

    const uploadData = await uploadResponse.json() as any;
    if (!uploadResponse.ok) {
        console.error("Upload URL request failed:", uploadData);
        process.exit(1);
    }

    console.log("Report ID:", uploadData.reportId);
    console.log("Upload URL acquired.");

    console.log("\n--- 3. Uploading Sample PDF ---");
    const pdfPath = path.join(__dirname, 'samples', 'Pre-Pour-Sample.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const s3Response = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: pdfBuffer,
        headers: { 'Content-Type': 'application/pdf' }
    });

    if (s3Response.ok) {
        console.log("PDF uploaded to S3 successfully.");
        console.log("\n--- Pipeline Triggered ---");
        console.log("The AWS environment is now processing your report.");
        console.log("Wait about 30-60 seconds, then check status with:");
        console.log(`curl -H "Authorization: ${idToken.substring(0, 20)}..." ${apiUrl}v1/reports/${uploadData.reportId}`);
    } else {
        console.error("S3 upload failed:", s3Response.statusText);
    }
}

test().catch(console.error);
