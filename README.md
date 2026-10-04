# Kingdom Manager

Self-hosted PF2e Kingmaker kingdom manager: a local web app (React + Fastify + SQLite)
for tracking the kingdom, skills, leaders, and settlements between sessions.

## Development

```sh
npm install
npm run dev        # server (port 3000) + web dev server (port 5173)
```

Other useful scripts:

```sh
npm run build      # build shared, server, and web
npm run typecheck
npm run lint
npm test           # server API tests (vitest)
npm run test:e2e   # Playwright e2e (uses a fresh throwaway database)
```

### Database and schema changes

The app is **not deployed**, so there is no migration policy:

- The SQLite database lives at `./data/kingdom.sqlite` relative to the server
  (configurable via `DB_PATH`).
- Incompatible schema changes bump `SCHEMA_VERSION` in `apps/server/src/db.ts`.
- On startup, if the stored schema version does not match, the server exits with a
  message telling you to **delete the local database file** to start fresh.
- Do not add migrations for incompatible changes — delete the database instead.
- `FRESH_DB=1` deletes the database before opening it (used by the e2e tests).