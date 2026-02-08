import { google } from 'googleapis';

let authClient: ReturnType<typeof google.auth.GoogleAuth.prototype.getClient> | null = null;

export function getAuth() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
  }

  const credentials = JSON.parse(
    Buffer.from(keyJson, 'base64').toString('utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive',
    ],
  });

  return auth;
}

export function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

export function getDocsClient() {
  return google.docs({ version: 'v1', auth: getAuth() });
}

export function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() });
}
