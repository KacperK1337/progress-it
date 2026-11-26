import { describe, expect, it } from 'vitest';
import { clickAction, remainingMs, WORK_BLOCK_MS } from '../work';

const hours = { id: 'h', unit: 'hours' as const };
const hours2 = { id: 'h2', unit: 'hours' as const };
const times = { id: 't', unit: 'times' as const };

describe('clickAction', () => {
  it('starts and stops work on hours bars', () => {
    expect(clickAction(hours, null)).toBe('start');
    expect(clickAction(hours, 'h')).toBe('stop');
  });

  it('keeps the old behaviour for times bars', () => {
    expect(clickAction(times, null)).toBe('fill');
  });

  it('locks every other bar while one is being worked on', () => {
    expect(clickAction(hours2, 'h')).toBe('locked');
    expect(clickAction(times, 'h')).toBe('locked');
  });
});

describe('remainingMs', () => {
  it('counts down from the block length and never goes below zero', () => {
    expect(WORK_BLOCK_MS).toBe(30 * 60 * 1000);
    expect(remainingMs(1000, 1000, WORK_BLOCK_MS)).toBe(WORK_BLOCK_MS);
    expect(remainingMs(1000, 1000 + 60_000, WORK_BLOCK_MS)).toBe(WORK_BLOCK_MS - 60_000);
    expect(remainingMs(1000, 1000 + WORK_BLOCK_MS + 5, WORK_BLOCK_MS)).toBe(0);
  });
});
