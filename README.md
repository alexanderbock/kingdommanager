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
