import { ref, type Ref } from 'vue';

export interface UseDragReorderOptions {
  /** 长按多久进入单图层排序（ms） */
  longPressDelay?: number;
  /** 超过该位移视为滚动列表，取消长按（px） */
  touchCancelDistance?: number;
  mouseDragThreshold?: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** 长按激活排序时回调（用于选中该图层） */
  onActivate?: (displayIndex: number) => void;
}

export interface UseDragReorderReturn {
  draggingIndex: Readonly<Ref<number | null>>;
  dragOverIndex: Readonly<Ref<number | null>>;
  isDragging: Readonly<Ref<boolean>>;
  bindContainer: (el: HTMLElement | null) => void;
  containerHandlers: {
    onMousedown: (e: MouseEvent) => void;
  };
  getItemAttrs: (displayIndex: number) => {
    'data-layer-index': number;
    class: { [key: string]: boolean };
  };
}

/** 拖拽排序时靠近列表边缘多少 px 触发自动滚动 */
const AUTO_SCROLL_EDGE_PX = 48;
/** 自动滚动最大速度（px / frame） */
const AUTO_SCROLL_MAX_SPEED = 14;

/**
 * 图层列表手势：
 * - 在图层上按住滑动 → 手动滚动整个列表（不依赖浏览器对子元素的原生滚动）
 * - 长按不动 → 选中并拖拽单图层排序
 * - 排序拖拽靠近顶部/底部 → 列表自动滚动
 *
 * 悬浮层使用 body 上的 fixed 克隆，避免列表内 transform 撑高 scrollHeight，
 * 导致「滚不到底 / 提示线与落点错位」。
 */
