import { getDocsClient } from './auth.js';

/**
 * Append a text section to the end of a Google Doc.
 * Inserts a horizontal rule separator followed by the content.
 */
export async function appendSection(
  docId: string,
  content: string
): Promise<void> {
  const docs = getDocsClient();

  // Get the current document length to find the end index
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1;

  // Insert content at the end of the document
  const textToInsert = `\n---\n${content}\n`;

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: endIndex - 1 },
            text: textToInsert,
          },
        },
      ],
    },
  });
}

/**
 * Create a new Google Doc in a specific Drive folder.
 * Returns the new document ID.
 */
export async function createDoc(
  folderId: string,
  title: string,
  body: string
): Promise<string> {
  const docs = getDocsClient();

  // Create the doc
  const createResponse = await docs.documents.create({
    requestBody: { title },
  });

  const docId = createResponse.data.documentId;
  if (!docId) {
    throw new Error('Failed to create Google Doc — no document ID returned');
  }

  // Insert the body text
  if (body.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: body,
            },
          },
        ],
      },
    });
  }

  // Move the doc into the target folder using Drive API
  const { getDriveClient } = await import('./auth.js');
  const drive = getDriveClient();
  await drive.files.update({
    fileId: docId,
    addParents: folderId,
    fields: 'id, parents',
  });

  return docId;
}
