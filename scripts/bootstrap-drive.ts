/**
 * Bootstrap script — run once to create the full Google Workspace structure.
 *
 * Creates:
 * 1. Root folder: "Voice Capture System"
 * 2. Subfolders: "Project Notes", "Project Ideas", "System"
 * 3. Config Sheet with "Projects" and "Tags" tabs
 * 4. Saved Links Sheet
 * 5. Activity Log Sheet
 * 6. Inbox Google Doc
 *
 * Outputs all IDs needed for the .env file.
 *
 * Usage: npx tsx scripts/bootstrap-drive.ts
 */

import 'dotenv/config';
import { google } from 'googleapis';

function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }

  const credentials = JSON.parse(
    Buffer.from(keyJson, 'base64').toString('utf-8')
  );

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

async function createFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return response.data.id!;
}

async function createSheet(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [parentId],
    },
    fields: 'id',
  });
  return response.data.id!;
}

async function createDoc(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  name: string
): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.document',
      parents: [parentId],
    },
    fields: 'id',
  });
  return response.data.id!;
}

async function setupConfigSheet(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: string
): Promise<void> {
  // Rename default sheet to "Projects" and add "Tags" tab
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
  });

  const defaultSheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: defaultSheetId, title: 'Projects' },
            fields: 'title',
          },
        },
        {
          addSheet: {
            properties: { title: 'Tags' },
          },
        },
      ],
    },
  });

  // Add header rows
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: 'Projects!A1:D1',
          values: [['Project Name', 'Doc ID', 'Status', 'Description']],
        },
        {
          range: 'Tags!A1:B1',
          values: [['Tag Name', 'Category']],
        },
      ],
    },
  });
}

async function setupLinksSheet(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: string
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1:F1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [['Date', 'URL', 'Comment', 'Tags', 'Source Project', 'Raw Input']],
    },
  });
}

async function setupActivityLogSheet(
  sheets: ReturnType<typeof google.sheets>,
  sheetId: string
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1:H1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          'Timestamp',
          'Raw Input',
          'Source',
          'Parsed Action',
          'Parsed Tags',
          'Destination',
          'Status',
          'Error',
        ],
      ],
    },
  });
}

async function main() {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  console.log('Creating Voice Capture System folder structure...\n');

  // 1. Create root folder
  const rootId = await createFolder(drive, 'root', 'Voice Capture System');
  console.log(`Root folder:       ${rootId}`);

  // 2. Create subfolders
  const projectNotesId = await createFolder(drive, rootId, 'Project Notes');
  console.log(`Project Notes:     ${projectNotesId}`);

  const ideasFolderId = await createFolder(drive, rootId, 'Project Ideas');
  console.log(`Project Ideas:     ${ideasFolderId}`);

  const systemFolderId = await createFolder(drive, rootId, 'System');
  console.log(`System:            ${systemFolderId}`);

  // 3. Create Config Sheet
  const configSheetId = await createSheet(drive, systemFolderId, 'Config');
  await setupConfigSheet(sheets, configSheetId);
  console.log(`Config Sheet:      ${configSheetId}`);

  // 4. Create Saved Links Sheet
  const linksSheetId = await createSheet(drive, systemFolderId, 'Saved Links');
  await setupLinksSheet(sheets, linksSheetId);
  console.log(`Saved Links Sheet: ${linksSheetId}`);

  // 5. Create Activity Log Sheet
  const activityLogSheetId = await createSheet(
    drive,
    systemFolderId,
    'Activity Log'
  );
  await setupActivityLogSheet(sheets, activityLogSheetId);
  console.log(`Activity Log:      ${activityLogSheetId}`);

  // 6. Create Inbox Doc
  const inboxDocId = await createDoc(drive, systemFolderId, 'Inbox');
  console.log(`Inbox Doc:         ${inboxDocId}`);

  // Output env vars
  console.log('\n--- Add these to your .env file ---\n');
  console.log(`CONFIG_SHEET_ID=${configSheetId}`);
  console.log(`LINKS_SHEET_ID=${linksSheetId}`);
  console.log(`ACTIVITY_LOG_SHEET_ID=${activityLogSheetId}`);
  console.log(`IDEAS_FOLDER_ID=${ideasFolderId}`);
  console.log(`INBOX_DOC_ID=${inboxDocId}`);
  console.log('');
}

main().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
