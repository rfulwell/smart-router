import { appendSection } from '../services/docs.js';
import { fetchRegistry } from '../config/registry.js';
import type { CaptureAction } from '../classifier/schema.js';

/**
 * Append a timestamped note to an existing project's Google Doc.
 * Looks up the project's Doc ID from the Config Sheet registry.
 */
export async function appendToProject(result: CaptureAction): Promise<void> {
  if (!result.project) {
    throw new Error('append_to_project action requires a project name');
  }

  const registry = await fetchRegistry();
  const project = registry.projects.find(
    (p) => p.name.toLowerCase() === result.project!.toLowerCase()
  );

  if (!project || !project.docId) {
    throw new Error(
      `Project "${result.project}" not found in registry or has no Doc ID`
    );
  }

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const tagsLine = result.tags.length > 0 ? result.tags.join(', ') : 'none';

  const section = [
    `${timestamp}`,
    `Tags: ${tagsLine}`,
    '',
    result.comment,
  ].join('\n');

  await appendSection(project.docId, section);
}
