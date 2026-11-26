// Focus blocks: hour-based bars are "worked on" with a timer instead of clicked up.
import type { Task } from './types';

/** One block of focused work fills one half-hour segment. */
export const WORK_BLOCK_MS = 30 * 60 * 1000;

/**
 * Dev builds can shorten blocks for testing: start with `VITE_BLOCK_MS=10000 npm run tauri dev`,
 * or set localStorage "progress-it:block-ms" in the browser preview.
 */
export function blockMs(): number {
  if (import.meta.env.DEV) {
    const fromEnv = Number(import.meta.env.VITE_BLOCK_MS);
    if (fromEnv > 0) return fromEnv;
    try {
      const override = Number(localStorage.getItem('progress-it:block-ms'));
      if (override > 0) return override;
    } catch {
      // No storage: use the real length.
    }
  }
  return WORK_BLOCK_MS;
}

export type ClickAction = 'fill' | 'start' | 'stop' | 'locked';

/**
 * What a left click on a bar does.
 * - Another bar is being worked on: nothing (one task at a time).
 * - Times bar: adds one time, as before.
 * - Hours bar: starts working on it, or stops if it's the one being worked on.
 */
export function clickAction(task: Pick<Task, 'id' | 'unit'>, workingId: string | null): ClickAction {
  if (workingId !== null && workingId !== task.id) return 'locked';
  if (task.unit === 'times') return 'fill';
  return workingId === task.id ? 'stop' : 'start';
}

/** Time left in the current block, never below zero. */
export function remainingMs(startedAt: number, now: number, block: number): number {
  return Math.max(0, startedAt + block - now);
}
