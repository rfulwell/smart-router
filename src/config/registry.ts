import { readRows } from '../services/sheets.js';

export interface Registry {
  projects: { name: string; docId: string; status: string; description: string }[];
  tags: { name: string; category: string }[];
}

/**
 * Fetch the current projects and tags from the Config Sheet.
 * The Config Sheet has two tabs: "Projects" and "Tags".
 *
 * Projects columns: Project Name | Doc ID | Status | Description
 * Tags columns: Tag Name | Category
 */
export async function fetchRegistry(): Promise<Registry> {
  const configSheetId = process.env.CONFIG_SHEET_ID;
  if (!configSheetId) {
    throw new Error('CONFIG_SHEET_ID environment variable is not set');
  }

  const [projectRows, tagRows] = await Promise.all([
    readRows(configSheetId, 'Projects!A2:D'),
    readRows(configSheetId, 'Tags!A2:B'),
  ]);

  const projects = projectRows.map((row) => ({
    name: row[0] ?? '',
    docId: row[1] ?? '',
    status: row[2] ?? '',
    description: row[3] ?? '',
  }));

  const tags = tagRows.map((row) => ({
    name: row[0] ?? '',
    category: row[1] ?? '',
  }));

  return { projects, tags };
}
