import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage } from '../../src/classifier/prompt.js';
import type { PromptContext } from '../../src/classifier/prompt.js';

describe('buildSystemPrompt', () => {
  const context: PromptContext = {
    projects: [
      { name: 'Compiler', status: 'active', description: 'A Rust compiler project' },
      { name: 'Blog', status: 'idea', description: 'Personal blog' },
    ],
    tags: [
      { name: 'rust', category: 'language' },
      { name: 'web', category: 'topic' },
    ],
  };

  it('should include the classification rules', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('save_link');
    expect(prompt).toContain('new_idea');
    expect(prompt).toContain('append_to_project');
    expect(prompt).toContain('inbox');
  });

  it('should include project names in the prompt', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('Compiler');
    expect(prompt).toContain('Blog');
    expect(prompt).toContain('active');
    expect(prompt).toContain('A Rust compiler project');
  });

  it('should include tags in the prompt', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('rust');
    expect(prompt).toContain('web');
    expect(prompt).toContain('language');
    expect(prompt).toContain('topic');
  });

  it('should include few-shot examples', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('async-patterns');
    expect(prompt).toContain('CLI project scaffolding');
    expect(prompt).toContain('chrome manifest v3');
    expect(prompt).toContain('database');
  });

  it('should include JSON-only instruction', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('Return ONLY valid JSON');
  });

  it('should handle empty projects and tags', () => {
    const emptyContext: PromptContext = { projects: [], tags: [] };
    const prompt = buildSystemPrompt(emptyContext);
    expect(prompt).toContain('(none configured yet)');
  });

  it('should include confidence threshold instruction', () => {
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain('0.6');
    expect(prompt).toContain('inbox');
  });
});

describe('buildUserMessage', () => {
  it('should prefix the text with the source', () => {
    const msg = buildUserMessage('hello world', 'voice');
    expect(msg).toBe('[Source: voice] hello world');
  });

  it('should handle share source', () => {
    const msg = buildUserMessage('https://example.com cool article', 'share');
    expect(msg).toBe('[Source: share] https://example.com cool article');
  });

  it('should handle empty text', () => {
    const msg = buildUserMessage('', 'test');
    expect(msg).toBe('[Source: test] ');
  });
});
