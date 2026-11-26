import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStore } from '../tasks.svelte';
import { MAX_BARS, TITLE_MAX, type SaveFile, type Task } from '../types';
import { WORK_BLOCK_MS } from '../work';

const loadTasks = vi.fn<() => Promise<SaveFile>>();
const saveTasks = vi.fn<(data: SaveFile) => Promise<void>>();
const revealBars = vi.fn<() => Promise<void>>();

vi.mock('../ipc', () => ({
  inTauri: false,
  ipc: {
    loadTasks: () => loadTasks(),
    saveTasks: (data: SaveFile) => saveTasks(data),
    revealBars: () => revealBars(),
  },
}));

const AREA = { x: 0, y: 0, w: 1440, h: 900 };
const SAVE_DELAY_MS = 300;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Read book',
    unit: 'hours',
    segments: 4,
    done: 0,
    colorIndex: 0,
    x: 100,
    y: 300,
    createdAt: 0,
    ...overrides,
  };
}

const save = (tasks: Task[] = [], favorites: SaveFile['favorites'] = []): SaveFile => ({
  version: 2,
  tasks,
  favorites,
});

const find = (store: TaskStore, id: string) => store.tasks.find((t) => t.id === id);

let store: TaskStore;

beforeEach(() => {
  vi.useFakeTimers();
  loadTasks.mockReset().mockResolvedValue(save());
  saveTasks.mockReset().mockResolvedValue(undefined);
  revealBars.mockReset().mockResolvedValue(undefined);
  store = new TaskStore();
});

afterEach(() => {
  store.stopWork();
  vi.useRealTimers();
});

describe('load', () => {
  it('drops finished bars, cuts long names and caps the list', async () => {
    const many = Array.from({ length: MAX_BARS + 3 }, (_, i) => task({ id: `t${i}`, title: `Task ${i}` }));
    loadTasks.mockResolvedValue(
      save([task({ id: 'done', done: 4 }), task({ id: 'long', title: 'x'.repeat(45) }), ...many]),
    );

    await store.load(AREA);

    expect(find(store, 'done')).toBeUndefined();
    expect(find(store, 'long')?.title).toBe('x'.repeat(TITLE_MAX));
    expect(store.tasks).toHaveLength(MAX_BARS);
  });

  it('survives a version 1 save file with no favourites', async () => {
    loadTasks.mockResolvedValue({ version: 1, tasks: [task()] } as unknown as SaveFile);
    await store.load(AREA);
    expect(store.favorites).toEqual([]);
    expect(store.tasks).toHaveLength(1);
  });
});

describe('saving', () => {
  it('writes once after a burst of changes, leaving finished bars out', async () => {
    loadTasks.mockResolvedValue(save([task({ id: 'a', segments: 2 }), task({ id: 'b', title: 'Gym', segments: 2 })]));
    await store.load(AREA);
    saveTasks.mockClear();

    store.fill('a');
    store.fill('a'); // 'a' is now finished
    store.fill('b');
    expect(saveTasks).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(saveTasks).toHaveBeenCalledTimes(1);
    expect(saveTasks.mock.calls[0][0].tasks.map((t) => t.id)).toEqual(['b']);
  });
});

