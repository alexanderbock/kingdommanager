import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Army, StoredRecord } from '@kingdom/shared';
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

type ArmyTypeValue = Army['type'];
type ArmyStatusValue = Army['status'];
type AttackKindValue = Army['attacks'][number]['kind'];
type NumKey =
  | 'level'
  | 'scouting'
  | 'recruitmentDc'
  | 'consumption'
  | 'ac'
  | 'maneuver'
  | 'morale'
  | 'hp'
  | 'maxHp'
  | 'routThreshold'
  | 'recruitedOnTurn';

const ARMY_TYPES: ArmyTypeValue[] = ['infantry', 'cavalry', 'skirmisher', 'siege', 'other'];
const TYPE_LABELS: Record<ArmyTypeValue, string> = {
  infantry: 'Infantry',
  cavalry: 'Cavalry',
  skirmisher: 'Skirmishers',
  siege: 'Siege',
  other: 'Other',
};
const ARMY_STATUSES: ArmyStatusValue[] = ['active', 'garrisoned', 'routed', 'destroyed'];
const ATTACK_KINDS: AttackKindValue[] = ['melee', 'ranged', 'other'];

/** A fresh army stat block: every number left unset (null), never 0. */
function newArmy(name: string, type: ArmyTypeValue): Army {
  return {
    name,
    type,
    level: null,
    scouting: null,
    recruitmentDc: null,
    consumption: null,
    ac: null,
    maneuver: null,
    morale: null,
    hp: null,
    maxHp: null,
    routThreshold: null,
    attacks: [],
    tactics: [],
    gear: [],
    specialAbilities: [],
    conditions: [],
    location: '',
    recruitedOnTurn: null,
    status: 'active',
    notes: '',
  };
}

