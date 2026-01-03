const API_URL = 'https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod/v1';
const COGNITO_CLIENT_ID = '4o9paj64knm94ctrqclc38a5ke';
const USERNAME = 'testuser@example.com';
const PASSWORD = 'Password123!';

async function authenticate() {
    const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
    const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });

    try {
        const response = await client.send(new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: COGNITO_CLIENT_ID,
            AuthParameters: {
                USERNAME,
                PASSWORD,
            },
        }));
        return response.AuthenticationResult.IdToken;
    } catch (error) {
        console.error("Auth failed:", error);
        process.exit(1);
    }
}

async function testNegotiation(reportId: string) {
    const token = await authenticate();
    console.log(`\n--- Testing Negotiation for report: ${reportId} ---`);

    try {
        const response = await fetch(`${API_URL}/reports/${reportId}/plan`, {
            method: 'POST',
            body: JSON.stringify({
                context: 'Competitive market, buyer needs to close quickly.',
                style: 'balanced'
            }),
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
        });

        const data = await response.json();
        console.log('\nNegotiation Response:');
        console.log(JSON.stringify(data, null, 2));
    } catch (error: any) {
        console.error('Negotiation test failed:', error.message);
    }
}

const reportId = process.argv[2];
if (!reportId) {
    console.error("Please provide a reportId");
    process.exit(1);
}

testNegotiation(reportId);
