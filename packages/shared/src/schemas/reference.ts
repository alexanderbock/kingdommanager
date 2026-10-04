import { z } from 'zod';
import { Source } from './common.js';
import { ActivityCategory } from './turns.js';

/**
 * Kingdom activity reference entry. `summary` is a one-line summary with a page
 * reference; `details` is left for the GM to paste rule text into locally.
 */
export const ActivitySchema = z.object({
  key: z.string(),
  name: z.string(),
  category: ActivityCategory,
  source: Source,
  summary: z.string(),
  details: z.string(),
  page: z.string(),
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
