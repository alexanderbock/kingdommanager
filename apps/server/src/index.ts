import { loadConfig } from './config.js';
import { initDb, closeDb } from './db.js';
import { seedIfEmpty } from './seed.js';
import { buildApp } from './app.js';

const config = loadConfig();
initDb(config.dbPath);
seedIfEmpty();

const app = await buildApp(config);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    closeDb();
    process.exit(0);
  });
}
