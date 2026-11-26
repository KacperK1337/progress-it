// Pure task logic. The reactive store in tasks.svelte.ts wraps these.
import { barSize, blockedRects, findFreeSpot, packBars, type BarSpec } from './layout';
import { pickColor } from './palette';
import {
  MAX_BARS,
  sameName,
  toSegments,
  TITLE_MAX,
  type Favorite,
  type NewTaskInput,
  type Point,
  type Rect,
  type Task,
} from './types';

export type CreateError = 'empty' | 'taken' | 'full' | 'room';

/** Why a title can't be used for a new bar, or null if it's fine. */
export function titleError(title: string, tasks: Pick<Task, 'title'>[]): 'empty' | 'taken' | null {
  if (!title.trim()) return 'empty';
  if (tasks.some((t) => sameName(t.title, title))) return 'taken';
  return null;
}

/**
 * Finds a spot for a new bar. Tries a random free spot first. If the
 * screen is too crowded, rearranges every bar into tidy rows to make room; `tasks`
 * then comes back with new positions. Null when even that doesn't fit.
 */
export function placeBar(
  spec: BarSpec,
  area: Rect,
  tasks: Task[],
  rand: () => number = Math.random,
): { spot: Point; tasks: Task[] } | null {
  const size = barSize(spec);
  const spot = findFreeSpot(size, area, blockedRects(area, tasks), rand);
  if (spot) return { spot, tasks };

  const NEW = '\0new';
  const packed = packBars([...tasks.map((t) => ({ id: t.id, ...barSize(t) })), { id: NEW, ...size }], area);
  if (!packed) return null;
  return {
    spot: packed.get(NEW)!,
    tasks: tasks.map((t) => ({ ...t, ...packed.get(t.id)! })),
  };
}

function newTask(
  fields: Pick<Task, 'title' | 'unit' | 'segments' | 'colorIndex' | 'favoriteId'>,
  spot: Point,
  id: string,
  now: number,
): Task {
  const task: Task = { id, done: 0, createdAt: now, ...fields, ...spot };
  if (!task.favoriteId) delete task.favoriteId;
  return task;
}

/**
 * Adds a new bar to `existing`. Returns the new bar and the full list (other bars may
 * have moved to make room), or the reason it can't be added.
 */
export function createTask(
  input: NewTaskInput,
  area: Rect,
  existing: Task[],
  rand: () => number = Math.random,
  id: string = crypto.randomUUID(),
  now: number = Date.now(),
): { task: Task; tasks: Task[] } | { error: CreateError } {
  const title = input.title.trim().slice(0, TITLE_MAX);
  const nameError = titleError(title, existing);
  if (nameError) return { error: nameError };
  if (existing.length >= MAX_BARS) return { error: 'full' };

  const segments = toSegments(input.unit, input.amount);
  const placed = placeBar({ title, unit: input.unit, segments }, area, existing, rand);
  if (!placed) return { error: 'room' };

  const task = newTask({ title, unit: input.unit, segments, colorIndex: input.colorIndex }, placed.spot, id, now);
  return { task, tasks: [...placed.tasks, task] };
}

/**
 * A fresh board with one empty bar per favourite, linked to it and in its saved color.
 * Stops early if the screen runs out of room even after rearranging.
 */
export function boardFromFavorites(
  favorites: Favorite[],
  area: Rect,
  rand: () => number = Math.random,
  makeId: () => string = () => crypto.randomUUID(),
  now: number = Date.now(),
): Task[] {
  let tasks: Task[] = [];
  for (const fav of favorites.slice(0, MAX_BARS)) {
    const placed = placeBar(fav, area, tasks, rand);
    if (!placed) break;
    const fields = {
      title: fav.title,
      unit: fav.unit,
      segments: fav.segments,
      colorIndex: fav.colorIndex ?? pickColor(placed.tasks, rand),
      favoriteId: fav.id,
    };
    tasks = [...placed.tasks, newTask(fields, placed.spot, makeId(), now)];
  }
  return tasks;
}

/** Lights one more segment. `completed` is true when this was the last one. */
export function fillOne(task: Task): { task: Task; completed: boolean } {
  const done = Math.min(task.segments, task.done + 1);
  return { task: { ...task, done }, completed: done === task.segments };
}

export function undoOne(task: Task): Task {
  return { ...task, done: Math.max(0, task.done - 1) };
}