/** Editable list of plain strings (tactics, gear, special abilities, conditions). */
function StringList({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">{label}</span>
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onChange([...values, ''])}>
          + Add
        </button>
      </div>
      {values.length === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500">None</p>}
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <EditableText
              value={v}
              onChange={(nv) => onChange(values.map((x, j) => (j === i ? nv : x)))}
              placeholder={placeholder}
            />
            <button
              type="button"
              className="btn-ghost px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400"
              aria-label={`Remove ${label} ${i + 1}`}
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function ArmyCard({ rec }: { rec: StoredRecord<Army> }) {
  const qc = useQueryClient();
  const { draft, setDraft, dirty, baseVersion, bumpBaseVersion } = useDraft(rec.data, rec.version);
  const mutate = usePatch<Army>('armies', rec.id);
  const del = useDelete('armies');
  const [conflict, setConflict] = useState<StoredRecord<Army> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const deletedRef = useRef(false);
  // Latest saved version, updated immediately on success so a racing autosave
  // can never go out with a stale version (baseVersion only updates on render).
  const versionRef = useRef<number | undefined>(baseVersion);
  versionRef.current = baseVersion;
  // JSON of the last successfully saved draft, to skip redundant saves.
  const lastSavedRef = useRef<string | null>(null);

  const save = () => {
    if (!draft || deletedRef.current) return;
    const draftJson = JSON.stringify(draft);
    if (lastSavedRef.current === draftJson) return;
    mutate.mutate(
      { data: draft, version: versionRef.current ?? rec.version },
      {
        onSuccess: (saved) => {
          versionRef.current = saved.version;
          lastSavedRef.current = draftJson;
          setSaveError(null);
          bumpBaseVersion(saved.version);
        },
        onError: (e) => {
          if (e instanceof ConflictError) setConflict(e.current);
          else setSaveError(describeSaveError(e));
        },
      },
    );
  };
  useAutosave({ draft, dirty, isPending: mutate.isPending, paused: conflict !== null, save });

  if (!draft) return null;

  const up = <K extends keyof Army>(key: K, value: Army[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const upAttack = (i: number, patch: Partial<Army['attacks'][number]>) =>
    setDraft((d) => (d ? { ...d, attacks: d.attacks.map((a, j) => (j === i ? { ...a, ...patch } : a)) } : d));

  const acceptServer = () => {
    if (!conflict) return;
    qc.setQueryData<StoredRecord<Army>[]>(['armies'], (list) =>
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
          setSaveError(null);
          bumpBaseVersion(saved.version);
          setConflict(null);
        },
        onError: (e) => {
          if (e instanceof ConflictError) setConflict(e.current);
          else setSaveError(describeSaveError(e));
        },
      },
    );
  };

  /** Labeled integer field with a rules tooltip. */
  const num = (key: NumKey, label: string, title?: string) => (
    <label className="block" title={title}>
      <span className="label">{label}</span>
      <NumberField value={draft[key]} onChange={(v) => up(key, v)} title={title} />
    </label>
  );

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {TYPE_LABELS[draft.type]} army
        </span>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost px-2 py-0.5 text-xs text-red-600 dark:text-red-400"
            onClick={() => {
              if (window.confirm(`Delete ${draft.name || 'this army'}?`)) {
                deletedRef.current = true;
                del.mutate(rec.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="block flex-1 basis-48">
            <span className="label">Name</span>
            <input
              className="field"
              value={draft.name}
              placeholder="Army name"
              aria-label="Army name"
              onChange={(e) => up('name', e.target.value)}
            />
          </label>
          {num('level', 'Level')}
          <label className="block">
            <span className="label">Type</span>
            <select className="field" value={draft.type} onChange={(e) => up('type', e.target.value as ArmyTypeValue)}>
              {ARMY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Status</span>
            <select className="field" value={draft.status} onChange={(e) => up('status', e.target.value as ArmyStatusValue)}>
              {ARMY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {num('ac', 'AC')}
          {num('maneuver', 'Maneuver save', 'Modifier for checks to maneuver, execute tactics, and minimize damage from physical dangers.')}
          {num('morale', 'Morale save', 'Modifier for checks to avoid becoming shaken or to resist effects that undermine cooperation and bravery.')}
          {num('hp', 'HP', 'At 0 HP the army is defeated; it cannot be reduced below 0.')}
          {num('maxHp', 'Max HP')}
          {num('routThreshold', 'Rout threshold', 'Typically half of maximum HP; brave or fear-resistant armies have a lower RT, fear-immune armies have none.')}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {num('scouting', 'Scouting', "Initiative modifier (typically the army's Perception modifier) or the Scouting DC to detect the army in ambush.")}
          {num('recruitmentDc', 'Recruitment DC', 'DC to recruit the army; as a general rule, the standard DC for its level.')}
          {num('consumption', 'Consumption', 'Food Commodities consumed in the Upkeep Phase. If unpaid, shaken and weary each increase by 1; at 4 or higher the army disbands.')}
          {num('recruitedOnTurn', 'Recruited on turn')}
        </div>

        <label className="block">
          <span className="label">Location</span>
          <EditableText
            value={draft.location}
            onChange={(v) => up('location', v)}
            placeholder="Where the army is (settlement, hex, road…)"
          />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Attacks</span>
            <button
              type="button"
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => up('attacks', [...draft.attacks, { kind: 'melee', name: '', bonus: null, notes: '' }])}
            >
              + Add
            </button>
          </div>
          {draft.attacks.length === 0 && <p className="text-xs text-zinc-400 dark:text-zinc-500">None</p>}
          <div className="space-y-1">
            {draft.attacks.map((a, i) => (
              <div key={i} className="flex items-center gap-1">
                <select
                  className="field w-24"
                  value={a.kind}
                  aria-label={`Attack ${i + 1} kind`}
                  onChange={(e) => upAttack(i, { kind: e.target.value as AttackKindValue })}
                >
                  {ATTACK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <EditableText
                  value={a.name}
                  onChange={(v) => upAttack(i, { name: v })}
                  placeholder="e.g. Longsword"
                />
                <div className="w-20 shrink-0">
                  <NumberField value={a.bonus} onChange={(v) => upAttack(i, { bonus: v })} title="Attack modifier" />
                </div>
                <button
                  type="button"
                  className="btn-ghost px-1.5 py-0.5 text-xs text-red-600 dark:text-red-400"
                  aria-label={`Remove attack ${i + 1}`}
                  onClick={() => up('attacks', draft.attacks.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            1 damage on a hit, 2 on a critical. Melee only against engaged armies; ranged is limited to 5 shots per
            war encounter and replenishes at the end.
          </p>
        </div>

        <StringList label="Tactics" values={draft.tactics} onChange={(v) => up('tactics', v)} placeholder="Tactic name" />
        <StringList label="Gear" values={draft.gear} onChange={(v) => up('gear', v)} placeholder="Gear item" />
        <StringList
          label="Special abilities"
          values={draft.specialAbilities}
          onChange={(v) => up('specialAbilities', v)}
          placeholder="Ability"
        />
        <StringList
          label="Conditions"
          values={draft.conditions}
          onChange={(v) => up('conditions', v)}
          placeholder="e.g. shaken 2, weary 1"
        />

        <label className="block">
          <span className="label">Notes</span>
          <EditableText textarea value={draft.notes} onChange={(v) => up('notes', v)} />
        </label>
      </div>

      {saveError && (
        <p className="mt-3 rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{saveError}</p>
      )}
      <ConflictDialog
        open={conflict !== null}
        title={draft.name || 'Army'}
        current={conflict}
        error={saveError}
        onAcceptServer={acceptServer}
        onForce={forceSave}
      />
    </div>
  );
}
function AddArmyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ArmyTypeValue>('infantry');
  const create = useCreate<Army>('armies');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      newArmy(name.trim(), type),
      {
        onSuccess: () => {
          setName('');
          setType('infantry');
          setError(null);
          onClose();
        },
        onError: (e) => setError(describeSaveError(e)),
      },
    );
  };

  return (
    <Modal open={open} title="New army" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Guard Company"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="label">Type</span>
          <select className="field" value={type} onChange={(e) => setType(e.target.value as ArmyTypeValue)}>
            {ARMY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={submit}>
            Add army
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ArmiesPage() {
  const { data, isLoading, error, isFetching, refetch } = useList<Army>('armies');
  useAutoRefetchOnError(error, isFetching, refetch);
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) return <p className="text-sm text-zinc-500">Loading armies…</p>;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">Could not load armies.</p>
        <button className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Armies</h1>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          Add army
        </button>
      </div>

      {data.length === 0 && (
        <div className="card text-center text-sm text-zinc-500 dark:text-zinc-400">
          No armies yet. Add one to start tracking your forces.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((rec) => (
          <ArmyCard key={rec.id} rec={rec} />
        ))}
      </div>

      <AddArmyModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}