import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// BASE_PATH flows into Vite's base, the router basename (via import.meta.env.BASE_URL)
// and the API prefix, so the app works at "/" or behind an Apache sub-path.
// It is read from the environment or the repo-root .env (shared with the server).
export default defineConfig(({ mode }) => {
  const base = loadEnv(mode, repoRoot, '').BASE_PATH || '/';
  return {
    base,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        [`${base}api`]: {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
