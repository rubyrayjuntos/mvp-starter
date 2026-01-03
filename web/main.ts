import {
    CognitoIdentityProviderClient,
    InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";

// Constants (from deployed stack)
const CONFIG = {
    USER_POOL_ID: 'us-east-1_AtZZVRIjO',
    CLIENT_ID: '4o9paj64knm94ctrqclc38a5ke',
    API_URL: 'https://p3dy1qpbja.execute-api.us-east-1.amazonaws.com/prod/v1'
};

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

// DOM Elements
const authOverlay = document.getElementById('auth-overlay')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const mainContent = document.getElementById('main-content')!;
const uploadZone = document.getElementById('upload-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const processingStatus = document.getElementById('processing-status')!;
const statusProgress = document.getElementById('status-progress')!;
const statusText = document.getElementById('status-text')!;
const dashboardResults = document.getElementById('dashboard-results')!;
const issuesList = document.getElementById('issues-list')!;
const negotiationPlanDiv = document.getElementById('negotiation-plan')!;

let idToken = '';

// Authentication
loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = (document.getElementById('email') as HTMLInputElement).value;
    const password = (document.getElementById('password') as HTMLInputElement).value;

    try {
        const response = await cognito.send(new InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CONFIG.CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        }));

        idToken = response.AuthenticationResult?.IdToken!;
        authOverlay.style.display = 'none';
        mainContent.style.display = 'block';
    } catch (err) {
        console.error('Auth failed:', err);
        alert('Authentication failed. Verify your access credentials.');
    }
};

// Upload Logic
uploadZone.onclick = () => fileInput.click();

fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    uploadZone.style.display = 'none';
    processingStatus.style.display = 'block';
    updateStatus('Acquiring secure upload tunnel...', 20);

    try {
        // 1. Get Presigned URL
        const uploadResponse = await fetch(`${CONFIG.API_URL}/reports/upload`, {
            method: 'POST',
            headers: {
                'Authorization': idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: file.name })
        });

        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}));
            throw new Error(errorData.error || `Upload initiation failed with status ${uploadResponse.status}`);
        }

        const { uploadUrl, reportId } = await uploadResponse.json();

        // 2. Upload to S3
        updateStatus('Transferring data to AI cluster...', 40);
        const s3Response = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': 'application/pdf' }
        });

        if (!s3Response.ok) {
            throw new Error(`S3 transfer failed with status ${s3Response.status}`);
        }

        // 3. Start Polling
        pollStatus(reportId);
    } catch (err: any) {
        console.error('Upload failed:', err);
        updateStatus(`Transmission Error: ${err.message || 'Unknown issue'}`, 0);
        // Reset view so user can try again
        setTimeout(() => {
            uploadZone.style.display = 'block';
            processingStatus.style.display = 'none';
        }, 3000);
    }
};

async function pollStatus(reportId: string) {
    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;
        const elapsed = attempts * 5;
        updateStatus(`Analyzing document... (${elapsed}s elapsed)`, 40 + Math.min(attempts * 2, 40));

        try {
            const response = await fetch(`${CONFIG.API_URL}/reports/${reportId}`, {
                headers: { 'Authorization': idToken }
            });
            const report = await response.json();

            if (report.status === 'COMPLETED') {
                clearInterval(interval);
                renderResults(report);
            } else if (report.status === 'ERROR') {
                clearInterval(interval);
                updateStatus('Analysis Failed', 0);
            }
        } catch (err) {
            console.error('Polling error:', err);
        }

        if (attempts > 50) {
            clearInterval(interval);
            updateStatus('Timeout reached. Check logs.', 0);
        }
    }, 5000);
}

function updateStatus(text: string, progress: number) {
    statusText.innerText = text;
    statusProgress.style.width = `${progress}%`;
}

function renderResults(report: any) {
    processingStatus.style.display = 'none';
    dashboardResults.style.display = 'grid';

    // Render Issues
    issuesList.innerHTML = report.issues.map((issue: any) => `
        <div class="issue-item severity-${issue.Severity?.toLowerCase() || 'medium'}">
            <strong style="color: var(--text-primary);">${issue.Defect || 'Detected Defect'}</strong>
            <p style="font-size: 0.85rem; margin-top: 0.2rem;">Location: ${issue.Location || 'General'}</p>
            <p style="font-size: 0.85rem; color: var(--accent-blue);">${issue.Issue || 'Structural'}</p>
        </div>
    `).join('');

    // Trigger Negotiation Plan (Auto-generate for MVP)
    generateNegotiationPlan(report.reportId);
}

async function generateNegotiationPlan(reportId: string) {
    updateStatus('Crafting negotiation strategy...', 90);
    try {
        const response = await fetch(`${CONFIG.API_URL}/reports/${reportId}/plan`, {
            method: 'POST',
            headers: {
                'Authorization': idToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                context: 'Competitive market, buyer intends for quick close.',
                style: 'balanced'
            })
        });
        const data = await response.json();
        negotiationPlanDiv.innerText = data.negotiationPlan;
        updateStatus('Ready', 100);
    } catch (err) {
        console.error('Plan generation failed:', err);
    }
}
