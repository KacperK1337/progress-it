import { describe, expect, it } from 'vitest';
import { favoriteErrors, isFavorited, toggleFavorite, unlinkChanged } from '../favorites';
import { MAX_FAVORITES, type Favorite, type Task } from '../types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Learn Java',
    unit: 'hours',
    segments: 8,
    done: 2,
    colorIndex: 0,
    x: 0,
    y: 0,
    createdAt: 0,
    ...overrides,
  };
}

const fav = (id: string, title: string, segments = 4): Favorite => ({ id, title, unit: 'hours', segments });

describe('toggleFavorite', () => {
  it('adds a new favourite and links the bar', () => {
    const r = toggleFavorite(task({ colorIndex: 7 }), [], () => 'f1');
    expect(r).toEqual({
      favorites: [{ id: 'f1', title: 'Learn Java', unit: 'hours', segments: 8, colorIndex: 7 }],
      task: task({ colorIndex: 7, favoriteId: 'f1' }),
    });
  });

  it('removes the favourite when the bar is already linked', () => {
    const r = toggleFavorite(task({ favoriteId: 'f1' }), [fav('f1', 'Learn Java', 8), fav('f2', 'Gym')]);
    expect('favorites' in r && r.favorites.map((f) => f.id)).toEqual(['f2']);
    expect('task' in r && r.task.favoriteId).toBeUndefined();
  });

  it('updates a favourite with the same name to match the bar, color included', () => {
    const r = toggleFavorite(task({ title: 'learn java ', colorIndex: 9 }), [
      { ...fav('f1', 'Learn Java', 2), colorIndex: 1 },
    ]);
    expect(r).toEqual({
      favorites: [{ id: 'f1', title: 'learn java', unit: 'hours', segments: 8, colorIndex: 9 }],
      task: task({ title: 'learn java ', colorIndex: 9, favoriteId: 'f1' }),
    });
  });

  it('refuses a new favourite when the list is full', () => {
    const full = Array.from({ length: MAX_FAVORITES }, (_, i) => fav(`f${i}`, `Fav ${i}`));
    expect(toggleFavorite(task(), full)).toEqual({ error: 'full' });
    // Updating an existing one still works when full.
    expect('favorites' in toggleFavorite(task({ title: 'Fav 3' }), full)).toBe(true);
  });

  it('treats a link to a deleted favourite as not favourited', () => {
    expect(isFavorited(task({ favoriteId: 'gone' }), [fav('f1', 'Gym')])).toBe(false);
  });
});

describe('unlinkChanged', () => {
  const before = [fav('f1', 'Learn Java', 8), fav('f2', 'Gym', 3), fav('f3', 'Read', 2)];
  const tasks = [
    task({ id: 'a', favoriteId: 'f1' }),
    task({ id: 'b', title: 'Gym', favoriteId: 'f2' }),
    task({ id: 'c', title: 'Read', favoriteId: 'f3' }),
    task({ id: 'd', title: 'Plain' }),
  ];

  it('keeps links to unchanged favourites and drops the rest, without touching the bars', () => {
    const after = [fav('f1', 'Learn Java', 8), fav('f2', 'Gym', 5)]; // f2 edited, f3 removed
    const out = unlinkChanged(tasks, before, after);
    expect(out.map((t) => t.favoriteId)).toEqual(['f1', undefined, undefined, undefined]);
    expect(out.map((t) => [t.title, t.segments])).toEqual(tasks.map((t) => [t.title, t.segments]));
  });
});

describe('favoriteErrors', () => {
  it('flags empty and duplicate names', () => {
    const errors = favoriteErrors([fav('1', 'Gym'), fav('2', ' '), fav('3', 'GYM '), fav('4', 'Read')]);
    expect([...errors]).toEqual([
      ['2', 'empty'],
      ['3', 'taken'],
    ]);
  });
});
