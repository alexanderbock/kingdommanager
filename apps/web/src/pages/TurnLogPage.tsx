import type { ReactNode } from 'react';
import type { TurnLogChange, TurnLogEntry, TurnLogTurn } from '@kingdom/shared';
import { useAutoRefetchOnError, useDeleteTurnLogEntry, useNextTurn, useTurnLog } from '../hooks/useRecords';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  return String(v);
}

function isComplex(v: unknown): boolean {
  return Array.isArray(v) || (v !== null && typeof v === 'object');
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (isComplex(v)) return Object.keys(v).length === 0;
  return false;
}

/** Human-readable `key: value` lines for a data object; empty values and
 *  technical identifiers (`id`) are skipped. */
function dataLines(data: unknown, depth = 0): string[] {
  const pad = '  '.repeat(depth);
  if (isEmptyValue(data)) return [`${pad}—`];
  if (Array.isArray(data)) {
    if (data.every((v) => !isComplex(v))) return [`${pad}${data.map(formatValue).join(', ')}`];
    return data.flatMap((item) =>
      isComplex(item) ? dataLines(item, depth + 1) : [`${pad}- ${formatValue(item)}`],
    );
  }
  if (data !== null && typeof data === 'object') {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'id') continue;
      if (isEmptyValue(value)) continue;
      if (!isComplex(value)) {
        lines.push(`${pad}${key}: ${formatValue(value)}`);
      } else if (Array.isArray(value) && value.every((v) => !isComplex(v))) {
        lines.push(`${pad}${key}: ${value.map(formatValue).join(', ')}`);
      } else {
        lines.push(`${pad}${key}:`);
        lines.push(...dataLines(value, depth + 1));
      }
    }
    return lines.length > 0 ? lines : [`${pad}—`];
  }
  return [`${pad}${formatValue(data)}`];
}

/** Short human label for an array item (its name or type, if it has one). */
function itemLabel(item: unknown): string {
  if (item === null || typeof item !== 'object') return '';
  const v = (item as Record<string, unknown>).name ?? (item as Record<string, unknown>).type;
  return typeof v === 'string' && v !== '' ? v : '';
}

/** `field: before → after` lines for two values (recursive; `id` skipped). */
function diffLines(a: unknown, b: unknown, prefix = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const lines: string[] = [];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (key === 'id') continue;
      lines.push(...diffLines(a[key], b[key], prefix ? `${prefix}.${key}` : key));
    }
    return lines;
  }
  return [`${prefix || 'value'}: ${formatValue(a)} → ${formatValue(b)}`];
}

/**
 * Minimal diff of two arrays of items keyed by `id`: lists only the added,
 * removed, and changed items. Returns null when the items cannot be matched
 * by id (caller falls back to a full before/after dump).
 */
function arrayDiffLines(before: unknown[], after: unknown[]): string[] | null {
  const isIdItem = (v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) && typeof (v as { id?: unknown }).id === 'string';
  if (!before.every(isIdItem) || !after.every(isIdItem)) return null;
  const bMap = new Map(before.map((v) => [(v as { id: string }).id, v]));
  const aMap = new Map(after.map((v) => [(v as { id: string }).id, v]));
  const lines: string[] = [];
  for (const [id, item] of aMap) {
    if (!bMap.has(id)) lines.push('added:', ...dataLines(item, 1));
  }
  for (const [id, item] of bMap) {
    const next = aMap.get(id);
    if (next === undefined) {
      lines.push('removed:', ...dataLines(item, 1));
    } else if (JSON.stringify(next) !== JSON.stringify(item)) {
      const label = itemLabel(item);
      lines.push(`changed${label ? ` (${label})` : ''}:`, ...diffLines(item, next).map((l) => `  ${l}`));
    }
  }
  return lines.length > 0 ? lines : null;
}

/** Show-block text for a complex change: a minimal array diff when possible. */
function complexLines(change: TurnLogChange): string {
  if (Array.isArray(change.before) && Array.isArray(change.after)) {
    const lines = arrayDiffLines(change.before, change.after);
    if (lines) return lines.join('\n');
  }
  return `before:\n${dataLines(change.before).join('\n')}\nafter:\n${dataLines(change.after).join('\n')}`;
}

/** One changed scalar field: `field: before → after`. */
function Change({ change }: { change: TurnLogChange }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-medium text-zinc-700 dark:text-zinc-200">{change.field}</span>
      <span className="text-zinc-500 dark:text-zinc-400">{formatValue(change.before)}</span>
      <span className="text-zinc-400 dark:text-zinc-500">→</span>
      <span className="font-semibold">{formatValue(change.after)}</span>
    </span>
  );
}

