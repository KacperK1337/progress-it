<script lang="ts">
  import { tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { favoriteErrors } from '../lib/favorites';
  import { pickColor } from '../lib/palette';
  import { popIn, popOut } from '../lib/transitions';
  import {
    formatAmount,
    LIMITS,
    MAX_FAVORITES,
    segmentsToAmount,
    TITLE_MAX,
    toSegments,
    type Favorite,
    type Point,
    type Unit,
  } from '../lib/types';
  import TypeToggle from './TypeToggle.svelte';

  let {
    origin,
    favorites,
    onsave,
    oncancel,
  }: {
    /** Center of the screen; the card is placed here. */
    origin: Point;
    favorites: Favorite[];
    onsave: (favorites: Favorite[]) => void;
    oncancel: () => void;
  } = $props();

  /** Editable copy of a favourite. Each type keeps its own amount, like the create modal. */
  interface Row {
    id: string;
    title: string;
    unit: Unit;
    amounts: Record<Unit, number>;
    colorIndex: number | undefined;
  }

  function toRow(f: Favorite): Row {
    const amounts: Record<Unit, number> = { hours: LIMITS.hours.initial, times: LIMITS.times.initial };
    amounts[f.unit] = segmentsToAmount(f.unit, f.segments);
    return { id: f.id, title: f.title, unit: f.unit, amounts, colorIndex: f.colorIndex };
  }

  function toFavorite(r: Row): Favorite {
    const fav: Favorite = {
      id: r.id,
      title: r.title.trim(),
      unit: r.unit,
      segments: toSegments(r.unit, r.amounts[r.unit]),
    };
    if (r.colorIndex !== undefined) fav.colorIndex = r.colorIndex;
    return fav;
  }

  // Edits stay in this copy until Save. The modal is rebuilt each time it opens.
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(favorites.map(toRow));
  let list: HTMLDivElement;

  const errors = $derived(favoriteErrors(rows));
  const result = $derived(rows.map(toFavorite));
  // Compare in the same shape, so key order or untouched rows never count as a change.
  const original = $derived(JSON.stringify(favorites.map((f) => toFavorite(toRow(f)))));
  const changed = $derived(JSON.stringify(result) !== original);
  const canSave = $derived(changed && errors.size === 0);
  const full = $derived(rows.length >= MAX_FAVORITES);

  async function addRow() {
    if (full) return;
    rows.push({
      id: crypto.randomUUID(),
      title: '',
      unit: 'hours',
      amounts: { hours: LIMITS.hours.initial, times: LIMITS.times.initial },
      // A color no other favourite uses yet, while there are free ones.
      colorIndex: pickColor(rows.filter((r): r is Row & { colorIndex: number } => r.colorIndex !== undefined)),
    });
    // Scroll to and focus the new row's name, once the new row is in the DOM.
    await tick();
    const inputs = list.querySelectorAll<HTMLInputElement>('input.name');
    inputs[inputs.length - 1]?.focus();
  }

  function removeRow(id: string) {
    rows = rows.filter((r) => r.id !== id);
  }

  function step(row: Row, direction: -1 | 1) {
    const l = LIMITS[row.unit];
    row.amounts[row.unit] = Math.min(l.max, Math.max(l.min, row.amounts[row.unit] + direction * l.step));
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (canSave) onsave(result);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  const ERROR_TEXT = { empty: 'Name is required', taken: 'Name already used' } as const;
</script>

<svelte:window {onkeydown} />

<div class="backdrop" role="presentation" onclick={oncancel} transition:fade={{ duration: 180 }}></div>

<form
  class="card"
  style:left="{origin.x}px"
  style:top="{origin.y}px"
  onsubmit={save}
  in:popIn
  out:popOut
  aria-labelledby="settings-title"
>
  <h2 id="settings-title">Settings</h2>

  <section>
    <div class="section-head">
      <h3>Manage favourites</h3>
      <span class="count">{rows.length} / {MAX_FAVORITES}</span>
    </div>
    <p class="info">
      Favourites are your daily routine. When your day starts, press <strong>Restore favourites</strong> to clear the board
      and get all of them back, fresh.
    </p>

    <div class="list" bind:this={list}>
      {#each rows as row (row.id)}
        {@const error = errors.get(row.id)}
        {@const l = LIMITS[row.unit]}
        <div class="row" transition:fade={{ duration: 150 }}>
          <div class="name-cell">
            <input
              class="name"
              bind:value={row.title}
              maxlength={TITLE_MAX}
              placeholder="Task name"
              autocomplete="off"
              spellcheck="false"
              aria-label="Task name"
              aria-invalid={!!error}
            />
            {#if error}
              <span class="error">{ERROR_TEXT[error]}</span>
            {/if}
          </div>
          <TypeToggle small value={row.unit} onchange={(u) => (row.unit = u)} />
          <div class="stepper">
            <button
              type="button"
              aria-label="Less"
              disabled={row.amounts[row.unit] <= l.min}
              onclick={() => step(row, -1)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8" /></svg>
            </button>
            <span class="amount">{formatAmount(row.unit, row.amounts[row.unit])}</span>
            <button
              type="button"
              aria-label="More"
              disabled={row.amounts[row.unit] >= l.max}
              onclick={() => step(row, 1)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>
            </button>
          </div>
          <button
            type="button"
            class="remove"
            aria-label="Remove {row.title || 'favourite'}"
            onclick={() => removeRow(row.id)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
            </svg>
          </button>
        </div>
      {:else}
        <p class="empty">No favourites yet. Hover a bar and click its heart, or add one here.</p>
      {/each}
    </div>

    <button type="button" class="add" disabled={full} onclick={addRow}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
      {full ? `${MAX_FAVORITES} favourites is the limit` : 'Add favourite'}
    </button>
  </section>

  <div class="actions">
    <button type="button" class="ghost" onclick={oncancel}>Cancel</button>
    <button type="submit" class="save" disabled={!canSave}>Save</button>
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
    width: 600px;
    max-height: min(680px, calc(100vh - 80px));
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    gap: 16px;
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
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }

  .count {
    font-size: 12px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }

  .info {
    margin: 0;
    padding: 10px 12px;
    border-radius: 11px;
    /* Calm blue: this is just information. */
    background: rgba(58, 134, 255, 0.1);
    border: 1px solid rgba(58, 134, 255, 0.35);
    font-size: 12.5px;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.78);
  }

  .info strong {
    color: #fff;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    padding: 2px;
    margin: -2px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    align-items: start;
    gap: 8px;
  }

  .name-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .name {
    height: 36px;
    box-sizing: border-box;
    padding: 0 11px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  .name:focus {
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
  }

  .name[aria-invalid='true'] {
    border-color: rgba(255, 120, 120, 0.8);
  }

  .name::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .error {
    font-size: 11.5px;
    color: #ffb4b4;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 36px;
  }

  .amount {
    min-width: 44px;
    text-align: center;
    font-size: 13.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .stepper button,
  .remove {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text);
    cursor: pointer;
    transition:
      background-color 0.15s,
      opacity 0.2s,
      transform 0.18s var(--ease-spring);
  }

  .stepper button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }

  .stepper button:active:not(:disabled),
  .remove:active {
    transform: scale(0.9);
  }

  .stepper button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .remove {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    color: var(--text-dim);
  }

  .remove:hover {
    background: rgba(229, 72, 77, 0.2);
    border-color: rgba(229, 72, 77, 0.5);
    color: #fff;
  }

  svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .empty {
    margin: 0;
    padding: 18px;
    text-align: center;
    border-radius: 11px;
    border: 1px dashed var(--border);
    font-size: 13px;
    color: var(--text-dim);
  }

  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 38px;
    border-radius: 11px;
    border: 1px dashed rgba(255, 255, 255, 0.22);
    background: transparent;
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .add:hover:not(:disabled) {
    background: var(--surface-raised);
    color: var(--text);
  }

  .add:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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

  .save {
    min-width: 84px;
    background: #fff;
    color: #10121a;
  }

  .save:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
