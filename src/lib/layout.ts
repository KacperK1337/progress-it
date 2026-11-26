import { formatProgress, type Point, type Rect, type Task } from './types';

/** What a bar's size depends on. */
export type BarSpec = Pick<Task, 'title' | 'unit' | 'segments'>;

/** Width of the frame around the segments, and of the outlines between them. */
const RING = 5;

export const BAR = {
  height: 53,
  ring: RING,
  padding: RING,
  /** How much of each segment's left side hides under the segment before it. */
  overlap: 16,
  /** Visible width of every segment after the first. */
  step: 44,
  /** Smallest first segment, for very short names. */
  minFirst: 96,
  radius: 21,
  /** Bar radius minus the frame, so segment, outline and bar corners line up. */
  segmentRadius: 21 - RING,
  minWidth: 220,
} as const;

/**
 * Text on bars. The font is monospaced (every letter equally wide), so text width can be
 * worked out from the number of letters and the bar always fits its text.
 */
export const BAR_TEXT = {
  /** Width of one letter, as a share of the font size (JetBrains Mono: 600/1000). */
  charWidth: 0.6,
  labelSize: 16,
  /** Space between the name and the progress count. */
  labelGap: 10,
  /** Space between the label and the edges of the done block. */
  labelInset: 12,
  doneSize: 17,
  doneInset: 16,
  doneSuffix: ' is done!',
  /** Shown before the name while an hours bar is being worked on. */
  workPrefix: 'Working on: ',
  /** Extra room for the text outline and rounding. */
  slack: 4,
} as const;

/** The button bar at the top center of the screen. */
export const TOOLBAR = {
  top: 14,
  height: 46,
  /** Width kept free for it (a bit wider than the toolbar itself). */
  zoneWidth: 640,
  /** Free space below it. */
  zoneMargin: 24,
} as const;
/** Distance from the screen edges. */
export const EDGE_MARGIN = 24;
/** Space between bars; also covers the X button sticking out of the corner. */
export const BAR_SPACING = 20;
/** Extra hit area around a bar so the X button in the corner is reachable. */
export const BAR_HIT_PADDING = 14;

const RANDOM_TRIES = 300;
const GRID_STEP = 16;

/**
 * Random numbers that repeat for the same seed. Used where placement must give the same
 * answer every time it is asked (the "is there room?" check while typing) and in tests.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function textWidth(chars: number, size: number): number {
  return chars * BAR_TEXT.charWidth * size;
}

/** Longest progress text the bar will ever show, e.g. "6.5 / 7.5 h". */
function longestCount(spec: BarSpec): number {
  let longest = 0;
  for (let done = 0; done <= spec.segments; done++) {
    longest = Math.max(longest, formatProgress({ ...spec, done }).length);
  }
  return longest;
}

/** Width the label (name + progress) needs inside the done block. */
export function labelWidth(spec: BarSpec): number {
  const t = BAR_TEXT;
  // Hours bars can show "Working on: " in front of the name.
  const prefix = spec.unit === 'hours' ? t.workPrefix.length : 0;
  return (
    textWidth(prefix + spec.title.trim().length, t.labelSize) +
    t.labelGap +
    textWidth(longestCount(spec), t.labelSize) +
    2 * t.labelInset +
    t.slack
  );
}

/**
 * First segment's width: wide enough for the whole label, so the label never spills onto
 * the other segments. The bar as a whole must also fit "<name> is done!".
 */
export function firstSegmentWidth(spec: BarSpec): number {
  const t = BAR_TEXT;
  const rest = (spec.segments - 1) * BAR.step;
  const done = textWidth(spec.title.trim().length + t.doneSuffix.length, t.doneSize) + 2 * t.doneInset + t.slack;
  return Math.ceil(Math.max(BAR.minFirst, labelWidth(spec), done - rest, BAR.minWidth - 2 * BAR.padding - rest));
}

export function barWidth(spec: BarSpec): number {
  return 2 * BAR.padding + firstSegmentWidth(spec) + (spec.segments - 1) * BAR.step;
}

/**
 * Full width of segment `i`. Segments overlap: each one's left side hides under the one
 * before it. The first one is as wide as its label needs; the rest are all the same.
 */
export function segmentWidth(spec: BarSpec, i: number): number {
  return i === 0 ? firstSegmentWidth(spec) : BAR.step + BAR.overlap;
}

/** Left edge of segment `i` (0-based), measured from the first segment's left edge. */
export function segmentLeft(spec: BarSpec, i: number): number {
  return i === 0 ? 0 : firstSegmentWidth(spec) - BAR.overlap + (i - 1) * BAR.step;
}

/** Width of the lit part of the bar, measured from the first segment's left edge. */
export function litWidth(spec: BarSpec, done: number): number {
  if (done <= 0) return 0;
  return segmentLeft(spec, done - 1) + segmentWidth(spec, done - 1);
}

export function barSize(spec: BarSpec): { w: number; h: number } {
  return { w: barWidth(spec), h: BAR.height };
}

export function barRect(task: BarSpec & Pick<Task, 'x' | 'y'>): Rect {
  return { x: task.x, y: task.y, ...barSize(task) };
}

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Top-center strip kept free of bars, covering the toolbar. */
export function toolbarZone(area: Rect): Rect {
  const c = center(area);
  return {
    x: c.x - TOOLBAR.zoneWidth / 2,
    y: area.y,
    w: TOOLBAR.zoneWidth,
    h: TOOLBAR.top + TOOLBAR.height + TOOLBAR.zoneMargin,
  };
}

