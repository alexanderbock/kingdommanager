import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Building,
  Defense,
  Settlement,
  SettlementBorder,
  SettlementSide,
  StoredRecord,
} from '@kingdom/shared';
import {
  blockCells,
  buildingCells,
  buildingRect,
  fitsPlacement,
  overcrowdingFor,
  rectCells,
  SETTLEMENT_SIDES,
  settlementBorders,
  settlementGrid,
  type SettlementGrid,
} from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import { describeSaveError } from '../lib/api';
import {
  ConflictError,
  useAutoRefetchOnError,
  useAutosave,
  useCreate,
  useDelete,
  useDraft,
  useList,
  usePatch,
} from '../hooks/useRecords';

type SettlementType = Settlement['type'];

const SETTLEMENT_TYPES: SettlementType[] = ['village', 'town', 'city', 'metropolis'];
const TYPE_LABELS: Record<SettlementType, string> = {
  village: 'Village (1 block)',
  town: 'Town (4 blocks)',
  city: 'City (9 blocks)',
  metropolis: 'Metropolis (9 blocks × N)',
};
const SIDE_LABELS: Record<SettlementSide, string> = {
  north: 'North',
  west: 'West',
  south: 'South',
  east: 'East',
};

/** A new building's details, before the user picks where to place it. */
interface BuildingDetails {
  name: string;
  w: number;
  h: number;
  notes: string;
  residential: boolean;
  image: string;
  link: string;
}

export function SettlementsPage() {
  const { data, isLoading, error, isFetching, refetch } = useList<Settlement>('settlements');
  useAutoRefetchOnError(error, isFetching, refetch);
  const create = useCreate<Settlement>('settlements');
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) return <p className="text-sm text-zinc-500">Loading settlements…</p>;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">Could not load settlements.</p>
        <button className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Settlements</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          Add settlement
        </button>
      </div>
      {data.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No settlements yet — add one to get started.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((rec) => (
          <SettlementCard key={rec.id} rec={rec} />
        ))}
      </div>
      <AddSettlementModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        isPending={create.isPending}
        onCreate={(s) => create.mutate(s)}
      />
    </div>
  );
}

