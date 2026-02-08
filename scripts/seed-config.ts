/**
 * Seed script — populates the Config Sheet with initial projects and tags.
 *
 * Run after bootstrap-drive.ts to give the LLM enough context to start
 * being useful for classification.
 *
 * Usage: npx tsx scripts/seed-config.ts
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
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function main() {
  const configSheetId = process.env.CONFIG_SHEET_ID;
  if (!configSheetId) {
    throw new Error('CONFIG_SHEET_ID environment variable is not set');
  }

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // Sample projects — replace with your own
  const projects = [
    ['Smart Router', '', 'active', 'Voice capture and knowledge routing system'],
    ['Personal Site', '', 'active', 'Personal website and blog'],
    ['CLI Tools', '', 'active', 'Collection of command-line utilities'],
    ['Learning Notes', '', 'active', 'Notes from courses, books, and tutorials'],
    ['Side Projects', '', 'idea', 'Backlog of side project ideas'],
  ];

  // Sample tags organized by category — replace with your own
  const tags = [
    ['typescript', 'language'],
    ['rust', 'language'],
    ['python', 'language'],
    ['go', 'language'],
    ['react', 'framework'],
    ['express', 'framework'],
    ['api', 'architecture'],
    ['database', 'architecture'],
    ['devops', 'infrastructure'],
    ['docker', 'infrastructure'],
    ['gcp', 'infrastructure'],
    ['testing', 'practice'],
    ['performance', 'practice'],
    ['security', 'practice'],
    ['ai', 'topic'],
    ['llm', 'topic'],
    ['web', 'topic'],
    ['mobile', 'topic'],
    ['tooling', 'topic'],
  ];

  console.log('Seeding Config Sheet...\n');

  // Seed projects
  await sheets.spreadsheets.values.append({
    spreadsheetId: configSheetId,
    range: 'Projects!A2:D',
    valueInputOption: 'RAW',
    requestBody: { values: projects },
  });
  console.log(`Seeded ${projects.length} projects`);

  // Seed tags
  await sheets.spreadsheets.values.append({
    spreadsheetId: configSheetId,
    range: 'Tags!A2:B',
    valueInputOption: 'RAW',
    requestBody: { values: tags },
  });
  console.log(`Seeded ${tags.length} tags`);

  console.log('\nDone! Open the Config Sheet to customize.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
