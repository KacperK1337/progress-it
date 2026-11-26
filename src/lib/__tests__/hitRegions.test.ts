import { describe, expect, it, vi } from 'vitest';
import { createRegionSync, regionAt, type HitRegion } from '../hitRegions';

const region = (id: string, x: number, y: number, w = 100, h = 40): HitRegion => ({ id, x, y, w, h });

describe('regionAt', () => {
  const regions = [region('a', 10, 10), region('b', 200, 10)];

  it('finds the region under the point, edges included', () => {
    expect(regionAt(regions, 50, 20)).toBe('a');
    expect(regionAt(regions, 10, 10)).toBe('a');
    expect(regionAt(regions, 110, 50)).toBe('a');
    expect(regionAt(regions, 250, 20)).toBe('b');
  });

  it('returns null outside every region', () => {
    expect(regionAt(regions, 9, 20)).toBeNull();
    expect(regionAt(regions, 50, 51)).toBeNull();
    expect(regionAt([], 50, 20)).toBeNull();
  });

  it('takes the first region when two overlap', () => {
    expect(regionAt([region('top', 0, 0), region('under', 0, 0)], 5, 5)).toBe('top');
  });
});

describe('createRegionSync', () => {
  it('sends only when the regions actually change', () => {
    const send = vi.fn();
    const sync = createRegionSync(send);

    sync([region('a', 10, 10)]);
    sync([region('a', 10, 10)]); // same values, new objects
    expect(send).toHaveBeenCalledTimes(1);

    sync([region('a', 10, 11)]);
    expect(send).toHaveBeenCalledTimes(2);

    sync([]);
    sync([]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith([]);
  });
});
