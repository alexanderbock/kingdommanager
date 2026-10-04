import type { FastifyInstance } from 'fastify';

type SseClient = {
  id: number;
  send: (chunk: string) => void;
};

const clients = new Set<SseClient>();
const heartbeats = new Map<number, NodeJS.Timeout>();
let nextId = 1;

/** Broadcast a change message to all connected clients. */
export function broadcast(message: Record<string, unknown>): void {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const client of clients) {
    try {
      client.send(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function sseClientCount(): number {
  return clients.size;
}

/**
 * GET /api/events-stream - Server-Sent Events.
 * Sends {entity, id, version} messages plus a heartbeat comment every 25 s.
 */
export function registerSseRoutes(app: FastifyInstance, apiPrefix: string): void {
  app.get(`${apiPrefix}/events-stream`, (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 2000\n\n');
    const id = nextId++;
    const client: SseClient = {
      id,
      send: (chunk) => reply.raw.write(chunk),
    };
    clients.add(client);
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clients.delete(client);
      }
    }, 25000);
    heartbeats.set(id, heartbeat);
    req.raw.on('close', () => {
      clients.delete(client);
      const hb = heartbeats.get(id);
      if (hb) clearInterval(hb);
      heartbeats.delete(id);
    });
    reply.hijack();
  });
}
