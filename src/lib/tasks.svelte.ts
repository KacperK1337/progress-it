import { SvelteSet } from 'svelte/reactivity';
import { toggleFavorite, unlinkChanged } from './favorites';
import { ipc } from './ipc';
import { reflow } from './layout';
import { boardFromFavorites, createTask, fillOne, undoOne, type CreateError } from './tasks';
import { blockMs, remainingMs } from './work';
import { MAX_BARS, SAVE_VERSION, TITLE_MAX, type Favorite, type NewTaskInput, type Rect, type Task } from './types';

const SAVE_DELAY_MS = 300;

export class TaskStore {
  tasks = $state<Task[]>([]);
  favorites = $state<Favorite[]>([]);
  /** Bars playing the finish animation. They can't be clicked any more. */
  celebrating = new SvelteSet<string>();
  /** Bars just created, so they fly in from the Add button. */
  fresh = new SvelteSet<string>();
  /**
   * The hours bar being worked on right now, and when its current block started.
   * Only one at a time. Not saved: closing the app stops working.
   */
  working = $state<{ id: string; startedAt: number } | null>(null);
  /** Length of one focus block (30 min; shorter in dev when overridden). */
  readonly blockMs = blockMs();

  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #blockTimer: ReturnType<typeof setTimeout> | undefined;

  async load(area: Rect) {
    const save = await ipc.loadTasks();
    // Names from before the 30-character limit get cut, so their bars still fit them.
    const valid = save.tasks
      .filter((t) => t.segments > 0 && t.done < t.segments)
      .slice(0, MAX_BARS)
      .map((t) => ({ ...t, title: t.title.slice(0, TITLE_MAX) }));
    this.tasks = reflow(valid, area);
    this.favorites = (save.favorites ?? []).map((f) => ({ ...f, title: f.title.slice(0, TITLE_MAX) }));
    // Positions may have moved to fit this screen.
    this.#scheduleSave();
  }

  reflow(area: Rect) {
    this.tasks = reflow(this.tasks, area);
    this.#scheduleSave();
  }

  /** Adds a bar; other bars may move to make room. Returns the reason on failure. */
  add(input: NewTaskInput, area: Rect): CreateError | null {
    const result = createTask(input, area, this.tasks);
    if ('error' in result) return result.error;
    this.tasks = result.tasks;
    this.fresh.clear();
    this.fresh.add(result.task.id);
    this.#scheduleSave();
    return null;
  }

  /** Lights one more segment. Returns true when the task is now complete. */
  fill(id: string): boolean {
    const i = this.#index(id);
    if (i < 0 || this.celebrating.has(id)) return false;
    const { task, completed } = fillOne(this.tasks[i]);
    this.tasks[i] = task;
    if (completed) this.celebrating.add(id);
    this.#scheduleSave();
    return completed;
  }

  undo(id: string) {
    const i = this.#index(id);
    if (i < 0 || this.celebrating.has(id) || this.tasks[i].done === 0) return;
    this.tasks[i] = undoOne(this.tasks[i]);
    this.#scheduleSave();
  }

  remove(id: string) {
    if (this.working?.id === id) this.stopWork();
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.celebrating.delete(id);
    this.fresh.delete(id);
    this.#scheduleSave();
  }

  clearAll() {
    this.stopWork();
    this.tasks = [];
    this.celebrating.clear();
    this.fresh.clear();
    this.#scheduleSave();
  }

  /** Clears the board and puts every favourite back with no progress. */
  restoreFavorites(area: Rect): { placed: number; total: number } {
    // Restored bars all start idle.
    this.stopWork();
    const board = boardFromFavorites($state.snapshot(this.favorites), area);
    this.celebrating.clear();
    this.fresh.clear();
    for (const t of board) this.fresh.add(t.id);
    this.tasks = board;
    this.#scheduleSave();
    return { placed: board.length, total: this.favorites.length };
  }

  /** Heart button on a bar. Returns false when the favourites list is full. */
  toggleFavorite(id: string): boolean {
    const i = this.#index(id);
    if (i < 0) return true;
    const result = toggleFavorite($state.snapshot(this.tasks[i]), $state.snapshot(this.favorites));
    if ('error' in result) return false;
    this.favorites = result.favorites;
    this.tasks[i] = result.task;
    this.#scheduleSave();
    return true;
  }

  /** Saves the list from the settings modal. Bars linked to changed favourites get unlinked. */
  saveFavorites(next: Favorite[]) {
    this.tasks = unlinkChanged($state.snapshot(this.tasks), $state.snapshot(this.favorites), next);
    this.favorites = next;
    this.#scheduleSave();
  }

  /** Starts a focus block on an hours bar, if nothing else is being worked on. */
  startWork(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.unit !== 'hours' || this.working || this.celebrating.has(id)) return;
    this.working = { id, startedAt: Date.now() };
    this.#scheduleBlock();
  }

  /** Stops working. The unfinished block is dropped; starting again begins a new one. */
  stopWork() {
    clearTimeout(this.#blockTimer);
    this.working = null;
  }

  #scheduleBlock() {
    clearTimeout(this.#blockTimer);
    if (!this.working) return;
    const wait = remainingMs(this.working.startedAt, Date.now(), this.blockMs);
    this.#blockTimer = setTimeout(() => this.#blockDone(), wait);
  }

  /** A block finished: add half an hour, bring the bars into view, start the next block. */
  #blockDone() {
    const id = this.working?.id;
    if (!id) return;
    const completed = this.fill(id);
    ipc.revealBars().catch(console.error);
    if (completed || this.#index(id) < 0) {
      this.stopWork();
    } else {
      this.working = { id, startedAt: Date.now() };
      this.#scheduleBlock();
    }
  }

  #index(id: string) {
    return this.tasks.findIndex((t) => t.id === id);
  }

  #scheduleSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      // Finished tasks are dropped on load anyway, but don't write them at all.
      const tasks = $state.snapshot(this.tasks).filter((t) => t.done < t.segments);
      const favorites = $state.snapshot(this.favorites);
      ipc.saveTasks({ version: SAVE_VERSION, tasks, favorites }).catch((e) => console.error('save failed', e));
    }, SAVE_DELAY_MS);
  }
}

/** The one store the app uses. Tests build their own `TaskStore` instead. */
export const taskStore = new TaskStore();
