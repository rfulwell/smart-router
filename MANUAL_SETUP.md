# Manual Setup Steps

These are actions that require human intervention — they cannot be automated from this repo. Complete them in order.

---

## Phase 2: Google Cloud & Workspace Setup

### Step 1: Create a GCP Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project**
3. Name it `voice-capture` (or your preferred name)
4. Note your **Project ID** — you'll need it for GitHub Secrets

### Step 2: Enable Google APIs
In the GCP Console, go to **APIs & Services > Library** and enable:
- [ ] Google Sheets API
- [ ] Google Docs API
- [ ] Google Drive API

### Step 3: Create a Service Account
1. Go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Name: `voice-capture-sa`
4. Grant roles: none needed (it accesses shared resources)
5. Click **Create Key** > JSON
6. Download the JSON key file
7. Base64-encode it: `cat key.json | base64 -w 0` (save this — it's your `GOOGLE_SERVICE_ACCOUNT_KEY`)
8. Note the service account email (looks like `voice-capture-sa@project-id.iam.gserviceaccount.com`)

### Step 4: Run the Bootstrap Script
1. Copy `.env.example` to `.env`
2. Fill in `GOOGLE_SERVICE_ACCOUNT_KEY` (base64-encoded JSON from Step 3)
3. Run: `npm run bootstrap`
4. The script will output all the Google resource IDs — copy them into your `.env`

### Step 5: Share Google Resources with the Service Account
The bootstrap script creates resources owned by the service account, so sharing is automatic. If you created resources manually:
- [ ] Share the root Drive folder with the service account email
- [ ] Give it **Editor** access

### Step 6: Run the Seed Script
1. Ensure your `.env` has `CONFIG_SHEET_ID` set (from Step 4 output)
2. Run: `npm run seed`
3. Open the Config Sheet in Google Sheets to verify data looks correct
4. Customize the projects and tags to match your actual interests

### Step 7: Test Locally
1. Fill in remaining `.env` values: `ANTHROPIC_API_KEY`, `WEBHOOK_SECRET` (pick any random string)
2. Run: `npm run dev`
3. In another terminal:
   ```bash
   curl -X POST http://localhost:8080/webhook \
     -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"text": "idea for a CLI tool that scaffolds projects", "source": "test"}'
   ```
4. Verify:
   - [ ] Server returns `{"status":"accepted"}`
   - [ ] Activity Log Sheet has a new row
   - [ ] A new Google Doc appears in the Ideas folder (if classified as new_idea)

---

## Phase 4: Deployment Setup

### Step 8: Set Up Artifact Registry
```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com

gcloud artifacts repositories create voice-capture \
  --repository-format=docker \
  --location=us-central1
```

### Step 9: Set Up Workload Identity Federation
This lets GitHub Actions deploy to GCP without a JSON key. Follow:
1. Create a Workload Identity Pool:
   ```bash
   gcloud iam workload-identity-pools create "github" \
     --location="global" \
     --display-name="GitHub Actions"
   ```
2. Create a Provider for your GitHub repo:
   ```bash
   gcloud iam workload-identity-pools providers create-oidc "github-provider" \
     --location="global" \
     --workload-identity-pool="github" \
     --display-name="GitHub" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --issuer-uri="https://token.actions.githubusercontent.com"
   ```
3. Grant the service account permissions:
   ```bash
   gcloud iam service-accounts add-iam-policy-binding voice-capture-sa@PROJECT_ID.iam.gserviceaccount.com \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_GITHUB_USER/smart-router"
   ```
4. Grant Cloud Run and Artifact Registry permissions to the service account:
   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:voice-capture-sa@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/run.admin"

   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:voice-capture-sa@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/artifactregistry.writer"

   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="serviceAccount:voice-capture-sa@PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/iam.serviceAccountUser"
   ```

### Step 10: Store Secrets in Google Secret Manager
```bash
echo -n "YOUR_ANTHROPIC_KEY" | gcloud secrets create anthropic-api-key --data-file=-
echo -n "YOUR_BASE64_SA_KEY" | gcloud secrets create google-sa-key --data-file=-
echo -n "YOUR_WEBHOOK_SECRET" | gcloud secrets create webhook-secret --data-file=-
```

Grant the Cloud Run service account access to read these secrets:
```bash
gcloud secrets add-iam-policy-binding anthropic-api-key \
  --member="serviceAccount:voice-capture-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
# Repeat for google-sa-key and webhook-secret
```

### Step 11: Configure GitHub Repository Secrets
Go to your repo **Settings > Secrets and variables > Actions** and add:
- [ ] `GCP_PROJECT_ID` — your GCP project ID
- [ ] `GCP_WORKLOAD_IDENTITY_PROVIDER` — full provider resource name from Step 9
- [ ] `GCP_SERVICE_ACCOUNT` — service account email from Step 3
- [ ] `ANTHROPIC_API_KEY` — your Claude API key
- [ ] `WEBHOOK_SECRET` — same secret you chose in Step 7
- [ ] `CONFIG_SHEET_ID` — from Step 4 output
- [ ] `LINKS_SHEET_ID` — from Step 4 output
- [ ] `ACTIVITY_LOG_SHEET_ID` — from Step 4 output
- [ ] `IDEAS_FOLDER_ID` — from Step 4 output
- [ ] `INBOX_DOC_ID` — from Step 4 output

### Step 12: First Deploy
Push to the branch or merge to main. The GitHub Action will:
1. Run tests
2. Build the Docker image
3. Push to Artifact Registry
4. Deploy to Cloud Run

After deploy, note your Cloud Run service URL.

---

## Phase 5: Connect Input Sources

### Step 13: Configure IFTTT (Google Home Voice Input)
1. Go to [ifttt.com](https://ifttt.com) and create an account
2. Create a new applet:
   - **If This**: Google Assistant V2 > "Say a phrase with a text ingredient"
   - **Trigger phrase**: "Capture $"
   - **Then That**: Webhooks > Make a web request
     - URL: `https://YOUR-CLOUD-RUN-URL/webhook`
     - Method: `POST`
     - Content-Type: `application/json`
     - Headers: `Authorization: Bearer YOUR_WEBHOOK_SECRET`
     - Body: `{"text": "{{TextField}}", "source": "voice", "timestamp": "{{CreatedAt}}"}`
3. Test by saying: "Hey Google, capture — idea for a browser extension"
4. Verify in your Activity Log Sheet

### Step 14: Configure HTTP Shortcuts (Android Link Sharing)
1. Install [HTTP Shortcuts](https://http-shortcuts.rmy.ch/) from the Play Store
2. Create a new shortcut:
   - **Type**: Regular Shortcut / Share intent receiver
   - **Method**: POST
   - **URL**: `https://YOUR-CLOUD-RUN-URL/webhook`
   - **Headers**: `Authorization: Bearer YOUR_WEBHOOK_SECRET`
   - **Body** (custom): `{"text": "{{share_text}}", "source": "share"}`
3. Enable "Accept as share target"
4. Test by sharing a URL from Chrome

### Step 15: End-to-End Verification
Test the complete chain:
- [ ] Voice: "Hey Google, capture — save this great article about Rust async patterns"
  - Check: IFTTT activity log fired
  - Check: Cloud Run received request (Cloud Logging)
  - Check: Activity Log Sheet has new row
  - Check: Appropriate Google resource was created/updated
- [ ] Share: Share a URL from Chrome via HTTP Shortcuts
  - Check: Links Sheet has new row with the URL
  - Check: Activity Log Sheet has new row

---

## Summary Checklist

| Step | What | Where | Done? |
|------|------|-------|-------|
| 1 | Create GCP project | GCP Console | [ ] |
| 2 | Enable APIs (Sheets, Docs, Drive) | GCP Console | [ ] |
| 3 | Create service account + download key | GCP Console | [ ] |
| 4 | Run bootstrap script | Terminal | [ ] |
| 5 | Share resources with SA | Google Drive | [ ] |
| 6 | Run seed script | Terminal | [ ] |
| 7 | Test locally with curl | Terminal | [ ] |
| 8 | Set up Artifact Registry | gcloud CLI | [ ] |
| 9 | Set up Workload Identity Federation | gcloud CLI | [ ] |
| 10 | Store secrets in Secret Manager | gcloud CLI | [ ] |
| 11 | Add GitHub repo secrets | GitHub Settings | [ ] |
| 12 | First deploy | git push | [ ] |
| 13 | Configure IFTTT applet | ifttt.com | [ ] |
| 14 | Configure HTTP Shortcuts | Android phone | [ ] |
| 15 | End-to-end verification | All systems | [ ] |
