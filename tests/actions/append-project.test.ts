import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/docs.js', () => ({
  appendSection: vi.fn(),
}));

vi.mock('../../src/config/registry.js', () => ({
  fetchRegistry: vi.fn(),
}));

import { appendToProject } from '../../src/actions/append-project.js';
import { appendSection } from '../../src/services/docs.js';
import { fetchRegistry } from '../../src/config/registry.js';
import type { CaptureAction } from '../../src/classifier/schema.js';

const mockAppendSection = vi.mocked(appendSection);
const mockFetchRegistry = vi.mocked(fetchRegistry);

describe('appendToProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRegistry.mockResolvedValue({
      projects: [
        { name: 'Compiler', docId: 'compiler-doc-id', status: 'active', description: 'Rust compiler' },
        { name: 'Blog', docId: 'blog-doc-id', status: 'active', description: 'Personal blog' },
      ],
      tags: [],
    });
  });

  const projectResult: CaptureAction = {
    action: 'append_to_project',
    url: null,
    tags: ['rust', 'performance'],
    project: 'Compiler',
    title: 'Optimization note',
    comment: 'Found a way to speed up the parser by 30%',
    confidence: 0.9,
  };

  it('should look up the project doc and append a section', async () => {
    await appendToProject(projectResult);

    expect(mockAppendSection).toHaveBeenCalledWith(
      'compiler-doc-id',
      expect.stringContaining('Found a way to speed up the parser by 30%')
    );
  });

  it('should include tags in the appended section', async () => {
    await appendToProject(projectResult);

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('rust, performance');
  });

  it('should include timestamp in the appended section', async () => {
    await appendToProject(projectResult);

    const section = mockAppendSection.mock.calls[0][1];
    // Should contain a date-like string
    expect(section).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('should be case-insensitive when matching project names', async () => {
    const lowerCaseResult: CaptureAction = {
      ...projectResult,
      project: 'compiler', // lowercase
    };

    await appendToProject(lowerCaseResult);

    expect(mockAppendSection).toHaveBeenCalledWith(
      'compiler-doc-id',
      expect.any(String)
    );
  });

  it('should throw when project name is null', async () => {
    const nullProject: CaptureAction = { ...projectResult, project: null };

    await expect(appendToProject(nullProject)).rejects.toThrow(
      'append_to_project action requires a project name'
    );
  });

  it('should throw when project is not in registry', async () => {
    const unknownProject: CaptureAction = {
      ...projectResult,
      project: 'NonExistent',
    };

    await expect(appendToProject(unknownProject)).rejects.toThrow(
      'Project "NonExistent" not found in registry'
    );
  });

  it('should throw when project has no doc ID', async () => {
    mockFetchRegistry.mockResolvedValueOnce({
      projects: [
        { name: 'NoDoc', docId: '', status: 'active', description: 'Missing doc' },
      ],
      tags: [],
    });

    const noDocResult: CaptureAction = { ...projectResult, project: 'NoDoc' };

    await expect(appendToProject(noDocResult)).rejects.toThrow(
      'not found in registry or has no Doc ID'
    );
  });

  it('should show "none" when tags are empty', async () => {
    const noTagsResult: CaptureAction = { ...projectResult, tags: [] };
    await appendToProject(noTagsResult);

    const section = mockAppendSection.mock.calls[0][1];
    expect(section).toContain('Tags: none');
  });
});
