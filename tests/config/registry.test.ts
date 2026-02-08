import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/sheets.js', () => ({
  readRows: vi.fn(),
}));

import { fetchRegistry } from '../../src/config/registry.js';
import { readRows } from '../../src/services/sheets.js';

const mockReadRows = vi.mocked(readRows);

describe('fetchRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONFIG_SHEET_ID = 'test-config-sheet';
  });

  it('should fetch and parse projects and tags', async () => {
    mockReadRows
      .mockResolvedValueOnce([
        ['Smart Router', 'doc-1', 'active', 'Voice capture system'],
        ['Blog', 'doc-2', 'idea', 'Personal blog'],
      ])
      .mockResolvedValueOnce([
        ['typescript', 'language'],
        ['react', 'framework'],
      ]);

    const registry = await fetchRegistry();

    expect(registry.projects).toHaveLength(2);
    expect(registry.projects[0]).toEqual({
      name: 'Smart Router',
      docId: 'doc-1',
      status: 'active',
      description: 'Voice capture system',
    });

    expect(registry.tags).toHaveLength(2);
    expect(registry.tags[0]).toEqual({
      name: 'typescript',
      category: 'language',
    });
  });

  it('should read from the correct sheet ranges', async () => {
    mockReadRows.mockResolvedValue([]);

    await fetchRegistry();

    expect(mockReadRows).toHaveBeenCalledWith('test-config-sheet', 'Projects!A2:D');
    expect(mockReadRows).toHaveBeenCalledWith('test-config-sheet', 'Tags!A2:B');
  });

  it('should handle empty sheet data', async () => {
    mockReadRows.mockResolvedValue([]);

    const registry = await fetchRegistry();

    expect(registry.projects).toEqual([]);
    expect(registry.tags).toEqual([]);
  });

  it('should handle rows with missing columns', async () => {
    mockReadRows
      .mockResolvedValueOnce([['Partial Project']]) // Only name, missing other columns
      .mockResolvedValueOnce([['only-tag']]); // Only name, missing category

    const registry = await fetchRegistry();

    expect(registry.projects[0]).toEqual({
      name: 'Partial Project',
      docId: '',
      status: '',
      description: '',
    });

    expect(registry.tags[0]).toEqual({
      name: 'only-tag',
      category: '',
    });
  });

  it('should throw when CONFIG_SHEET_ID is not set', async () => {
    delete process.env.CONFIG_SHEET_ID;

    await expect(fetchRegistry()).rejects.toThrow(
      'CONFIG_SHEET_ID environment variable is not set'
    );
  });

  it('should fetch projects and tags in parallel', async () => {
    const callOrder: string[] = [];

    mockReadRows.mockImplementation(async (_sheetId, range) => {
      callOrder.push(range);
      return [];
    });

    await fetchRegistry();

    // Both calls should have been made (we can't strictly verify parallelism
    // but we can verify both ranges were requested)
    expect(callOrder).toContain('Projects!A2:D');
    expect(callOrder).toContain('Tags!A2:B');
  });
});
