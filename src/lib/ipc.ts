// Typed calls into the Rust side. When the page runs in a plain browser (`npm run dev`
// without Tauri) it falls back to localStorage and the viewport, so the UI can be
// worked on and tested in a normal browser too.
import { invoke as call } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { HitRegion } from './hitRegions';
import { SAVE_VERSION, type Rect, type SaveFile } from './types';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const BROWSER_KEY = 'progress-it:tasks';

function on<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  return listen<T>(event, (e) => cb(e.payload));
}

function viewport(): Rect {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

export const ipc = {
  async loadTasks(): Promise<SaveFile> {
    if (inTauri) return call<SaveFile>('load_tasks');
    try {
      const raw = localStorage.getItem(BROWSER_KEY);
      if (raw) {
        const save = JSON.parse(raw) as Partial<SaveFile>;
        return { version: SAVE_VERSION, tasks: save.tasks ?? [], favorites: save.favorites ?? [] };
      }
    } catch {
      // Broken or blocked storage: start empty.
    }
    return { version: SAVE_VERSION, tasks: [], favorites: [] };
  },

  async saveTasks(data: SaveFile): Promise<void> {
    if (inTauri) return call('save_tasks', { data });
    try {
      localStorage.setItem(BROWSER_KEY, JSON.stringify(data));
    } catch {
      // Nothing to do; the browser preview just won't remember.
    }
  },

  async setHitRegions(regions: HitRegion[]): Promise<void> {
    if (inTauri) return call('set_hit_regions', { regions });
  },

  async getWorkArea(): Promise<Rect> {
    if (!inTauri) return viewport();
    return (await call<Rect | null>('get_work_area')) ?? viewport();
  },

  async overlayReady(): Promise<void> {
    if (inTauri) return call('overlay_ready');
  },

  async setModalMode(open: boolean): Promise<void> {
    if (inTauri) return call('set_modal_mode', { open });
  },

  /** Brings the bars into view (shows the desktop, or lifts them above apps for a moment). */
  async revealBars(): Promise<void> {
    if (inTauri) return call('reveal_bars');
  },

  async onRegionHover(cb: (id: string | null) => void): Promise<() => void> {
    if (inTauri) return on<string | null>('region-hover', cb);
    return () => {};
  },

  async onDisplayChanged(cb: () => void): Promise<() => void> {
    if (inTauri) return on<null>('display-changed', () => cb());
    const handler = () => cb();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  },
};
