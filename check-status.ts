import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

const clientId = "4o9paj64knm94ctrqclc38a5ke";
const apiUrl = "https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod/";
const email = "testuser@example.com";
const password = "Password123!";
const reportId = process.argv[2];

if (!reportId) {
    console.error("Please provide a Report ID as an argument.");
    process.exit(1);
}

const cognito = new CognitoIdentityProviderClient({});

async function checkStatus() {
    const authResponse = await cognito.send(new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: email, PASSWORD: password }
    }));

    const idToken = authResponse.AuthenticationResult?.IdToken;

    const response = await fetch(`${apiUrl}v1/reports/${reportId}`, {
        headers: { 'Authorization': idToken! }
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

checkStatus().catch(console.error);
