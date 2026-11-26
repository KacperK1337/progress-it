<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { seededRandom } from '../lib/layout';
  import { rgbOf } from '../lib/palette';
  import { placeBar, titleError } from '../lib/tasks';
  import { popIn, popOut } from '../lib/transitions';
  import {
    formatAmount,
    LIMITS,
    TITLE_MAX,
    toSegments,
    type NewTaskInput,
    type Point,
    type Rect,
    type Task,
    type Unit,
  } from '../lib/types';
  import TypeToggle from './TypeToggle.svelte';

  let {
    origin,
    area,
    tasks,
    colorIndex,
    onsubmit,
    oncancel,
  }: {
    /** Center of the screen; the card is placed here. */
    origin: Point;
    area: Rect;
    tasks: Task[];
    /** Color the new bar will get; the modal uses it as its accent. */
    colorIndex: number;
    onsubmit: (input: NewTaskInput) => void;
    oncancel: () => void;
  } = $props();

  let title = $state('');
  let unit = $state<Unit>('hours');
  // Each type keeps its own value, so switching back and forth doesn't lose the choice.
  let amounts = $state<Record<Unit, number>>({
    hours: LIMITS.hours.initial,
    times: LIMITS.times.initial,
  });
  let input: HTMLInputElement;

  const amount = $derived(amounts[unit]);
  const limits = $derived(LIMITS[unit]);
  const segments = $derived(toSegments(unit, amount));
  // Same check as creating: fits somewhere, rearranging other bars if needed.
  // The bar's width depends on the name, so this follows the typing too. A fresh seeded
  // random each time keeps the answer stable, so the warning and Add don't flicker while
  // typing on a nearly full screen.
  const room = $derived(placeBar({ title: title.trim(), unit, segments }, area, tasks, seededRandom(1)) !== null);
  const nameError = $derived(titleError(title, tasks));
  const canGo = $derived(nameError === null && room);
  const sliderFill = $derived(((amount - limits.min) / (limits.max - limits.min)) * 100);

  function setUnit(next: Unit) {
    unit = next;
  }

  /** Moves the value one step down (-1) or up (+1), staying inside the limits. */
  function step(direction: -1 | 1) {
    const next = amount + direction * limits.step;
    amounts[unit] = Math.min(limits.max, Math.max(limits.min, next));
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canGo) return;
    onsubmit({ title, unit, amount, colorIndex });
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  // The window only gets keyboard focus after Rust raises it, so try again on focus.
  function focusInput() {
    input?.focus();
  }

  onMount(() => {
    const t = setTimeout(focusInput, 60);
    window.addEventListener('focus', focusInput);
    return () => {
      clearTimeout(t);
      window.removeEventListener('focus', focusInput);
    };
  });
</script>

<svelte:window {onkeydown} />

<div class="backdrop" role="presentation" onclick={oncancel} transition:fade={{ duration: 180 }}></div>

<form
  class="card"
  style:left="{origin.x}px"
  style:top="{origin.y}px"
  style:--rgb={rgbOf(colorIndex)}
  onsubmit={submit}
  in:popIn
  out:popOut
>
  <h2 id="new-bar-title">Task name</h2>

  <input
    bind:this={input}
    bind:value={title}
    maxlength={TITLE_MAX}
    placeholder="e.g. Learn Rust"
    autocomplete="off"
    spellcheck="false"
    aria-labelledby="new-bar-title"
    aria-invalid={nameError === 'taken'}
    aria-describedby="new-bar-name-error"
  />
  {#if nameError === 'taken'}
    <p id="new-bar-name-error" class="error" transition:fade={{ duration: 120 }}>
      A bar with this name is already on screen
    </p>
  {/if}

  <TypeToggle value={unit} onchange={setUnit} />

  <div class="amount">
    <span class="value">{formatAmount(unit, amount)}</span>
    <span class="hint">{unit === 'hours' ? 'to finish' : 'times to finish'}</span>
  </div>

  <div class="stepper">
    <button type="button" class="step" aria-label="Less" disabled={amount <= limits.min} onclick={() => step(-1)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
    </button>
    <input
      class="slider"
      type="range"
      min={limits.min}
      max={limits.max}
      step={limits.step}
      bind:value={amounts[unit]}
      style:--fill="{sliderFill}%"
      aria-label={unit === 'hours' ? 'Hours' : 'Times'}
    />
    <button type="button" class="step" aria-label="More" disabled={amount >= limits.max} onclick={() => step(1)}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
    </button>
    <div class="scale" aria-hidden="true">
      <span>{formatAmount(unit, limits.min)}</span>
      <span>{formatAmount(unit, limits.max)}</span>
    </div>
  </div>

  {#if !room}
    <p class="warn" transition:fade={{ duration: 150 }}>No room left on screen — finish or remove a bar first</p>
  {/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
    <button type="submit" class="go" disabled={!canGo}>Add</button>
  </div>
</form>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.35);
  }

  .card {
    position: absolute;
    z-index: 101;
    width: 340px;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 22px;
    border-radius: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  input:not(.slider) {
    padding: 11px 12px;
    border-radius: 11px;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  input:not(.slider):focus {
    border-color: rgba(var(--rgb), 0.8);
    box-shadow: 0 0 0 3px rgba(var(--rgb), 0.22);
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .amount {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 2px;
  }

  .value {
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .stepper {
    display: grid;
    grid-template-columns: 34px 1fr 34px;
    align-items: center;
    column-gap: 12px;
    row-gap: 6px;
  }

  .step {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    cursor: pointer;
    transition:
      transform 0.18s var(--ease-spring),
      background-color 0.15s,
      border-color 0.15s,
      opacity 0.2s;
  }

  .step:hover:not(:disabled) {
    background: rgba(var(--rgb), 0.22);
    border-color: rgba(var(--rgb), 0.6);
  }

  .step:active:not(:disabled) {
    transform: scale(0.9);
  }

  .step:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .step svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    margin: 0;
    border-radius: 3px;
    background: linear-gradient(
      to right,
      rgb(var(--rgb)) 0%,
      rgb(var(--rgb)) var(--fill),
      rgba(255, 255, 255, 0.12) var(--fill)
    );
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    border: 0;
    box-shadow:
      0 0 0 4px rgba(var(--rgb), 0.35),
      0 2px 6px rgba(0, 0, 0, 0.4);
    transition: transform 0.15s var(--ease-spring);
  }

  .slider:active::-webkit-slider-thumb {
    transform: scale(1.15);
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    border: 0;
  }

  .scale {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-dim);
  }

  .warn,
  .error {
    margin: 0;
    font-size: 12px;
    color: #ffb4b4;
  }

  .error {
    margin-top: -8px;
  }

  input[aria-invalid='true'],
  input[aria-invalid='true']:focus {
    border-color: rgba(255, 120, 120, 0.8);
    box-shadow: 0 0 0 3px rgba(255, 120, 120, 0.2);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .actions button {
    padding: 10px 18px;
    border-radius: 11px;
    border: 0;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform 0.18s var(--ease-spring),
      opacity 0.2s,
      background-color 0.2s;
  }

  .actions button:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ghost {
    background: transparent;
    color: var(--text-dim);
  }

  .ghost:hover {
    background: var(--surface-raised);
    color: var(--text);
  }

  .go {
    min-width: 84px;
    background: rgb(var(--rgb));
    color: #fff;
    box-shadow: 0 6px 18px rgba(var(--rgb), 0.45);
  }

  .go:disabled {
    opacity: 0.35;
    box-shadow: none;
    cursor: default;
  }
</style>
