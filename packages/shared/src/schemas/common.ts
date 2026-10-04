import { z } from 'zod';

/**
 * Integer game number entered by hand. `null` means "not set" and must render
 * as an empty field, never as 0. The app never derives these values.
 */
export const Num = z.number().int().nullable();
export const Int = z.number().int();
export const IsoDate = z.string();

/** Where a piece of rules content comes from. `house-rule` items get a badge in the UI. */
export const Source = z.enum(['core', 'house-rule', 'custom']);

/** Shape of every persisted record (managed by the server store). */
export interface StoredRecord<T = any> {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  data: T;
}
