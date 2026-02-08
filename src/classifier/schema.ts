import { z } from 'zod';

export const CaptureAction = z.object({
  action: z.enum(['save_link', 'new_idea', 'append_to_project', 'inbox']),
  url: z.string().url().nullable(),
  tags: z.array(z.string()),
  project: z.string().nullable(),
  title: z.string(),
  comment: z.string(),
  confidence: z.number().min(0).max(1),
});

export type CaptureAction = z.infer<typeof CaptureAction>;
