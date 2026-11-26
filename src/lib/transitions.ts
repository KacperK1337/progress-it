// Shared open/close animations for the centered modal cards.
import { backOut, cubicIn } from 'svelte/easing';

export function popIn(_node: Element, { duration = 300 } = {}) {
  return {
    duration,
    css: (t: number) => {
      const s = 0.6 + 0.4 * backOut(t);
      return `transform: translate(-50%, -50%) scale(${s}); opacity: ${Math.min(1, t * 1.8)}`;
    },
  };
}

export function popOut(_node: Element, { duration = 170 } = {}) {
  return {
    duration,
    easing: cubicIn,
    css: (t: number) => `transform: translate(-50%, -50%) scale(${0.85 + 0.15 * t}); opacity: ${t}`,
  };
}
