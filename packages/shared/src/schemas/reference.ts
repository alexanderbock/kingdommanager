import { z } from 'zod';
import { Source } from './common.js';
import { ActivityCategory } from './turns.js';

/**
 * Kingdom activity (seed/activities.json, read at runtime). `summary` is a
 * one-line summary with a page reference; `details` is for full rule text.
 */
export const ActivitySchema = z.object({
  key: z.string(),
  name: z.string(),
  category: ActivityCategory,
  source: Source,
  summary: z.string(),
  details: z.string(),
  page: z.string(),
  /** Rules page (Archives of Nethys), shown next to the activity picker. */
  link: z.string().optional(),
  enabled: z.boolean(),
});
export type Activity = z.infer<typeof ActivitySchema>;

/** Read-only lookup table (display only, never used to fill in game numbers). */
export const ReferenceTableSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  source: Source,
});
export type ReferenceTable = z.infer<typeof ReferenceTableSchema>;
