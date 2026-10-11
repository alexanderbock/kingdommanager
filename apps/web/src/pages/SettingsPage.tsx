import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

/** Application-wide settings. */
export function SettingsPage() {
  const reset = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>('/reset', { method: 'POST' }),
    // The whole database changed: a reload is the cleanest way to refresh
    // every query, the SSE stream, and any stale local drafts.
    onSuccess: () => window.location.reload(),
  });

  const onReset = () => {
    const ok = window.confirm(
      'Reset the entire kingdom to its default state?\n\n' +
        'All records, turns, and the turn log will be replaced with the initial seed data. ' +
        'Export a backup first if you want to keep the current state.',
    );
    if (ok) reset.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="card">
        <h2 className="mb-1 text-lg font-semibold">Reset</h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Restore the kingdom to its default state: every record, turn, and turn log entry is
          replaced with the initial seed data (an empty kingdom with no settlements).
        </p>
        <button className="btn-danger" onClick={onReset} disabled={reset.isPending}>
          {reset.isPending ? 'Resetting…' : 'Reset kingdom to defaults'}
        </button>
        {reset.isError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            Reset failed: {(reset.error as Error).message}
          </p>
        )}
      </section>
    </div>
  );
}