# Voice Capture System — Implementation Plan

A voice-driven personal knowledge ingestion pipeline that turns Google Home commands into organized knowledge across Google Workspace. Everything lives in one repo, deployed to Google Cloud Run via GitHub Actions.

---

## Stack Summary

| Component | Technology | Cost |
|---|---|---|
| Runtime | Google Cloud Run (serverless) | Free tier |
| Language | TypeScript + Express | — |
| Intelligence | Claude Haiku API | ~$1/mo |
| Storage | Google Sheets + Docs + Drive | Free |
| Deploy | GitHub Actions → Cloud Run | Free |
| Voice bridge | IFTTT (Google Assistant → webhook) | Free |
| Link sharing | HTTP Shortcuts Android app → webhook | Free |
| **Total** | | **~$1–3/mo** |

---

## Architecture

### Data Flow

```
Google Home (voice)          Android Share (links)
        │                            │
        ▼                            ▼
    IFTTT Applet              HTTP Shortcuts App
        │                            │
        └──────────┬─────────────────┘
                   ▼
         POST /webhook (Cloud Run)
                   │
                   ▼
         ┌─────────────────┐
         │  Validate req   │
         │  Fetch config   │  ← reads Projects & Tags from Config Sheet
         │  Call Claude     │  → returns structured JSON
         │  Route action    │
         └────────┬────────┘
                  │
       ┌──────────┼──────────┬──────────┐
       ▼          ▼          ▼          ▼
   save_link  new_idea  append_to   inbox
       │          │      _project      │
       ▼          ▼          ▼          ▼
  Links Sheet  New Doc   Existing   Inbox Doc
              in Ideas   Project
              folder     Doc
                  │
                  ▼
           Activity Log Sheet
          (always, every request)
```

### Input Sources

**Voice (Google Home → IFTTT → Cloud Run)**
- You say: "Hey Google, capture — [anything]"
- IFTTT extracts the text after the trigger phrase
- POSTs to your Cloud Run webhook with `{ "text": "...", "source": "voice" }`

**Link Share (Android → HTTP Shortcuts → Cloud Run)**
- Share a URL from Chrome or any app
- HTTP Shortcuts app appears in the share sheet
- POSTs to the same webhook with `{ "text": "...", "source": "share" }`
- Optionally prompts for a comment before sending

**Future: Bespoke Android App**
- Same webhook endpoint
- Richer UI: project picker, tag selector, voice recording
- Fetches project/tag list from a `/config` endpoint on your service

### Classification

Claude Haiku receives the raw text plus your full list of projects and tags (fetched from the Config Sheet). It returns structured JSON:

```json
{
  "action": "save_link | new_idea | append_to_project | inbox",
  "url": "https://example.com or null",
  "tags": ["rust", "async"],
  "project": "compiler or null",
  "title": "Short title for the capture",
  "comment": "Your commentary, cleaned up",
  "confidence": 0.92
}
```

If confidence is below 0.6, the action defaults to `inbox` so nothing is lost.

### Actions

**save_link** — Appends a row to the Saved Links Google Sheet: timestamp, URL, comment, tags, source project, raw input.

**new_idea** — Creates a new Google Doc in the "Project Ideas" Drive folder. Title and body are populated from the LLM output. Optionally adds a row to the Config Sheet's Projects tab with status "idea".

**append_to_project** — Looks up the project's Doc ID from the Config Sheet. Appends a timestamped section to that Google Doc with the note content and tags.

**inbox** — Catch-all. Appends to an Inbox Google Doc with raw input and whatever partial parsing the LLM could produce. You triage this manually.

### Logging

Every request — regardless of action — gets logged to the Activity Log Sheet with: timestamp, raw input, source (voice/share), parsed action, parsed tags, destination, status, and error message if any. This is your debugging lifeline and the source for weekly digests.

---

## Repository Structure

