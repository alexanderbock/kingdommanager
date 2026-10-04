import { z } from 'zod';
import { Num, Int } from './common.js';

export const PhaseSchema = z.object({
  key: z.string(),
  name: z.string(),
  order: Int,
});
export type Phase = z.infer<typeof PhaseSchema>;

export const StepChecklistItem = z.object({
  key: z.string(),
  label: z.string(),
});

export const ActivityCategory = z.enum(['leadership', 'region', 'civic', 'army']);

export const StepSchema = z.object({
  key: z.string(),
  phaseKey: z.string(),
  order: Int,
  title: z.string(),
  /** Plain-text guidance shown on the step page. */
  guidance: z.string(),
  checklist: z.array(StepChecklistItem),
  /** Which activity categories the log form on this step should offer, if any. */
  allowsActivities: ActivityCategory.nullable(),
  enabled: z.boolean(),
});
export type Step = z.infer<typeof StepSchema>;

/** Editable turn template (Settings). Snapshotted into each turn at start. */
export const TurnTemplateSchema = z.object({
  phases: z.array(PhaseSchema),
  steps: z.array(StepSchema),
});
export type TurnTemplate = z.infer<typeof TurnTemplateSchema>;

export const StepStateSchema = z.object({
  done: z.boolean(),
  checklist: z.record(z.boolean()),
  notes: z.string(),
});
export type StepState = z.infer<typeof StepStateSchema>;

export const TurnSchema = z.object({
  number: Int,
  inGameDate: z.string(),
  status: z.enum(['active', 'complete']),
  currentStepKey: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  /** Snapshot of the enabled template at the time the turn started. */
  template: TurnTemplateSchema,
  stepState: z.record(StepStateSchema),
});
export type Turn = z.infer<typeof TurnSchema>;

export const Outcome = z.enum(['crit-success', 'success', 'failure', 'crit-failure', 'n/a']);

/**
 * An explicit, user-triggered change applied together with a log entry.
 * The server performs exactly this one addition or assignment and records
 * before/after. This is the only place the server touches game numbers.
 */
export const LogChangeSchema = z.object({
  target: z.string(),
  mode: z.enum(['delta', 'set']),
  value: z.number(),
  field: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export type LogChange = z.infer<typeof LogChangeSchema>;

/** Input form of a change, before the server applies it. */
export const ChangeSpecSchema = z.object({
  target: z.string(),
  mode: z.enum(['delta', 'set']),
  value: z.number(),
});
export type ChangeSpec = z.infer<typeof ChangeSpecSchema>;

export const LogEntrySchema = z.object({
  turnId: z.string(),
  stepKey: z.string(),
  actor: z.string(),
  activityKey: z.string().nullable(),
  skillKey: z.string().nullable(),
  factionId: z.string().nullable(),
  modifierUsed: Num,
  dc: Num,
  roll: Num,
  outcome: Outcome,
  summary: z.string(),
  changes: z.array(LogChangeSchema),
  reverted: z.boolean(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;
