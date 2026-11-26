<script lang="ts">
  import { fly } from 'svelte/transition';

  let { message, x, y }: { message: string; x: number; y: number } = $props();
</script>

<div class="toast" role="status" style:left="{x}px" style:top="{y}px" transition:fly={{ y: -8, duration: 200 }}>
  {message}
</div>

<style>
  .toast {
    position: absolute;
    z-index: 6;
    translate: -50% 0;
    padding: 9px 16px;
    border-radius: 12px;
    background: rgba(16, 18, 26, 0.92);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
</style>
