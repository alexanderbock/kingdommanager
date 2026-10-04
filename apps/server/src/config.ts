export interface Config {
  port: number;
  host: string;
  basePath: string;
  dbPath: string;
  webDist: string;
}

/** BASE_PATH must start and end with "/". */
export function normalizeBasePath(p: string): string {
  let b = p || '/';
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '127.0.0.1',
    basePath: normalizeBasePath(process.env.BASE_PATH ?? '/'),
    dbPath: process.env.DB_PATH ?? './data/kingdom.sqlite',
    // apps/server/src|dist -> ../../web/dist
    webDist: new URL('../../web/dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  };
}
