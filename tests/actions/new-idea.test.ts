import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/docs.js', () => ({
  createDoc: vi.fn().mockResolvedValue('new-doc-id-123'),
}));

vi.mock('../../src/services/sheets.js', () => ({
  appendRow: vi.fn(),
}));

import { newIdea } from '../../src/actions/new-idea.js';
import { createDoc } from '../../src/services/docs.js';
import { appendRow } from '../../src/services/sheets.js';
import type { CaptureAction } from '../../src/classifier/schema.js';

const mockCreateDoc = vi.mocked(createDoc);
const mockAppendRow = vi.mocked(appendRow);

describe('newIdea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.IDEAS_FOLDER_ID = 'test-ideas-folder';
    process.env.CONFIG_SHEET_ID = 'test-config-sheet';
  });

  const ideaResult: CaptureAction = {
    action: 'new_idea',
    url: null,
    tags: ['cli', 'tooling'],
    project: null,
    title: 'CLI scaffolding tool',
    comment: 'A tool that scaffolds projects with templates',
    confidence: 0.92,
  };

  it('should create a doc in the ideas folder', async () => {
    await newIdea(ideaResult);

    expect(mockCreateDoc).toHaveBeenCalledWith(
      'test-ideas-folder',
      'CLI scaffolding tool',
      expect.stringContaining('CLI scaffolding tool')
    );
  });

  it('should include tags in the doc body', async () => {
    await newIdea(ideaResult);

    const docBody = mockCreateDoc.mock.calls[0][2];
    expect(docBody).toContain('cli, tooling');
  });

  it('should include the comment in the doc body', async () => {
    await newIdea(ideaResult);

    const docBody = mockCreateDoc.mock.calls[0][2];
    expect(docBody).toContain('A tool that scaffolds projects with templates');
  });

  it('should register the idea in the config sheet', async () => {
    await newIdea(ideaResult);

    expect(mockAppendRow).toHaveBeenCalledWith(
      'test-config-sheet',
      'Projects!A:D',
      [
        'CLI scaffolding tool',
        'new-doc-id-123',
        'idea',
        'A tool that scaffolds projects with templates',
      ]
    );
  });

  it('should skip config registration when CONFIG_SHEET_ID is not set', async () => {
    delete process.env.CONFIG_SHEET_ID;

    await newIdea(ideaResult);

    expect(mockCreateDoc).toHaveBeenCalled();
    expect(mockAppendRow).not.toHaveBeenCalled();
  });

  it('should throw when IDEAS_FOLDER_ID is not set', async () => {
    delete process.env.IDEAS_FOLDER_ID;

    await expect(newIdea(ideaResult)).rejects.toThrow(
      'IDEAS_FOLDER_ID environment variable is not set'
    );
  });

  it('should handle empty tags array', async () => {
    const noTagsResult: CaptureAction = { ...ideaResult, tags: [] };
    await newIdea(noTagsResult);

    const docBody = mockCreateDoc.mock.calls[0][2];
    expect(docBody).toContain('Tags: none');
  });
});
