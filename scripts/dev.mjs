// Dev runner: builds the shared package, then starts the API server and the Vite dev server.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const useShell = process.platform === 'win32';

const build = spawnSync('npm', ['run', 'build', '-w', '@kingdom/shared'], {
  cwd: root,
  stdio: 'inherit',
  shell: useShell,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const procs = [
  { name: 'server', args: ['run', 'dev', '-w', '@kingdom/server'] },
  { name: 'web', args: ['run', 'dev', '-w', '@kingdom/web'] },
];

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill('SIGTERM');
  process.exit(code);
}

const children = procs.map((p) => {
  const child = spawn('npm', p.args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], shell: useShell });
  child.stdout.on('data', (d) => process.stdout.write(`[${p.name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${p.name}] ${d}`));
  child.on('exit', (code) => {
    console.log(`[dev] ${p.name} exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
