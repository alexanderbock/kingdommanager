import { useState } from 'react';
import type {
  Activity,
  ActivitySelection,
  Leader,
  Outcome,
  Settlement,
  StoredRecord,
} from '@kingdom/shared';
import { WheelSelect } from './WheelSelect';

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: 'crit-failure', label: 'Critical failure' },
  { value: 'failure', label: 'Failure' },
  { value: 'success', label: 'Success' },
  { value: 'crit-success', label: 'Critical success' },
];

/** Actor id for the collective region activities. */
const PARTY = 'party';

interface SlotValue {
  activityKey: string;
  outcome: string;
}

interface ActorCard {
  id: string;
  title: string;
  subtitle?: string;
  slots: number;
  /** Vacant roles cannot perform activities. */
  disabled?: boolean;
}

interface ActivityPickerProps {
  mode: 'leadership' | 'region' | 'civic';
  selections: ActivitySelection[];
  activities: Activity[];
  leaders?: StoredRecord<Leader>[];
  settlements?: StoredRecord<Settlement>[];
  onChange: (next: ActivitySelection[]) => void;
}

function slotValues(selections: ActivitySelection[], actorId: string, count: number): SlotValue[] {
  const own = selections.filter((s) => s.actorId === actorId);
  return Array.from({ length: count }, (_, i) => ({
    activityKey: own[i]?.activityKey ?? '',
    outcome: own[i]?.outcome ?? '',
  }));
}

/**
 * Records which activities were performed on an activity step and how they
 * went. A slot is saved once both an activity and an outcome are chosen;
 * clearing either removes it again. The rules page of the activity picked
 * last is shown in an iframe next to the slots until its outcome is chosen.
 */
export function ActivityPicker({
  mode,
  selections,
  activities,
  leaders,
  settlements,
  onChange,
}: ActivityPickerProps) {
  // In-progress slots that are not saved yet (activity chosen, outcome not).
  const [slots, setSlots] = useState<Record<string, SlotValue[]>>({});
  // The slot whose activity dropdown changed last; cleared by picking an outcome.
  const [preview, setPreview] = useState<{ cardId: string; index: number } | null>(null);

  const cards: ActorCard[] = (() => {
    if (mode === 'region') {
      return [
        {
          id: PARTY,
          title: 'The party',
          subtitle: 'up to 3 region activities this turn',
          slots: 3,
        },
      ];
    }
    if (mode === 'civic') {
      return (settlements ?? []).map((s) => ({
        id: s.id,
        title: s.data.name,
        subtitle: s.data.type,
        slots: 1,
      }));
    }
    return (leaders ?? [])
      .filter((l) => l.data.isPC)
      .map((l) => ({
        id: l.id,
        title: l.data.holderName || l.data.role,
        subtitle: l.data.holderName ? l.data.role : undefined,
        slots: l.data.activitiesPerTurn ?? 3,
        disabled: l.data.vacant,
      }));
  })();

  const setSlot = (card: ActorCard, index: number, patch: Partial<SlotValue>) => {
    const values = (slots[card.id] ?? slotValues(selections, card.id, card.slots)).map((v, i) =>
      i === index ? { ...v, ...patch } : v,
    );
    setSlots((prev) => ({ ...prev, [card.id]: values }));
    const next = selections.filter((s) => s.actorId !== card.id);
    values.forEach((v) => {
      if (v.activityKey && v.outcome) {
        next.push({ actorId: card.id, activityKey: v.activityKey, outcome: v.outcome as Outcome });
      }
    });
    onChange(next);
  };

  // Picking an activity (click or mouse wheel) also shows its rules page.
  const pickActivity = (card: ActorCard, index: number, activityKey: string) => {
    setSlot(card, index, { activityKey });
    setPreview({ cardId: card.id, index });
  };

  const previewCard = preview && cards.find((c) => c.id === preview.cardId);
  const previewSlot = previewCard
    ? (slots[previewCard.id] ?? slotValues(selections, previewCard.id, previewCard.slots))[
        preview.index
      ]
    : undefined;
  const previewActivity =
    previewSlot && !previewSlot.outcome
      ? activities.find((a) => a.key === previewSlot.activityKey)
      : undefined;

  if (cards.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {mode === 'leadership'
          ? 'No PC leaders yet — mark a leader as PC on the Leaders page.'
          : 'No settlements yet — add one on the Settlements page.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="space-y-3 lg:shrink-0">
        {cards.map((card) => {
          const values = slots[card.id] ?? slotValues(selections, card.id, card.slots);
          return (
            <div
              key={card.id}
              data-testid="activity-actor"
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold">{card.title}</span>
                {card.subtitle && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{card.subtitle}</span>
                )}
                {card.disabled && (
                  <span className="text-xs italic text-amber-600 dark:text-amber-400">
                    role is vacant
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {values.map((v, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <WheelSelect
                      className="field w-48"
                      aria-label={`${card.title} activity ${i + 1}`}
                      value={v.activityKey}
                      disabled={Boolean(card.disabled)}
                      onChange={(e) => pickActivity(card, i, e.target.value)}
                      onWheelSelect={(key) => pickActivity(card, i, key)}
                    >
                      <option value="">— no activity —</option>
                      {activities.map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.name}
                        </option>
                      ))}
                    </WheelSelect>
                    <select
                      className="field w-40"
                      aria-label={`${card.title} outcome ${i + 1}`}
                      value={v.outcome}
                      disabled={!v.activityKey || Boolean(card.disabled)}
                      onChange={(e) => {
                        setSlot(card, i, { outcome: e.target.value });
                        setPreview(null);
                      }}
                    >
                      <option value="">— outcome —</option>
                      {OUTCOME_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {previewActivity?.link && (
        <iframe
          key={previewActivity.link}
          src={previewActivity.link}
          title={`${previewActivity.name} rules`}
          data-testid="activity-rules"
          className="h-[70vh] min-w-0 flex-1 rounded-md border border-zinc-200 bg-white lg:sticky lg:top-4 dark:border-zinc-700"
        />
      )}
    </div>
  );
}
