import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock all downstream dependencies
vi.mock('../../src/classifier/classify.js', () => ({
  classify: vi.fn(),
}));

vi.mock('../../src/actions/save-link.js', () => ({
  saveLink: vi.fn(),
}));

vi.mock('../../src/actions/new-idea.js', () => ({
  newIdea: vi.fn(),
}));

vi.mock('../../src/actions/append-project.js', () => ({
  appendToProject: vi.fn(),
}));

vi.mock('../../src/actions/inbox.js', () => ({
  inbox: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  logActivity: vi.fn(),
}));

import { webhookRouter } from '../../src/routes/webhook.js';
import { classify } from '../../src/classifier/classify.js';
import { saveLink } from '../../src/actions/save-link.js';
import { newIdea } from '../../src/actions/new-idea.js';
import { appendToProject } from '../../src/actions/append-project.js';
import { inbox } from '../../src/actions/inbox.js';
import { logActivity } from '../../src/logger.js';
import type { CaptureAction } from '../../src/classifier/schema.js';

const mockClassify = vi.mocked(classify);
const mockSaveLink = vi.mocked(saveLink);
const mockNewIdea = vi.mocked(newIdea);
const mockAppendToProject = vi.mocked(appendToProject);
const mockInbox = vi.mocked(inbox);
const mockLogActivity = vi.mocked(logActivity);

// Create a test app
const app = express();
app.use(express.json());
app.use('/webhook', webhookRouter);

describe('POST /webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
  });

  const saveLinkResult: CaptureAction = {
    action: 'save_link',
    url: 'https://example.com',
    tags: ['test'],
    project: null,
    title: 'Test link',
    comment: 'A test',
    confidence: 0.95,
  };

  it('should return 200 accepted for a valid request', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    const res = await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'save this link https://example.com', source: 'voice' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  it('should return 401 when webhook secret is wrong', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer wrong-secret')
      .send({ text: 'test', source: 'voice' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should return 401 when authorization header is missing', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ text: 'test', source: 'voice' });

    expect(res.status).toBe(401);
  });

  it('should return 400 when text is missing', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ source: 'voice' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
  });

  it('should return 400 when text is empty', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: '', source: 'voice' });

    expect(res.status).toBe(400);
  });

  it('should call classify with text and source', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'hello world', source: 'voice' });

    // Allow async processing to complete
    await vi.waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith('hello world', 'voice');
    });
  });

  it('should route save_link actions to saveLink', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'save link', source: 'voice' });

    await vi.waitFor(() => {
      expect(mockSaveLink).toHaveBeenCalledWith(saveLinkResult, 'save link');
    });
  });

  it('should route new_idea actions to newIdea', async () => {
    const ideaResult: CaptureAction = { ...saveLinkResult, action: 'new_idea' };
    mockClassify.mockResolvedValueOnce(ideaResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'idea for tool', source: 'voice' });

    await vi.waitFor(() => {
      expect(mockNewIdea).toHaveBeenCalledWith(ideaResult);
    });
  });

  it('should route append_to_project actions to appendToProject', async () => {
    const projectResult: CaptureAction = {
      ...saveLinkResult,
      action: 'append_to_project',
      project: 'compiler',
    };
    mockClassify.mockResolvedValueOnce(projectResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'note for compiler', source: 'voice' });

    await vi.waitFor(() => {
      expect(mockAppendToProject).toHaveBeenCalledWith(projectResult);
    });
  });

  it('should route inbox actions to inbox', async () => {
    const inboxResult: CaptureAction = { ...saveLinkResult, action: 'inbox' };
    mockClassify.mockResolvedValueOnce(inboxResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'vague thing', source: 'share' });

    await vi.waitFor(() => {
      expect(mockInbox).toHaveBeenCalledWith(inboxResult, 'vague thing', 'share');
    });
  });

  it('should always log activity after successful processing', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'test', source: 'voice' });

    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        'test',
        'voice',
        saveLinkResult,
        'success'
      );
    });
  });

  it('should log error activity when processing fails', async () => {
    mockClassify.mockRejectedValueOnce(new Error('Classification failed'));

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'test', source: 'voice' });

    await vi.waitFor(() => {
      expect(mockLogActivity).toHaveBeenCalledWith(
        'test',
        'voice',
        expect.objectContaining({ action: 'inbox' }),
        'error',
        'Classification failed'
      );
    });
  });

  it('should default source to "unknown" when not provided', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'test' });

    await vi.waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith('test', 'unknown');
    });
  });

  it('should allow requests when WEBHOOK_SECRET is not set', async () => {
    delete process.env.WEBHOOK_SECRET;
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    const res = await request(app)
      .post('/webhook')
      .send({ text: 'test', source: 'voice' });

    expect(res.status).toBe(200);
  });

  it('should accept optional timestamp field', async () => {
    mockClassify.mockResolvedValueOnce(saveLinkResult);

    const res = await request(app)
      .post('/webhook')
      .set('Authorization', 'Bearer test-secret')
      .send({
        text: 'test',
        source: 'voice',
        timestamp: '2026-02-08T12:00:00Z',
      });

    expect(res.status).toBe(200);
  });
});