export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Area where bars may be placed: the work area minus the edge margin. */
export function placementBounds(area: Rect): Rect {
  return inflate(area, -EDGE_MARGIN);
}

/** Rects a new bar must not touch: the toolbar zone and every other bar with spacing. */
export function blockedRects(area: Rect, tasks: (BarSpec & Pick<Task, 'x' | 'y'>)[]): Rect[] {
  return [toolbarZone(area), ...tasks.map((t) => inflate(barRect(t), BAR_SPACING))];
}

function fits(r: Rect, blocked: Rect[]): boolean {
  return !blocked.some((b) => intersects(r, b));
}

function scanGrid(size: { w: number; h: number }, bounds: Rect, blocked: Rect[]): Point | null {
  for (let y = bounds.y; y + size.h <= bounds.y + bounds.h; y += GRID_STEP) {
    for (let x = bounds.x; x + size.w <= bounds.x + bounds.w; x += GRID_STEP) {
      if (fits({ x, y, ...size }, blocked)) return { x, y };
    }
  }
  return null;
}

/**
 * Random free spot for a bar of `size`. Tries random spots first so bars spread
 * around the screen, then falls back to a grid scan. Null when the screen is full.
 */
export function findFreeSpot(
  size: { w: number; h: number },
  area: Rect,
  blocked: Rect[],
  rand: () => number = Math.random,
): Point | null {
  const bounds = placementBounds(area);
  const spanX = bounds.w - size.w;
  const spanY = bounds.h - size.h;
  if (spanX < 0 || spanY < 0) return null;

  for (let i = 0; i < RANDOM_TRIES; i++) {
    const p = {
      x: Math.round(bounds.x + rand() * spanX),
      y: Math.round(bounds.y + rand() * spanY),
    };
    if (fits({ ...p, ...size }, blocked)) return p;
  }
  return scanGrid(size, bounds, blocked);
}

function clampInto(r: Rect, bounds: Rect): Point {
  return {
    x: Math.min(Math.max(r.x, bounds.x), Math.max(bounds.x, bounds.x + bounds.w - r.w)),
    y: Math.min(Math.max(r.y, bounds.y), Math.max(bounds.y, bounds.y + bounds.h - r.h)),
  };
}

/**
 * Makes saved positions valid for the current screen: pulls bars inside the bounds,
 * then moves any bar that overlaps the toolbar zone or an earlier bar to a free spot.
 * Bars that can't fit anywhere stay clamped (overlapping) rather than vanish.
 */
export function reflow<T extends BarSpec & Pick<Task, 'x' | 'y'>>(
  tasks: T[],
  area: Rect,
  rand: () => number = Math.random,
): T[] {
  const bounds = placementBounds(area);
  const placed: T[] = [];
  for (const task of tasks) {
    const clamped = { ...task, ...clampInto(barRect(task), bounds) };
    const blocked = blockedRects(area, placed);
    if (fits(barRect(clamped), blocked)) {
      placed.push(clamped);
      continue;
    }
    const spot = findFreeSpot(barSize(task), area, blocked, rand);
    placed.push(spot ? { ...task, ...spot } : clamped);
  }
  return placed;
}

/** Smallest gap between packed bars, sideways and between rows (a bit over BAR_SPACING). */
const PACK_GAP = BAR_SPACING + 4;
/** Packed rows and bars spread out to use the screen, but no further apart than this. */
const PACK_MAX_SPREAD = 140;

/**
 * Tidy arrangement of all `items` in rows below the toolbar, used when random placement
 * can't find room. Widest bars are placed first, each into the first row with space
 * left. Rows and bars are then spread out evenly. Null if they can't all fit.
 */
export function packBars(items: { id: string; w: number; h: number }[], area: Rect): Map<string, Point> | null {
  const bounds = placementBounds(area);
  const zone = toolbarZone(area);
  const top = Math.max(bounds.y, zone.y + zone.h);
  const avail: Rect = { x: bounds.x, y: top, w: bounds.w, h: bounds.y + bounds.h - top };

  const rows: { items: typeof items; width: number }[] = [];
  for (const item of [...items].sort((a, b) => b.w - a.w)) {
    if (item.w > avail.w) return null;
    const row = rows.find((r) => r.width + PACK_GAP + item.w <= avail.w);
    if (row) {
      row.items.push(item);
      row.width += PACK_GAP + item.w;
    } else {
      rows.push({ items: [item], width: item.w });
    }
  }
  if (rows.length === 0) return new Map();

  const rowHeight = Math.max(...items.map((i) => i.h));
  const freeY = avail.h - rows.length * rowHeight;
  if (freeY < (rows.length - 1) * PACK_GAP) return null;
  const gapY = rows.length > 1 ? Math.min(freeY / (rows.length - 1), PACK_MAX_SPREAD) : 0;
  let y = avail.y + (avail.h - (rows.length * rowHeight + (rows.length - 1) * gapY)) / 2;

  const spots = new Map<string, Point>();
  for (const row of rows) {
    const sum = row.items.reduce((total, i) => total + i.w, 0);
    const n = row.items.length;
    const gapX = n > 1 ? Math.min((avail.w - sum) / (n - 1), PACK_MAX_SPREAD) : 0;
    let x = avail.x + (avail.w - (sum + (n - 1) * gapX)) / 2;
    for (const item of row.items) {
      spots.set(item.id, { x: Math.round(x), y: Math.round(y) });
      x += item.w + gapX;
    }
    y += rowHeight + gapY;
  }
  return spots;
}
