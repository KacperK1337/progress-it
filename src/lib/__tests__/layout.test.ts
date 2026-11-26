import { describe, expect, it } from 'vitest';
import {
  BAR,
  BAR_TEXT,
  BAR_SPACING,
  barRect,
  barSize,
  barWidth,
  blockedRects,
  EDGE_MARGIN,
  findFreeSpot,
  firstSegmentWidth,
  inflate,
  intersects,
  labelWidth,
  litWidth,
  packBars,
  toolbarZone,
  reflow,
  segmentLeft,
  segmentWidth,
  seededRandom,
  type BarSpec,
} from '../layout';
import { formatProgress, TITLE_MAX, type Rect, type Unit } from '../types';

const AREA: Rect = { x: 0, y: 25, w: 1440, h: 875 };

const spec = (segments: number, title = 'Task', unit: Unit = 'hours'): BarSpec => ({ title, unit, segments });
const LONGEST = 'W'.repeat(TITLE_MAX);

describe('bar size', () => {
  it('has a minimum width', () => {
    expect(barWidth(spec(1, 'a', 'times'))).toBe(BAR.minWidth);
  });

  it('gets longer with more segments', () => {
    for (let n = 1; n < 16; n++) expect(barWidth(spec(n + 1))).toBeGreaterThanOrEqual(barWidth(spec(n)));
    expect(barWidth(spec(10))).toBeGreaterThan(barWidth(spec(3)));
  });

  it('overlapping segments fill the inner width exactly', () => {
    for (const title of ['a', 'Learn Java', LONGEST]) {
      for (let n = 1; n <= 16; n++) {
        const s = spec(n, title);
        const inner = barWidth(s) - 2 * BAR.padding;
        expect(segmentLeft(s, n - 1) + segmentWidth(s, n - 1)).toBeCloseTo(inner);
        expect(litWidth(s, n)).toBeCloseTo(inner);
        // Every segment shows more than just its rounded edge.
        for (let i = 1; i < n; i++) expect(segmentWidth(s, i) - BAR.overlap).toBeGreaterThan(2 * BAR.segmentRadius);
      }
    }
    expect(segmentLeft(spec(4), 0)).toBe(0);
    expect(litWidth(spec(4), 0)).toBe(0);
  });

  it('first segment always fits the name and the longest progress text', () => {
    for (const unit of ['hours', 'times'] as Unit[]) {
      for (let n = 1; n <= 16; n++) {
        for (const title of ['a', 'Read', LONGEST]) {
          const s = spec(n, title, unit);
          let longest = 0;
          for (let d = 0; d <= n; d++) longest = Math.max(longest, formatProgress({ ...s, done: d }).length);
          const t = BAR_TEXT;
          const needed = (title.length + longest) * t.charWidth * t.labelSize + t.labelGap + 2 * t.labelInset;
          expect(firstSegmentWidth(s)).toBeGreaterThanOrEqual(needed);
          expect(firstSegmentWidth(s)).toBeGreaterThanOrEqual(labelWidth(s));
          // "<name> is done!" fits across the whole bar.
          const doneText = (title.length + t.doneSuffix.length) * t.charWidth * t.doneSize + 2 * t.doneInset;
          expect(barWidth(s) - 2 * BAR.padding).toBeGreaterThanOrEqual(doneText);
        }
      }
    }
  });

  it('hours bars also fit "Working on: " before the name', () => {
    const s = spec(16, LONGEST, 'hours');
    const t = BAR_TEXT;
    const chars = t.workPrefix.length + LONGEST.length + '7.5 / 8 h'.length;
    expect(firstSegmentWidth(s)).toBeGreaterThanOrEqual(
      chars * t.charWidth * t.labelSize + t.labelGap + 2 * t.labelInset,
    );
    // Times bars can't be worked on, so they don't reserve the room.
    expect(labelWidth(spec(16, LONGEST, 'times'))).toBeLessThan(labelWidth(s));
  });

  it('longer names make the first segment wider, the others stay the same', () => {
    expect(firstSegmentWidth(spec(4, LONGEST))).toBeGreaterThan(firstSegmentWidth(spec(4, 'Gym')));
    expect(segmentWidth(spec(4, LONGEST), 2)).toBe(segmentWidth(spec(4, 'Gym'), 2));
  });
});

