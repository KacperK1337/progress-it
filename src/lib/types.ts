export type Unit = 'hours' | 'times';

export interface Task {
  id: string;
  title: string;
  unit: Unit;
  /** Number of small rectangles. Hours: one per 0.5 h. Times: one per time. */
  segments: number;
  /** How many segments are lit. */
  done: number;
  colorIndex: number;
  /** Top-left corner in logical px, relative to the overlay window. */
  x: number;
  y: number;
  createdAt: number;
  /** The favourite this bar matches. Cleared when that favourite is edited or removed. */
  favoriteId?: string;
}

/** A saved bar template for daily routines. */
export interface Favorite {
  id: string;
  title: string;
  unit: Unit;
  segments: number;
  /** Bar color, so restored bars look the same every day. Missing in older saves. */
  colorIndex?: number;
}

export interface SaveFile {
  version: number;
  tasks: Task[];
  favorites: Favorite[];
}

/** Format of the save file. Must match `SAVE_VERSION` in src-tauri/src/storage.rs. */
export const SAVE_VERSION = 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface NewTaskInput {
  title: string;
  unit: Unit;
  /** Hours (0.5 steps) or times, depending on `unit`. */
  amount: number;
  colorIndex: number;
}

export const LIMITS = {
  hours: { min: 0.5, max: 8, step: 0.5, initial: 3 },
  times: { min: 1, max: 10, step: 1, initial: 3 },
} as const satisfies Record<Unit, { min: number; max: number; step: number; initial: number }>;

/** Longest task name. Bars are sized so a name this long always fits. */
export const TITLE_MAX = 30;
/** Most bars on screen at once. */
export const MAX_BARS = 20;
/** Most favourites. */
export const MAX_FAVORITES = 20;

/** Names are compared trimmed and case-insensitive: "Gym " and "gym" are the same. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function toSegments(unit: Unit, amount: number): number {
  const { min, max } = LIMITS[unit];
  const clamped = Math.min(max, Math.max(min, amount));
  return unit === 'hours' ? Math.round(clamped * 2) : Math.round(clamped);
}

/** Value of `count` segments in the task's own unit. */
export function segmentsToAmount(unit: Unit, count: number): number {
  return unit === 'hours' ? count / 2 : count;
}

export function formatAmount(unit: Unit, amount: number): string {
  return unit === 'hours' ? `${amount} h` : `${amount} ×`;
}

/** Short progress text, e.g. "1.5 / 4 h" or "3 / 10 ×". */
export function formatProgress(task: Pick<Task, 'unit' | 'segments' | 'done'>): string {
  const done = segmentsToAmount(task.unit, task.done);
  const total = segmentsToAmount(task.unit, task.segments);
  return task.unit === 'hours' ? `${done} / ${total} h` : `${done} / ${total} ×`;
}
