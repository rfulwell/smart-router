import { appendSection } from '../services/docs.js';
import type { CaptureAction } from '../classifier/schema.js';

/**
 * Catch-all action: append to the Inbox Google Doc.
 * Includes raw input, any partial classification, and the source.
 */
export async function inbox(
  result: CaptureAction,
  rawInput: string,
  source: string
): Promise<void> {
  const inboxDocId = process.env.INBOX_DOC_ID;
  if (!inboxDocId) {
    throw new Error('INBOX_DOC_ID environment variable is not set');
  }

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const tagsLine =
    result.tags.length > 0 ? result.tags.join(', ') : 'none';

  const section = [
    `${timestamp} [${source}]`,
    `Confidence: ${result.confidence}`,
    `Suggested action: ${result.action}`,
    `Tags: ${tagsLine}`,
    result.project ? `Project: ${result.project}` : '',
    result.url ? `URL: ${result.url}` : '',
    '',
    `Raw: ${rawInput}`,
    '',
    `Parsed: ${result.comment}`,
  ]
    .filter(Boolean)
    .join('\n');

  await appendSection(inboxDocId, section);
}
