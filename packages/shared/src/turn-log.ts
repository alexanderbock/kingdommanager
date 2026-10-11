/** One changed field in a turn-log entry (dot path into the record's data). */
export interface TurnLogChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** One change to game data, attributed to a turn. */
export interface TurnLogEntry {
  /** audit_log row ids this entry was merged from (used for removal). */
  ids: number[];
  entity: string;
  entityId: string | null;
  action: 'create' | 'update' | 'delete';
  /** ISO timestamp of the last write in the merged group. */
  at: string;
  /** Human-readable record name, e.g. `Settlement "New Halvong"`. */
  label: string;
  /** Net changed fields for updates; empty for create/delete. */
  changes: TurnLogChange[];
  /** Final record data, for create entries ("created with values"). */
  values?: unknown;
}

/** A turn with its log entries (chronological). */
export interface TurnLogTurn {
  number: number;
  inGameDate: string;
  status: 'active' | 'complete';
  startedAt: string;
  completedAt: string | null;
  entries: TurnLogEntry[];
}

/** GET /api/turn-log response. Turns newest first; setup (turn 0) is excluded. */
export interface TurnLogResponse {
  activeTurnNumber: number | null;
  turns: TurnLogTurn[];
}