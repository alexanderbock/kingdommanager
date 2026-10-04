import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const BASE = `${import.meta.env.BASE_URL}api`;

/**
 * Subscribe to the server's change stream. Reconnects with exponential
 * backoff (1s .. 30s) and invalidates the matching query on each message.
 */
export function useSse(): void {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number | undefined;
    let delay = 1000;
    let closed = false;

    const connect = () => {
      es = new EventSource(`${BASE}/events-stream`);
      es.onopen = () => {
        delay = 1000;
      };
      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.entity) qc.invalidateQueries({ queryKey: [msg.entity] });
        } catch {
          /* heartbeat or bad frame */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30_000);
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      es?.close();
    };
  }, [qc]);
}