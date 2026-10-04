import type { StoredRecord } from '@kingdom/shared';

interface Props {
  open: boolean;
  title: string;
  current: StoredRecord<any> | null;
  onAcceptServer: () => void;
  onForce: () => void;
}

/**
 * Shown when a save is rejected with a 409: the server copy changed since
 * the user started editing. Offers loading the server copy or overwriting.
 */
export function ConflictDialog({ open, title, current, onAcceptServer, onForce }: Props) {
  if (!open || !current) return null;
  const updated = current.updatedAt ? new Date(current.updatedAt).toLocaleString() : 'unknown time';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-md">
        <h2 className="mb-2 text-lg font-semibold">Save conflict</h2>
        <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{title}</span> was changed
          elsewhere since you started editing (server copy last updated {updated}, v{current.version}).
        </p>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
          Load the server copy and discard your edits, or overwrite it with yours.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onAcceptServer}>
            Load server copy
          </button>
          <button className="btn-primary" onClick={onForce}>
            Overwrite with mine
          </button>
        </div>
      </div>
    </div>
  );
}