describe('findFreeSpot', () => {
  it('fills the screen without overlaps, inside bounds, away from the toolbar', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seededRandom(seed);
      const tasks: (BarSpec & { x: number; y: number })[] = [];
      for (let i = 0; i < 200; i++) {
        const s = spec(1 + Math.floor(rand() * 16), 'x'.repeat(1 + Math.floor(rand() * TITLE_MAX)));
        const spot = findFreeSpot(barSize(s), AREA, blockedRects(AREA, tasks), rand);
        if (!spot) break;
        tasks.push({ ...spot, ...s });
      }
      expect(tasks.length).toBeGreaterThanOrEqual(5);

      const zone = toolbarZone(AREA);
      tasks.forEach((t, i) => {
        const r = barRect(t);
        expect(r.x).toBeGreaterThanOrEqual(AREA.x + EDGE_MARGIN);
        expect(r.y).toBeGreaterThanOrEqual(AREA.y + EDGE_MARGIN);
        expect(r.x + r.w).toBeLessThanOrEqual(AREA.x + AREA.w - EDGE_MARGIN);
        expect(r.y + r.h).toBeLessThanOrEqual(AREA.y + AREA.h - EDGE_MARGIN);
        expect(intersects(r, zone)).toBe(false);
        for (const other of tasks.slice(i + 1)) {
          expect(intersects(inflate(r, BAR_SPACING / 2), inflate(barRect(other), BAR_SPACING / 2))).toBe(false);
        }
      });
    }
  });

  it('returns null when nothing fits', () => {
    const tiny: Rect = { x: 0, y: 0, w: 300, h: 120 };
    expect(findFreeSpot(barSize(spec(16)), tiny, [])).toBeNull();
  });
});

describe('reflow', () => {
  it('moves bars inside a smaller screen and removes overlaps', () => {
    const tasks = [
      { id: 'a', x: 1300, y: 800, ...spec(4) },
      { id: 'b', x: 1300, y: 800, ...spec(4) },
      { id: 'c', x: 500, y: 30, ...spec(2) }, // on the toolbar
    ];
    const small: Rect = { x: 0, y: 0, w: 1024, h: 700 };
    const out = reflow(tasks, small, seededRandom(3));
    expect(out.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    const blocked = [toolbarZone(small)];
    for (const t of out) {
      const r = barRect(t);
      expect(r.x + r.w).toBeLessThanOrEqual(small.w - EDGE_MARGIN);
      expect(r.y + r.h).toBeLessThanOrEqual(small.h - EDGE_MARGIN);
      expect(blocked.some((b) => intersects(r, b))).toBe(false);
      blocked.push(inflate(r, BAR_SPACING));
    }
  });

  it('keeps valid positions as they are', () => {
    const tasks = [{ x: 100, y: 300, ...spec(4) }];
    expect(reflow(tasks, AREA)).toEqual(tasks);
  });
});

describe('packBars', () => {
  const sizes = (list: number[], title = 'Task') => list.map((n, i) => ({ id: String(i), ...barSize(spec(n, title)) }));

  it('packs bars without overlaps, inside bounds, below the toolbar', () => {
    const items = sizes([16, 12, 10, 8, 8, 6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 6, 9, 7, 2]);
    const spots = packBars(items, AREA)!;
    expect(spots.size).toBe(items.length);
    const rects = items.map((i) => ({ ...spots.get(i.id)!, w: i.w, h: i.h }));
    const zone = toolbarZone(AREA);
    rects.forEach((r, i) => {
      expect(r.x).toBeGreaterThanOrEqual(AREA.x + EDGE_MARGIN);
      expect(r.x + r.w).toBeLessThanOrEqual(AREA.x + AREA.w - EDGE_MARGIN);
      expect(r.y + r.h).toBeLessThanOrEqual(AREA.y + AREA.h - EDGE_MARGIN);
      expect(intersects(r, zone)).toBe(false);
      for (const other of rects.slice(i + 1)) {
        // Same gap rule as random placement.
        expect(intersects(inflate(r, BAR_SPACING), other)).toBe(false);
      }
    });
  });

  it('returns null when the bars cannot fit', () => {
    expect(packBars(sizes(Array(20).fill(16), LONGEST), AREA)).toBeNull();
  });
});
