import { createDoc } from '../services/docs.js';
import { appendRow } from '../services/sheets.js';
import type { CaptureAction } from '../classifier/schema.js';

/**
 * Create a new Google Doc in the Ideas folder.
 * Optionally registers it in the Config Sheet's Projects tab as status "idea".
 */
export async function newIdea(result: CaptureAction): Promise<void> {
  const ideasFolderId = process.env.IDEAS_FOLDER_ID;
  if (!ideasFolderId) {
    throw new Error('IDEAS_FOLDER_ID environment variable is not set');
  }

  const body = [
    `# ${result.title}`,
    '',
    `Tags: ${result.tags.join(', ') || 'none'}`,
    `Created: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    result.comment,
  ].join('\n');

  const docId = await createDoc(ideasFolderId, result.title, body);

  // Register the new idea in the Config Sheet's Projects tab
  const configSheetId = process.env.CONFIG_SHEET_ID;
  if (configSheetId) {
    await appendRow(configSheetId, 'Projects!A:D', [
      result.title,
      docId,
      'idea',
      result.comment,
    ]);
  }
}
