import { getDriveClient } from './auth.js';

/**
 * Create a folder in Google Drive under a parent folder.
 * Returns the new folder ID.
 */
export async function createFolder(
  parentId: string,
  name: string
): Promise<string> {
  const drive = getDriveClient();
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  const folderId = response.data.id;
  if (!folderId) {
    throw new Error(`Failed to create folder "${name}" — no ID returned`);
  }

  return folderId;
}
