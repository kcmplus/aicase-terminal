export type KeyboardTextSelection = { start: number; end: number }

export type VirtualKeyboardUpdateOptions = {
  /** 打开键盘后首次输入：整段替换（避免失焦导致选区折叠） */
  replaceAllPending?: boolean
}

/** Chromium 不在 readonly 输入框显示闪烁光标；用事件拦截代替 readonly */
export const ADMIN_KBD_GUARD_EVENTS = {
  keydown: (e: Event) => e.preventDefault(),
  beforeinput: (e: Event) => e.preventDefault(),
  paste: (e: Event) => e.preventDefault(),
  cut: (e: Event) => e.preventDefault(),
  input: (e: Event) => e.preventDefault(),
} as const

/** 聚焦时全选触发输入框内容 */
export function selectAllOnFocusTarget(e: FocusEvent) {
  const el = e.target
  if (!(el instanceof HTMLInputElement)) return
  const len = el.value.length
  requestAnimationFrame(() => {
    el.setSelectionRange(0, len)
  })
}

export function getInputFromRef(
  ref: HTMLInputElement | { input?: HTMLInputElement; $el?: HTMLElement } | null
): HTMLInputElement | null {
  if (!ref) return null
  if (ref instanceof HTMLInputElement) return ref
  if (ref.input) return ref.input
  return ref.$el?.querySelector?.('input') ?? null
}

export function applySelectionToInput(
  input: HTMLInputElement | null,
  selection: KeyboardTextSelection
) {
  if (!input) return
  const { start, end } = selection
  const apply = () => {
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true })
    }
    try {
      input.setSelectionRange(start, end, 'forward')
    } catch {
      input.setSelectionRange(start, end)
    }
  }
  apply()
  requestAnimationFrame(() => {
    apply()
    requestAnimationFrame(apply)
  })
}

export function measureTextWidth(input: HTMLInputElement, text: string) {
  if (!text) return 0
  if (input.type === 'password') {
    const style = window.getComputedStyle(input)
    const rect = input.getBoundingClientRect()
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    const usable = Math.max(1, rect.width - paddingLeft - paddingRight)
    const len = input.value.length || 1
    return (text.length / len) * usable
  }
  const style = window.getComputedStyle(input)
  const mirror = document.createElement('span')
  mirror.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'white-space:pre',
    `font:${style.font}`,
    `letter-spacing:${style.letterSpacing}`,
  ].join(';')
  mirror.textContent = text
  document.body.appendChild(mirror)
  const width = mirror.offsetWidth
  document.body.removeChild(mirror)
  return width
}

/** 根据屏幕 X 坐标计算输入框内光标索引（与 system 英文键盘一致） */
export function getCaretIndexFromClientX(input: HTMLInputElement, clientX: number) {
  const value = input.value
  if (!value) return 0
  const style = window.getComputedStyle(input)
  const rect = input.getBoundingClientRect()
  const paddingLeft = parseFloat(style.paddingLeft) || 0
  const paddingRight = parseFloat(style.paddingRight) || 0

  if (input.type === 'password') {
    const usable = Math.max(1, rect.width - paddingLeft - paddingRight)
    const x = Math.min(Math.max(0, clientX - rect.left - paddingLeft + input.scrollLeft), usable)
    return Math.round((x / usable) * value.length)
  }

  const x = clientX - rect.left - paddingLeft + input.scrollLeft
  let low = 0
  let high = value.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (measureTextWidth(input, value.slice(0, mid)) <= x) low = mid
    else high = mid - 1
  }
  return low
}

export function syncSelectionFromInput(
  input: HTMLInputElement | null,
  selection: KeyboardTextSelection,
  textLength: number
) {
  if (!input) return
  selection.start = input.selectionStart ?? 0
  selection.end = input.selectionEnd ?? 0
  return shouldClearReplaceAllPending(selection, textLength)
}

export function isFullTextSelection(selection: KeyboardTextSelection, textLength: number) {
  return textLength > 0 && selection.start === 0 && selection.end === textLength
}

/** 选区不再是全文时，取消「打开键盘后的整段替换」状态 */
export function shouldClearReplaceAllPending(
  selection: KeyboardTextSelection,
  textLength: number
) {
  return textLength > 0 && !isFullTextSelection(selection, textLength)
}

const deleteAtSelection = (value: string, selection: KeyboardTextSelection) => {
  let { start, end } = selection
  if (start === end) {
    if (start <= 0) return { value, selection }
    start -= 1
  }
  const next = `${value.slice(0, start)}${value.slice(end)}`
  return { value: next, selection: { start, end: start } }
}

/**
 * 虚拟键盘通过 modelValue 追加/退格时，按当前选区替换或删除（与 system 软键盘逻辑一致）
 */
export function applyVirtualKeyboardModelUpdate(
  oldVal: string,
  newVal: string,
  selection: KeyboardTextSelection,
  sanitize?: (raw: string) => string,
  options?: VirtualKeyboardUpdateOptions
): { value: string; selection: KeyboardTextSelection; consumedReplaceAll: boolean } {
  const replaceAll =
    options?.replaceAllPending && oldVal.length > 0

  // 全选替换：按键盘追加的原文取新增片段再 sanitize（价格等字段 sanitize 整串可能与 oldVal 相同）
  if (replaceAll && newVal.length > oldVal.length && newVal.startsWith(oldVal)) {
    const rawInserted = newVal.slice(oldVal.length)
    const next = sanitize ? sanitize(rawInserted) : rawInserted
    const caret = next.length
    return {
      value: next,
      selection: { start: caret, end: caret },
      consumedReplaceAll: true,
    }
  }

  if (replaceAll && newVal.length < oldVal.length) {
    if (isFullTextSelection(selection, oldVal.length)) {
      return { value: '', selection: { start: 0, end: 0 }, consumedReplaceAll: true }
    }
    // 用户已改为局部选区：不再整段清空，走下方按选区删除
  }

  const sanitized = sanitize ? sanitize(newVal) : newVal
  if (sanitized === oldVal) return { value: oldVal, selection, consumedReplaceAll: false }

  if (sanitized.startsWith(oldVal) && sanitized.length > oldVal.length) {
    const text = sanitized.slice(oldVal.length)
    const { start, end } = selection
    const next = `${oldVal.slice(0, start)}${text}${oldVal.slice(end)}`
    const caret = start + text.length
    return { value: next, selection: { start: caret, end: caret }, consumedReplaceAll: false }
  }

  if (oldVal.startsWith(sanitized) && sanitized.length < oldVal.length) {
    let value = oldVal
    let nextSelection = { ...selection }
    const count = oldVal.length - sanitized.length
    for (let i = 0; i < count; i += 1) {
      const result = deleteAtSelection(value, nextSelection)
      value = result.value
      nextSelection = result.selection
    }
    return { value, selection: nextSelection, consumedReplaceAll: false }
  }

  const len = sanitized.length
  return {
    value: sanitized,
    selection: { start: len, end: len },
    consumedReplaceAll: false,
  }
}
