/** Fetch wrapper. All API calls are prefixed with the app's base path. */
const BASE = `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(`API error ${status}`);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    // Only advertise a JSON body when there is one; an empty body with
    // content-type application/json is rejected by Fastify (400).
    ...(init?.body != null ? { headers: { 'Content-Type': 'application/json' } } : {}),
    ...init,
  });
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Human-readable message for a failed save (validation details, etc.). */
export function describeSaveError(e: unknown): string {
  if (e instanceof ApiError) {
    const details = e.body?.details;
    if (Array.isArray(details) && details.length > 0) {
      return details
        .map((d: any) => (d.path?.length ? `${d.path.join('.')}: ${d.message}` : d.message))
        .join('; ');
    }
    return e.body?.error ? `server error: ${e.body.error}` : `server error (${e.status})`;
  }
  return e instanceof Error ? e.message : 'unknown error';
}