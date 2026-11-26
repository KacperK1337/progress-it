<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { BAR, BAR_TEXT, barRect, barSize, center, litWidth, segmentLeft, segmentWidth } from '../lib/layout';
  import { dimRgbOf, frameRgbOf, lightRgbOf, rgbOf } from '../lib/palette';
  import { formatProgress, type Point, type Task } from '../lib/types';
  import { clickAction } from '../lib/work';

  let {
    task,
    index,
    hovered,
    favorited,
    celebrating,
    fresh,
    flyDelay = 0,
    workingId,
    flyFrom,
    onfill,
    onwork,
    onundo,
    ondelete,
    onfavorite,
    oncelebrated,
  }: {
    task: Task;
    /** Position in the list; staggers the Clear all animation. */
    index: number;
    hovered: boolean;
    favorited: boolean;
    celebrating: boolean;
    /** Just created: fly in from `flyFrom`, after `flyDelay` ms. */
    fresh: boolean;
    flyDelay?: number;
    /** The bar being worked on (any bar), or null. */
    workingId: string | null;
    flyFrom: Point;
    onfill: () => void;
    /** Start or stop working on this (hours) bar. */
    onwork: () => void;
    onundo: () => void;
    ondelete: () => void;
    onfavorite: () => void;
    oncelebrated: () => void;
  } = $props();

  const LABEL_INSET = BAR_TEXT.labelInset;
  const RING = BAR.ring;

  const working = $derived(workingId === task.id);
  /** Another bar is being worked on: this one can't be clicked until that stops. */
  const locked = $derived(workingId !== null && !working);
  const size = $derived(barSize(task));
  const lit = $derived(litWidth(task, task.done));
  // The done block grows and shrinks smoothly; its outline follows along.
  const litAnim = Tween.of(() => lit, { duration: 300, easing: cubicOut });
  // The glowing outline wraps the done part, plus the segment being worked on (if any), so
  // there is only ever one outline around them.
  const outlined = $derived(working ? litWidth(task, Math.min(task.done + 1, task.segments)) : lit);
  const outlineAnim = Tween.of(() => outlined, { duration: 300, easing: cubicOut });

  // The label's right edge follows the end of the lit part, but never goes past the start.
  let labelWidth = $state(0);
  const labelShift = $derived(Math.max(0, lit - labelWidth - 2 * LABEL_INSET));

  let wrap: HTMLDivElement;

  function handleClick() {
    if (celebrating) return;
    const action = clickAction(task, workingId);
    if (action === 'fill') onfill();
    else if (action === 'start' || action === 'stop') onwork();
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    if (!celebrating && !locked) onundo();
  }

  // Bounce whenever a segment is added, by click or by a finished focus block.
  let shownDone = untrack(() => task.done);
  $effect(() => {
    const done = task.done;
    if (done > shownDone) popFill();
    shownDone = done;
  });

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    ondelete();
  }

  function handleFavorite(e: MouseEvent) {
    e.stopPropagation();
    onfavorite();
  }

  /** Small bounce of the done block when a segment is added. */
  function popFill() {
    if (!wrap) return;
    wrap
      .querySelector('.fill')
      ?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.1)', offset: 0.35 }, { transform: 'scaleY(1)' }], {
        duration: 340,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
  }

  // New bars grow out of the Add button and fly to their spot.
  onMount(() => {
    if (!fresh) return;
    const to = center(barRect(task));
    const dx = flyFrom.x - to.x;
    const dy = flyFrom.y - to.y;
    wrap.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0 },
        { transform: 'translate(0, 0) scale(1.05)', opacity: 1, offset: 0.72 },
        { transform: 'none', opacity: 1 },
      ],
      // Several new bars at once (Restore favourites) fly out one after another.
      { duration: 620, delay: flyDelay, fill: 'backwards', easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  let celebrationStarted = false;
  /** Set once the finish animation has faded the bar out, so removal skips the delete animation. */
  let celebrationDone = $state(false);
  $effect(() => {
    if (celebrating && !celebrationStarted) {
      celebrationStarted = true;
      untrack(celebrate);
    }
  });

  // Finish: the bar stays at its real size (no zoom, which blurred it), glows, shows
  // "<name> is done!", then fades out.
  async function celebrate() {
    await sleep(1840);
    // The bar can be gone by now (Clear all during the finish animation): Svelte nulls
    // `wrap` when the component is destroyed, and there is nothing left to fade out.
    if (!wrap) return;
    await wrap.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 360,
      easing: 'ease-in',
      fill: 'forwards',
    }).finished;
    celebrationDone = true;
    oncelebrated();
  }

  // Deleting with X or Clear all: quick shrink and fade. Skipped after the finish animation
  // (already faded). Clear all staggers them by list position.
  function vanish(_node: Element, { skip, delay }: { skip: boolean; delay: number }) {
    if (skip) return { duration: 0 };
    return {
      delay,
      duration: 240,
      easing: cubicIn,
      css: (t: number) => `opacity: ${t}; transform: scale(${0.8 + 0.2 * t})`,
    };
  }
</script>

