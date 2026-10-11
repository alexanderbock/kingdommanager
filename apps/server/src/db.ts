import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bump when a change makes existing databases incompatible. The app is not
 * deployed, so instead of migrating, the local database file is deleted.
 */
export const SCHEMA_VERSION = 2;

let db: Database.Database;

export function initDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  checkSchemaVersion(db, dbPath);
  return db;
}

function checkSchemaVersion(db: Database.Database, dbPath: string): void {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    return;
  }
  if (Number(row.value) !== SCHEMA_VERSION) {
    console.error(
      `Database schema is incompatible (stored v${row.value}, code expects v${SCHEMA_VERSION}).\n` +
        `The app is not deployed: delete ${dbPath} to start fresh.`,
    );
    process.exit(1);
  }
}

function runMigrations(db: Database.Database): void {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
  }
}

export function getDb(): Database.Database {
  return db;
}

export function closeDb(): void {
  db?.close();
}
