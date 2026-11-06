const PRESS_CLASS = 'is-pressed';
/** 单边超过该值且面积过大时，视为遮罩/画布，不做按下缩放 */
const PRESS_MAX_EDGE = 640;
const PRESS_MAX_AREA = 640 * 480;

const SKIP_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'HTML', 'BODY']);

type VueEventInvokers = Record<string, unknown>;

let pressedEl: HTMLElement | null = null;

const hasVueClick = (el: HTMLElement): boolean => {
    const vei = (el as HTMLElement & { _vei?: VueEventInvokers })._vei;
    if (!vei) return false;
    return !!(vei.onClick || vei.onClickCapture || vei.onMousedown || vei.onPointerdown);
};

const isDisabledControl = (el: HTMLElement): boolean => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return true;
    if (el.classList.contains('disabled') || el.classList.contains('is-disabled')) return true;
    if (el instanceof HTMLButtonElement && el.disabled) return true;
    return false;
};

const isExplicitControl = (el: HTMLElement): boolean => {
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A') return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.classList.contains('cursor-pointer')) return true;
    if (el.classList.contains('toolbar-btn')) return true;
    if (el.classList.contains('control-btn')) return true;
    if (el.classList.contains('start-btn')) return true;
    if (el.classList.contains('layer-btn')) return true;
    if (el.dataset.press !== undefined) return true;
    return false;
};

const isButtonSized = (el: HTMLElement): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.width > PRESS_MAX_EDGE && rect.height > PRESS_MAX_EDGE) return false;
    if (rect.width * rect.height > PRESS_MAX_AREA) return false;
    return true;
};

const isPressable = (el: HTMLElement): boolean => {
    if (SKIP_TAGS.has(el.tagName)) return false;
    // 只跳过自身带 data-no-press 的节点，不影响其子按钮
    if (el.hasAttribute('data-no-press')) return false;
    if (isDisabledControl(el)) return false;
    if (!isButtonSized(el)) return false;

    if (isExplicitControl(el) || hasVueClick(el)) return true;

    // 仅检查内联 cursor，避免每次按下都触发 getComputedStyle 强制布局
    try {
        if (el.style.cursor === 'pointer') return true;
    } catch {
        /* ignore */
    }

    return false;
};

/** 跳过纯展示子节点，优先落到真正可点的容器上 */
const shouldSkipLeaf = (el: HTMLElement): boolean => {
    const tag = el.tagName;
    if (tag === 'IMG' || tag === 'SVG' || tag === 'PATH' || tag === 'I' || tag === 'SPAN' || tag === 'P') {
        return !hasVueClick(el) && !isExplicitControl(el);
    }
    return false;
};

export const findPressable = (target: EventTarget | null, path?: EventTarget[]): HTMLElement | null => {
    const chain: EventTarget[] =
        path && path.length > 0
            ? path
            : (() => {
                  const list: HTMLElement[] = [];
                  let cur = target as HTMLElement | null;
                  while (cur && cur !== document.documentElement) {
                      list.push(cur);
                      cur = cur.parentElement;
                  }
                  return list;
              })();

    for (const node of chain) {
        if (!(node instanceof HTMLElement)) continue;
        if (node === document.documentElement || node === document.body) break;
        if (shouldSkipLeaf(node)) continue;
        if (isPressable(node)) return node;
    }
    return null;
};

export const clearPressed = () => {
    if (!pressedEl) return;
    pressedEl.classList.remove(PRESS_CLASS);
    pressedEl = null;
};

export const setPressed = (el: HTMLElement | null) => {
    clearPressed();
    if (!el) return;
    pressedEl = el;
    el.classList.add(PRESS_CLASS);
};

export const handlePressPointerDown = (e: PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    setPressed(findPressable(e.target, path));
};

export const handlePressPointerEnd = () => {
    clearPressed();
};
