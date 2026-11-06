import { computed, reactive, ref, type Ref } from 'vue'
import {
  ADMIN_KBD_GUARD_EVENTS,
  applySelectionToInput,
  isFullTextSelection,
  shouldClearReplaceAllPending,
  type KeyboardTextSelection,
} from '../utils/adminKeyboardInput'

export type UseAdminKeyboardFeedbackOptions = {
  getValue: () => string
  setValue: (value: string) => void
  replaceAllPending: Ref<boolean>
  getInputType?: () => 'text' | 'password'
  /** 与虚拟键盘一致的整串校验（数字/价格等） */
  sanitizeInput?: (raw: string) => string
  /** Enter 确认 */
  onConfirm?: () => void
}

export function useAdminKeyboardFeedback(options: UseAdminKeyboardFeedbackOptions) {
  const keyboardFeedbackRef = ref<HTMLInputElement | null>(null)
  const feedbackPreviewRef = ref<HTMLElement | null>(null)
  const feedbackSel = reactive<KeyboardTextSelection>({ start: 0, end: 0 })
  const hasFeedbackSelection = computed(() => feedbackSel.end > feedbackSel.start)
  /** Shift+方向键扩展选区时的锚点 */
  let selectionAnchor = 0

  const getFeedbackInput = (): HTMLInputElement | null => keyboardFeedbackRef.value

  /**
   * 设置选区：同步更新内部状态与原生 input 选区。
   * 原生选区负责渲染（高亮 + 光标），内部状态供虚拟键盘定位插入点。
   */
  const setFeedbackSelection = (start: number, end: number = start) => {
    const value = options.getValue()
    const nextStart = Math.max(0, Math.min(Math.min(start, end), value.length))
    const nextEnd = Math.max(0, Math.min(Math.max(start, end), value.length))
    feedbackSel.start = nextStart
    feedbackSel.end = nextEnd
    if (shouldClearReplaceAllPending(feedbackSel, value.length)) {
      options.replaceAllPending.value = false
    }
    const input = getFeedbackInput()
    if (input) {
      applySelectionToInput(input, { start: nextStart, end: nextEnd })
    }
  }

  /** 原生 select 事件：把浏览器选区同步回内部状态（鼠标拖选、双击选词等） */
  const syncSelectionFromNative = () => {
    const input = getFeedbackInput()
    if (!input) return
    feedbackSel.start = input.selectionStart ?? 0
    feedbackSel.end = input.selectionEnd ?? 0
    if (shouldClearReplaceAllPending(feedbackSel, options.getValue().length)) {
      options.replaceAllPending.value = false
    }
  }

  const onFeedbackSelect = () => syncSelectionFromNative()

  /** 点击放置光标时部分浏览器不触发 select，在此兜底同步选区 */
  const onFeedbackClick = () => syncSelectionFromNative()

  const selectAllFeedbackText = () => {
    setFeedbackSelection(0, options.getValue().length)
    selectionAnchor = 0
  }

  /** 打开键盘后全选（ref 未就绪时重试一次） */
  const selectAllOnOpen = () => {
    const run = () => {
      if (!getFeedbackInput()) return false
      selectAllFeedbackText()
      return hasFeedbackSelection.value || options.getValue().length === 0
    }
    requestAnimationFrame(() => {
      if (!run()) requestAnimationFrame(run)
    })
  }

  const commitTextValue = (next: string, caret: number) => {
    options.setValue(next)
    setFeedbackSelection(caret, caret)
    selectionAnchor = caret
  }

  const handlePhysicalInsert = (text: string) => {
    if (!text) return
    const oldVal = options.getValue()
    const { start, end } = feedbackSel

    if (options.replaceAllPending.value && oldVal.length > 0) {
      const next = options.sanitizeInput ? options.sanitizeInput(text) : text
      if (options.sanitizeInput && text && !next) return
      options.replaceAllPending.value = false
      commitTextValue(next, next.length)
      return
    }

    const raw = `${oldVal.slice(0, start)}${text}${oldVal.slice(end)}`
    const next = options.sanitizeInput ? options.sanitizeInput(raw) : raw
    if (next === oldVal) return
    const caret = start + (next.length - oldVal.length) + (end - start)
    commitTextValue(next, Math.max(0, Math.min(caret, next.length)))
  }

  const handlePhysicalDelete = (forward: boolean) => {
    const oldVal = options.getValue()
    const { start, end } = feedbackSel

    if (
      options.replaceAllPending.value &&
      oldVal.length > 0 &&
      isFullTextSelection(feedbackSel, oldVal.length) &&
      !forward
    ) {
      options.replaceAllPending.value = false
      commitTextValue('', 0)
      return
    }

    let raw: string
    let caret: number
    if (start !== end) {
      raw = `${oldVal.slice(0, start)}${oldVal.slice(end)}`
      caret = start
    } else if (forward) {
      if (start >= oldVal.length) return
      raw = `${oldVal.slice(0, start)}${oldVal.slice(start + 1)}`
      caret = start
    } else {
      if (start <= 0) return
      raw = `${oldVal.slice(0, start - 1)}${oldVal.slice(start)}`
      caret = start - 1
    }

    const next = options.sanitizeInput ? options.sanitizeInput(raw) : raw
    commitTextValue(next, Math.max(0, Math.min(caret, next.length)))
  }

  const movePhysicalCaret = (nextIndex: number, extendSelection: boolean) => {
    const len = options.getValue().length
    const idx = Math.max(0, Math.min(nextIndex, len))
    if (extendSelection) {
      setFeedbackSelection(selectionAnchor, idx)
    } else {
      setFeedbackSelection(idx, idx)
      selectionAnchor = idx
    }
  }

  const onFeedbackKeydown = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const input = getFeedbackInput()
    if (!input || document.activeElement !== input) return

    const { start, end } = feedbackSel
    const mod = e.ctrlKey || e.metaKey

    if (mod) {
      const key = e.key.toLowerCase()
      if (key === 'a') {
        e.preventDefault()
        selectAllFeedbackText()
        return
      }
      if (key === 'c') {
        // 复制交由浏览器原生处理（原生选区可见，无需手动写入剪贴板）
        return
      }
      if (key === 'x') {
        // 不拦截 keydown，交由原生 cut 事件处理（onFeedbackCut 写入剪贴板并删除选区）
        return
      }
      if (key === 'v') {
        // 不拦截 keydown，交由原生 paste 事件处理（onFeedbackPaste 读取 clipboardData）
        return
      }
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      handlePhysicalDelete(false)
      return
    }
    if (e.key === 'Delete') {
      e.preventDefault()
      handlePhysicalDelete(true)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      options.onConfirm?.()
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const from = e.shiftKey ? end : start !== end ? Math.min(start, end) : start
      movePhysicalCaret(from - 1, e.shiftKey)
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const from = e.shiftKey ? end : start !== end ? Math.max(start, end) : end
      movePhysicalCaret(from + 1, e.shiftKey)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      movePhysicalCaret(0, e.shiftKey)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      movePhysicalCaret(options.getValue().length, e.shiftKey)
      return
    }

    if (e.key.length === 1 && !e.altKey) {
      e.preventDefault()
      handlePhysicalInsert(e.key)
    }
  }

  /**
   * 原生 paste 事件处理：直接从事件 clipboardData 读取文本，
   * 比 navigator.clipboard.readText() 更可靠（不依赖安全上下文/权限/用户手势）。
   */
  const onFeedbackPaste = (e: ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    if (text) handlePhysicalInsert(text)
  }

  /**
   * 原生 cut 事件处理：通过 clipboardData 写入选中文本并删除选区，
   * 避免 navigator.clipboard.writeText 的权限/上下文限制。
   */
  const onFeedbackCut = (e: ClipboardEvent) => {
    e.preventDefault()
    const { start, end } = feedbackSel
    if (start === end) return
    const text = options.getValue().slice(start, end)
    try {
      e.clipboardData?.setData('text/plain', text)
    } catch {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
    handlePhysicalDelete(true)
  }

  const onClearClick = () => {
    options.setValue('')
    options.replaceAllPending.value = false
    feedbackSel.start = 0
    feedbackSel.end = 0
    selectionAnchor = 0
  }

  return {
    ADMIN_KBD_GUARD_EVENTS,
    keyboardFeedbackRef,
    feedbackPreviewRef,
    feedbackSel,
    hasFeedbackSelection,
    setFeedbackSelection,
    selectAllFeedbackText,
    selectAllOnOpen,
    onFeedbackSelect,
    onFeedbackClick,
    onFeedbackKeydown,
    onFeedbackPaste,
    onFeedbackCut,
    onClearClick,
    hideActionMode: () => {},
  }
}