```
voice-capture/
├── .github/
│   └── workflows/
│       ├── deploy.yml              # Deploy to Cloud Run on push to main
│       └── setup-sheets.yml        # One-time: bootstrap Google Sheets & Drive
│
├── src/
│   ├── index.ts                    # Express app entry point
│   │
│   ├── routes/
│   │   └── webhook.ts              # POST /webhook — single entry point
│   │
│   ├── classifier/
│   │   ├── prompt.ts               # Claude prompt template
│   │   ├── classify.ts             # Call Claude API, parse response
│   │   └── schema.ts               # Zod schema for LLM output validation
│   │
│   ├── actions/
│   │   ├── save-link.ts            # Append row to Links sheet
│   │   ├── new-idea.ts             # Create Google Doc in Ideas folder
│   │   ├── append-project.ts       # Append to existing project doc
│   │   └── inbox.ts                # Catch-all: append to Inbox doc
│   │
│   ├── services/
│   │   ├── sheets.ts               # Google Sheets read/write helpers
│   │   ├── docs.ts                 # Google Docs append helpers
│   │   └── drive.ts                # Google Drive folder/file helpers
│   │
│   ├── config/
│   │   └── registry.ts             # Fetch projects & tags from Config Sheet
│   │
│   └── logger.ts                   # Log every transaction to Activity Log
│
├── scripts/
│   ├── bootstrap-drive.ts          # Create folder structure & sheets
│   └── seed-config.ts              # Seed initial projects & tags
│
├── Dockerfile
├── package.json
├── tsconfig.json
├── .env.example                    # Document required env vars
└── README.md
```

### Design Rationale

**Why TypeScript?** Type safety for the Google API wrappers and Zod validation of LLM output. Catches errors at build time instead of at 2am when you mumble something weird at Google Home.

**Why Express?** Simplicity and ecosystem. Express is boring in a good way. The routing logic is framework-agnostic — swap to Hono or Fastify later if you want.

**Why a service account instead of OAuth?** No token refresh dance, no user consent flow. The service account has permanent access to the specific Sheets and Folders you share with it. Perfect for a backend service.

**Why Google Sheets as a config store?** You can edit your projects and tags from your phone in the Sheets app. No redeploy needed. The service reads the sheet on every request (fast enough for personal use).

**Why not a database?** For personal use, Sheets IS your database. It's queryable, editable, shareable, and free. If you ever outgrow it, swap in Firestore — the service wrappers make this a clean refactor.

---

## Environment Variables

### Secrets (store in GitHub Actions secrets + Cloud Run secret manager)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for classification |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | JSON key for GCP service account (base64 encoded) |
| `WEBHOOK_SECRET` | Shared secret to validate incoming requests |

### Config (can be committed to repo or stored as env vars)

| Variable | Description |
|---|---|
| `CONFIG_SHEET_ID` | Google Sheet ID for projects/tags registry |
| `LINKS_SHEET_ID` | Google Sheet ID for saved links |
| `ACTIVITY_LOG_SHEET_ID` | Google Sheet ID for activity log |
| `IDEAS_FOLDER_ID` | Google Drive folder ID for new project ideas |
| `INBOX_DOC_ID` | Google Doc ID for catch-all inbox |

---

## Implementation Phases

### Phase 1: Repo & Local Dev Setup (~1 hour)

#### 1.1 Initialize the repo

```bash
mkdir voice-capture && cd voice-capture
npm init -y
npm i express @anthropic-ai/sdk googleapis zod dotenv
npm i -D typescript @types/express @types/node tsx
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

Add scripts to `package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

#### 1.2 Create the Express skeleton

`src/index.ts` — minimal Express app:

