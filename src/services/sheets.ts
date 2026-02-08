import { getSheetsClient } from './auth.js';

/**
 * Read rows from a Google Sheet range.
 * Returns a 2D array of strings.
 */
export async function readRows(
  sheetId: string,
  range: string
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  return (response.data.values as string[][]) ?? [];
}

/**
 * Append a single row to a Google Sheet.
 */
export async function appendRow(
  sheetId: string,
  range: string,
  values: string[]
): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}
