import { useState } from 'react';
import type {
  Activity,
  KingdomSkill,
  Leader,
  Settlement,
  Step,
  StepState,
  StoredRecord,
  Turn,
  TurnTemplate,
} from '@kingdom/shared';
import { ActivityPicker } from '../components/ActivityPicker';
import {
  useActiveTurn,
  useAutoRefetchOnError,
  useAutosave,
  useCatalog,
  useDraft,
  useKingdom,
  useList,
  useNextTurn,
  usePatchStep,
  useTurns,
} from '../hooks/useRecords';
import { describeSaveError } from '../lib/api';
import { linksForStep } from '../lib/step-links';

/** Steps that show an activity picker, and which mode to use. */
const ACTIVITY_STEPS: Record<string, 'leadership' | 'region' | 'civic'> = {
  'leadership-activities': 'leadership',
  'region-activities': 'region',
  'civic-activities': 'civic',
};

export function TurnPage() {
  const { data: turnRec, error, isFetching, refetch } = useActiveTurn();
  useAutoRefetchOnError(error, isFetching, refetch);
  const { data: turns } = useTurns();
  const nextTurn = useNextTurn();

  if (!turnRec) {
    const nextNumber = (turns?.[0]?.data.number ?? 0) + 1;
    return (
      <div className="mx-auto max-w-md">
        <div className="card text-center">
          <h1 className="mb-2 text-2xl font-bold">Turn</h1>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            No active turn. Start one to walk through the kingdom turn step by step.
          </p>
          <button className="btn-primary" disabled={nextTurn.isPending} onClick={() => nextTurn.mutate()}>
            {nextTurn.isPending ? 'Starting…' : `Start turn ${nextNumber}`}
          </button>
          {nextTurn.isError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Failed to start the turn: {describeSaveError(nextTurn.error)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return <ActiveTurnView turn={turnRec.data as Turn} />;
}

function ActiveTurnView({ turn }: { turn: Turn }) {
  const nextTurn = useNextTurn();
  const patchStep = usePatchStep();
  const leaders = useList<Leader>('leaders');
  const settlements = useList<Settlement>('settlements');
  const skills = useList<KingdomSkill>('skills');
  const kingdom = useKingdom();
  const activities = useCatalog<Activity[]>('activities');
  const template = useCatalog<TurnTemplate>('turn-template');

  // The template is static; the turn holds a state for each step it started with.
  const steps = (template.data?.steps ?? [])
    .filter((s) => s.key in turn.stepState)
    .sort((a, b) => a.order - b.order);
  const phases = [...(template.data?.phases ?? [])].sort((a, b) => a.order - b.order);
  const currentKey = turn.currentStepKey ?? steps[0]?.key;
  const current = steps.find((s) => s.key === currentKey) ?? steps[0];
  const doneCount = steps.filter((s) => turn.stepState[s.key]?.done).length;
  const openCount = steps.length - doneCount;

  const selectStep = (key: string) => {
    if (key !== currentKey) {
      patchStep.mutate({ turnNumber: turn.number, stepKey: key, patch: { currentStepKey: key } });
    }
  };

  const finish = () => {
    if (!window.confirm(`Finish turn ${turn.number} and start turn ${turn.number + 1}?`)) return;
    nextTurn.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Turn {turn.number}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {turn.inGameDate ? `${turn.inGameDate} · ` : ''}
            {doneCount} of {steps.length} steps done
          </p>
        </div>
        <div className="flex items-center gap-3">
          {openCount > 0 && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {openCount} step{openCount === 1 ? '' : 's'} still open
            </span>
          )}
          <button className="btn-primary" disabled={openCount > 0 || nextTurn.isPending} onClick={finish}>
            {nextTurn.isPending ? 'Finishing…' : `Finish turn ${turn.number}`}
          </button>
        </div>
      </div>

      {nextTurn.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to finish the turn: {describeSaveError(nextTurn.error)}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <nav className="card h-fit" aria-label="Turn steps">
          {phases.map((phase) => (
            <div key={phase.key} className="mb-3 last:mb-0">
              <h2 className="label">{phase.name}</h2>
              <ul className="space-y-0.5">
                {steps
                  .filter((s) => s.phaseKey === phase.key)
                  .map((s) => {
                    const isCurrent = s.key === current?.key;
                    const done = turn.stepState[s.key]?.done;
                    return (
                      <li key={s.key}>
                        <button
                          onClick={() => selectStep(s.key)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors ${
                            isCurrent
                              ? 'bg-amber-600/15 font-medium text-amber-700 dark:text-amber-400'
                              : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <span aria-hidden>{done ? '✅' : '⬜'}</span>
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        {current && (
          <StepPanel
            key={`${turn.number}:${current.key}`}
            turn={turn}
            step={current}
            steps={steps}
            patchStep={patchStep}
            onSelectStep={selectStep}
            leaders={leaders.data}
            settlements={settlements.data}
            activities={(activities.data ?? []).filter((a) => a.enabled)}
            controlDc={kingdom.data?.data.controlDc ?? null}
            skills={skills.data}
          />
        )}
      </div>
    </div>
  );
}

interface StepPanelProps {
  turn: Turn;
  step: Step;
  steps: Step[];
  patchStep: ReturnType<typeof usePatchStep>;
  onSelectStep: (key: string) => void;
  leaders?: StoredRecord<Leader>[];
  settlements?: StoredRecord<Settlement>[];
  activities: Activity[];
  /** Typed in on the Kingdom page; null when not set. */
  controlDc: number | null;
  /** Shown with their totals on the activity steps. */
  skills?: StoredRecord<KingdomSkill>[];
}

function StepPanel({
  turn,
  step,
  steps,
  patchStep,
  onSelectStep,
  leaders,
  settlements,
  activities,
  controlDc,
  skills,
}: StepPanelProps) {
  const state: StepState = turn.stepState[step.key] ?? { done: false, checklist: {}, notes: '' };
  const [saveError, setSaveError] = useState<string | null>(null);

  const patch = (p: Record<string, unknown>) => {
    setSaveError(null);
    patchStep.mutate(
      { turnNumber: turn.number, stepKey: step.key, patch: p },
      { onError: (e) => setSaveError(describeSaveError(e)) },
    );
  };

  // Notes autosave with the shared draft/autosave machinery (debounce,
  // in-flight queueing, flush on unmount).
  const { draft: notes, setDraft: setNotes, dirty: notesDirty } = useDraft(state.notes);
  useAutosave({
    draft: notes,
    dirty: notesDirty,
    isPending: patchStep.isPending,
    save: () => patch({ notes: notes ?? '' }),
  });

  const links = linksForStep(step.key);
  const pickerMode = ACTIVITY_STEPS[step.key];
  const pickerActivities = activities.filter((a) => a.category === pickerMode);
  const idx = steps.findIndex((s) => s.key === step.key);
  const prev = steps[idx - 1];
  const next = steps[idx + 1];

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{step.title}</h2>
        <button className={state.done ? 'btn-ghost' : 'btn-primary'} onClick={() => patch({ done: !state.done })}>
          {state.done ? 'Reopen step' : 'Mark step done'}
        </button>
      </div>

      {pickerMode && (
        <p className="mb-3 text-sm" data-testid="control-dc">
          <span className="font-semibold">Control DC: </span>
          {controlDc != null ? (
            <span className="font-semibold text-amber-700 dark:text-amber-400">{controlDc}</span>
          ) : (
            <span className="italic text-zinc-500 dark:text-zinc-400">
              not set (enter it on the Kingdom page)
            </span>
          )}
        </p>
      )}

      {pickerMode && skills && (
        <div className="mb-3" data-testid="skill-totals">
          <h3 className="label">Skill bonuses</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3 xl:grid-cols-4">
            {[...skills]
              .sort((a, b) => a.data.name.localeCompare(b.data.name))
              .map((rec) => (
                <div key={rec.id} className="flex justify-between gap-2">
                  <dt className="text-zinc-600 dark:text-zinc-300">{rec.data.name}</dt>
                  <dd className="font-semibold tabular-nums">
                    {rec.data.total == null ? (
                      <span className="font-normal text-zinc-400 dark:text-zinc-500">—</span>
                    ) : (
                      `${rec.data.total >= 0 ? '+' : ''}${rec.data.total}`
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {links.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              📖 {l.label}
            </a>
          ))}
        </div>
      )}

      {step.guidance && (
        <p className="mb-3 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{step.guidance}</p>
      )}

      {pickerMode && (
        <div className="mb-4">
          <h3 className="label">Activities</h3>
          <ActivityPicker
            mode={pickerMode}
            selections={state.activities ?? []}
            activities={pickerActivities}
            leaders={leaders}
            settlements={settlements}
            onChange={(next) => patch({ activities: next })}
          />
        </div>
      )}

      {step.checklist.length > 0 && (
        <div className="mb-4">
          <h3 className="label">Checklist</h3>
          <ul className="space-y-1">
            {step.checklist.map((item) => {
              const checked = state.checklist[item.key] ?? false;
              return (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => patch({ checklist: { [item.key]: !checked } })}
                    />
                    {item.label}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mb-4">
        <h3 className="label">Notes</h3>
        <textarea
          className="field min-h-20"
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for this step…"
        />
      </div>

      {saveError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">Save failed: {saveError}</p>}

      <div className="flex justify-between gap-2">
        <button className="btn-ghost" disabled={!prev} onClick={() => prev && onSelectStep(prev.key)}>
          ← Previous
        </button>
        <button className="btn-ghost" disabled={!next} onClick={() => next && onSelectStep(next.key)}>
          Next →
        </button>
      </div>
    </section>
  );
}