```typescript
import express from 'express';
import { webhookRouter } from './routes/webhook';

const app = express();
app.use(express.json());
app.use('/webhook', webhookRouter);
app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Voice capture service listening on port ${port}`);
});
```

Cloud Run sets the `PORT` environment variable automatically.

#### 1.3 Create the webhook route

`src/routes/webhook.ts` — accepts POST from IFTTT and HTTP Shortcuts:

- Validates the shared secret (Bearer token in Authorization header)
- Extracts `{ text, source, timestamp }` from the request body
- Passes to classifier → router → action → logger
- Returns 200 immediately (IFTTT has a short timeout)

Consider using Google Cloud Tasks for async processing if you want to decouple the HTTP response from the work. For personal use this is unlikely to be necessary — the whole pipeline runs in under 3 seconds.

#### 1.4 Write the Dockerfile

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

Multi-stage build keeps the image small (~150MB).

---

### Phase 2: Google Workspace Setup (~1 hour)

#### 2.1 Create a GCP project and service account

1. Go to `console.cloud.google.com` → New Project → name it "voice-capture"
2. Enable APIs: Google Sheets API, Google Docs API, Google Drive API
3. Go to IAM & Admin → Service Accounts → Create Service Account
4. Download the JSON key file
5. Share your Google Sheets and Drive folders with the service account's email address (it looks like `name@project-id.iam.gserviceaccount.com`)

This service account is how your Cloud Run app authenticates with Google Workspace. No OAuth flow needed.

#### 2.2 Write the bootstrap script

`scripts/bootstrap-drive.ts` — run once to create the full folder and file structure:

1. Root folder: "Voice Capture System"
2. Subfolder: "Project Notes"
3. Subfolder: "Project Ideas"
4. Subfolder: "System"
5. Config Sheet with two tabs: "Projects" (columns: Project Name, Doc ID, Status, Description) and "Tags" (columns: Tag Name, Category)
6. Saved Links Sheet (columns: Date, URL, Comment, Tags, Source Project, Raw Input)
7. Activity Log Sheet (columns: Timestamp, Raw Input, Source, Parsed Action, Parsed Tags, Destination, Status, Error)
8. Inbox Google Doc

The script should output all the IDs you need for your `.env` file. Run with:

```bash
npx tsx scripts/bootstrap-drive.ts
```

#### 2.3 Write the seed script

`scripts/seed-config.ts` — populates the Config Sheet with your initial data:

- 3–5 existing projects with names, doc IDs, status, and descriptions
- 10–15 tags you commonly use, organized by category

This gives the LLM enough context to start being useful and also serves as a reference for the expected data format.

#### 2.4 Create Google API service wrappers

`src/services/sheets.ts`:
- `readRows(sheetId, range)` → `string[][]`
- `appendRow(sheetId, range, values)` → `void`

`src/services/docs.ts`:
- `appendSection(docId, content)` → `void`
- `createDoc(folderId, title, body)` → `string` (returns new doc ID)

`src/services/drive.ts`:
- `createFolder(parentId, name)` → `string`

Keep these thin — just wrap the `googleapis` SDK. This abstraction layer makes it easy to swap in Firestore or another backend later.

---

### Phase 3: Classification & Routing (~2 hours)

#### 3.1 Define the output schema

`src/classifier/schema.ts` — use Zod for runtime validation:

```typescript
import { z } from 'zod';

export const CaptureAction = z.object({
  action: z.enum(['save_link', 'new_idea', 'append_to_project', 'inbox']),
  url: z.string().url().nullable(),
  tags: z.array(z.string()),
  project: z.string().nullable(),
  title: z.string(),
  comment: z.string(),
  confidence: z.number().min(0).max(1),
});

export type CaptureAction = z.infer<typeof CaptureAction>;
```

The confidence field lets you route low-confidence items to inbox automatically.

#### 3.2 Write the Claude prompt

`src/classifier/prompt.ts` — template function that takes raw text, list of projects, and list of tags. Returns a system prompt and user message.

Key prompt engineering principles:

- "Return ONLY valid JSON, no markdown fences, no explanation"
- "Match tags from the provided list. Only invent new tags if nothing matches."
- "If a URL is mentioned but mangled by voice transcription, do your best to reconstruct it"
- "If you are not confident in the classification, set action to 'inbox' and confidence below 0.6"
- Include 3–4 few-shot examples covering each action type

Example prompt structure:

```
System: You are a personal knowledge router. Given the user's voice input 
and their list of projects and tags, return a JSON object with the following 
fields: action, url, tags, project, title, comment, confidence.

[Few-shot examples here]

Available projects: {{ projects }}
Available tags: {{ tags }}

User: {{ raw_text }}
```

#### 3.3 Implement the classifier

`src/classifier/classify.ts`:

1. Fetch registry (projects + tags) from Config Sheet via `registry.ts`
2. Build prompt with registry context
3. Call Claude Haiku API (`claude-haiku-4-5-20251001`)
4. Parse response as JSON
5. Validate with Zod schema
6. If validation fails → default to `inbox` action with the raw input preserved

Use Haiku for speed and cost. At ~$0.25 per 1M input tokens and ~$1.25 per 1M output tokens, a few hundred requests per month costs well under a dollar.

#### 3.4 Implement the action router

In `src/routes/webhook.ts`, after classification:

```typescript
switch (result.action) {
  case 'save_link':
    await saveLink(result);
    break;
  case 'new_idea':
    await newIdea(result);
    break;
  case 'append_to_project':
    await appendToProject(result);
    break;
  default:
    await inbox(result);
}

// Always log, regardless of action
await logActivity(rawInput, source, result);
```

#### 3.5 Implement each action

`src/actions/save-link.ts`: Append a row to the Saved Links Sheet — `[timestamp, url, comment, tags.join(', '), project, rawInput]`.

`src/actions/new-idea.ts`: Create a new Google Doc in the Ideas folder with the LLM-generated title and body. Optionally add a row to the Config Sheet's Projects tab with status "idea".

`src/actions/append-project.ts`: Look up the project's Doc ID from the registry. Append a timestamped section to the Google Doc:

```
---
📅 2026-02-07 14:32
🏷️ rust, async, performance
Found a great article on Rust async patterns. The key insight is...
---
```

`src/actions/inbox.ts`: Append to the Inbox Doc with raw input and whatever partial parsing the LLM produced. Include the source and timestamp.

---

### Phase 4: Deploy Pipeline (~1 hour)

#### 4.1 Enable Cloud Run in GCP

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create an Artifact Registry repo for Docker images
gcloud artifacts repositories create voice-capture \
  --repository-format=docker \
  --location=us-central1
```

