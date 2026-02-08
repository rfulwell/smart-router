import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/sheets.js', () => ({
  appendRow: vi.fn(),
}));

import { saveLink } from '../../src/actions/save-link.js';
import { appendRow } from '../../src/services/sheets.js';
import type { CaptureAction } from '../../src/classifier/schema.js';

const mockAppendRow = vi.mocked(appendRow);

describe('saveLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LINKS_SHEET_ID = 'test-links-sheet';
  });

  const linkResult: CaptureAction = {
    action: 'save_link',
    url: 'https://example.com/article',
    tags: ['rust', 'async'],
    project: 'compiler',
    title: 'Rust async article',
    comment: 'Great article on async patterns',
    confidence: 0.95,
  };

  it('should append a row to the links sheet', async () => {
    await saveLink(linkResult, 'save link https://example.com/article');

    expect(mockAppendRow).toHaveBeenCalledWith(
      'test-links-sheet',
      'Sheet1!A:F',
      expect.arrayContaining([
        'https://example.com/article',
        'Great article on async patterns',
        'rust, async',
        'compiler',
        'save link https://example.com/article',
      ])
    );
  });

  it('should include ISO timestamp as first value', async () => {
    await saveLink(linkResult, 'raw');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should use empty string for null url', async () => {
    const nullUrlResult: CaptureAction = { ...linkResult, url: null };
    await saveLink(nullUrlResult, 'raw');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[1]).toBe('');
  });

  it('should use empty string for null project', async () => {
    const nullProjectResult: CaptureAction = { ...linkResult, project: null };
    await saveLink(nullProjectResult, 'raw');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[4]).toBe('');
  });

  it('should throw when LINKS_SHEET_ID is not set', async () => {
    delete process.env.LINKS_SHEET_ID;

    await expect(saveLink(linkResult, 'raw')).rejects.toThrow(
      'LINKS_SHEET_ID environment variable is not set'
    );
  });

  it('should join tags with comma separator', async () => {
    await saveLink(linkResult, 'raw');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[3]).toBe('rust, async');
  });
});
