import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActivityOption } from '@kingdom/shared';

/**
 * The leadership activity list is a user-editable JSON file
 * (seed/leadership-activities.json). It is read on every request so the GM
 * can edit the file and see changes immediately — no restart, no re-seed.
 */
function findActivitiesFile(): string {
  // Walk up from this module (src/routes or dist/routes) to the server root,
  // so the route works both in dev (tsx from src) and production (dist).
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'seed', 'leadership-activities.json');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('leadership-activities.json not found');
}

function readLeadershipActivities(): ActivityOption[] {
  return JSON.parse(readFileSync(findActivitiesFile(), 'utf8')) as ActivityOption[];
}

export function registerLeadershipRoutes(app: FastifyInstance, api: string): void {
  app.get(`${api}/leadership-activities`, async (req, reply) => {
    try {
      return readLeadershipActivities();
    } catch (e) {
      app.log.error(e, 'failed to read leadership-activities.json');
      return reply.code(500).send({ error: 'failed to read leadership activities' });
    }
  });
}
