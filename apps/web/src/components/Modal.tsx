import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  /** Accessible name of the dialog (also shown as the heading). */
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Simple centered modal dialog. Clicking the backdrop closes it. */
export function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}