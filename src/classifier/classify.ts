import Anthropic from '@anthropic-ai/sdk';
import { CaptureAction } from './schema.js';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { fetchRegistry } from '../config/registry.js';

const anthropic = new Anthropic();

/**
 * Classify raw input text using Claude Haiku.
 * Returns a validated CaptureAction or falls back to inbox on failure.
 */
export async function classify(
  rawText: string,
  source: string
): Promise<CaptureAction> {
  const registry = await fetchRegistry();

  const systemPrompt = buildSystemPrompt(registry);
  const userMessage = buildUserMessage(rawText, source);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text from the response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const parsed = JSON.parse(textBlock.text);
    const result = CaptureAction.parse(parsed);

    // Force low-confidence results to inbox
    if (result.confidence < 0.6) {
      return {
        ...result,
        action: 'inbox',
      };
    }

    return result;
  } catch (error) {
    console.error('Classification failed, falling back to inbox:', error);

    // Fallback: route to inbox so nothing is lost
    return {
      action: 'inbox',
      url: null,
      tags: [],
      project: null,
      title: 'Unclassified capture',
      comment: rawText,
      confidence: 0,
    };
  }
}
