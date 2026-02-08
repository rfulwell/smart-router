import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/docs.js', () => ({
  appendSection: vi.fn(),
}));

import { inbox } from '../../src/actions/inbox.js';
import { appendSection } from '../../src/services/docs.js';
import type { CaptureAction } from '../../src/classifier/schema.js';

const mockAppendSection = vi.mocked(appendSection);

describe('inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INBOX_DOC_ID = 'test-inbox-doc';
  });

  const inboxResult: CaptureAction = {
    action: 'inbox',
    url: null,
    tags: [],
    project: null,
    title: 'Unclear capture',
    comment: 'Something about databases',
    confidence: 0.3,
  };

  it('should append a section to the inbox doc', async () => {
    await inbox(inboxResult, 'remind me about that database thing', 'voice');

    expect(mockAppendSection).toHaveBeenCalledWith(
      'test-inbox-doc',
      expect.stringContaining('Something about databases')
    );
  });

  it('should include the raw input', async () => {
    await inbox(inboxResult, 'remind me about that database thing', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Raw: remind me about that database thing');
  });

  it('should include the source', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('[voice]');
  });

  it('should include the confidence score', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Confidence: 0.3');
  });

  it('should include the suggested action', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Suggested action: inbox');
  });

  it('should include URL when present', async () => {
    const withUrl: CaptureAction = {
      ...inboxResult,
      url: 'https://example.com',
    };

    await inbox(withUrl, 'raw input', 'share');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('URL: https://example.com');
  });

  it('should include project when present', async () => {
    const withProject: CaptureAction = {
      ...inboxResult,
      project: 'compiler',
    };

    await inbox(withProject, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Project: compiler');
  });

  it('should omit URL and project lines when null', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).not.toContain('URL:');
    expect(section).not.toContain('Project:');
  });

  it('should include tags when present', async () => {
    const withTags: CaptureAction = {
      ...inboxResult,
      tags: ['database', 'sql'],
    };

    await inbox(withTags, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Tags: database, sql');
  });

  it('should show "none" for empty tags', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Tags: none');
  });

  it('should throw when INBOX_DOC_ID is not set', async () => {
    delete process.env.INBOX_DOC_ID;

    await expect(inbox(inboxResult, 'raw', 'voice')).rejects.toThrow(
      'INBOX_DOC_ID environment variable is not set'
    );
  });

  it('should include timestamp', async () => {
    await inbox(inboxResult, 'raw input', 'voice');

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
