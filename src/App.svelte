<script lang="ts">
  import { onMount, tick } from 'svelte';
  import NewTaskModal from './components/NewTaskModal.svelte';
  import ProgressBar from './components/ProgressBar.svelte';
  import SettingsModal from './components/SettingsModal.svelte';
  import Toast from './components/Toast.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import { isFavorited } from './lib/favorites';
  import { createRegionSync, regionAt, type HitRegion } from './lib/hitRegions';
  import { inTauri, ipc } from './lib/ipc';
  import { BAR_HIT_PADDING, barRect, center, inflate, TOOLBAR } from './lib/layout';
  import { pickColor } from './lib/palette';
  import { taskStore } from './lib/tasks.svelte';
  import { MAX_BARS, MAX_FAVORITES, type Favorite, type NewTaskInput, type Point, type Rect } from './lib/types';

  const TOOLBAR_ID = '__toolbar__';
  const MODAL_ID = '__modal__';
  const TOAST_MS = 3500;
  const FLY_STAGGER_MS = 70;

  let area = $state<Rect>({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
  let modal = $state<'new' | 'settings' | null>(null);
  let modalColor = $state(0);
  let hoveredId = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  let toolbar: Toolbar;
  let toolbarWidth = $state(0);
  let toolbarHeight = $state(0);
  let flyFrom = $state<Point>({ x: 0, y: 0 });

  const areaCenter = $derived(center(area));
  const toolbarRect = $derived<Rect>({
    x: Math.round(areaCenter.x - toolbarWidth / 2),
    y: area.y + TOOLBAR.top,
    w: toolbarWidth,
    h: toolbarHeight,
  });
  // New bars that fly in one after another (Restore favourites), in list order.
  const freshOrder = $derived(taskStore.tasks.filter((t) => taskStore.fresh.has(t.id)).map((t) => t.id));

  // Parts of the screen that take the mouse. Everything else clicks through to the desktop.
  const regions = $derived.by<HitRegion[]>(() => {
    if (modal) {
      return [{ id: MODAL_ID, x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }];
    }
    return [
      { id: TOOLBAR_ID, ...toolbarRect },
      ...taskStore.tasks
        .filter((t) => !taskStore.celebrating.has(t.id))
        .map((t) => ({ id: t.id, ...inflate(barRect(t), BAR_HIT_PADDING) })),
    ];
  });

  const syncRegions = createRegionSync((r) => {
    ipc.setHitRegions(r).catch((e) => console.error('set_hit_regions failed', e));
  });

  $effect(() => syncRegions(regions));

  // A bar that stops being interactive (e.g. it started celebrating) can't stay hovered.
  $effect(() => {
    if (hoveredId && !regions.some((r) => r.id === hoveredId)) hoveredId = null;
  });

  function showToast(message: string) {
    clearTimeout(toastTimer);
    toast = message;
    toastTimer = setTimeout(() => (toast = null), TOAST_MS);
  }

  function openModal(kind: 'new' | 'settings') {
    if (kind === 'new') modalColor = pickColor(taskStore.tasks);
    modal = kind;
    ipc.setModalMode(true).catch(console.error);
  }

  function closeModal() {
    modal = null;
    ipc.setModalMode(false).catch(console.error);
  }

  function createTask(input: NewTaskInput) {
    flyFrom = toolbar.addCenter();
    // The modal blocks the other errors (taken name, no room) before Add is possible.
    if (taskStore.add(input, area) === null) closeModal();
  }

  function restoreFavorites() {
    flyFrom = toolbar.addCenter();
    const { placed, total } = taskStore.restoreFavorites(area);
    if (placed < total) showToast(`Only ${placed} of ${total} favourites fit on this screen`);
  }

  function toggleFavorite(id: string) {
    if (!taskStore.toggleFavorite(id)) showToast(`Favourites are full (${MAX_FAVORITES} max)`);
  }

  function saveFavorites(next: Favorite[]) {
    taskStore.saveFavorites(next);
    closeModal();
  }

  async function refreshArea() {
    area = await ipc.getWorkArea();
    taskStore.reflow(area);
  }

  onMount(() => {
    const cleanups: (() => void)[] = [];

    (async () => {
      area = await ipc.getWorkArea();
      await taskStore.load(area);
      cleanups.push(await ipc.onRegionHover((id) => (hoveredId = id)));
      cleanups.push(await ipc.onDisplayChanged(refreshArea));
      // Show the window once the DOM is built. Not in requestAnimationFrame: a hidden
      // webview never runs animation frames, so it would wait forever.
      await tick();
      ipc.overlayReady().catch(console.error);
    })();

    // In a plain browser there is no Rust hover tracking; do it here.
    if (!inTauri) {
      const onMove = (e: PointerEvent) => (hoveredId = regionAt(regions, e.clientX, e.clientY));
      window.addEventListener('pointermove', onMove);
      cleanups.push(() => window.removeEventListener('pointermove', onMove));
    }

    return () => cleanups.forEach((c) => c());
  });
</script>

{#each taskStore.tasks as task, index (task.id)}
  <ProgressBar
    {task}
    {index}
    {flyFrom}
    hovered={hoveredId === task.id}
    favorited={isFavorited(task, taskStore.favorites)}
    celebrating={taskStore.celebrating.has(task.id)}
    fresh={taskStore.fresh.has(task.id)}
    flyDelay={Math.max(0, freshOrder.indexOf(task.id)) * FLY_STAGGER_MS}
    workingId={taskStore.working?.id ?? null}
    onfill={() => taskStore.fill(task.id)}
    onwork={() => (taskStore.working ? taskStore.stopWork() : taskStore.startWork(task.id))}
    onundo={() => taskStore.undo(task.id)}
    ondelete={() => taskStore.remove(task.id)}
    onfavorite={() => toggleFavorite(task.id)}
    oncelebrated={() => taskStore.remove(task.id)}
  />
{/each}

<Toolbar
  bind:this={toolbar}
  bind:width={toolbarWidth}
  bind:height={toolbarHeight}
  x={toolbarRect.x}
  y={toolbarRect.y}
  active={hoveredId === TOOLBAR_ID}
  canAdd={taskStore.tasks.length < MAX_BARS}
  canClear={taskStore.tasks.length > 0}
  canRestore={taskStore.favorites.length > 0}
  onadd={() => openModal('new')}
  onclear={() => taskStore.clearAll()}
  onrestore={restoreFavorites}
  onsettings={() => openModal('settings')}
/>

{#if toast}
  <Toast message={toast} x={areaCenter.x} y={toolbarRect.y + toolbarRect.h + 10} />
{/if}

{#if modal === 'new'}
  <NewTaskModal
    origin={areaCenter}
    {area}
    tasks={taskStore.tasks}
    colorIndex={modalColor}
    onsubmit={createTask}
    oncancel={closeModal}
  />
{:else if modal === 'settings'}
  <SettingsModal origin={areaCenter} favorites={taskStore.favorites} onsave={saveFavorites} oncancel={closeModal} />
{/if}
