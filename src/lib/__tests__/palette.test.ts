import { describe, expect, it } from 'vitest';
import { colorOf, dimRgbOf, frameRgbOf, lightRgbOf, PALETTE, pickColor, rgbOf } from '../palette';

describe('pickColor', () => {
  it('never repeats a color until all are used', () => {
    for (let run = 0; run < 50; run++) {
      const tasks: { colorIndex: number }[] = [];
      for (let i = 0; i < PALETTE.length; i++) tasks.push({ colorIndex: pickColor(tasks) });
      expect(new Set(tasks.map((t) => t.colorIndex)).size).toBe(PALETTE.length);
    }
  });

  it('reuses the least used color once all are taken', () => {
    const tasks = PALETTE.map((_, i) => ({ colorIndex: i }));
    tasks.push({ colorIndex: 4 });
    for (let i = 0; i < 30; i++) expect(pickColor(tasks)).not.toBe(4);
  });

  it('picks a freed color after a bar is removed', () => {
    const tasks = PALETTE.map((_, i) => ({ colorIndex: i })).filter((t) => t.colorIndex !== 7);
    expect(pickColor(tasks)).toBe(7);
  });

  it('counts out-of-range indexes the same way colorOf wraps them', () => {
    // -1 and PALETTE.length - 1 are the same color, so only 7 is still free.
    const tasks = PALETTE.map((_, i) => ({ colorIndex: i }))
      .filter((t) => t.colorIndex !== 7 && t.colorIndex !== PALETTE.length - 1)
      .concat({ colorIndex: -1 });
    expect(pickColor(tasks)).toBe(7);
  });
});

describe('color helpers', () => {
  it('converts hex to rgb', () => {
    expect(rgbOf(0)).toBe('214, 60, 68');
  });

  it('makes the lighter and darker shades used on bars', () => {
    expect(lightRgbOf(0)).toBe('228, 128, 133');
    expect(dimRgbOf(0)).toBe('106, 37, 41');
    expect(frameRgbOf(0)).toBe('67, 29, 31');
  });

  it('wraps out-of-range indexes', () => {
    expect(colorOf(PALETTE.length)).toBe(PALETTE[0]);
    expect(colorOf(-1)).toBe(PALETTE[PALETTE.length - 1]);
  });
});
