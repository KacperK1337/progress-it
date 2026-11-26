import { describe, expect, it } from 'vitest';
import { barRect, BAR_SPACING, inflate, intersects } from '../layout';
import { boardFromFavorites, createTask, fillOne, placeBar, titleError, undoOne } from '../tasks';
import { formatProgress, MAX_BARS, toSegments, type Favorite, type Rect, type Task } from '../types';

const AREA: Rect = { x: 0, y: 0, w: 1440, h: 900 };

function make(overrides: Partial<Task> = {}): Task {
  return {
    id: 't',
    title: 'Read book',
    unit: 'hours',
    segments: 4,
    done: 0,
    colorIndex: 0,
    x: 50,
    y: 50,
    createdAt: 0,
    ...overrides,
  };
}

describe('toSegments', () => {
  it('uses one segment per half hour', () => {
    expect(toSegments('hours', 0.5)).toBe(1);
    expect(toSegments('hours', 2.5)).toBe(5);
    expect(toSegments('hours', 8)).toBe(16);
  });

  it('uses one segment per time', () => {
    expect(toSegments('times', 1)).toBe(1);
    expect(toSegments('times', 10)).toBe(10);
  });

  it('clamps out-of-range values', () => {
    expect(toSegments('hours', 0)).toBe(1);
    expect(toSegments('hours', 20)).toBe(16);
    expect(toSegments('times', 99)).toBe(10);
  });
});

function noOverlaps(tasks: Task[]) {
  tasks.forEach((t, i) => {
    for (const other of tasks.slice(i + 1)) {
      expect(intersects(inflate(barRect(t), BAR_SPACING), barRect(other))).toBe(false);
    }
  });
}

describe('createTask', () => {
  it('builds a task at a free spot', () => {
    const r = createTask({ title: '  Learn Rust  ', unit: 'hours', amount: 2.5, colorIndex: 3 }, AREA, []);
    expect('task' in r && r.task).toMatchObject({
      title: 'Learn Rust',
      unit: 'hours',
      segments: 5,
      done: 0,
      colorIndex: 3,
    });
  });

  it('rejects an empty title', () => {
    expect(createTask({ title: '   ', unit: 'times', amount: 3, colorIndex: 0 }, AREA, [])).toEqual({ error: 'empty' });
  });

  it('rejects a name already on screen, ignoring case and spaces', () => {
    const r = createTask({ title: ' read BOOK ', unit: 'times', amount: 3, colorIndex: 0 }, AREA, [
      make({ title: 'Read book' }),
    ]);
    expect(r).toEqual({ error: 'taken' });
    expect(titleError('Other', [make({ title: 'Read book' })])).toBeNull();
  });

  it('rejects when there is no room', () => {
    const tiny: Rect = { x: 0, y: 0, w: 200, h: 100 };
    expect(createTask({ title: 'x', unit: 'times', amount: 3, colorIndex: 0 }, tiny, [])).toEqual({ error: 'room' });
  });

  it('cuts names to 30 characters', () => {
    const r = createTask({ title: 'x'.repeat(45), unit: 'times', amount: 2, colorIndex: 0 }, AREA, []);
    expect('task' in r && r.task.title).toBe('x'.repeat(30));
  });

  it('allows at most 20 bars, rearranging bars when the screen gets crowded', () => {
    let tasks: Task[] = [];
    for (let i = 0; i < MAX_BARS; i++) {
      const r = createTask({ title: `Task ${i}`, unit: 'hours', amount: 1 + (i % 4), colorIndex: 0 }, AREA, tasks);
      if (!('task' in r)) throw new Error(`bar ${i} failed: ${r.error}`);
      tasks = r.tasks;
    }
    expect(tasks).toHaveLength(MAX_BARS);
    noOverlaps(tasks);
    expect(createTask({ title: 'One more', unit: 'times', amount: 1, colorIndex: 0 }, AREA, tasks)).toEqual({
      error: 'full',
    });
  });
});

describe('placeBar', () => {
  it('moves existing bars when random placement has no room', () => {
    // Two rows of small bars leave no gap wide enough for the longest bar.
    const crowded: Rect = { x: 0, y: 0, w: 1000, h: 400 };
    const blockers = [150, 260].flatMap((y, row) =>
      [30, 360, 690].map((x, i) => make({ id: `b${row}${i}`, unit: 'times', segments: 2, x, y })),
    );
    noOverlaps(blockers);
    const r = placeBar({ title: 'Read book', unit: 'times', segments: 10 }, crowded, blockers, () => 0.5)!;
    expect(r).not.toBeNull();
    expect(r.tasks).not.toEqual(blockers); // bars were moved
    noOverlaps([...r.tasks, make({ id: 'new', unit: 'times', segments: 10, ...r.spot })]);
  });
});

describe('boardFromFavorites', () => {
  it('makes an empty linked bar per favourite with different colors', () => {
    const favs: Favorite[] = [
      { id: 'f1', title: 'Gym', unit: 'times', segments: 3 },
      { id: 'f2', title: 'Learn Java', unit: 'hours', segments: 8 },
    ];
    let n = 0;
    const board = boardFromFavorites(favs, AREA, Math.random, () => `t${n++}`);
    expect(board.map((t) => [t.title, t.done, t.favoriteId])).toEqual([
      ['Gym', 0, 'f1'],
      ['Learn Java', 0, 'f2'],
    ]);
    expect(board[0].colorIndex).not.toBe(board[1].colorIndex);
    noOverlaps(board);
  });

  it("uses each favourite's saved color", () => {
    const favs: Favorite[] = [
      { id: 'f1', title: 'Gym', unit: 'times', segments: 3, colorIndex: 4 },
      { id: 'f2', title: 'Read', unit: 'times', segments: 2, colorIndex: 4 },
      { id: 'f3', title: 'Walk', unit: 'times', segments: 2, colorIndex: 11 },
    ];
    expect(boardFromFavorites(favs, AREA).map((t) => t.colorIndex)).toEqual([4, 4, 11]);
  });
});

describe('fill and undo', () => {
  it('completes exactly on the last segment', () => {
    let task = make({ segments: 3 });
    const results = [1, 2, 3].map(() => {
      const r = fillOne(task);
      task = r.task;
      return r.completed;
    });
    expect(results).toEqual([false, false, true]);
    expect(fillOne(task).task.done).toBe(3);
  });

  it('undo stops at zero', () => {
    expect(undoOne(make({ done: 1 })).done).toBe(0);
    expect(undoOne(make({ done: 0 })).done).toBe(0);
  });
});

describe('formatProgress', () => {
  it('shows hours and times', () => {
    expect(formatProgress({ unit: 'hours', segments: 8, done: 3 })).toBe('1.5 / 4 h');
    expect(formatProgress({ unit: 'times', segments: 10, done: 3 })).toBe('3 / 10 ×');
  });
});
