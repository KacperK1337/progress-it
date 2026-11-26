<script lang="ts">
  import type { Point } from '../lib/types';

  let {
    x,
    y,
    active,
    canAdd,
    canClear,
    canRestore,
    width = $bindable(0),
    height = $bindable(0),
    onadd,
    onclear,
    onrestore,
    onsettings,
  }: {
    x: number;
    y: number;
    /** Cursor is over the toolbar. Button hover styles only apply then (see App). */
    active: boolean;
    canAdd: boolean;
    canClear: boolean;
    canRestore: boolean;
    width?: number;
    height?: number;
    onadd: () => void;
    onclear: () => void;
    onrestore: () => void;
    onsettings: () => void;
  } = $props();

  let addButton: HTMLButtonElement;

  /** Center of the Add button on screen; new bars fly out of it. */
  export function addCenter(): Point {
    const r = addButton.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
</script>

<div
  class="toolbar"
  class:active
  style:left="{x}px"
  style:top="{y}px"
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="toolbar"
  aria-label="Progress It"
>
  <button
    bind:this={addButton}
    type="button"
    class="primary"
    disabled={!canAdd}
    title={canAdd ? undefined : '20 bars is the limit'}
    onclick={onadd}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
    Add new
  </button>
  <button type="button" disabled={!canClear} onclick={onclear}>
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
    </svg>
    Clear all
  </button>
  <button type="button" disabled={!canRestore} onclick={onrestore}>
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 13.5S2.5 10.2 2.5 6.3C2.5 4.6 3.8 3.3 5.4 3.3c1.1 0 2 .6 2.6 1.5.6-.9 1.5-1.5 2.6-1.5 1.6 0 2.9 1.3 2.9 3 0 3.9-5.5 7.2-5.5 7.2z"
      />
    </svg>
    Restore favourites
  </button>
  <button type="button" class="icon" aria-label="Settings" onclick={onsettings}>
    <svg viewBox="0 0 24 24" class="gear" aria-hidden="true">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  </button>
</div>

<style>
  .toolbar {
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px;
    border-radius: 18px;
    background: rgba(16, 18, 26, 0.86);
    border: 1px solid var(--border);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.07);
    white-space: nowrap;
  }

  button {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 13px;
    background: transparent;
    color: rgba(255, 255, 255, 0.86);
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 0.15s,
      color 0.15s,
      opacity 0.2s,
      transform 0.18s var(--ease-spring);
  }

  /* Hover only while the cursor is really over the toolbar: once the window stops
     taking the mouse, the webview may never hear that the pointer left. */
  .active button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  button:active:not(:disabled) {
    transform: scale(0.95);
  }

  button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .primary {
    background: #fff;
    color: #12141c;
  }

  .active .primary:hover:not(:disabled) {
    background: #e9ebf2;
    color: #12141c;
  }

  .icon {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .icon svg {
    width: 18px;
    height: 18px;
  }

  svg.gear {
    stroke-width: 1.8;
  }
</style>
