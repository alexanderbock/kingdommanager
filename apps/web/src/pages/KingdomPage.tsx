import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Kingdom, StoredRecord } from '@kingdom/shared';
import { ConflictDialog } from '../components/ConflictDialog';
import { EditableText } from '../components/EditableText';
import { NumberField } from '../components/NumberField';
import { ConflictError, useDraft, useKingdom, usePatchKingdom } from '../hooks/useRecords';

type AbilityKey = keyof Kingdom['abilities'];
type RuinKey = keyof Kingdom['ruin'];
type CommodityKey = keyof Kingdom['commodities'];
type WorkSiteKey = keyof Kingdom['workSites'];

const ABILITIES: AbilityKey[] = ['culture', 'economy', 'loyalty', 'stability'];
const RUINS: RuinKey[] = ['corruption', 'crime', 'decay', 'strife'];
const COMMODITIES: CommodityKey[] = ['food', 'lumber', 'luxuries', 'ore', 'stone'];
const WORK_SITES: WorkSiteKey[] = ['farmland', 'lumber', 'mine', 'quarry'];

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

export function KingdomPage() {
  const qc = useQueryClient();
  const { data: rec, isLoading, error } = useKingdom();
  const { draft, setDraft, dirty, baseVersion } = useDraft(rec?.data, rec?.version);
  const mutate = usePatchKingdom();
  const [conflict, setConflict] = useState<StoredRecord<Kingdom> | null>(null);

  if (isLoading) return <p className="text-sm text-zinc-500">Loading kingdom…</p>;
  if (error || !rec || !draft) {
    return <p className="text-sm text-red-600 dark:text-red-400">Could not load the kingdom record.</p>;
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
  const upWorkSite = (k: WorkSiteKey, patch: Partial<Kingdom['workSites'][WorkSiteKey]>) =>
    setDraft((d) =>
      d ? { ...d, workSites: { ...d.workSites, [k]: { ...d.workSites[k], ...patch } } } : d,
    );

  const save = () =>
    mutate.mutate(
      { data: draft, version: baseVersion ?? rec.version },
      { onError: (e) => e instanceof ConflictError && setConflict(e.current) },
    );
  const acceptServer = () => {
    if (!conflict) return;
    qc.setQueryData(['kingdom'], conflict);
    setDraft(conflict.data);
    setConflict(null);
  };
  const forceSave = () => {
    if (!conflict) return;
    mutate.mutate(
      { data: draft, version: conflict.version, force: true },
      {
        onSuccess: () => setConflict(null),
        onError: (e) => e instanceof ConflictError && setConflict(e.current),
      },
    );
  };

  const num = (label: string, key: keyof Kingdom) => (
    <div>
      <span className="label">{label}</span>
      <NumberField value={draft[key] as number | null} onChange={(v) => up(key, v as never)} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Kingdom</h1>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          <button className="btn-primary" disabled={!dirty || mutate.isPending} onClick={save}>
            {mutate.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

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
            <EditableText value={draft.government} onChange={(v) => up('government', v)} placeholder="Government" />
          </div>
        </div>
      </Section>

      <Section title="Core Numbers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {num('Level', 'level')}
          {num('XP', 'xp')}
          {num('Size', 'size')}
          {num('Control DC', 'controlDc')}
          {num('Unrest', 'unrest')}
          {num('Fame', 'fame')}
          {num('Infamy', 'infamy')}
          {num('Resource Points', 'resourcePoints')}
          {num('Consumption', 'consumption')}
          {num('Event DC', 'eventDc')}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:w-1/2">
          <div>
            <span className="label">Resource Dice · Count</span>
            <NumberField
              value={draft.resourceDice.count}
              onChange={(v) => up('resourceDice', { ...draft.resourceDice, count: v })}
            />
          </div>
          <div>
            <span className="label">Resource Dice · Die</span>
            <EditableText
              value={draft.resourceDice.die}
              onChange={(v) => up('resourceDice', { ...draft.resourceDice, die: v })}
              placeholder="d6"
            />
          </div>
        </div>
      </Section>

      <Section title="Abilities">
        <div className="grid gap-3 sm:grid-cols-2">
          {ABILITIES.map((k) => (
            <div key={k} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="label capitalize">{k}</span>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  value={draft.abilities[k].score}
                  onChange={(v) => upAbility(k, { score: v })}
                  title="Score"
                />
                <NumberField
                  value={draft.abilities[k].modifier}
                  onChange={(v) => upAbility(k, { modifier: v })}
                  title="Modifier"
                />
              </div>
              <div className="mt-2">
                <EditableText
                  value={draft.abilities[k].notes}
                  onChange={(v) => upAbility(k, { notes: v })}
                  placeholder="Notes"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Ruin">
        <div className="grid gap-3 sm:grid-cols-2">
          {RUINS.map((k) => (
            <div key={k} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="label capitalize">{k}</span>
              <div className="grid grid-cols-3 gap-2">
                <NumberField
                  value={draft.ruin[k].value}
                  onChange={(v) => upRuin(k, { value: v })}
                  title="Value"
                />
                <NumberField
                  value={draft.ruin[k].threshold}
                  onChange={(v) => upRuin(k, { threshold: v })}
                  title="Threshold"
                />
                <NumberField
                  value={draft.ruin[k].penalty}
                  onChange={(v) => upRuin(k, { penalty: v })}
                  title="Penalty"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Commodities">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COMMODITIES.map((k) => (
            <div key={k} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="label capitalize">{k}</span>
              <NumberField
                value={draft.commodities[k].stored}
                onChange={(v) => upCommodity(k, { stored: v })}
                title="Stored"
              />
              <div className="mt-2">
                <NumberField
                  value={draft.commodities[k].capacity}
                  onChange={(v) => upCommodity(k, { capacity: v })}
                  title="Capacity"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Work Sites">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {WORK_SITES.map((k) => (
            <div key={k} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="label capitalize">{k}</span>
              <NumberField
                value={draft.workSites[k].count}
                onChange={(v) => upWorkSite(k, { count: v })}
                title="Count"
              />
              <div className="mt-2">
                <NumberField
                  value={draft.workSites[k].resourceHexes}
                  onChange={(v) => upWorkSite(k, { resourceHexes: v })}
                  title="Resource hexes"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Notes">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Notes</span>
            <EditableText textarea value={draft.notes} onChange={(v) => up('notes', v)} />
          </div>
          <div>
            <span className="label">GM Notes</span>
            <EditableText textarea value={draft.gmNotes} onChange={(v) => up('gmNotes', v)} />
          </div>
        </div>
      </Section>

      <div className="flex justify-end">
        <button className="btn-primary" disabled={!dirty || mutate.isPending} onClick={save}>
          {mutate.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

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