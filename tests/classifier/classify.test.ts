import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies before importing
vi.mock('../../src/config/registry.js', () => ({
  fetchRegistry: vi.fn().mockResolvedValue({
    projects: [
      { name: 'Compiler', docId: 'doc-1', status: 'active', description: 'Rust compiler' },
    ],
    tags: [
      { name: 'rust', category: 'language' },
      { name: 'async', category: 'topic' },
    ],
  }),
}));

// Use vi.hoisted so the fn is available inside the vi.mock factory
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { classify } from '../../src/classifier/classify.js';

describe('classify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONFIG_SHEET_ID = 'test-config-sheet';
  });

  it('should return a valid save_link classification', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'save_link',
            url: 'https://example.com',
            tags: ['rust'],
            project: 'Compiler',
            title: 'Example link',
            comment: 'An example link about Rust',
            confidence: 0.95,
          }),
        },
      ],
    });

    const result = await classify('save link https://example.com for compiler', 'voice');
    expect(result.action).toBe('save_link');
    expect(result.url).toBe('https://example.com');
    expect(result.confidence).toBe(0.95);
  });

  it('should force low-confidence results to inbox', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'new_idea',
            url: null,
            tags: [],
            project: null,
            title: 'Vague thought',
            comment: 'Something unclear',
            confidence: 0.3,
          }),
        },
      ],
    });

    const result = await classify('something vague', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0.3);
  });

  it('should fall back to inbox on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'));

    const result = await classify('test input', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0);
    expect(result.comment).toBe('test input');
    expect(result.title).toBe('Unclassified capture');
  });

  it('should fall back to inbox on invalid JSON response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This is not JSON' }],
    });

    const result = await classify('test input', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0);
  });

  it('should fall back to inbox on Zod validation failure', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'invalid_action',
            url: null,
            tags: [],
            project: null,
            title: 'Test',
            comment: 'Test',
            confidence: 0.8,
          }),
        },
      ],
    });

    const result = await classify('test input', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0);
  });

  it('should call Claude with the correct model', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'inbox',
            url: null,
            tags: [],
            project: null,
            title: 'Test',
            comment: 'Test',
            confidence: 0.8,
          }),
        },
      ],
    });

    await classify('test', 'voice');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
      })
    );
  });

  it('should fall back to inbox when response has no text block', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'test', name: 'test', input: {} }],
    });

    const result = await classify('test input', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0);
  });

  it('should preserve raw text in fallback comment', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));

    const result = await classify('my important note about things', 'voice');
    expect(result.comment).toBe('my important note about things');
  });

  it('should pass confidence exactly at 0.6 threshold', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'new_idea',
            url: null,
            tags: ['test'],
            project: null,
            title: 'Borderline idea',
            comment: 'This is borderline confident',
            confidence: 0.6,
          }),
        },
      ],
    });

    const result = await classify('borderline idea', 'voice');
    // 0.6 is NOT below 0.6, so should keep the original action
    expect(result.action).toBe('new_idea');
    expect(result.confidence).toBe(0.6);
  });

  it('should override action to inbox at 0.59 confidence', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            action: 'save_link',
            url: 'https://example.com',
            tags: [],
            project: null,
            title: 'Low confidence link',
            comment: 'Not sure about this',
            confidence: 0.59,
          }),
        },
      ],
    });

    const result = await classify('maybe a link', 'voice');
    expect(result.action).toBe('inbox');
    expect(result.confidence).toBe(0.59);
  });
});
