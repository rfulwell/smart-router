import { describe, it, expect } from 'vitest';
import { CaptureAction } from '../../src/classifier/schema.js';

describe('CaptureAction schema', () => {
  const validAction = {
    action: 'save_link' as const,
    url: 'https://example.com',
    tags: ['rust', 'async'],
    project: 'compiler',
    title: 'Test link',
    comment: 'A test comment',
    confidence: 0.95,
  };

  it('should accept a valid save_link action', () => {
    const result = CaptureAction.parse(validAction);
    expect(result.action).toBe('save_link');
    expect(result.url).toBe('https://example.com');
    expect(result.tags).toEqual(['rust', 'async']);
  });

  it('should accept a valid new_idea action with null url', () => {
    const result = CaptureAction.parse({
      ...validAction,
      action: 'new_idea',
      url: null,
      project: null,
    });
    expect(result.action).toBe('new_idea');
    expect(result.url).toBeNull();
  });

  it('should accept all valid action types', () => {
    const actions = ['save_link', 'new_idea', 'append_to_project', 'inbox'] as const;
    for (const action of actions) {
      const result = CaptureAction.parse({ ...validAction, action });
      expect(result.action).toBe(action);
    }
  });

  it('should reject an invalid action type', () => {
    expect(() =>
      CaptureAction.parse({ ...validAction, action: 'invalid_action' })
    ).toThrow();
  });

  it('should reject an invalid URL', () => {
    expect(() =>
      CaptureAction.parse({ ...validAction, url: 'not-a-url' })
    ).toThrow();
  });

  it('should accept null URL', () => {
    const result = CaptureAction.parse({ ...validAction, url: null });
    expect(result.url).toBeNull();
  });

  it('should reject confidence below 0', () => {
    expect(() =>
      CaptureAction.parse({ ...validAction, confidence: -0.1 })
    ).toThrow();
  });

  it('should reject confidence above 1', () => {
    expect(() =>
      CaptureAction.parse({ ...validAction, confidence: 1.5 })
    ).toThrow();
  });

  it('should accept confidence at boundaries', () => {
    expect(CaptureAction.parse({ ...validAction, confidence: 0 }).confidence).toBe(0);
    expect(CaptureAction.parse({ ...validAction, confidence: 1 }).confidence).toBe(1);
  });

  it('should accept empty tags array', () => {
    const result = CaptureAction.parse({ ...validAction, tags: [] });
    expect(result.tags).toEqual([]);
  });

  it('should reject missing required fields', () => {
    expect(() => CaptureAction.parse({ action: 'inbox' })).toThrow();
    expect(() => CaptureAction.parse({})).toThrow();
  });

  it('should reject non-string tags', () => {
    expect(() =>
      CaptureAction.parse({ ...validAction, tags: [123, true] })
    ).toThrow();
  });

  it('should accept null project', () => {
    const result = CaptureAction.parse({ ...validAction, project: null });
    expect(result.project).toBeNull();
  });
});
