import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { classify } from '../classifier/classify.js';
import { saveLink } from '../actions/save-link.js';
import { newIdea } from '../actions/new-idea.js';
import { appendToProject } from '../actions/append-project.js';
import { inbox } from '../actions/inbox.js';
import { logActivity } from '../logger.js';

const WebhookBody = z.object({
  text: z.string().min(1),
  source: z.string().default('unknown'),
  timestamp: z.string().optional(),
});

export const webhookRouter = Router();

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Validate webhook secret
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${webhookSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  // Validate request body
  const bodyResult = WebhookBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: bodyResult.error.issues,
    });
    return;
  }

  const { text, source } = bodyResult.data;

  // Respond immediately — processing happens after
  res.status(200).json({ status: 'accepted' });

  // Process asynchronously (IFTTT has short timeouts)
  try {
    const result = await classify(text, source);

    switch (result.action) {
      case 'save_link':
        await saveLink(result, text);
        break;
      case 'new_idea':
        await newIdea(result);
        break;
      case 'append_to_project':
        await appendToProject(result);
        break;
      default:
        await inbox(result, text, source);
        break;
    }

    await logActivity(text, source, result, 'success');
    console.log(`Processed: [${source}] ${result.action} — "${result.title}"`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`Webhook processing failed: ${errorMessage}`);

    // Try to log the failure — use a fallback result if classification itself failed
    try {
      await logActivity(
        text,
        source,
        {
          action: 'inbox',
          url: null,
          tags: [],
          project: null,
          title: 'Processing error',
          comment: text,
          confidence: 0,
        },
        'error',
        errorMessage
      );
    } catch (logError) {
      console.error('Failed to log error to activity sheet:', logError);
    }
  }
});