describe('focus blocks', () => {
  beforeEach(async () => {
    loadTasks.mockResolvedValue(
      save([
        task({ id: 'h', segments: 3 }),
        task({ id: 'h2', title: 'Gym' }),
        task({ id: 'x', title: 'Walk', unit: 'times' }),
      ]),
    );
    await store.load(AREA);
  });

  it('fills one segment per block and starts the next one', () => {
    store.startWork('h');
    expect(store.working?.id).toBe('h');

    vi.advanceTimersByTime(WORK_BLOCK_MS);
    expect(find(store, 'h')?.done).toBe(1);
    expect(revealBars).toHaveBeenCalledTimes(1);
    expect(store.working?.id).toBe('h');

    vi.advanceTimersByTime(WORK_BLOCK_MS);
    expect(find(store, 'h')?.done).toBe(2);
  });

  it('stops on the block that finishes the bar', () => {
    store.startWork('h');
    vi.advanceTimersByTime(3 * WORK_BLOCK_MS);

    expect(store.working).toBeNull();
    expect(store.celebrating.has('h')).toBe(true);
    expect(find(store, 'h')?.done).toBe(3);

    // No further blocks run once work stopped.
    vi.advanceTimersByTime(5 * WORK_BLOCK_MS);
    expect(find(store, 'h')?.done).toBe(3);
  });

  it('drops the unfinished block when work is stopped', () => {
    store.startWork('h');
    vi.advanceTimersByTime(WORK_BLOCK_MS - 1);
    store.stopWork();

    vi.advanceTimersByTime(5 * WORK_BLOCK_MS);
    expect(find(store, 'h')?.done).toBe(0);
    expect(store.working).toBeNull();
  });

  it('works on one bar at a time, and only on hours bars', () => {
    store.startWork('h');
    store.startWork('h2');
    expect(store.working?.id).toBe('h');

    store.stopWork();
    store.startWork('x');
    expect(store.working).toBeNull();
  });

  it('stops working when the bar being worked on is removed', () => {
    store.startWork('h');
    store.remove('h');

    expect(store.working).toBeNull();
    vi.advanceTimersByTime(5 * WORK_BLOCK_MS);
    expect(find(store, 'h')).toBeUndefined();
  });

  it('stops working when the board is cleared', () => {
    store.startWork('h');
    store.clearAll();

    expect(store.working).toBeNull();
    expect(store.tasks).toEqual([]);
  });
});

describe('fill and undo', () => {
  beforeEach(async () => {
    loadTasks.mockResolvedValue(save([task({ id: 'a', segments: 2 })]));
    await store.load(AREA);
  });

  it('reports completion on the last segment and locks the bar after it', () => {
    expect(store.fill('a')).toBe(false);
    expect(store.fill('a')).toBe(true);
    expect(store.celebrating.has('a')).toBe(true);

    // A celebrating bar takes no more clicks.
    expect(store.fill('a')).toBe(false);
    store.undo('a');
    expect(store.tasks[0].done).toBe(2);
  });

  it('ignores unknown ids', () => {
    expect(store.fill('nope')).toBe(false);
    expect(() => store.undo('nope')).not.toThrow();
  });

  it('undo stops at zero', () => {
    store.undo('a');
    expect(store.tasks[0].done).toBe(0);
  });
});

describe('favourites', () => {
  it('restores a bar per favourite, in its saved color', async () => {
    loadTasks.mockResolvedValue(
      save(
        [],
        [
          { id: 'f1', title: 'Gym', unit: 'times', segments: 3 },
          { id: 'f2', title: 'Read', unit: 'hours', segments: 4, colorIndex: 5 },
        ],
      ),
    );
    await store.load(AREA);

    const { placed, total } = store.restoreFavorites(AREA);
    expect([placed, total]).toEqual([2, 2]);
    expect(store.tasks.map((t) => [t.title, t.done, t.favoriteId])).toEqual([
      ['Gym', 0, 'f1'],
      ['Read', 0, 'f2'],
    ]);
    expect(store.tasks[1].colorIndex).toBe(5);
  });

  it('unlinks bars whose favourite was edited in settings', async () => {
    loadTasks.mockResolvedValue(
      save(
        [task({ id: 'a', title: 'Gym', favoriteId: 'f1' }), task({ id: 'b', title: 'Read', favoriteId: 'f2' })],
        [
          { id: 'f1', title: 'Gym', unit: 'hours', segments: 4 },
          { id: 'f2', title: 'Read', unit: 'hours', segments: 4 },
        ],
      ),
    );
    await store.load(AREA);

    store.saveFavorites([{ id: 'f1', title: 'Gym', unit: 'hours', segments: 6 }]);

    expect(store.tasks.map((t) => t.favoriteId)).toEqual([undefined, undefined]);
    expect(store.tasks.map((t) => t.title)).toEqual(['Gym', 'Read']);
  });
});
