// Pure favourites logic. Bars link to a favourite through `task.favoriteId`.
import { MAX_FAVORITES, sameName, type Favorite, type Task } from './types';

export function isFavorited(task: Pick<Task, 'favoriteId'>, favorites: Favorite[]): boolean {
  return !!task.favoriteId && favorites.some((f) => f.id === task.favoriteId);
}

export function unlink(task: Task): Task {
  if (!task.favoriteId) return task;
  const { favoriteId: _, ...rest } = task;
  return rest;
}

export type ToggleResult = { favorites: Favorite[]; task: Task } | { error: 'full' };

/**
 * The heart button on a bar.
 * - Linked bar: removes its favourite.
 * - A favourite with the same name exists: updates it to match the bar (color too) and links the bar.
 * - Otherwise: adds a new favourite, unless the list is full.
 */
export function toggleFavorite(
  task: Task,
  favorites: Favorite[],
  makeId: () => string = () => crypto.randomUUID(),
): ToggleResult {
  if (isFavorited(task, favorites)) {
    return { favorites: favorites.filter((f) => f.id !== task.favoriteId), task: unlink(task) };
  }
  const fields = { title: task.title.trim(), unit: task.unit, segments: task.segments, colorIndex: task.colorIndex };
  const match = favorites.find((f) => sameName(f.title, task.title));
  if (match) {
    return {
      favorites: favorites.map((f) => (f.id === match.id ? { ...f, ...fields } : f)),
      task: { ...task, favoriteId: match.id },
    };
  }
  if (favorites.length >= MAX_FAVORITES) return { error: 'full' };
  const fav: Favorite = { id: makeId(), ...fields };
  return { favorites: [...favorites, fav], task: { ...task, favoriteId: fav.id } };
}

function sameFavorite(a: Favorite, b: Favorite): boolean {
  return a.title === b.title && a.unit === b.unit && a.segments === b.segments;
}

/**
 * After the favourites list was edited: bars linked to a favourite that was removed or
 * changed keep their name and size, but lose the link (their heart goes empty).
 */
export function unlinkChanged(tasks: Task[], before: Favorite[], after: Favorite[]): Task[] {
  return tasks.map((t) => {
    if (!t.favoriteId) return t;
    const old = before.find((f) => f.id === t.favoriteId);
    const now = after.find((f) => f.id === t.favoriteId);
    return old && now && sameFavorite(old, now) ? t : unlink(t);
  });
}

export type FavoriteFieldError = 'empty' | 'taken';

/** Problems with each favourite's name, by favourite id. Empty map = all good. */
export function favoriteErrors(favorites: Pick<Favorite, 'id' | 'title'>[]): Map<string, FavoriteFieldError> {
  const errors = new Map<string, FavoriteFieldError>();
  favorites.forEach((f, i) => {
    if (!f.title.trim()) errors.set(f.id, 'empty');
    else if (favorites.slice(0, i).some((other) => sameName(other.title, f.title))) errors.set(f.id, 'taken');
  });
  return errors;
}
