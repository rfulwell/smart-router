import { appendRow } from '../services/sheets.js';
import type { CaptureAction } from '../classifier/schema.js';

/**
 * Save a link to the Saved Links Google Sheet.
 * Columns: Date | URL | Comment | Tags | Source Project | Raw Input
 */
export async function saveLink(
  result: CaptureAction,
  rawInput: string
): Promise<void> {
  const linksSheetId = process.env.LINKS_SHEET_ID;
  if (!linksSheetId) {
    throw new Error('LINKS_SHEET_ID environment variable is not set');
  }

  await appendRow(linksSheetId, 'Sheet1!A:F', [
    new Date().toISOString(),
    result.url ?? '',
    result.comment,
    result.tags.join(', '),
    result.project ?? '',
    rawInput,
  ]);
}
