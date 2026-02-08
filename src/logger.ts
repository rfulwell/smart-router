import { appendRow } from './services/sheets.js';
import type { CaptureAction } from './classifier/schema.js';

/**
 * Log every webhook transaction to the Activity Log Sheet.
 * Columns: Timestamp | Raw Input | Source | Parsed Action | Parsed Tags | Destination | Status | Error
 */
export async function logActivity(
  rawInput: string,
  source: string,
  result: CaptureAction,
  status: 'success' | 'error',
  errorMessage?: string
): Promise<void> {
  const activityLogSheetId = process.env.ACTIVITY_LOG_SHEET_ID;
  if (!activityLogSheetId) {
    console.error('ACTIVITY_LOG_SHEET_ID not set — skipping activity log');
    return;
  }

  const destination = getDestination(result);

  try {
    await appendRow(activityLogSheetId, 'Sheet1!A:H', [
      new Date().toISOString(),
      rawInput,
      source,
      result.action,
      result.tags.join(', '),
      destination,
      status,
      errorMessage ?? '',
    ]);
  } catch (error) {
    // Log to console but don't throw — logging should never break the main flow
    console.error('Failed to write activity log:', error);
  }
}

function getDestination(result: CaptureAction): string {
  switch (result.action) {
    case 'save_link':
      return 'Links Sheet';
    case 'new_idea':
      return `Ideas Folder: ${result.title}`;
    case 'append_to_project':
      return `Project Doc: ${result.project ?? 'unknown'}`;
    case 'inbox':
      return 'Inbox Doc';
    default:
      return 'unknown';
  }
}