<div
  bind:this={wrap}
  class="wrap"
  class:hovered={hovered && !celebrating && !locked}
  class:celebrating
  class:working
  class:locked
  style:left="{task.x}px"
  style:top="{task.y}px"
  style:width="{size.w}px"
  style:height="{size.h}px"
  style:--rgb={rgbOf(task.colorIndex)}
  style:--rgb-light={lightRgbOf(task.colorIndex)}
  style:--rgb-dim={dimRgbOf(task.colorIndex)}
  style:--rgb-frame={frameRgbOf(task.colorIndex)}
  style:--ring="{RING}px"
  style:--pad="{BAR.padding}px"
  style:--radius="{BAR.radius}px"
  style:--seg-radius="{BAR.segmentRadius}px"
  style:--label-size="{BAR_TEXT.labelSize}px"
  style:--label-gap="{BAR_TEXT.labelGap}px"
  style:--done-size="{BAR_TEXT.doneSize}px"
  style:--done-inset="{BAR_TEXT.doneInset}px"
  out:vanish={{ skip: celebrationDone, delay: Math.min(index * 30, 300) }}
>
  {#if celebrating}
    <div class="halo" aria-hidden="true"></div>
  {/if}

  <button
    type="button"
    class="bar"
    aria-label="{task.title}, {formatProgress(task)}. {task.unit === 'hours'
      ? working
        ? 'Click to stop working'
        : 'Click to start working'
      : 'Click to add progress'}, right-click to undo."
    aria-disabled={locked}
    onclick={handleClick}
    oncontextmenu={handleContextMenu}
  >
    <!-- Segments overlap like shingles: earlier ones sit on top, so only right edges show. -->
    {#each Array.from({ length: task.segments }) as _, i (i)}
      <span
        class="seg"
        class:covered={i < task.done}
        style:left="{BAR.padding + segmentLeft(task, i)}px"
        style:width="{segmentWidth(task, i)}px"
        style:z-index={100 - 2 * i}
        aria-hidden="true"
      ></span>
    {/each}
    <!-- Done part: a solid fill. Around it (and, while working, around the segment being
         worked on, which stays unfilled until its block is done) one outline in a lighter
         shade that glows. It sits on the frame, so no dark outline shows. -->
    {#if outlineAnim.current > 0.5}
      <span class="glow-layer" style:width="{outlineAnim.current + 2 * BAR.padding}px" aria-hidden="true"></span>
      <span class="outline" style:width="{outlineAnim.current + 2 * BAR.padding}px" aria-hidden="true"></span>
    {/if}
    {#if litAnim.current > 0.5}
      <span class="fill" style:width="{litAnim.current}px" aria-hidden="true"></span>
    {/if}
    <span
      class="label"
      style:left="{BAR.padding + LABEL_INSET}px"
      style:transform="translateX({labelShift}px)"
      bind:clientWidth={labelWidth}
    >
      {#if working}<span class="prefix">{BAR_TEXT.workPrefix.trim()}</span>{/if}
      <span class="title">{task.title}</span>
      <span class="count">{formatProgress(task)}</span>
    </span>
  </button>

  <button type="button" class="corner close" aria-label="Delete {task.title}" onclick={handleDelete}>
    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
  </button>
  <button
    type="button"
    class="corner heart"
    class:on={favorited}
    aria-label={favorited ? `Remove ${task.title} from favourites` : `Add ${task.title} to favourites`}
    aria-pressed={favorited}
    onclick={handleFavorite}
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 13.5S2.5 10.2 2.5 6.3C2.5 4.6 3.8 3.3 5.4 3.3c1.1 0 2 .6 2.6 1.5.6-.9 1.5-1.5 2.6-1.5 1.6 0 2.9 1.3 2.9 3 0 3.9-5.5 7.2-5.5 7.2z"
      />
    </svg>
  </button>

  {#if celebrating}
    <div class="done" aria-live="polite">
      {task.title}{BAR_TEXT.doneSuffix}
    </div>
  {/if}
</div>

<style>
  .wrap {
    position: absolute;
    /* Own stacking layer, so inner z-indexes never leak above the modal. */
    z-index: 1;
    /* Bars slide when they get rearranged to make room. */
    transition:
      left 0.5s var(--ease-out),
      top 0.5s var(--ease-out);
  }

  .wrap.celebrating {
    z-index: 10;
  }

  .bar {
    all: unset;
    box-sizing: border-box;
    position: relative;
    /* Keeps the segments' z-order inside the bar, below the X and heart buttons. */
    isolation: isolate;
    display: block;
    width: 100%;
    height: 100%;
    padding: var(--pad);
    border-radius: var(--radius);
    /* The frame around the segments. */
    background: rgb(var(--rgb-frame));
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.32);
    cursor: pointer;
    transition:
      transform 0.25s var(--ease-spring),
      filter 0.2s;
  }

  .hovered .bar {
    transform: scale(1.02);
    filter: brightness(1.12);
  }

  .bar:active {
    transform: scale(0.985);
    transition-duration: 0.08s;
  }

  /* Segments still to do. Solid colors, so overlaps don't show through. Each has an outline
     in the frame's color and width, so on the next segment it reads as the same frame line
     curving around its rounded right edge, pointing the way progress goes. */
  .seg {
    position: absolute;
    top: var(--pad);
    bottom: var(--pad);
    border-radius: var(--seg-radius);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0) 55%), rgb(var(--rgb-dim));
    box-shadow: 0 0 0 var(--ring) rgb(var(--rgb-frame));
  }

  /* Done segments sit under the done part; their outline would peek out past its edge. */
  .seg.covered {
    box-shadow: none;
  }

  /* The done part: one solid block on top of the segments, inside its outline. */
  .fill {
    position: absolute;
    z-index: 161;
    left: var(--pad);
    top: var(--pad);
    bottom: var(--pad);
    border-radius: var(--seg-radius);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 60%), rgb(var(--rgb));
  }

  /* Another bar is being worked on: this one can't be clicked. */
  .locked .bar {
    cursor: not-allowed;
    filter: saturate(0.45) brightness(0.8);
  }

  .prefix {
    font-weight: 500;
    opacity: 0.85;
  }

  /* Outline around the done part (and the segment being worked on), one frame wide, in a
     lighter shade of the bar color. A ring, so the segment inside stays visible. */
  .outline {
    position: absolute;
    z-index: 160;
    box-sizing: border-box;
    left: 0;
    top: 0;
    bottom: 0;
    border: var(--ring) solid rgb(var(--rgb-light));
    border-radius: var(--radius);
  }

  /* The outline's glow. Always on; pulses only on the bar being worked on. It's a separate
     layer so only opacity animates, which keeps the pulse cheap. */
  .glow-layer {
    position: absolute;
    z-index: 159;
    left: 0;
    top: 0;
    bottom: 0;
    border-radius: var(--radius);
    box-shadow:
      0 0 16px 2px rgba(var(--rgb-light), 0.6),
      0 0 5px 1px rgba(var(--rgb-light), 0.7);
  }

  .working .glow-layer {
    animation: pulse 1.6s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 1;
    }
  }

  .label {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 163;
    display: flex;
    align-items: center;
    /* Sizes come from BAR_TEXT, which the bar's width is calculated from, so it always fits. */
    gap: var(--label-gap);
    white-space: nowrap;
    pointer-events: none;
    font-size: var(--label-size);
    font-weight: 700;
    transition:
      transform 0.42s var(--ease-spring),
      opacity 0.2s;
  }

  .count {
    font-weight: 500;
    opacity: 0.82;
    font-variant-numeric: tabular-nums;
  }

  /* X and heart buttons on the top-left corner, side by side, always shown. */
  .corner {
    position: absolute;
    top: -11px;
    left: -11px;
    z-index: 3;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.28);
    background: #1b1e29;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    transition:
      opacity 0.18s,
      transform 0.25s var(--ease-spring),
      background-color 0.15s;
  }

  /* Hover styles only while the cursor is really over this bar (see Toolbar). */
  .hovered .corner:hover {
    transform: scale(1.1);
  }

  .hovered .close:hover {
    background: #e5484d;
  }

  .corner svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: #fff;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .heart {
    left: 22px;
  }

  .celebrating .corner {
    opacity: 0;
    pointer-events: none;
  }

  .heart svg {
    width: 14px;
    height: 14px;
    transition:
      fill 0.15s,
      stroke 0.15s;
  }

  .hovered .heart:hover svg {
    stroke: #ff6b8b;
  }

  /* The pop plays once, when the heart gets filled. */
  .heart.on svg {
    fill: #ff4f7a;
    stroke: #ff4f7a;
    animation: heart-pop 0.35s var(--ease-spring);
  }

  @keyframes heart-pop {
    50% {
      transform: scale(1.3);
    }
  }

  /* ---------- Finish animation: the bar's own color, glowing bright ---------- */

  .celebrating .bar {
    border-color: rgb(var(--rgb));
    cursor: default;
  }

  .celebrating .fill {
    filter: brightness(1.2) saturate(1.15);
  }

  .celebrating .glow-layer {
    animation: none;
    opacity: 1;
  }

  .celebrating .label {
    opacity: 0;
  }

  /* Strong glow around the whole bar. Only opacity animates. */
  .halo {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    pointer-events: none;
    box-shadow:
      0 0 22px 6px rgba(var(--rgb), 0.95),
      0 0 70px 22px rgba(var(--rgb), 0.55);
    animation:
      fade-in 0.35s ease-out,
      halo-pulse 0.9s 0.35s ease-in-out infinite alternate;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes halo-pulse {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.6;
    }
  }

  .done {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--done-inset);
    white-space: pre;
    font-size: var(--done-size);
    font-weight: 800;
    color: #fff;
    pointer-events: none;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
    animation: done-in 0.4s 0.15s var(--ease-out) both;
  }

  /* Slides up a little and fades in; no scaling, so the text stays sharp. */
  @keyframes done-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow-layer,
    .halo {
      animation: none;
    }
    .glow-layer {
      opacity: 0.75;
    }
  }
</style>
