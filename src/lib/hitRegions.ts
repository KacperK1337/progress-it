import type { Rect } from './types';

export interface HitRegion extends Rect {
  id: string;
}

export function regionAt(regions: HitRegion[], x: number, y: number): string | null {
  const hit = regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  return hit ? hit.id : null;
}

/** Calls `send` only when the regions actually changed. */
export function createRegionSync(send: (regions: HitRegion[]) => void) {
  let last = '';
  return (regions: HitRegion[]) => {
    const key = JSON.stringify(regions);
    if (key === last) return;
    last = key;
    send(regions);
  };
}