function AddSettlementModal({
  open,
  onClose,
  onCreate,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (s: Settlement) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<SettlementType>('village');
  const [grids, setGrids] = useState(1);
  const [location, setLocation] = useState('');

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({
      name: trimmed,
      type,
      grids: type === 'metropolis' ? Math.max(1, grids) : 1,
      location,
      buildings: [],
      notes: '',
      borders: settlementBorders({}),
    });
    setName('');
    setType('village');
    setGrids(1);
    setLocation('');
    onClose();
  };

  return (
    <Modal open={open} title="New settlement" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field"
            value={name}
            placeholder="Settlement name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Size</span>
          <select
            className="field"
            value={type}
            onChange={(e) => setType(e.target.value as SettlementType)}
          >
            {SETTLEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {type === 'metropolis' && (
          <label className="block">
            <span className="label">Urban grids (9 blocks each)</span>
            <NumberField value={grids} min={1} onChange={(v) => setGrids(v ?? 1)} />
          </label>
        )}
        <label className="block">
          <span className="label">Location</span>
          <input
            className="field"
            value={location}
            placeholder="Location"
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!name.trim() || isPending} onClick={submit}>
            {isPending ? 'Adding…' : 'Add settlement'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettlementCard({ rec }: { rec: StoredRecord<Settlement> }) {
  const qc = useQueryClient();
  const { draft, setDraft, dirty, baseVersion, bumpBaseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<Settlement>('settlements', rec.id);
  const del = useDelete('settlements');
  const [conflict, setConflict] = useState<StoredRecord<Settlement> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ building: Building | null } | null>(null);
  const [defenseSide, setDefenseSide] = useState<SettlementSide | null>(null);
  const [placing, setPlacing] = useState<BuildingDetails | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<number | null>(null);
  const deletedRef = useRef(false);
  // The version the draft is based on, tracked in a ref so a save that fires
  // in the same tick as a just-completed one reads the *latest* version
  // (React state lags a render, which is what caused stale-version 409s).
  const versionRef = useRef<number | undefined>(baseVersion);
  versionRef.current = baseVersion;
  // JSON of the last successfully saved draft, so we skip redundant saves.
  const lastSavedRef = useRef<string | null>(null);

  const save = () => {
    if (!draft || deletedRef.current) return;
    const draftJson = JSON.stringify(draft);
    // Nothing changed since the last successful save: don't re-save (a
    // redundant save here would race the completed one and 409).
    if (lastSavedRef.current !== null && draftJson === lastSavedRef.current) return;
    mutate.mutate(
      { data: draft, version: versionRef.current ?? rec.version },
      {
        onSuccess: (saved) => {
          versionRef.current = saved.version;
          lastSavedRef.current = draftJson;
          bumpBaseVersion(saved.version);
          setSaveError(null);
        },
        onError: (e) => {
          if (e instanceof ConflictError) {
            setConflict(e.current);
          } else {
            setSaveError(describeSaveError(e));
            console.error('Settlement save failed', e);
          }
        },
      },
    );
  };
  useAutosave({ draft, dirty, isPending: mutate.isPending, paused: conflict !== null, save });

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPlacing(null);
        setHoverAnchor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  if (!draft) return null;

  const grid = settlementGrid(draft.type, draft.grids);
  const occ = overcrowdingFor(draft);
  const cellBuilding = new Map<number, Building>();
  for (const b of draft.buildings) {
    for (const c of buildingCells(b, grid)) cellBuilding.set(c, b);
  }

  const up = <K extends keyof Settlement>(key: K, value: Settlement[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  /** Changing the size may shrink the grid; buildings that no longer fit are removed. */
  const pruneTo = (next: Settlement): Settlement => {
    const g = settlementGrid(next.type, next.grids);
    return {
      ...next,
      buildings: next.buildings.filter((b) =>
        buildingCells(b, g).every((c) => c >= 0 && c < g.totalCells),
      ),
    };
  };
  const upType = (type: SettlementType) =>
    setDraft((d) => (d ? pruneTo({ ...d, type, grids: type === 'metropolis' ? d.grids : 1 }) : d));
  const upGrids = (n: number) =>
    setDraft((d) => (d && d.type === 'metropolis' ? pruneTo({ ...d, grids: Math.max(1, n) }) : d));

  const borders = settlementBorders(draft);
  const upBorder = (side: SettlementSide, patch: Partial<SettlementBorder>) =>
    setDraft((d) => {
      if (!d) return d;
      const current = settlementBorders(d);
      return { ...d, borders: { ...current, [side]: { ...current[side], ...patch } } };
    });

  const addBuilding = (b: Building) =>
    setDraft((d) => (d ? { ...d, buildings: [...d.buildings, b] } : d));
  const updateBuilding = (b: Building) =>
    setDraft((d) => (d ? { ...d, buildings: d.buildings.map((x) => (x.id === b.id ? b : x)) } : d));
  const removeBuilding = (id: string) =>
    setDraft((d) => (d ? { ...d, buildings: d.buildings.filter((x) => x.id !== id) } : d));

  const placementError = (anchor: number, w: number, h: number, ignoreId?: string): string | null => {
    if (!fitsPlacement(grid, anchor, w, h)) return "Doesn't fit at this location.";
    for (const c of rectCells(grid, anchor, w, h)) {
      const taken = cellBuilding.get(c);
      if (taken && taken.id !== ignoreId) return `Overlaps ${taken.name}.`;
    }
    return null;
  };

  const tryPlace = (anchor: number) => {
    if (!placing || placementError(anchor, placing.w, placing.h)) return;
    addBuilding({ id: crypto.randomUUID(), ...placing, anchor });
    setPlacing(null);
    setHoverAnchor(null);
  };

  const acceptServer = () => {
    if (!conflict) return;
    qc.setQueryData<StoredRecord<Settlement>[]>(['settlements'], (list) =>
      list ? list.map((r) => (r.id === conflict.id ? conflict : r)) : list,
    );
    setDraft(conflict.data);
    versionRef.current = conflict.version;
    lastSavedRef.current = JSON.stringify(conflict.data);
    setConflict(null);
    setSaveError(null);
  };
  const forceSave = () => {
    if (!conflict) return;
    const draftJson = JSON.stringify(draft);
    mutate.mutate(
      { data: draft, version: conflict.version, force: true },
      {
        onSuccess: (saved) => {
          versionRef.current = saved.version;
          lastSavedRef.current = draftJson;
          bumpBaseVersion(saved.version);
          setConflict(null);
          setSaveError(null);
        },
        onError: (e) => {
          if (e instanceof ConflictError) {
            setConflict(e.current);
          } else {
            // The overwrite was rejected (e.g. invalid data). Surface it
            // instead of looping silently on the same dialog.
            setSaveError(describeSaveError(e));
            console.error('Settlement overwrite failed', e);
          }
        },
      },
    );
  };

  const removeSettlement = () => {
    if (window.confirm(`Delete ${draft.name || 'this settlement'} and all of its buildings?`)) {
      deletedRef.current = true;
      del.mutate(rec.id);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="field flex-1 font-semibold"
          value={draft.name}
          placeholder="Settlement name"
          aria-label="Settlement name"
          onChange={(e) => up('name', e.target.value)}
        />
        {saveError && (
          <span className="shrink-0 text-xs text-red-600 dark:text-red-400" title={saveError}>
            Save failed
          </span>
        )}
        <button
          className="btn-ghost shrink-0 px-2 py-1 text-xs text-red-600 dark:text-red-400"
          onClick={removeSettlement}
        >
          Delete
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Size</span>
          <select
            className="field"
            value={draft.type}
            title="Shrinking the grid removes buildings that no longer fit"
            onChange={(e) => upType(e.target.value as SettlementType)}
          >
            {SETTLEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {draft.type === 'metropolis' && (
          <label className="block">
            <span className="label">Urban grids</span>
            <NumberField value={draft.grids} min={1} onChange={(v) => upGrids(v ?? 1)} />
          </label>
        )}
        <label className="block">
          <span className="label">Location</span>
          <EditableText value={draft.location} onChange={(v) => up('location', v)} placeholder="Location" />
        </label>
      </div>
      <label className="block">
        <span className="label">Notes</span>
        <EditableText
          textarea
          rows={3}
          value={draft.notes ?? ''}
          onChange={(v) => up('notes', v)}
          placeholder="Notes"
        />
      </label>

      {occ.occupiedBlocks > 0 &&
        (occ.overcrowded ? (
          <span className="inline-block rounded-full bg-red-600/15 px-3 py-1 text-xs font-semibold text-red-700 dark:text-red-400">
            Overcrowded — +1 Unrest/turn ({occ.residentialLots} residential lots /{' '}
            {occ.occupiedBlocks} occupied blocks)
          </span>
        ) : (
          <span className="inline-block rounded-full bg-green-600/15 px-3 py-1 text-xs font-semibold text-green-700 dark:text-green-400">
            Housing OK ({occ.residentialLots} residential lots / {occ.occupiedBlocks} occupied blocks)
          </span>
        ))}

      <div>
        {/* urban grid framed by its four sides (bridges and defenses) */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1">
          {SETTLEMENT_SIDES.map((side) => (
            <SideBar
              key={side}
              side={side}
              border={borders[side]}
              onToggleBridge={() => upBorder(side, { bridge: !borders[side].bridge })}
              onEditDefense={() => setDefenseSide(side)}
            />
          ))}
          <div
            className="col-start-2 row-start-2 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHoverAnchor(null)}
          >
            {/* 2×2 block outlines (behind the cells) */}
            {Array.from({ length: grid.blocks }, (_, bi) => {
              const a = blockCells(grid, bi)[0];
              const col = a % grid.cols;
              const row = Math.floor(a / grid.cols);
              return (
                <div
                  key={`block-${bi}`}
                  aria-hidden
                  style={{ gridColumn: `${col + 1} / span 2`, gridRow: `${row + 1} / span 2` }}
                  className="pointer-events-none z-10 rounded-md border-2 border-zinc-300 dark:border-zinc-600"
                />
              );
            })}
            {/* lots */}
            {Array.from({ length: grid.totalCells }, (_, i) => {
              const b = cellBuilding.get(i);
              const col = i % grid.cols;
              const row = Math.floor(i / grid.cols);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Lot ${row + 1}.${col + 1}`}
                  aria-hidden={b ? true : undefined}
                  tabIndex={b ? -1 : 0}
                  style={{ gridColumn: col + 1, gridRow: row + 1 }}
                  onMouseEnter={() => {
                    if (placing) setHoverAnchor(i);
                  }}
                  onClick={() => {
                    if (placing) tryPlace(i);
                    else if (b) setModal({ building: b });
                  }}
                  className={`aspect-square rounded-sm ${
                    b
                      ? ''
                      : 'bg-zinc-100 hover:bg-amber-200/70 dark:bg-zinc-800/60 dark:hover:bg-amber-500/30'
                  } ${placing ? 'cursor-crosshair' : ''}`}
                />
              );
            })}
            {/* buildings (span their w×h rectangle) */}
            {draft.buildings.map((b) => {
              const { anchor, w, h } = buildingRect(b, grid);
              const col = anchor % grid.cols;
              const row = Math.floor(anchor / grid.cols);
              const sw = Math.min(w, grid.cols - col);
              const sh = Math.min(h, grid.rows - row);
              const img = b.image ?? '';
              return (
                <button
                  key={b.id}
                  type="button"
                  style={{ gridColumn: `${col + 1} / span ${sw}`, gridRow: `${row + 1} / span ${sh}` }}
                  title={`${b.name}${b.residential ? ' (residential)' : ''}${
                    b.notes ? ` — ${b.notes}` : ''
                  }`}
                  onClick={() => {
                    if (!placing) setModal({ building: b });
                  }}
                  className={`relative z-20 overflow-hidden rounded-sm border-2 text-xs font-semibold text-white ${
                    b.residential ? 'border-amber-600 bg-amber-500/70' : 'border-sky-600 bg-sky-500/70'
                  } ${placing ? 'pointer-events-none' : ''}`}
                >
                  {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                  {img ? (
                    <span className="absolute bottom-0 left-0 m-0.5 line-clamp-2 break-words rounded bg-black/50 px-1 text-left text-[10px] leading-tight">
                      {b.name}
                    </span>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center overflow-hidden break-words p-0.5 text-center text-[10px] leading-tight">
                      {b.name}
                    </span>
                  )}
                </button>
              );
            })}
            {/* placement preview */}
            {placing && hoverAnchor !== null && (() => {
              const col = hoverAnchor % grid.cols;
              const row = Math.floor(hoverAnchor / grid.cols);
              const valid = !placementError(hoverAnchor, placing.w, placing.h);
              const sw = Math.min(placing.w, grid.cols - col);
              const sh = Math.min(placing.h, grid.rows - row);
              return (
                <div
                  aria-hidden
                  style={{ gridColumn: `${col + 1} / span ${sw}`, gridRow: `${row + 1} / span ${sh}` }}
                  className={`pointer-events-none z-30 rounded-sm border-2 ${
                    valid ? 'border-green-500 bg-green-500/25' : 'border-red-500 bg-red-500/25'
                  }`}
                />
              );
            })()}
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Each block is a 2×2 of lots. <span className="text-amber-600 dark:text-amber-400">■</span>{' '}
          residential · <span className="text-sky-600 dark:text-sky-400">■</span> other ·{' '}
          <span className="text-rose-600 dark:text-rose-400">■</span> defense — click a building to
          edit it, or a side to toggle a bridge or add a defense.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="label">Buildings</span>
          {placing ? (
            <button
              type="button"
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => {
                setPlacing(null);
                setHoverAnchor(null);
              }}
            >
              Cancel placement
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => setModal({ building: null })}
            >
              + Add building
            </button>
          )}
        </div>
        {placing && (
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            Click a lot to place {placing.name} ({placing.w}×{placing.h}) — Esc to cancel.
          </p>
        )}
        {draft.buildings.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            None yet — add a building and place it on the grid.
          </p>
        ) : (
          <ul className="space-y-1">
            {draft.buildings.map((b) => {
              const { w, h } = buildingRect(b, grid);
              return (
                <li key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {w}×{h}
                  </span>
                  {b.residential && (
                    <span className="rounded-full bg-amber-600/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      residential
                    </span>
                  )}
                  {b.link && (
                    <a
                      href={b.link}
                      target="_blank"
                      rel="noreferrer"
                      title={b.link}
                      className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                    >
                      link ↗
                    </a>
                  )}
                  {b.notes && (
                    <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{b.notes}</span>
                  )}
                  <span className="ml-auto flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="btn-ghost px-2 py-0.5 text-xs"
                      onClick={() => setModal({ building: b })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
                      onClick={() => removeBuilding(b.id)}
                    >
                      Remove
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConflictDialog
        open={conflict !== null}
        title={draft.name || 'Settlement'}
        current={conflict}
        error={saveError}
        onAcceptServer={acceptServer}
        onForce={forceSave}
      />
      {modal && (
        <BuildingModal
          key={modal.building?.id ?? 'new'}
          grid={grid}
          building={modal.building}
          placementError={placementError}
          onPlace={(d) => {
            setPlacing(d);
            setModal(null);
          }}
          onSave={(b) => {
            updateBuilding(b);
            setModal(null);
          }}
          onRemove={
            modal.building
              ? () => {
                  removeBuilding(modal.building!.id);
                  setModal(null);
                }
              : undefined
          }
          onClose={() => setModal(null)}
        />
      )}
      {defenseSide && (
        <DefenseModal
          key={defenseSide}
          side={defenseSide}
          defense={borders[defenseSide].defense}
          onSave={(d) => {
            upBorder(defenseSide, { defense: d });
            setDefenseSide(null);
          }}
          onRemove={() => {
            upBorder(defenseSide, { defense: null });
            setDefenseSide(null);
          }}
          onClose={() => setDefenseSide(null)}
        />
      )}
    </div>
  );
}

/** Where each side's bar sits in the 3×3 frame around the lot grid. */
const SIDE_PLACEMENT: Record<SettlementSide, string> = {
  north: 'col-start-2 row-start-1',
  // W and E use vertical text, where a flex row already runs top to bottom.
  west: 'col-start-1 row-start-2 [writing-mode:vertical-rl] rotate-180',
  south: 'col-start-2 row-start-3',
  east: 'col-start-3 row-start-2 [writing-mode:vertical-rl]',
};

/** One side of the urban grid: a bridge toggle and an optional defensive structure. */
function SideBar({
  side,
  border,
  onToggleBridge,
  onEditDefense,
}: {
  side: SettlementSide;
  border: SettlementBorder;
  onToggleBridge: () => void;
  onEditDefense: () => void;
}) {
  const label = SIDE_LABELS[side];
  const d = border.defense;
  return (
    <div className={`flex items-center justify-center gap-1 text-xs ${SIDE_PLACEMENT[side]}`}>
      <button
        type="button"
        aria-pressed={border.bridge}
        title={`${label}: ${border.bridge ? 'bridge (click to remove)' : 'no bridge (click to add)'}`}
        onClick={onToggleBridge}
        className={`rounded-sm border px-1.5 py-0.5 font-medium ${
          border.bridge
            ? 'border-zinc-600 bg-zinc-500/70 text-white'
            : 'border-dashed border-zinc-300 text-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800'
        }`}
      >
        Bridge
      </button>
      {d ? (
        <span className="flex items-center gap-1 rounded-sm border-2 border-rose-600 bg-rose-500/70 px-1.5 py-0.5 font-semibold text-white">
          <button
            type="button"
            title={`${label} defense${d.notes ? ` — ${d.notes}` : ''}`}
            onClick={onEditDefense}
          >
            {d.name}
          </button>
          {d.link && (
            <a href={d.link} target="_blank" rel="noreferrer" title={d.link} className="hover:underline">
              ↗
            </a>
          )}
        </span>
      ) : (
        <button
          type="button"
          title={`Add a defensive structure on the ${side} side`}
          onClick={onEditDefense}
          className="rounded-sm border border-dashed border-zinc-300 px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800"
        >
          + Defense
        </button>
      )}
    </div>
  );
}

/** Create or edit the defensive structure on one side of a settlement. */
function DefenseModal({
  side,
  defense,
  onSave,
  onRemove,
  onClose,
}: {
  side: SettlementSide;
  defense: Defense | null;
  onSave: (d: Defense) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defense?.name ?? '');
  const [link, setLink] = useState(defense?.link ?? '');
  const [notes, setNotes] = useState(defense?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required.');
      return;
    }
    onSave({ name: trimmed, link: link.trim(), notes });
  };

  return (
    <Modal open title={`${SIDE_LABELS[side]} defense`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field"
            value={name}
            placeholder="e.g. Wall, Gate"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Link</span>
          <input
            className="field"
            value={link}
            placeholder="https://… (e.g. an Archives of Nethys page)"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <textarea
            className="field"
            rows={2}
            value={notes}
            placeholder="Notes"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <div>
            {defense && (
              <button className="btn-ghost text-red-600 dark:text-red-400" onClick={onRemove}>
                Remove
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit}>
              {defense ? 'Save defense' : 'Add defense'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface BuildingModalProps {
  grid: SettlementGrid;
  /** The building being edited, or null for a new one. */
  building: Building | null;
  placementError: (anchor: number, w: number, h: number, ignoreId?: string) => string | null;
  /** New building: close the modal and start the grid's placement phase. */
  onPlace: (details: BuildingDetails) => void;
  /** Edited building: save in place (anchor unchanged). */
  onSave: (b: Building) => void;
  onRemove?: () => void;
  onClose: () => void;
}

/** Create or edit a building. New buildings are placed after the modal:
 *  "Choose location" hands the details to the grid's placement phase. */
function BuildingModal({ grid, building, placementError, onPlace, onSave, onRemove, onClose }: BuildingModalProps) {
  const rect = building ? buildingRect(building, grid) : null;
  const [name, setName] = useState(building?.name ?? '');
  const [w, setW] = useState(rect?.w ?? 1);
  const [h, setH] = useState(rect?.h ?? 1);
  const [notes, setNotes] = useState(building?.notes ?? '');
  const [residential, setResidential] = useState(building?.residential ?? false);
  const [image, setImage] = useState(building?.image ?? '');
  const [link, setLink] = useState(building?.link ?? '');
  const [error, setError] = useState<string | null>(null);

  const details = (): BuildingDetails => ({
    name: name.trim(),
    w,
    h,
    notes,
    residential,
    image: image.trim(),
    link: link.trim(),
  });

  const submit = () => {
    const d = details();
    if (!d.name) {
      setError('Name is required.');
      return;
    }
    if (!building) {
      onPlace(d);
      return;
    }
    const err = placementError(rect!.anchor, w, h, building.id);
    if (err) {
      setError(err);
      return;
    }
    onSave({ id: building.id, ...d, anchor: rect!.anchor });
  };

  return (
    <Modal open title={building ? 'Edit building' : 'New building'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field"
            value={name}
            placeholder="Building name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="flex items-end gap-4">
          <label className="block">
            <span className="label">Width (x)</span>
            <select className="field" value={w} onChange={(e) => setW(Number(e.target.value))}>
              {Array.from({ length: grid.cols }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Height (y)</span>
            <select className="field" value={h} onChange={(e) => setH(Number(e.target.value))}>
              {Array.from({ length: grid.rows }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2 flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={residential}
              onChange={(e) => setResidential(e.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            Residential
          </label>
        </div>
        <label className="block">
          <span className="label">Image link</span>
          <input
            className="field"
            value={image}
            placeholder="https://… (optional, shown on the grid)"
            onChange={(e) => setImage(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Link</span>
          <input
            className="field"
            value={link}
            placeholder="https://… (e.g. an Archives of Nethys page)"
            onChange={(e) => setLink(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Notes</span>
          <textarea
            className="field"
            rows={2}
            value={notes}
            placeholder="Notes"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <div>
            {onRemove && (
              <button className="btn-ghost text-red-600 dark:text-red-400" onClick={onRemove}>
                Remove
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={submit}>
              {building ? 'Save building' : 'Choose location'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