/** Collapsible details block rendered below the entry line. */
function Show({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer select-none text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        {label}
      </summary>
      <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 font-mono text-xs dark:bg-zinc-800">
        {children}
      </pre>
    </details>
  );
}

function Entry({ entry }: { entry: TurnLogEntry }) {
  const del = useDeleteTurnLogEntry();
  const isCreate = entry.action === 'create';
  const isDelete = entry.action === 'delete';
  const simple = entry.changes.filter((c) => !isComplex(c.before) && !isComplex(c.after));
  const complex = entry.changes.filter((c) => isComplex(c.before) || isComplex(c.after));
  return (
    <li className="group py-1.5 text-sm">
      <div className="flex items-start gap-2">
        <span className="w-10 shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
          {formatTime(entry.at)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{entry.label}</span>
          {isCreate && <span className="text-zinc-500 dark:text-zinc-400"> created with values</span>}
          {isDelete && <span className="text-zinc-500 dark:text-zinc-400"> deleted</span>}
          {simple.length > 0 && (
            <span className="ml-1 inline-flex flex-wrap gap-x-3 gap-y-0.5 align-baseline">
              {simple.map((c, i) => (
                <Change key={i} change={c} />
              ))}
            </span>
          )}
          {complex.length > 0 && (
            <span className="ml-1 inline-flex flex-wrap gap-x-3 gap-y-0.5 align-baseline">
              {complex.map((c, i) => (
                <span key={i} className="inline-flex items-baseline gap-1">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{c.field}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">changed</span>
                </span>
              ))}
            </span>
          )}
        </span>
        <button
          className="btn-ghost px-1.5 py-0.5 text-xs opacity-0 transition-opacity group-hover:opacity-100"
          title="Remove from log"
          onClick={() => {
            if (window.confirm(`Remove all of ${entry.label}'s changes for this turn?`)) {
              del.mutate(entry.ids);
            }
          }}
        >
          ×
        </button>
      </div>
      {(isCreate || complex.length > 0) && (
        <div className="ml-12 space-y-1.5">
          {isCreate && <Show label="show values">{dataLines(entry.values).join('\n')}</Show>}
          {complex.map((c, i) => (
            <Show key={i} label={`show ${c.field}`}>
              {complexLines(c)}
            </Show>
          ))}
        </div>
      )}
    </li>
  );
}

function TurnSection({ turn }: { turn: TurnLogTurn }) {
  const active = turn.status === 'active';
  return (
    <section className="card">
      <header className="mb-2 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        <h2 className="text-base font-bold">Turn {turn.number}</h2>
        {turn.inGameDate && (
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{turn.inGameDate}</span>
        )}
        <span
          className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            active
              ? 'bg-amber-600/15 text-amber-700 dark:text-amber-400'
              : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
          }`}
        >
          {active ? 'Active' : 'Finished'}
        </span>
      </header>
      {turn.entries.length === 0 ? (
        <p className="py-2 text-sm text-zinc-400 dark:text-zinc-500">No changes yet this turn.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {turn.entries.map((e) => (
            <Entry key={`${e.ids[0]}-${e.action}-${e.changes[0]?.field ?? ''}`} entry={e} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function TurnLogPage() {
  const { data, error, isFetching, refetch } = useTurnLog();
  useAutoRefetchOnError(error, isFetching, refetch);
  const nextTurn = useNextTurn();

  const active = data?.activeTurnNumber ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Turn Log</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {active === null
              ? 'No active turn — changes made now are setup and won’t be logged.'
              : `Changes are logged to turn ${active}.`}
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={nextTurn.isPending}
          onClick={() => {
            if (active !== null && !window.confirm(`Finish turn ${active} and start turn ${active + 1}?`)) {
              return;
            }
            nextTurn.mutate();
          }}
        >
          {active === null ? 'Start turn 1' : 'Next turn'}
        </button>
      </div>

      {nextTurn.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to start the next turn: {nextTurn.error instanceof Error ? nextTurn.error.message : 'unknown error'}
        </p>
      )}

      {data && data.turns.length === 0 && (
        <div className="card text-center text-sm text-zinc-500 dark:text-zinc-400">
          No turns yet. Start turn 1 to begin logging changes.
        </div>
      )}

      {data?.turns.map((t) => (
        <TurnSection key={t.number} turn={t} />
      ))}
    </div>
  );
}