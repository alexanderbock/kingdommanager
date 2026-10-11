import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Kingdom, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { NumberField } from '../components/NumberField';
import { describeSaveError } from '../lib/api';
import {
  ConflictError,
  useAutoRefetchOnError,
  useAutosave,
  useDraft,
  useKingdom,
  usePatchKingdom,
} from '../hooks/useRecords';

type AbilityKey = keyof Kingdom['abilities'];
type RuinKey = keyof Kingdom['ruin'];
type CommodityKey = keyof Kingdom['commodities'];
type WorkSiteType = Kingdom['workSites'][number]['type'];

const ABILITIES: AbilityKey[] = ['culture', 'economy', 'loyalty', 'stability'];
const RUINS: RuinKey[] = ['corruption', 'crime', 'decay', 'strife'];
const COMMODITIES: CommodityKey[] = ['food', 'lumber', 'luxuries', 'ore', 'stone'];
const WORK_SITE_TYPES: WorkSiteType[] = ['farmland', 'lumber', 'mine', 'quarry'];
const GOVERNMENTS = ['Despotism', 'Feudalism', 'Oligarchy', 'Republic', 'Thaumocracy', 'Yeomanry'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Number field for kingdom values: never negative. */
function NumField({
  value,
  onChange,
  title,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  title?: string;
}) {
  return <NumberField min={0} value={value} onChange={onChange} title={title} />;
}

export function KingdomPage() {
  const qc = useQueryClient();
  const { data: rec, isLoading, error, isFetching, refetch } = useKingdom();
  useAutoRefetchOnError(error, isFetching, refetch);
  const { draft, setDraft, dirty, baseVersion, bumpBaseVersion } = useDraft(rec?.data, rec?.version);
  const mutate = usePatchKingdom();
  const [conflict, setConflict] = useState<StoredRecord<Kingdom> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newWorkSiteType, setNewWorkSiteType] = useState<WorkSiteType>('farmland');

  const save = () => {
    if (!draft || !rec) return;
    mutate.mutate(
      { data: draft, version: baseVersion ?? rec.version },
      {
        // A successful save means the server now holds exactly what we sent,
        // so it is safe to rebase newer local edits onto the new version.
        onSuccess: (saved) => {
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

  if (isLoading) return <p className="text-sm text-zinc-500">Loading kingdom…</p>;
  if (error || !rec || !draft) {
    return (
      <div className="card mx-auto max-w-md text-center">
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">
          Could not load the kingdom record. Is the server running?
        </p>
        <button className="btn-primary" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const up = <K extends keyof Kingdom>(key: K, value: Kingdom[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const upAbility = (k: AbilityKey, patch: Partial<Kingdom['abilities'][AbilityKey]>) =>
    setDraft((d) =>
      d ? { ...d, abilities: { ...d.abilities, [k]: { ...d.abilities[k], ...patch } } } : d,
    );
  const upRuin = (k: RuinKey, patch: Partial<Kingdom['ruin'][RuinKey]>) =>
    setDraft((d) => (d ? { ...d, ruin: { ...d.ruin, [k]: { ...d.ruin[k], ...patch } } } : d));
  const upCommodity = (k: CommodityKey, patch: Partial<Kingdom['commodities'][CommodityKey]>) =>
    setDraft((d) =>
      d ? { ...d, commodities: { ...d.commodities, [k]: { ...d.commodities[k], ...patch } } } : d,
    );
  const upWorkSite = (i: number, patch: Partial<Kingdom['workSites'][number]>) =>
    setDraft((d) =>
      d ? { ...d, workSites: d.workSites.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    );
  const addWorkSite = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            workSites: [
              ...d.workSites,
              {
                id: crypto.randomUUID(),
                type: newWorkSiteType,
                resourceHexes: null,
                location: '',
                comments: '',
              },
            ],
          }
        : d,
    );
  const removeWorkSite = (i: number) =>
    setDraft((d) => (d ? { ...d, workSites: d.workSites.filter((_, j) => j !== i) } : d));

  const acceptServer = () => {
    if (!conflict) return;
    qc.setQueryData(['kingdom'], conflict);
    setDraft(conflict.data);
    setConflict(null);
    setSaveError(null);
  };
  const forceSave = () => {
    if (!conflict) return;
    mutate.mutate(
      { data: draft, version: conflict.version, force: true },
      {
        onSuccess: (saved) => {
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

  const num = (label: string, key: keyof Kingdom) => (
    <div>
      <span className="label">{label}</span>
      <NumField value={draft[key] as number | null} onChange={(v) => up(key, v as never)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Kingdom</h1>
      </div>

      {saveError && (
        <p className="rounded-md bg-red-600/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          Save failed: {saveError}
        </p>
      )}

      <Section title="Basics">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Name</span>
            <EditableText value={draft.name} onChange={(v) => up('name', v)} placeholder="Kingdom name" />
          </div>
          <div>
            <span className="label">Charter</span>
            <EditableText value={draft.charter} onChange={(v) => up('charter', v)} placeholder="Charter text" />
          </div>
          <div>
            <span className="label">Heartland</span>
            <EditableText value={draft.heartland} onChange={(v) => up('heartland', v)} placeholder="Heartland hex" />
          </div>
          <div>
            <span className="label">Government</span>
            <select
              value={draft.government}
              onChange={(e) => up('government', e.target.value)}
              className="field"
            >
              <option value="">—</option>
              {GOVERNMENTS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Core Numbers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {num('Level', 'level')}
          {num('XP', 'xp')}
          {num('Size', 'size')}
          {num('Control DC', 'controlDc')}
          {num('Unrest', 'unrest')}
          {num('Consumption', 'consumption')}
        </div>
        <div className="mt-3">
          <span className="label">Resource Dice</span>
          <div className="flex items-center gap-2">
            <NumberField
              value={draft.resourceDice.count}
              onChange={(v) => up('resourceDice', { ...draft.resourceDice, count: v })}
              title="Count"
              min={0}
            />
            <span className="text-sm text-zinc-400 dark:text-zinc-500">×</span>
            <select
              value={draft.resourceDice.die}
              onChange={(e) => up('resourceDice', { ...draft.resourceDice, die: e.target.value })}
              className="field w-20"
              title="Die"
            >
              {['d4', 'd6', 'd8', 'd10', 'd12'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={draft.untrainedImprovisation}
            onChange={(e) => up('untrainedImprovisation', e.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          <span>
            Untrained Improvisation{' '}
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              (untrained skills use level/2 instead of 0)
            </span>
          </span>
        </label>
      </Section>

      <Section title="Fame & Resource Points">
        <div className="grid grid-cols-2 gap-3 sm:w-1/2">
          {num('Fame/Infamy', 'fame')}
          {num('Resource Points', 'resourcePoints')}
        </div>
      </Section>

      <Section title="Abilities">
        <div className="grid gap-3 sm:grid-cols-2">
          {ABILITIES.map((k) => (
            <div key={k} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="label capitalize">{k}</span>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  value={draft.abilities[k].score}
                  onChange={(v) => upAbility(k, { score: v })}
                  title="Score"
                />
                <NumField
                  value={draft.abilities[k].modifier}
                  onChange={(v) => upAbility(k, { modifier: v })}
                  title="Modifier"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ruin">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="w-24" />
            <span className="w-20 text-center">Value</span>
            <span className="w-20 text-center">Threshold</span>
            <span className="w-20 text-center">Penalty</span>
          </div>
          {RUINS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium capitalize">{k}</span>
              <NumField
                value={draft.ruin[k].value}
                onChange={(v) => upRuin(k, { value: v })}
                title="Value"
              />
              <NumField
                value={draft.ruin[k].threshold}
                onChange={(v) => upRuin(k, { threshold: v })}
                title="Threshold"
              />
              <NumField
                value={draft.ruin[k].penalty}
                onChange={(v) => upRuin(k, { penalty: v })}
                title="Penalty"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Commodities">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="w-24" />
            <span className="w-20 text-center">Current</span>
            <span className="w-20 text-center">Maximum</span>
          </div>
          {COMMODITIES.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium capitalize">{k}</span>
              <NumField
                value={draft.commodities[k].stored}
                onChange={(v) => upCommodity(k, { stored: v })}
                title="Current"
              />
              <NumField
                value={draft.commodities[k].capacity}
                onChange={(v) => upCommodity(k, { capacity: v })}
                title="Maximum"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Work Sites">
        <div className="grid gap-3 sm:grid-cols-2">
          {draft.workSites.map((site, i) => (
            <div key={site.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <select
                  value={site.type}
                  onChange={(e) => upWorkSite(i, { type: e.target.value as WorkSiteType })}
                  className="field w-28 capitalize"
                  title="Type"
                >
                  {WORK_SITE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-ghost ml-auto px-2 py-1 text-xs"
                  onClick={() => removeWorkSite(i)}
                  title="Remove work site"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2">
                <span className="label">Resources</span>
                <NumField
                  value={site.resourceHexes}
                  onChange={(v) => upWorkSite(i, { resourceHexes: v })}
                  title="Resources"
                />
              </div>
              <div className="mt-2">
                <EditableText
                  value={site.location}
                  onChange={(v) => upWorkSite(i, { location: v })}
                  placeholder="Location"
                />
              </div>
              <div className="mt-2">
                <EditableText
                  textarea
                  value={site.comments}
                  onChange={(v) => upWorkSite(i, { comments: v })}
                  placeholder="Comments"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="label">Add work site</span>
          <select
            value={newWorkSiteType}
            onChange={(e) => setNewWorkSiteType(e.target.value as WorkSiteType)}
            className="field w-28 capitalize"
          >
            {WORK_SITE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn-ghost" onClick={addWorkSite}>
            Add
          </button>
        </div>
      </Section>

      <Section title="Notes">
        <span className="label">Notes</span>
        <EditableText textarea rows={6} value={draft.notes} onChange={(v) => up('notes', v)} />
      </Section>

      <ConflictDialog
        open={conflict !== null}
        title="Kingdom"
        current={conflict}
        onAcceptServer={acceptServer}
        onForce={forceSave}
      />
    </div>
  );
}
