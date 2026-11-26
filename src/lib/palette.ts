import type { Task } from './types';

/**
 * Clearly different hues, dark enough that white text reads well on all of them
 * (contrast with white at least 3.4:1, most above 4:1).
 */
export const PALETTE = [
  '#D63C44', // red
  '#C76A0A', // orange
  '#A8860A', // yellow
  '#5B9412', // lime
  '#10897E', // teal
  '#2E6AD6', // blue
  '#5052C2', // indigo
  '#8A44D9', // violet
  '#CC3277', // pink
  '#007F9E', // cyan
  '#B93A8A', // magenta
  '#078A69', // mint
] as const;

/** Any whole number folded into the palette, negatives included. */
function wrapIndex(index: number): number {
  return ((index % PALETTE.length) + PALETTE.length) % PALETTE.length;
}

export function colorOf(index: number): string {
  return PALETTE[wrapIndex(index)];
}

function channels(index: number): [number, number, number] {
  const n = parseInt(colorOf(index).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes the color toward `target` (0 = black, 255 = white) by `amount` (0..1). */
function mixed(index: number, target: number, amount: number): string {
  return channels(index)
    .map((c) => Math.round(c + (target - c) * amount))
    .join(', ');
}

/** "r, g, b" for use in CSS `rgba(var(--rgb), alpha)`. */
export function rgbOf(index: number): string {
  return channels(index).join(', ');
}

/** Lighter shade of the color (outline of the done part), same "r, g, b" format. */
export function lightRgbOf(index: number): string {
  return mixed(index, 255, 0.35);
}

/** Solid, muted version of the color for segments not done yet. */
export function dimRgbOf(index: number): string {
  return mixed(index, 18, 0.55);
}

/** Dark version of the color for the bar's frame and the outlines between segments. */
export function frameRgbOf(index: number): string {
  return mixed(index, 18, 0.75);
}

/**
 * Picks a color used the least by bars on screen, with a random tie-break.
 * So no two bars share a color until all of them are in use.
 */
export function pickColor(tasks: Pick<Task, 'colorIndex'>[], rand: () => number = Math.random): number {
  const counts = PALETTE.map(() => 0);
  for (const t of tasks) counts[wrapIndex(t.colorIndex)]++;
  const least = Math.min(...counts);
  const candidates = counts.flatMap((c, i) => (c === least ? [i] : []));
  return candidates[Math.floor(rand() * candidates.length)];
}