#### 4.2 Set up Workload Identity Federation

This lets GitHub Actions authenticate to GCP without storing a JSON key. Follow the [GitHub guide for configuring WIF](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation).

The key steps:
1. Create a Workload Identity Pool in GCP
2. Create a Provider linked to your GitHub repo
3. Grant the pool's service account permissions to deploy to Cloud Run and push to Artifact Registry

#### 4.3 Write the GitHub Action

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Required for WIF

    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Build and push Docker image
        run: |
          gcloud auth configure-docker us-central1-docker.pkg.dev
          docker build -t us-central1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/voice-capture/app:${{ github.sha }} .
          docker push us-central1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/voice-capture/app:${{ github.sha }}

      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy voice-capture \
            --image us-central1-docker.pkg.dev/${{ secrets.GCP_PROJECT_ID }}/voice-capture/app:${{ github.sha }} \
            --region us-central1 \
            --platform managed \
            --allow-unauthenticated \
            --set-env-vars="CONFIG_SHEET_ID=${{ secrets.CONFIG_SHEET_ID }},LINKS_SHEET_ID=${{ secrets.LINKS_SHEET_ID }},ACTIVITY_LOG_SHEET_ID=${{ secrets.ACTIVITY_LOG_SHEET_ID }},IDEAS_FOLDER_ID=${{ secrets.IDEAS_FOLDER_ID }},INBOX_DOC_ID=${{ secrets.INBOX_DOC_ID }}" \
            --set-secrets="ANTHROPIC_API_KEY=anthropic-api-key:latest,GOOGLE_SERVICE_ACCOUNT_KEY=google-sa-key:latest,WEBHOOK_SECRET=webhook-secret:latest"
```

Note: The `--set-secrets` flag references secrets stored in Google Secret Manager, which is the recommended approach for Cloud Run. Alternatively, you can pass them as env vars from GitHub Secrets.

#### 4.4 Store secrets in GitHub

In your repo → Settings → Secrets and variables → Actions:

- `GCP_PROJECT_ID`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `ANTHROPIC_API_KEY`
- `WEBHOOK_SECRET`
- `CONFIG_SHEET_ID`
- `LINKS_SHEET_ID`
- `ACTIVITY_LOG_SHEET_ID`
- `IDEAS_FOLDER_ID`
- `INBOX_DOC_ID`

#### 4.5 First deploy and test

Push to `main` → GitHub Action builds and deploys → Cloud Run gives you a URL.

Test with curl:

```bash
curl -X POST https://your-service-xyz.run.app/webhook \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text": "idea for a CLI tool that scaffolds projects", "source": "test"}'
```

Verify:
- Activity Log sheet has a new row
- Ideas folder has a new Google Doc
- The doc contains the parsed title and body

---

### Phase 5: Connect Input Sources (~30 minutes)

#### 5.1 IFTTT applet: Google Home → Cloud Run

Create an IFTTT applet:

- **Trigger**: Google Assistant V2 → "Say a phrase with a text ingredient"
- **Trigger phrase**: "Capture $" (the $ captures everything after)
- **Action**: Webhooks → Make a web request
  - URL: `https://your-service-xyz.run.app/webhook`
  - Method: POST
  - Content-Type: `application/json`
  - Headers: `Authorization: Bearer YOUR_WEBHOOK_SECRET`
  - Body: `{ "text": "{{TextField}}", "source": "voice", "timestamp": "{{CreatedAt}}" }`

#### 5.2 HTTP Shortcuts: Android share → Cloud Run

