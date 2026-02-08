import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/sheets.js', () => ({
  appendRow: vi.fn(),
}));

import { logActivity } from '../src/logger.js';
import { appendRow } from '../src/services/sheets.js';
import type { CaptureAction } from '../src/classifier/schema.js';

const mockAppendRow = vi.mocked(appendRow);

describe('logActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ACTIVITY_LOG_SHEET_ID = 'test-activity-log';
  });

  const basResult: CaptureAction = {
    action: 'save_link',
    url: 'https://example.com',
    tags: ['rust', 'async'],
    project: 'compiler',
    title: 'Test link',
    comment: 'A test comment',
    confidence: 0.95,
  };

  it('should append a row to the activity log sheet', async () => {
    await logActivity('raw input', 'voice', basResult, 'success');

    expect(mockAppendRow).toHaveBeenCalledWith(
      'test-activity-log',
      'Sheet1!A:H',
      expect.arrayContaining([
        'raw input',
        'voice',
        'save_link',
        'rust, async',
        'Links Sheet',
        'success',
        '',
      ])
    );
  });

  it('should include error message when status is error', async () => {
    await logActivity('raw input', 'voice', basResult, 'error', 'API failed');

    expect(mockAppendRow).toHaveBeenCalledWith(
      'test-activity-log',
      'Sheet1!A:H',
      expect.arrayContaining(['error', 'API failed'])
    );
  });

  it('should map save_link to "Links Sheet" destination', async () => {
    await logActivity('input', 'voice', basResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[5]).toBe('Links Sheet');
  });

  it('should map new_idea to "Ideas Folder: {title}" destination', async () => {
    const ideaResult: CaptureAction = {
      ...basResult,
      action: 'new_idea',
      title: 'Cool idea',
    };

    await logActivity('input', 'voice', ideaResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[5]).toBe('Ideas Folder: Cool idea');
  });

  it('should map append_to_project to "Project Doc: {project}" destination', async () => {
    const projectResult: CaptureAction = {
      ...basResult,
      action: 'append_to_project',
      project: 'compiler',
    };

    await logActivity('input', 'voice', projectResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[5]).toBe('Project Doc: compiler');
  });

  it('should map inbox to "Inbox Doc" destination', async () => {
    const inboxResult: CaptureAction = {
      ...basResult,
      action: 'inbox',
    };

    await logActivity('input', 'voice', inboxResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[5]).toBe('Inbox Doc');
  });

  it('should skip logging when ACTIVITY_LOG_SHEET_ID is not set', async () => {
    delete process.env.ACTIVITY_LOG_SHEET_ID;

    await logActivity('input', 'voice', basResult, 'success');

    expect(mockAppendRow).not.toHaveBeenCalled();
  });

  it('should not throw when appendRow fails', async () => {
    mockAppendRow.mockRejectedValueOnce(new Error('Sheets API error'));

    // Should not throw
    await expect(
      logActivity('input', 'voice', basResult, 'success')
    ).resolves.toBeUndefined();
  });

  it('should include ISO timestamp as first column', async () => {
    await logActivity('input', 'voice', basResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    // Should be ISO date string
    expect(callArgs[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should join tags with comma separator', async () => {
    const multiTagResult: CaptureAction = {
      ...basResult,
      tags: ['a', 'b', 'c'],
    };

    await logActivity('input', 'voice', multiTagResult, 'success');

    const callArgs = mockAppendRow.mock.calls[0][2];
    expect(callArgs[4]).toBe('a, b, c');
  });
});