export function useDragReorder(options: UseDragReorderOptions): UseDragReorderReturn {
  const {
    longPressDelay = 420,
    touchCancelDistance = 8,
    mouseDragThreshold = 5,
    onReorder,
    onActivate,
  } = options;

  const draggingIndex = ref<number | null>(null);
  const dragOverIndex = ref<number | null>(null);
  const isDragging = ref(false);

  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let startY = 0;
  let startX = 0;
  let startScrollTop = 0;
  let itemHeight = 0;
  let totalCount = 0;
  let pendingMouseIndex: number | null = null;
  let pendingDisplayIndex: number | null = null;
  let containerEl: HTMLElement | null = null;
  let dragEl: HTMLElement | null = null;
  let ghostEl: HTMLElement | null = null;
  let overEl: HTMLElement | null = null;
  let rafId: number | null = null;
  let pendingY: number | null = null;
  let activeIndex = -1;
  let overIndex = -1;
  let gestureBound = false;
  /** 当前手势是否已进入「滚列表」模式 */
  let isListScrolling = false;
  /** 排序拖拽时最近一次指针 Y（用于边缘自动滚动） */
  let lastPointerY: number | null = null;
  let autoScrollRafId: number | null = null;
  /** 指针相对悬浮克隆顶部的偏移 */
  let ghostOffsetY = 0;
  let ghostWidth = 0;
  let ghostHeight = 0;
  let ghostLeft = 0;
  /** 插入空隙高度（取自被拖项原始高度） */
  let dropGapPx = 60;
  const GHOST_SCALE = 0.82;

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function getItemElement(index: number): HTMLElement | null {
    if (!containerEl) return null;
    return containerEl.querySelector(`[data-layer-index="${index}"]`);
  }

  function collapseDragPlaceholder() {
    if (!dragEl) return;
    dragEl.style.opacity = '0';
    dragEl.style.overflow = 'hidden';
    dragEl.style.maxHeight = '0';
    dragEl.style.minHeight = '0';
    dragEl.style.height = '0';
    dragEl.style.padding = '0';
    dragEl.style.margin = '0';
    dragEl.style.borderWidth = '0';
    dragEl.style.pointerEvents = 'none';
    dragEl.classList.remove('layer-drag-slot');
    dragEl.style.removeProperty('--layer-drop-gap');
  }

  function showOriginalSlot() {
    if (!dragEl) return;
    const gap = `${dropGapPx}px`;
    overEl = dragEl;
    dragEl.classList.add('layer-drag-slot');
    dragEl.style.setProperty('--layer-drop-gap', gap);
    dragEl.style.height = gap;
    dragEl.style.maxHeight = gap;
    dragEl.style.minHeight = gap;
    dragEl.style.opacity = '1';
    dragEl.style.overflow = 'visible';
    dragEl.style.margin = '0';
    dragEl.style.padding = '0';
  }

  function clearInsertIndicator() {
    if (overEl) {
      const wasDragEl = overEl === dragEl;
      overEl.classList.remove('layer-drag-over', 'layer-drag-over-after', 'layer-drag-slot');
      overEl.style.marginTop = '';
      overEl.style.marginBottom = '';
      overEl.style.removeProperty('--layer-drop-gap');
      overEl = null;
      // 离开原位提示后，被拖项重新收起
      if (wasDragEl) {
        collapseDragPlaceholder();
      }
    }
  }

  /**
   * insertIndex: 插入空隙 0..totalCount
   * - i < totalCount → 插到第 i 项之前（提示线在该项顶部）
   * - i === totalCount → 插到最后一项之后（提示线在最后一项底部）
   */
  function insertIndexToDest(insertIndex: number, fromIndex: number): number {
    let to = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
    return Math.max(0, Math.min(totalCount - 1, to));
  }

  function setInsertIndex(next: number) {
    if (next === overIndex) return;
    clearInsertIndicator();
    overIndex = next;

    const dest = insertIndexToDest(next, activeIndex);
    dragOverIndex.value = dest;

    const gap = `${dropGapPx}px`;

    // 回到原位（插在自身前/后 = 无移动）也展示空隙提示
    if (next === activeIndex || next === activeIndex + 1) {
      showOriginalSlot();
      return;
    }

    if (next >= totalCount) {
      overEl = getItemElement(totalCount - 1);
      if (overEl) {
        overEl.classList.add('layer-drag-over-after');
        overEl.style.setProperty('--layer-drop-gap', gap);
        overEl.style.marginBottom = gap;
      }
    } else {
      overEl = getItemElement(next);
      if (overEl) {
        overEl.classList.add('layer-drag-over');
        overEl.style.setProperty('--layer-drop-gap', gap);
        overEl.style.marginTop = gap;
      }
    }
  }

  function getMaxScroll(): number {
    if (!containerEl) return 0;
    return Math.max(0, containerEl.scrollHeight - containerEl.clientHeight);
  }

  /** 是否还能朝 velocity 方向滚动（到顶/底为 false） */
  function canScrollInDirection(velocity: number): boolean {
    if (!containerEl || velocity === 0) return false;
    const maxScroll = getMaxScroll();
    const top = containerEl.scrollTop;
    if (velocity < 0) return top > 1;
    return top < maxScroll - 1;
  }

  function onReorderWheel(e: WheelEvent) {
    if (!isDragging.value) return;
    e.preventDefault();
  }

  function lockContainerScroll(lock: boolean) {
    if (!containerEl) return;
    if (lock) {
      containerEl.classList.add('is-reordering');
      containerEl.addEventListener('wheel', onReorderWheel, { passive: false });
    } else {
      containerEl.classList.remove('is-reordering');
      containerEl.removeEventListener('wheel', onReorderWheel);
    }
  }

  function destroyGhost() {
    if (ghostEl) {
      ghostEl.remove();
      ghostEl = null;
    }
  }

  function createGhost(source: HTMLElement, pointerY: number) {
    destroyGhost();
    const rect = source.getBoundingClientRect();
    ghostOffsetY = pointerY - rect.top;
    ghostWidth = rect.width;
    ghostHeight = rect.height;
    ghostLeft = rect.left;
    dropGapPx = Math.max(48, Math.round(rect.height));

    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-layer-index');
    clone.classList.add('layer-drag-ghost');
    clone.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'margin:0',
      'z-index:10000',
      'pointer-events:none',
      'box-sizing:border-box',
      'opacity:0.95',
      'box-shadow:0 8px 20px rgba(0,0,0,0.16)',
      `transform:scale(${GHOST_SCALE})`,
      'transform-origin:center center',
      'transition:transform 0.18s ease,opacity 0.18s ease',
      'border-radius:12px',
      'will-change:transform,top',
    ].join(';');

    document.body.appendChild(clone);
    ghostEl = clone;

    // 下一帧再强调缩小，便于感知「按住后缩小」
    requestAnimationFrame(() => {
      if (ghostEl) {
        ghostEl.style.transform = `scale(${GHOST_SCALE})`;
      }
    });
  }

  function updateGhostPosition(pointerY: number) {
    if (!ghostEl) return;
    ghostEl.style.top = `${pointerY - ghostOffsetY}px`;
    ghostEl.style.left = `${ghostLeft}px`;
    ghostEl.style.width = `${ghostWidth}px`;
    ghostEl.style.height = `${ghostHeight}px`;
  }

  function activateDrag(displayIndex: number) {
    isListScrolling = false;
    activeIndex = displayIndex;
    overIndex = -1;
    draggingIndex.value = displayIndex;
    dragOverIndex.value = displayIndex;
    isDragging.value = true;
    startScrollTop = containerEl?.scrollTop ?? 0;
    lastPointerY = startY;
    lockContainerScroll(true);
    onActivate?.(displayIndex);
    dragEl = getItemElement(displayIndex);
    if (dragEl) {
      createGhost(dragEl, startY);
      // 原项收起占位，列表合拢；插入间隙由 drop gap 单独展示
      dragEl.classList.add('layer-dragging');
      collapseDragPlaceholder();
    }
    // 初始落在原位，立即展示空隙提示
    setInsertIndex(displayIndex);
    ensureAutoScroll();
  }

  function computeItemHeight(target: EventTarget | null) {
    const el = (target as HTMLElement)?.closest?.('[data-layer-index]');
    return el ? el.getBoundingClientRect().height : 60;
  }

  /**
   * 返回插入空隙索引 0..totalCount（totalCount = 最后一项之后）。
   * 按各图层中线划分：上半 → 插到该项前；超过最后一项中线 → 插到末尾。
   * 跳过已收起的被拖项；若原位占位槽已展开则优先命中原位。
   */
  function findInsertIndex(clientY: number): number {
    if (!containerEl || totalCount <= 0) return 0;

    // 指针落在原位占位槽内 → 回到原来位置
    if (dragEl && activeIndex >= 0) {
      const slotRect = dragEl.getBoundingClientRect();
      if (slotRect.height > 1 && clientY >= slotRect.top && clientY <= slotRect.bottom) {
        return activeIndex;
      }
    }

    for (let i = 0; i < totalCount; i++) {
      if (i === activeIndex) continue;
      const el = getItemElement(i);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return i;
      }
    }
    return totalCount;
  }

  /** 指针相对列表边缘的自动滚动速度；到顶/底返回 0 */
  function getAutoScrollVelocity(clientY: number): number {
    if (!containerEl) return 0;
    const rect = containerEl.getBoundingClientRect();
    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;

    if (topDist < AUTO_SCROLL_EDGE_PX) {
      if (!canScrollInDirection(-1)) return 0;
      const intensity = 1 - Math.max(0, topDist) / AUTO_SCROLL_EDGE_PX;
      return -AUTO_SCROLL_MAX_SPEED * intensity;
    }
    if (bottomDist < AUTO_SCROLL_EDGE_PX) {
      if (!canScrollInDirection(1)) return 0;
      const intensity = 1 - Math.max(0, bottomDist) / AUTO_SCROLL_EDGE_PX;
      return AUTO_SCROLL_MAX_SPEED * intensity;
    }
    return 0;
  }

  function stopAutoScroll() {
    if (autoScrollRafId !== null) {
      cancelAnimationFrame(autoScrollRafId);
      autoScrollRafId = null;
    }
  }

  function tickAutoScroll() {
    autoScrollRafId = null;
    if (!isDragging.value || !containerEl || lastPointerY === null) return;

    const velocity = getAutoScrollVelocity(lastPointerY);
    if (velocity === 0 || !canScrollInDirection(velocity)) return;

    const maxScroll = getMaxScroll();
    const prev = containerEl.scrollTop;
    const next = Math.max(0, Math.min(maxScroll, prev + velocity));
    if (Math.abs(next - prev) < 0.5) return;

    containerEl.scrollTop = next;

    // 浏览器未真正滚过去（已到底），立即停
    if (Math.abs(containerEl.scrollTop - prev) < 0.5) return;

    applyVisualDrag(lastPointerY);

    if (getAutoScrollVelocity(lastPointerY) !== 0 && canScrollInDirection(velocity)) {
      autoScrollRafId = requestAnimationFrame(tickAutoScroll);
    }
  }

  function ensureAutoScroll() {
    if (!isDragging.value || autoScrollRafId !== null || lastPointerY === null) return;
    if (getAutoScrollVelocity(lastPointerY) === 0) return;
    autoScrollRafId = requestAnimationFrame(tickAutoScroll);
  }

  function applyVisualDrag(y: number) {
    if (!isDragging.value || activeIndex < 0 || !containerEl) return;

    updateGhostPosition(y);
    setInsertIndex(findInsertIndex(y));
  }

  function moveDrag(y: number) {
    lastPointerY = y;
    pendingY = y;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingY !== null) {
          applyVisualDrag(pendingY);
          pendingY = null;
        }
        ensureAutoScroll();
      });
    } else {
      ensureAutoScroll();
    }
  }

  function applyListScroll(y: number) {
    if (!containerEl) return;
    containerEl.scrollTop = startScrollTop - (y - startY);
  }

  function resetDragVisual() {
    stopAutoScroll();
    lastPointerY = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    pendingY = null;
    clearInsertIndicator();
    destroyGhost();
    if (dragEl) {
      dragEl.style.opacity = '';
      dragEl.style.overflow = '';
      dragEl.style.maxHeight = '';
      dragEl.style.minHeight = '';
      dragEl.style.height = '';
      dragEl.style.padding = '';
      dragEl.style.margin = '';
      dragEl.style.borderWidth = '';
      dragEl.style.pointerEvents = '';
      dragEl.style.removeProperty('--layer-drop-gap');
      dragEl.classList.remove('layer-dragging', 'layer-drag-slot');
      dragEl = null;
    }
    lockContainerScroll(false);
    activeIndex = -1;
    overIndex = -1;
  }

  function endGesture() {
    clearLongPress();
    pendingMouseIndex = null;
    pendingDisplayIndex = null;
    unbindGesture();

    if (isDragging.value && activeIndex >= 0 && overIndex >= 0) {
      const toDisplay = insertIndexToDest(overIndex, activeIndex);
      if (activeIndex !== toDisplay) {
        const fromOriginal = totalCount - 1 - activeIndex;
        const toOriginal = totalCount - 1 - toDisplay;
        onReorder(fromOriginal, toOriginal);
      }
    }

    resetDragVisual();
    draggingIndex.value = null;
    dragOverIndex.value = null;
    isDragging.value = false;
    isListScrolling = false;
  }

  function getDisplayIndex(target: EventTarget | null): number | null {
    const el = (target as HTMLElement)?.closest?.('[data-layer-index]');
    if (!el) return null;
    const index = el.getAttribute('data-layer-index');
    return index !== null ? parseInt(index, 10) : null;
  }

  function updateTotalCount() {
    if (!containerEl) return;
    totalCount = containerEl.querySelectorAll('[data-layer-index]').length;
  }

  const onGestureTouchMove = (e: TouchEvent) => {
    if (!containerEl || e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    const x = e.touches[0].clientX;

    // 单图层排序中
    if (isDragging.value) {
      e.preventDefault();
      moveDrag(y);
      return;
    }

    const dy = y - startY;
    const dx = x - startX;

    // 手指移动：取消长按，改为滚整个列表
    if (!isListScrolling && (Math.abs(dy) > touchCancelDistance || Math.abs(dx) > touchCancelDistance)) {
      clearLongPress();
      pendingDisplayIndex = null;
      isListScrolling = true;
    }

    if (isListScrolling) {
      e.preventDefault();
      applyListScroll(y);
    }
  };

  const onGestureTouchEnd = () => endGesture();

  function unbindGesture() {
    if (!gestureBound) return;
    gestureBound = false;
    document.removeEventListener('touchmove', onGestureTouchMove);
    document.removeEventListener('touchend', onGestureTouchEnd);
    document.removeEventListener('touchcancel', onGestureTouchEnd);
  }

  function bindGesture() {
    if (gestureBound) return;
    gestureBound = true;
    // 非 passive：滚列表 / 排序时都需要 preventDefault
    document.addEventListener('touchmove', onGestureTouchMove, { passive: false });
    document.addEventListener('touchend', onGestureTouchEnd);
    document.addEventListener('touchcancel', onGestureTouchEnd);
  }

  const onContainerTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) {
      endGesture();
      return;
    }
    if (isDragging.value) return;

    const target = e.target as HTMLElement;
    // 按钮区域留给点击，不抢手势
    if (target.closest?.('button, a, input, textarea')) return;

    updateTotalCount();
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startScrollTop = containerEl?.scrollTop ?? 0;
    itemHeight = computeItemHeight(e.target);
    isListScrolling = false;
    pendingDisplayIndex = getDisplayIndex(e.target);

    bindGesture();

    // 只有点在图层项上才允许长按排序
    if (pendingDisplayIndex !== null) {
      clearLongPress();
      const idx = pendingDisplayIndex;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        // 已在滚列表则不进入排序
        if (isListScrolling || pendingDisplayIndex === null) return;
        pendingDisplayIndex = null;
        // 以当前触点为排序起点
        activateDrag(idx);
      }, longPressDelay);
    }
  };

  function bindContainer(el: HTMLElement | null) {
    if (containerEl === el) return;
    if (containerEl) {
      containerEl.removeEventListener('touchstart', onContainerTouchStart);
      endGesture();
    }
    containerEl = el;
    if (containerEl) {
      containerEl.addEventListener('touchstart', onContainerTouchStart, { passive: true });
    }
  }

  const containerHandlers = {
    // 鼠标：拖动图层排序；触摸走手动滚列表 + 长按排序
    onMousedown: (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest?.('button, a, input, textarea')) return;

      containerEl = (e.currentTarget as HTMLElement) ?? containerEl;
      updateTotalCount();
      const displayIndex = getDisplayIndex(e.target);
      if (displayIndex === null) return;

      startY = e.clientY;
      startX = e.clientX;
      itemHeight = computeItemHeight(e.target);
      pendingMouseIndex = displayIndex;

      const onMouseMove = (me: MouseEvent) => {
        const dy = Math.abs(me.clientY - startY);
        if (!isDragging.value && pendingMouseIndex !== null && dy > mouseDragThreshold) {
          activateDrag(pendingMouseIndex);
          pendingMouseIndex = null;
        }
        if (isDragging.value) {
          moveDrag(me.clientY);
        }
      };
      const onMouseUp = () => {
        endGesture();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      document.addEventListener('mouseup', onMouseUp);
    },
  };

  function getItemAttrs(displayIndex: number) {
    const isAfterLast =
      dragOverIndex.value === totalCount - 1 &&
      overIndex === totalCount &&
      draggingIndex.value !== null;
    const isBeforeTarget =
      dragOverIndex.value === displayIndex &&
      draggingIndex.value !== displayIndex &&
      overIndex >= 0 &&
      overIndex < totalCount &&
      overIndex !== activeIndex &&
      overIndex !== activeIndex + 1;

    return {
      'data-layer-index': displayIndex,
      class: {
        'layer-dragging': draggingIndex.value === displayIndex,
        // 提示线主要由 setInsertIndex 的 DOM class 控制；此处保持 Vue 同步
        'layer-drag-over': isBeforeTarget && displayIndex === overIndex,
        'layer-drag-over-after': isAfterLast && displayIndex === totalCount - 1,
      },
    };
  }

  return {
    draggingIndex: draggingIndex as Readonly<Ref<number | null>>,
    dragOverIndex: dragOverIndex as Readonly<Ref<number | null>>,
    isDragging: isDragging as Readonly<Ref<boolean>>,
    bindContainer,
    containerHandlers,
    getItemAttrs,
  };
}
