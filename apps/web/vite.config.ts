import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH flows into Vite's base, the router basename (via import.meta.env.BASE_URL)
// and the API prefix, so the app works at "/" or behind an Apache sub-path.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
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
});