Install [HTTP Shortcuts](https://http-shortcuts.rmy.ch/) from the Play Store (free, open source).

Create a shortcut:
- **Type**: Share intent receiver
- **Method**: POST
- **URL**: `https://your-service-xyz.run.app/webhook`
- **Headers**: `Authorization: Bearer YOUR_WEBHOOK_SECRET`
- **Body**: `{ "text": "{{share_text}}", "source": "share" }`

Optional: enable the input dialog to add a comment before sending. The LLM will parse out the URL from your commentary.

Alternative: If you already use Tasker, create a profile with a Share intent trigger and an HTTP POST task.

#### 5.3 End-to-end voice test

Say: "Hey Google, capture — I want to build a browser extension that highlights code snippets"

Verify the full chain:
1. Google Assistant acknowledges
2. IFTTT fires (check IFTTT activity log)
3. Cloud Run receives the request (check Cloud Logging)
4. Claude classifies it as `new_idea`
5. A new Google Doc appears in the Ideas folder
6. Activity Log sheet has a row with all the details

---

### Phase 6: Polish & Extend (Ongoing)

#### 6.1 Request validation middleware

- Validate the webhook secret on every request
- Validate request body shape with Zod
- Add rate limiting (express-rate-limit) as a safety net
- Consider using Cloud Run's built-in IAM authentication for stronger security

#### 6.2 Error handling and retries

- Wrap Google API calls in retry logic (the googleapis SDK can be flaky)
- If the Claude API fails, fall back to `inbox` action so nothing is lost
- Send yourself a notification on errors (Pushover, email, or a Google Chat webhook)

#### 6.3 Tune the Claude prompt

After a week of use, review your Activity Log. Look for misclassifications and add examples to your prompt:

- "When the user says 'idea for...' or 'what if we...', always classify as new_idea"
- "When the user mentions an existing project by name, always classify as append_to_project"
- "When the input contains a URL with no other context, classify as save_link"

#### 6.4 Weekly digest

Use Google Cloud Scheduler to hit a `/digest` endpoint on your service every Sunday at 9am:

1. Read the Activity Log for the past 7 days
2. Send to Claude for summarization
3. Create a "Week of [date]" Google Doc with the summary

This is a great way to review what you captured and spot patterns.

#### 6.5 Multi-trigger phrases

Set up separate IFTTT applets to give the LLM a head start:

- "Capture link..." → `{ "source": "voice_link" }`
- "Note for [project]..." → `{ "source": "voice_project" }`
- "New idea..." → `{ "source": "voice_idea" }`

The source field can bias the LLM's classification for higher accuracy.

#### 6.6 Bespoke Android app

When you're ready to graduate from HTTP Shortcuts, build a purpose-built Android app (Kotlin or Flutter):

- Receives share intents
- Fetches your project/tag list from a `/config` endpoint on your service (or directly from the Config Sheet via Google API)
- Shows a project picker and tag selector UI
- Lets you type or dictate a comment
- Supports offline queue that syncs when connected
- POSTs to the same `/webhook` endpoint

Same backend, richer input experience.

#### 6.7 Monitoring

- Cloud Run has built-in logging via Cloud Logging — all `console.log` output is captured
- Set up a Cloud Monitoring alert for error rate > 0% over 5 minutes
- The Activity Log sheet is your application-level audit trail
- Consider adding a `/stats` endpoint that returns capture counts by action type and time period

---

## Google Workspace Structure

```
Google Drive
└── Voice Capture System/
    ├── Project Notes/
    │   ├── Compiler Project.gdoc
    │   ├── Browser Extension.gdoc
    │   └── ... (one doc per project)
    ├── Project Ideas/
    │   ├── CLI Scaffolding Tool.gdoc
    │   └── ... (new ideas land here)
    └── System/
        ├── Config.gsheet          ← your control panel
        │   ├── Tab: Projects      (name, doc ID, status, description)
        │   └── Tab: Tags          (name, category)
        ├── Saved Links.gsheet     ← link bookmarks with tags
        ├── Activity Log.gsheet    ← every transaction logged
        └── Inbox.gdoc             ← catch-all for low-confidence items
```

---

## What's In Repo vs. What's Not

**100% in repo (version controlled, deployed via git push):**
- Express application (all routing, classification, actions, services)
- Claude classification prompt and few-shot examples
- Zod validation schemas
- Google API service wrappers
- Bootstrap and seed scripts
- Dockerfile
- GitHub Actions deploy workflow
- README and documentation

**One-time GUI setup (not in repo, but stable once configured):**
- GCP project creation and API enablement
- Service account creation and key download
- Workload Identity Federation setup
- IFTTT applet configuration
- HTTP Shortcuts app configuration on phone
- Sharing Google Drive folders with the service account

---

## Quick Reference

### Local development
```bash
cp .env.example .env        # Fill in your values
npm run dev                  # Starts with hot reload on :8080
```

### Bootstrap Google Workspace
```bash
npx tsx scripts/bootstrap-drive.ts   # Creates all folders, sheets, docs
npx tsx scripts/seed-config.ts       # Seeds initial projects and tags
```

### Deploy
```bash
git push origin main         # GitHub Action handles build + deploy
```

### Test the webhook
```bash
curl -X POST https://your-service.run.app/webhook \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text": "save this link https://example.com about testing patterns — tag it for the API project", "source": "test"}'
```

### Add a new project
Open the Config Sheet on your phone → Projects tab → add a row. No redeploy needed.

### Add new tags
Open the Config Sheet on your phone → Tags tab → add a row. No redeploy needed.

### Check what was captured
Open the Activity Log Sheet to see every transaction with full details.

---

## Detailed Implementation Breakdown

Below is a granular, file-by-file breakdown of every implementation task, organized by phase. Each task specifies exactly what to build, the function signatures, key decisions, and acceptance criteria.

---

### Phase 1: Repo & Local Dev Setup — Detailed Tasks

#### Task 1.1.1: Create `package.json`
- **What**: Initialize with `npm init -y`, then customize
- **Key fields**: name (`smart-router`), description, scripts (`dev`, `build`, `start`, `bootstrap`, `seed`)
- **Dependencies**: express, @anthropic-ai/sdk, googleapis, zod, dotenv
- **Dev dependencies**: typescript, @types/express, @types/node, tsx
- **Acceptance**: `npm install` completes without errors

#### Task 1.1.2: Create `tsconfig.json`
- **What**: TypeScript compiler configuration
- **Key settings**: target ES2022, module NodeNext, moduleResolution NodeNext, strict mode, outDir `dist`, rootDir `src`
- **Acceptance**: `npx tsc --noEmit` exits cleanly

#### Task 1.1.3: Create `.env.example`
- **What**: Document every required environment variable with descriptions
- **Sections**: Secrets (ANTHROPIC_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY, WEBHOOK_SECRET), Config IDs (CONFIG_SHEET_ID, LINKS_SHEET_ID, ACTIVITY_LOG_SHEET_ID, IDEAS_FOLDER_ID, INBOX_DOC_ID), Optional (PORT)
- **Acceptance**: New developer can copy this and know exactly what to fill in

#### Task 1.1.4: Create `.gitignore`
- **What**: Exclude node_modules, dist, .env, source maps
- **Acceptance**: `git status` doesn't show generated files

#### Task 1.2.1: Create `src/index.ts` — Express entry point
- **What**: Minimal Express app with JSON body parsing
- **Routes**: mount `webhookRouter` at `/webhook`, health check at `GET /health`
- **Port**: Read from `process.env.PORT`, default `8080` (Cloud Run convention)
- **Imports**: `dotenv/config` at top for .env loading in local dev
- **Acceptance**: `npm run dev` starts server, `curl localhost:8080/health` returns `ok`

#### Task 1.3.1: Create `src/routes/webhook.ts` — Webhook handler
- **What**: POST endpoint that receives voice/share input
- **Input validation**: Zod schema for `{ text: string, source: string, timestamp?: string }`
- **Auth**: Compare `Authorization: Bearer <secret>` header against `WEBHOOK_SECRET` env var
- **Response pattern**: Return `200 { status: "accepted" }` immediately, then process asynchronously
- **Processing pipeline**: classify → route to action → log activity
- **Error handling**: On processing failure, log error to Activity Log Sheet and console
- **Action routing**: switch on `result.action` — `save_link`, `new_idea`, `append_to_project`, default → `inbox`
- **Acceptance**: Accepts well-formed POST, rejects missing/bad auth, rejects invalid body shapes

#### Task 1.4.1: Create `Dockerfile`
- **What**: Multi-stage Docker build for Cloud Run deployment
- **Stage 1 (builder)**: node:20-slim, `npm ci`, `npm run build`
- **Stage 2 (runtime)**: node:20-slim, copy only `dist/`, `node_modules/`, `package*.json`
- **Env**: NODE_ENV=production, CMD `node dist/index.js`
- **Acceptance**: `docker build .` succeeds, image size ~150MB

---

### Phase 2: Google Workspace Setup — Detailed Tasks

#### Task 2.1.1: Create `src/services/auth.ts` — Google auth helper
- **What**: Centralized Google API authentication using service account
- **Functions**:
  - `getAuth()` → GoogleAuth instance from base64-decoded `GOOGLE_SERVICE_ACCOUNT_KEY`
  - `getSheetsClient()` → Google Sheets v4 client
  - `getDocsClient()` → Google Docs v1 client
  - `getDriveClient()` → Google Drive v3 client
- **Scopes**: spreadsheets, documents, drive
- **Acceptance**: All three clients can be instantiated without error when key is set

#### Task 2.2.1: Create `src/services/sheets.ts` — Sheets wrapper
- **Functions**:
  - `readRows(sheetId: string, range: string): Promise<string[][]>` — reads a range, returns 2D array
  - `appendRow(sheetId: string, range: string, values: string[]): Promise<void>` — appends one row
- **Value input option**: `USER_ENTERED` for append (allows Sheets to auto-format dates)
- **Acceptance**: Can read from and write to a test sheet

#### Task 2.2.2: Create `src/services/docs.ts` — Docs wrapper
- **Functions**:
  - `appendSection(docId: string, content: string): Promise<void>` — appends text with separator at end of doc
  - `createDoc(folderId: string, title: string, body: string): Promise<string>` — creates doc in folder, returns ID
- **Implementation details**:
  - `appendSection`: Get doc length, insert at `endIndex - 1` with `\n---\n` prefix
  - `createDoc`: Create via Docs API, insert body text, then move to target folder via Drive API
- **Acceptance**: Can create a new doc and append to an existing one

#### Task 2.2.3: Create `src/services/drive.ts` — Drive wrapper
- **Functions**:
  - `createFolder(parentId: string, name: string): Promise<string>` — creates subfolder, returns ID
- **Acceptance**: Can create a folder in Drive

#### Task 2.3.1: Create `scripts/bootstrap-drive.ts` — One-time setup script
- **What**: Creates the full Google Workspace folder/file structure
- **Creates**:
  1. Root folder "Voice Capture System"
  2. Subfolder "Project Notes"
  3. Subfolder "Project Ideas"
  4. Subfolder "System"
  5. Config Sheet in System (with "Projects" and "Tags" tabs, header rows)
  6. Saved Links Sheet in System (with header row: Date, URL, Comment, Tags, Source Project, Raw Input)
  7. Activity Log Sheet in System (with header: Timestamp, Raw Input, Source, Parsed Action, Parsed Tags, Destination, Status, Error)
  8. Inbox Doc in System
- **Output**: Prints all IDs formatted for copy-paste into `.env`
- **Usage**: `npx tsx scripts/bootstrap-drive.ts`
- **Acceptance**: Running once creates all resources, IDs are printed

#### Task 2.3.2: Create `scripts/seed-config.ts` — Seed initial data
- **What**: Populates Config Sheet with starter projects and tags
- **Sample projects** (5): Smart Router, Personal Site, CLI Tools, Learning Notes, Side Projects
- **Sample tags** (19): organized by category — language, framework, architecture, infrastructure, practice, topic
- **Usage**: `npx tsx scripts/seed-config.ts`
- **Acceptance**: Config Sheet has populated Projects and Tags tabs

---

### Phase 3: Classification & Routing — Detailed Tasks

#### Task 3.1.1: Create `src/classifier/schema.ts` — Zod validation
- **Schema fields**:
  - `action`: enum `['save_link', 'new_idea', 'append_to_project', 'inbox']`
  - `url`: `string().url().nullable()`
  - `tags`: `array(string())`
  - `project`: `string().nullable()`
  - `title`: `string()`
  - `comment`: `string()`
  - `confidence`: `number().min(0).max(1)`
- **Export**: Both the Zod schema and the inferred TypeScript type
- **Acceptance**: Valid JSON parses correctly, invalid JSON throws ZodError

#### Task 3.2.1: Create `src/classifier/prompt.ts` — Prompt template
- **Exports**:
  - `PromptContext` interface: `{ projects, tags }` with their shapes
  - `buildSystemPrompt(context: PromptContext): string` — full system prompt with rules and few-shot examples
  - `buildUserMessage(rawText: string, source: string): string` — prefixes input with source
- **Prompt engineering rules**:
  - Return ONLY valid JSON, no markdown fences
  - Match tags from provided list, only invent new if nothing matches
  - Reconstruct mangled URLs from voice transcription
  - Low confidence → inbox with confidence < 0.6
- **Few-shot examples**: 4 examples covering save_link, new_idea, append_to_project, inbox
- **Dynamic context**: Injects available projects list and tags list from Config Sheet
- **Acceptance**: Generated prompts are well-formed and include all context

#### Task 3.3.1: Create `src/classifier/classify.ts` — Claude API integration
- **Function**: `classify(rawText: string, source: string): Promise<CaptureAction>`
- **Pipeline**:
  1. Fetch registry from Config Sheet via `fetchRegistry()`
  2. Build prompt with `buildSystemPrompt()` and `buildUserMessage()`
  3. Call Claude Haiku API (`claude-haiku-4-5-20251001`, max_tokens 512)
  4. Extract text from response content blocks
  5. Parse JSON from response text
  6. Validate with Zod `CaptureAction.parse()`
  7. If confidence < 0.6, override action to `inbox`
- **Error fallback**: On any failure (API error, JSON parse, Zod validation), return inbox action with raw text preserved
- **Acceptance**: Classifies test inputs correctly, handles failures gracefully

#### Task 3.4.1: Create `src/config/registry.ts` — Config Sheet reader
- **Interface**: `Registry { projects: [...], tags: [...] }`
- **Function**: `fetchRegistry(): Promise<Registry>`
- **Reads**: Config Sheet's "Projects" tab (A2:D) and "Tags" tab (A2:B) in parallel
- **Maps**: Row arrays to typed objects with named fields
- **Acceptance**: Returns structured registry from sheet data

#### Task 3.5.1: Create `src/logger.ts` — Activity logger
- **Function**: `logActivity(rawInput, source, result, status, errorMessage?): Promise<void>`
- **Writes to**: Activity Log Sheet, range `Sheet1!A:H`
- **Columns**: Timestamp (ISO), Raw Input, Source, Parsed Action, Parsed Tags (comma-joined), Destination (human-readable), Status, Error
- **Destination helper**: Maps action type to readable string (e.g., "Links Sheet", "Ideas Folder: {title}")
- **Error resilience**: Catches and logs errors to console, never throws (logging should not break the main flow)
- **Acceptance**: Every webhook call results in a new activity log row

#### Task 3.6.1: Create `src/actions/save-link.ts`
- **Function**: `saveLink(result: CaptureAction, rawInput: string): Promise<void>`
- **Appends row to**: Links Sheet, columns: Date (ISO), URL, Comment, Tags (comma-joined), Source Project, Raw Input
- **Acceptance**: Links sheet gets a new row with all fields populated

#### Task 3.6.2: Create `src/actions/new-idea.ts`
- **Function**: `newIdea(result: CaptureAction): Promise<void>`
- **Creates**: New Google Doc in Ideas folder with title from LLM, body with title/tags/date/comment
- **Side effect**: Registers the new idea in Config Sheet's Projects tab (name, docId, status "idea", description)
- **Acceptance**: New doc appears in Ideas folder, new row in Projects tab

#### Task 3.6.3: Create `src/actions/append-project.ts`
- **Function**: `appendToProject(result: CaptureAction): Promise<void>`
- **Looks up**: Project Doc ID from registry (case-insensitive match on project name)
- **Appends**: Timestamped section with tags and comment to the project's Google Doc
- **Error**: Throws if project not found in registry or has no Doc ID
- **Acceptance**: Existing project doc gets a new timestamped section

#### Task 3.6.4: Create `src/actions/inbox.ts`
- **Function**: `inbox(result: CaptureAction, rawInput: string, source: string): Promise<void>`
- **Appends to**: Inbox Doc with timestamp, source, confidence, suggested action, tags, raw input, and parsed comment
- **Acceptance**: Inbox doc gets a new section with all available context

---

### Phase 4: Deploy Pipeline — Detailed Tasks

#### Task 4.1.1: Create `.github/workflows/deploy.yml`
- **Trigger**: Push to `main` branch
- **Permissions**: contents read, id-token write (for Workload Identity Federation)
- **Steps**:
  1. Checkout code
  2. Authenticate to GCP via Workload Identity Federation
  3. Setup gcloud CLI
  4. Build Docker image tagged with git SHA
  5. Push image to Artifact Registry (`us-central1-docker.pkg.dev`)
  6. Deploy to Cloud Run with env vars and secrets
- **Secrets referenced**: GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT, GCP_PROJECT_ID, and all config IDs
- **Cloud Run config**: us-central1, managed platform, allow-unauthenticated, secrets from Secret Manager
- **Acceptance**: Push to main triggers build and deploy

---

### Implementation Status

- [x] Phase 1: Repo & Local Dev Setup — **COMPLETE**
- [x] Phase 2: Google Workspace Setup (code) — **COMPLETE** (manual GCP setup still needed)
- [x] Phase 3: Classification & Routing — **COMPLETE**
- [x] Phase 4: Deploy Pipeline — **COMPLETE** (manual GCP/GitHub secrets setup still needed)
- [ ] Phase 5: Connect Input Sources — requires manual IFTTT + HTTP Shortcuts configuration
- [ ] Phase 6: Polish & Extend — ongoing future work
