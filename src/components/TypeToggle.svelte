<script lang="ts">
  import type { Unit } from '../lib/types';

  let { value, small = false, onchange }: { value: Unit; small?: boolean; onchange: (unit: Unit) => void } = $props();

  const options: { unit: Unit; label: string }[] = [
    { unit: 'hours', label: 'Hours' },
    { unit: 'times', label: 'Times' },
  ];
</script>

<div class="toggle" class:small role="radiogroup" aria-label="Progress type">
  <span class="pill" class:right={value === 'times'} aria-hidden="true"></span>
  {#each options as o (o.unit)}
    <button
      type="button"
      role="radio"
      aria-checked={value === o.unit}
      class:active={value === o.unit}
      onclick={() => onchange(o.unit)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .toggle {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 4px;
    border-radius: 12px;
    background: var(--surface-raised);
    border: 1px solid var(--border);
  }

  .pill {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc(50% - 4px);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    transition: transform 0.32s var(--ease-spring);
  }

  .pill.right {
    transform: translateX(100%);
  }

  button {
    position: relative;
    padding: 8px 0;
    border: 0;
    background: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
    cursor: pointer;
    transition: color 0.2s;
  }

  button.active {
    color: var(--text);
  }

  .small {
    padding: 3px;
    border-radius: 10px;
  }

  .small .pill {
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc(50% - 3px);
    border-radius: 7px;
  }

  .small button {
    padding: 6px 10px;
    font-size: 12px;
  }
</style>
