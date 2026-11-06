<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useI18n } from 'vue-i18n'
import Keyboard from '@/skins/components/keyboard.vue'
import AdminKeyboardFieldInput from '../../components/AdminKeyboardFieldInput.vue'
import AdminKeyboardDragBar from '../../components/AdminKeyboardDragBar.vue'
import {
  applyVirtualKeyboardModelUpdate,
  selectAllOnFocusTarget,
} from '../../utils/adminKeyboardInput'
import {
  get_brand_list,
  get_series_list,
  get_model_list,
  get_model_by_id,
  get_model_by_material,
  type PcBrandItem,
  type PcSeriesItem,
  type PcModelItem,
  type PcMaterialItem,
} from '@/api/pclib'
import {
  get_stock_list,
  get_stock_scanning,
  start_scan_stock,
  cancel_scan_stock,
  update_slot_item,
  StockEvent,
  type StockItem,
  type StockInfoChanged,
  update_slot_count_all,
  type StockTpl,
  get_stock_tpl,
} from '@/api/stock'
import { logWarn } from '@/common/logger'
import { convertFileSrc } from '@tauri-apps/api/core'
import magneticIcon from '../../static/magnetic.svg'
import nonMagneticIcon from '../../static/non-magnetic.svg'
import { get_setting_options, SettingOptions } from '@/api/setting'

const { t } = useI18n()

const stocks = ref<StockItem[]>([])
const isScanning = ref(false)
const loading = ref(false)
const saving = ref(false)
/** 用户主动停止后，在后端扫描态真正归零前强制按已停止展示 */
let forceScanStopped = false
/** 开始识别前的货道快照，停止时用于恢复 */
let preScanSnapshot: StockItem[] | null = null

type ScanUiStatus = 'idle' | 'scanning' | 'success' | 'error'
interface ScanUiState {
  status: ScanUiStatus
  model?: string
  quantity?: number | string
  originalNum?: number
}
/** 识别会话中的 UI 状态（与库存数据分离，停止时可整体清空） */
const scanStates = ref<Record<number, ScanUiState>>({})
/** 当前正在识别的货道（每次只识别一个） */
const currentScanningSlot = ref<number | null>(null)

const brands = ref<PcBrandItem[]>([])
const seriesList = ref<PcSeriesItem[]>([])
const modelList = ref<PcModelItem[]>([])
const materialList = ref<PcMaterialItem[]>([])

const channelDetailVisible = ref(false)
const batchDialogVisible = ref(false)

const currentSlot = ref(0)
const batchStock = ref(0)

const stock_tpl = ref<StockTpl | null>(null)

const channelDetailForm = reactive({
  brand_id: '',
  series_id: '',
  model_id: '',
  material_id: '',
  stock: 0,
  price: 0,
  disabled: false,
})

/** 虚拟键盘（与 payment/system 一致：readonly 输入 + 自定义键盘） */
type ChannelKeyboardField = 'stock' | 'price' | 'batchStock'
const keyboardVisible = ref(false)
const keyboardField = ref<ChannelKeyboardField | null>(null)
const keyboardType = ref<'default' | 'numeric' | 'decimal'>('numeric')
const keyboardDraft = ref('')
const keyboardInputRef = ref<HTMLInputElement | null>(null)
const keyboardReplaceAllPending = ref(false)
const keyboardPos = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const keyboardFieldLabels = computed<Record<ChannelKeyboardField, string>>(() => ({
  stock: t('admin.channel.kbdStock'),
  price: t('admin.channel.kbdPrice'),
  batchStock: t('admin.channel.kbdBatchStock'),
}))
const keyboardLabel = computed(() =>
  keyboardField.value ? keyboardFieldLabels.value[keyboardField.value] : t('admin.common.inputContent')
)

const keyboardSanitize = computed(() => {
  if (keyboardField.value === 'price') return normalizePriceInput
  if (keyboardField.value === 'stock' || keyboardField.value === 'batchStock') {
    return (raw: string) => raw.replace(/[^\d]/g, '')
  }
  return undefined
})

const syncDraftToForm = (value: string) => {
  if (!keyboardField.value) return
  if (keyboardField.value === 'stock' || keyboardField.value === 'batchStock') {
    const next = clampStock(Math.floor(Number(value) || 0))
    if (keyboardField.value === 'stock') channelDetailForm.stock = next
    else batchStock.value = next
    // 超过上限时把键盘草稿一并钳制，避免显示与落库值不一致
    if (value !== '' && value !== String(next)) keyboardDraft.value = String(next)
    return
  }
  channelDetailForm.price = parsePriceNumber(value)
}

/** 价格输入规范：非负、仅数字与一个小数点、最多两位小数 */
const normalizePriceInput = (raw: string): string => {
  let s = raw.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
    const [intPart, decPart = ''] = s.split('.')
    s = `${intPart}.${decPart.slice(0, 2)}`
  }
  if (s.startsWith('.')) s = `0${s}`
  if (s.includes('.')) {
    const [intPart, decPart] = s.split('.')
    const normalizedInt = intPart.replace(/^0+(?=\d)/, '') || '0'
    s = `${normalizedInt}.${decPart}`
  } else if (s.length > 1) {
    s = s.replace(/^0+/, '') || '0'
  }
  return s
}

const parsePriceNumber = (value: string) => {
  if (!value || value === '.') return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

const formatPriceDisplay = (price: number) => {
  const n = Number.isFinite(price) ? Math.max(0, price) : 0
  return (Math.round(n * 100) / 100)
}

const onKeyboardDraftUpdate = (value: string) => {
  keyboardDraft.value = value
  syncDraftToForm(value)
}

/** 字段输入框直接粘贴：将剪贴板文本填入键盘草稿并同步到表单 */
const onFieldPaste = (text: string) => {
  onKeyboardDraftUpdate(text)
  keyboardReplaceAllPending.value = false
  nextTick(() => {
    requestAnimationFrame(() => {
      const input = keyboardInputRef.value
      if (input) input.select()
    })
  })
}

const openKeyboard = (
  field: ChannelKeyboardField,
  type: 'default' | 'numeric' | 'decimal' = 'numeric',
  focusEvent?: FocusEvent
) => {
  keyboardField.value = field
  keyboardType.value = type
  keyboardPos.x = 0
  keyboardPos.y = 0
  if (field === 'stock') keyboardDraft.value = String(channelDetailForm.stock ?? '')
  else if (field === 'price') keyboardDraft.value = formatPriceDisplay(channelDetailForm.price).toFixed(setting_options.value?.currency_decimal ?? 2)
  else keyboardDraft.value = String(batchStock.value ?? '')
  if (focusEvent) selectAllOnFocusTarget(focusEvent)
  keyboardVisible.value = true
  const len = keyboardDraft.value.length
  keyboardReplaceAllPending.value = len > 0
  nextTick(() => {
    requestAnimationFrame(() => {
      const input = keyboardInputRef.value
      if (input) {
        input.focus()
        input.select()
      }
    })
  })
}

const closeKeyboard = () => {
  if (keyboardField.value === 'price') {
    const normalized = normalizePriceInput(keyboardDraft.value)
    keyboardDraft.value = formatPriceDisplay(parsePriceNumber(normalized)).toFixed(setting_options.value?.currency_decimal ?? 2)
    channelDetailForm.price = parsePriceNumber(normalized)
  }
  keyboardVisible.value = false
  keyboardField.value = null
  keyboardReplaceAllPending.value = false
  isDragging.value = false
}

watch(channelDetailVisible, (visible) => {
  if (!visible) {
    closeKeyboard()
    closeChannelFilter()
  }
})
watch(batchDialogVisible, (visible) => {
  if (!visible) closeKeyboard()
})

/** 自建筛选下拉：WebView2 下 el-select 无法触摸滚动 */
type ChannelFilterKey = 'brand' | 'series' | 'model' | 'material'
const openChannelFilter = ref<ChannelFilterKey | null>(null)
const channelFilterScrollRef = ref<HTMLElement | null>(null)

let filterTouchMoveBound = false
let filterTouchStartY = 0
let filterTouchStartScrollTop = 0
let filterListScrolling = false
let filterTouchMoved = false

const brandFilterLabel = computed(() => {
  const id = channelDetailForm.brand_id
  if (!id) return ''
  const item = brands.value.find(b => b.brand_id === id)
  return item ? (displayName(item.lang_id) || item.brand_id) : id
})
const seriesFilterLabel = computed(() => {
  const id = channelDetailForm.series_id
  if (!id) return ''
  const item = seriesList.value.find(s => s.series_id === id)
  return item ? (displayName(item.lang_id) || item.series_id) : id
})
const modelFilterLabel = computed(() => {
  const id = channelDetailForm.model_id
  if (!id) return ''
  const item = modelList.value.find(m => m.model_id === id)
  return item ? (displayName(item.lang_id) || item.model_id) : id
})
const materialFilterLabel = computed(() => {
  const id = channelDetailForm.material_id
  if (!id) return ''
  const item = materialList.value.find(m => m.material_id === id)
  return item ? materialLabel(item) : id
})

const onFilterTouchMove = (e: TouchEvent) => {
  const el = channelFilterScrollRef.value
  if (!el || e.touches.length !== 1) return
  const y = e.touches[0].clientY
  const dy = y - filterTouchStartY
  if (!filterListScrolling && Math.abs(dy) > 4) {
    filterListScrolling = true
    filterTouchMoved = true
  }
  if (!filterListScrolling) return
  e.preventDefault()
  el.scrollTop = filterTouchStartScrollTop - dy
}

const onFilterTouchEnd = () => {
  if (!filterTouchMoveBound) return
  filterTouchMoveBound = false
  document.removeEventListener('touchmove', onFilterTouchMove)
  document.removeEventListener('touchend', onFilterTouchEnd)
  document.removeEventListener('touchcancel', onFilterTouchEnd)
  filterListScrolling = false
}

const onFilterTouchStart = (e: TouchEvent) => {
  const el = channelFilterScrollRef.value
  if (!el || e.touches.length !== 1) return
  filterTouchStartY = e.touches[0].clientY
  filterTouchStartScrollTop = el.scrollTop
  filterListScrolling = false
  filterTouchMoved = false
  if (!filterTouchMoveBound) {
    filterTouchMoveBound = true
    document.addEventListener('touchmove', onFilterTouchMove, { passive: false })
    document.addEventListener('touchend', onFilterTouchEnd)
    document.addEventListener('touchcancel', onFilterTouchEnd)
  }
}

const closeChannelFilter = () => {
  onFilterTouchEnd()
  openChannelFilter.value = null
}

const toggleChannelFilter = async (key: ChannelFilterKey) => {
  if (openChannelFilter.value === key) {
    closeChannelFilter()
    return
  }
  openChannelFilter.value = key
  await nextTick()
  const el = channelFilterScrollRef.value
  if (el) el.scrollTop = 0
}

const pickBrand = (id: string) => {
  if (filterTouchMoved) return
  channelDetailForm.brand_id = id
  closeChannelFilter()
}
const pickSeries = (id: string) => {
  if (filterTouchMoved) return
  channelDetailForm.series_id = id
  closeChannelFilter()
}
const pickModel = (id: string) => {
  if (filterTouchMoved) return
  channelDetailForm.model_id = id
  closeChannelFilter()
}
const pickMaterial = (id: string) => {
  if (filterTouchMoved) return
  channelDetailForm.material_id = id
  closeChannelFilter()
}
const clearBrand = () => {
  channelDetailForm.brand_id = ''
  closeChannelFilter()
}
const clearSeries = () => {
  channelDetailForm.series_id = ''
  closeChannelFilter()
}
const clearModel = () => {
  channelDetailForm.model_id = ''
  closeChannelFilter()
}
const clearMaterial = () => {
  channelDetailForm.material_id = ''
  closeChannelFilter()
}

const onVirtualKeyboardUpdate = (newVal: string) => {
  const input = keyboardInputRef.value
  if (!input) return
  const sel = {
    start: input.selectionStart ?? 0,
    end: input.selectionEnd ?? 0,
  }
  const oldVal = keyboardDraft.value
  const sanitize =
    keyboardField.value === 'price'
      ? normalizePriceInput
      : (raw: string) => raw.replace(/[^\d]/g, '')
  const { value, selection, consumedReplaceAll } = applyVirtualKeyboardModelUpdate(
    oldVal,
    newVal,
    sel,
    sanitize,
    { replaceAllPending: keyboardReplaceAllPending.value }
  )
  if (consumedReplaceAll) keyboardReplaceAllPending.value = false
  keyboardDraft.value = value
  syncDraftToForm(value)
  nextTick(() => {
    requestAnimationFrame(() => {
      input.setSelectionRange(selection.start, selection.end)
    })
  })
}

/** 物理键盘输入：原生输入框直接处理，此处仅做 sanitize 与表单同步 */
const onNativeInput = () => {
  const input = keyboardInputRef.value
  if (!input) return
  const raw = input.value
  const sanitize = keyboardSanitize.value
  keyboardReplaceAllPending.value = false
  if (!sanitize) {
    syncDraftToForm(raw)
    return
  }
  const sanitized = sanitize(raw)
  if (sanitized === raw) {
    syncDraftToForm(raw)
    return
  }
  const cursorPos = input.selectionStart ?? raw.length
  const beforeCursor = raw.slice(0, cursorPos)
  const newCursorPos = sanitize(beforeCursor).length
  keyboardDraft.value = sanitized
  nextTick(() => {
    input.setSelectionRange(newCursorPos, newCursorPos)
  })
  syncDraftToForm(sanitized)
}

/** 选区变化时：若不再是全选则清除 replaceAllPending */
const onNativeSelect = () => {
  if (!keyboardReplaceAllPending.value) return
  const input = keyboardInputRef.value
  if (!input) return
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  const len = keyboardDraft.value.length
  if (len > 0 && !(start === 0 && end === len)) {
    keyboardReplaceAllPending.value = false
  }
}
const onFeedbackClear = () => {
  keyboardDraft.value = ''
  keyboardReplaceAllPending.value = false
  syncDraftToForm('')
}

let dragStartX = 0
let dragStartY = 0
let dragOriginX = 0
let dragOriginY = 0
const getPoint = (e: MouseEvent | TouchEvent) =>
  ('touches' in e ? e.touches[0] || e.changedTouches[0] : e)
const onDragMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  e.preventDefault()
  const point = getPoint(e)
  keyboardPos.x = dragOriginX + (point.clientX - dragStartX)
  keyboardPos.y = dragOriginY + (point.clientY - dragStartY)
}
const onDragEnd = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
}
const onDragStart = (e: MouseEvent | TouchEvent) => {
  const point = getPoint(e)
  isDragging.value = true
  dragStartX = point.clientX
  dragStartY = point.clientY
  dragOriginX = keyboardPos.x
  dragOriginY = keyboardPos.y
  window.addEventListener('mousemove', onDragMove, { passive: false })
  window.addEventListener('mouseup', onDragEnd)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
}

const sortedStocks = computed(() =>
  [...stocks.value].sort((a, b) => a.slot - b.slot)
)

/** 货道布局来自 get_stock_tpl，不按库存列表推算 */
const gridRows = computed(() => Math.max(stock_tpl.value?.slot_rows || 0, 0))
const gridCols = computed(() => Math.max(stock_tpl.value?.slot_cols || 0, 0))
const totalChannels = computed(() => gridRows.value * gridCols.value)

const viewport = ref({
  w: typeof window !== 'undefined' ? window.innerWidth : 1080,
  h: typeof window !== 'undefined' ? window.innerHeight : 1920,
})
const isLandscape = computed(() => viewport.value.w > viewport.value.h)

const updateViewport = () => {
  viewport.value = { w: window.innerWidth, h: window.innerHeight }
}

/** 单货道库存上限，来自 get_stock_tpl.slot_volume */
const maxStock = computed(() => {
  const volume = stock_tpl.value?.slot_volume
  return typeof volume === 'number' && volume > 0 ? volume : undefined
})

const channelWidth = computed(() => {
  const cols = gridCols.value || 1
  const containerWidth = viewport.value.w - (isLandscape.value ? 96 : 160)
  const gap = 6
  const widthPerChannel = (containerWidth - (cols - 1) * gap) / cols
  const maxW = isLandscape.value ? 176 : 210
  const minW = isLandscape.value ? 96 : 130
  return Math.min(maxW, Math.max(minW, widthPerChannel))
})

let stockInfoUnlisten: UnlistenFn | null = null
let stockScanUnlisten: UnlistenFn | null = null
let cascading = false

const displayName = (langId: string) => {
  if (!langId) return ''
  const name = t(langId)
  return name === langId ? langId : name
}

const getChannelTitle = (stock: StockItem) => {
  if (!stock.material_id) return ''
  if (stock.model_lang_id) return displayName(stock.model_lang_id)
  return stock.material_id
}

const isOccupied = (stock: StockItem) => !!stock.material_id && !stock.disabled

const getScanState = (slot: number) => scanStates.value[slot]

const clearRecognitionState = () => {
  scanStates.value = {}
  currentScanningSlot.value = null
}

/** 根据后端进度同步识别 UI：每次只展示一个正在识别的货道 */
const syncScanStates = (latest: StockItem[], scanning: boolean) => {
  const next: Record<number, ScanUiState> = { ...scanStates.value }

  const finalizeSlot = (item: StockItem, prev?: ScanUiState) => {
    const snapshotNum = preScanSnapshot?.find(s => s.slot === item.slot)?.count
    const title = getChannelTitle(item)
    if (item.material_id) {
      next[item.slot] = {
        status: 'success',
        model: title || item.material_id,
        quantity: item.count,
        originalNum: prev?.originalNum ?? snapshotNum,
      }
    } else {
      next[item.slot] = {
        status: 'error',
        model: t('admin.channel.unrecognized'),
        quantity: '-',
        originalNum: prev?.originalNum ?? snapshotNum,
      }
    }
  }

  if (!scanning) {
    currentScanningSlot.value = null
    for (const item of latest) {
      const prev = next[item.slot]
      if (prev?.status === 'scanning') {
        finalizeSlot(item, prev)
      }
    }
    scanStates.value = next
    return
  }

  const scanningSlots = latest
    .filter(s => s.scanning)
    .map(s => s.slot)
    .sort((a, b) => a - b)
  // 每次只识别一个：取当前 scanning 中序号最小的货道
  const activeSlot = scanningSlots[0] ?? null
  currentScanningSlot.value = activeSlot

  for (const item of latest) {
    const prev = next[item.slot]
    const snapshotNum = preScanSnapshot?.find(s => s.slot === item.slot)?.count

    if (activeSlot !== null && item.slot === activeSlot) {
      next[item.slot] = {
        status: 'scanning',
        originalNum: prev?.originalNum ?? snapshotNum ?? item.count,
      }
      continue
    }

    // 从 scanning 变为完成 → 写入本次识别结果
    if (prev?.status === 'scanning' && !item.scanning) {
      finalizeSlot(item, prev)
    }
  }

  // 非当前货道即使后端仍标 scanning，也不展示转圈
  for (const slot of scanningSlots) {
    if (slot !== activeSlot && next[slot]?.status === 'scanning') {
      delete next[slot]
    }
  }

  scanStates.value = next
}

const loadStocks = async () => {
  try {
    const latest = await get_stock_list()
    let scanning = await get_stock_scanning()

    if (forceScanStopped) {
      if (!scanning) {
        forceScanStopped = false
        preScanSnapshot = null
        isScanning.value = false
        clearRecognitionState()
        stocks.value = latest.map(s => ({ ...s, scanning: false }))
      } else {
        // 停止过程中：保持识别前快照，并清空识别 UI
        isScanning.value = false
        clearRecognitionState()
        stocks.value = (preScanSnapshot ?? latest).map(s => ({ ...s, scanning: false }))
      }
    } else {
      isScanning.value = scanning
      stocks.value = scanning
        ? latest
        : latest.map(s => (s.scanning ? { ...s, scanning: false } : s))
      syncScanStates(stocks.value, scanning)
    }
  } catch (error) {
    logWarn('channel', `loadStocks failed: ${error}`)
    ElMessage.error(t('admin.channel.loadFailed'))
  }
}

const loadBrands = async () => {
  try {
    brands.value = await get_brand_list()
  } catch (error) {
    logWarn('channel', `loadBrands failed: ${error}`)
    brands.value = []
  }
}

const loadSeries = async (brandId: string) => {
  if (!brandId) {
    seriesList.value = []
    return
  }
  try {
    seriesList.value = await get_series_list(brandId)
  } catch (error) {
    logWarn('channel', `loadSeries failed: ${error}`)
    seriesList.value = []
  }
}

const loadModels = async (seriesId: string) => {
  if (!seriesId) {
    modelList.value = []
    materialList.value = []
    return
  }
  try {
    modelList.value = await get_model_list(seriesId)
  } catch (error) {
    logWarn('channel', `loadModels failed: ${error}`)
    modelList.value = []
  }
}

const syncMaterialsFromModel = (modelId: string) => {
  const model = modelList.value.find(m => m.model_id === modelId)
  // 找不到模型直接置空数组
  if (!model || !model.materials) {
    materialList.value = []
    return
  }

  materialList.value = model.materials
    .split(',')
    .map(id => id.trim()) // 清除前后空格
    .filter(material_id => !!material_id) // 过滤空字符串、空白项
    .map((material_id) => ({
      material_id: material_id,
      goods_id: 0,
      slot: 0,
      price: 0.0,
      count: 0,
    }))
}

/** 保证当前材质出现在下拉选项中，否则 el-select 无法显示已选值 */
const ensureMaterialOption = (materialId: string) => {
  if (!materialId) return
  if (materialList.value.some(m => m.material_id === materialId)) return
  materialList.value = [
    ...materialList.value,
    {
      material_id: materialId,
      goods_id: 0,
      slot: 0,
      price: 0,
      count: 0,
    },
  ]
}

watch(
  () => channelDetailForm.brand_id,
  async (brandId) => {
    if (cascading) return
    channelDetailForm.series_id = ''
    channelDetailForm.model_id = ''
    channelDetailForm.material_id = ''
    materialList.value = []
    modelList.value = []
    await loadSeries(brandId)
  }
)

watch(
  () => channelDetailForm.series_id,
  async (seriesId) => {
    if (cascading) return
    channelDetailForm.model_id = ''
    channelDetailForm.material_id = ''
    materialList.value = []
    await loadModels(seriesId)
  }
)

watch(
  () => channelDetailForm.model_id,
  (modelId) => {
    if (cascading) return
    channelDetailForm.material_id = ''
    syncMaterialsFromModel(modelId)
  }
)

watch(
  () => channelDetailForm.material_id,
  (materialId) => {
    if (cascading || !materialId) return
    const material = materialList.value.find(m => m.material_id === materialId)
    if (material && material.price > 0) {
      channelDetailForm.price = material.price
    }
  }
)

const selectChannel = async (slot: number) => {
  currentSlot.value = slot
  const stock = stocks.value.find(s => s.slot === slot)
  if (!stock) return

  cascading = true
  channelDetailForm.brand_id = ''
  channelDetailForm.series_id = ''
  channelDetailForm.model_id = ''
  channelDetailForm.material_id = ''
  channelDetailForm.stock = stock.count || 0
  channelDetailForm.price = stock.price || 0
  channelDetailForm.disabled = stock.disabled
  seriesList.value = []
  modelList.value = []
  materialList.value = []

  channelDetailVisible.value = true

  try {
    if (!stock.material_id && !stock.model_id) return

    // 优先用货道已关联的型号，避免仅按材质模糊匹配导致材质选项对不上
    const model = stock.model_id
      ? await get_model_by_id(stock.model_id)
      : stock.material_id
        ? await get_model_by_material(stock.material_id)
        : null

    if (model) {
      channelDetailForm.brand_id = model.brand_id
      await loadSeries(model.brand_id)
      channelDetailForm.series_id = model.series_id
      await loadModels(model.series_id)
      channelDetailForm.model_id = model.model_id
      syncMaterialsFromModel(model.model_id)
    }

    if (stock.material_id) {
      ensureMaterialOption(stock.material_id)
      // 等下拉选项渲染后再赋值，确保默认选中当前材质
      await nextTick()
      channelDetailForm.material_id = stock.material_id
    }
  } catch (error) {
    logWarn('channel', `selectChannel failed: ${error}`)
  } finally {
    await nextTick()
    cascading = false
  }
}

const clampStock = (count: number) => {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  return maxStock.value != null ? Math.min(n, maxStock.value) : n
}

const saveChannelConfig = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const materialId = channelDetailForm.material_id || ''
    const stock = clampStock(channelDetailForm.stock)
    channelDetailForm.stock = stock
    await update_slot_item(
      currentSlot.value,
      materialId,
      parsePriceNumber(String(channelDetailForm.price)),
      stock,
      !!channelDetailForm.disabled
    )
    channelDetailVisible.value = false
    ElMessage.success(t('admin.channel.configSaved'))
  } catch (error) {
    logWarn('channel', `saveChannelConfig failed: ${error}`)
    ElMessage.error(t('admin.channel.configSaveFailed'))
  } finally {
    saving.value = false
  }
}

const clearChannel = async () => {
  if (saving.value) return
  saving.value = true
  try {
    await update_slot_item(currentSlot.value, '', 0, 0, false)
    cascading = true
    channelDetailForm.brand_id = ''
    channelDetailForm.series_id = ''
    channelDetailForm.model_id = ''
    channelDetailForm.material_id = ''
    channelDetailForm.stock = 0
    channelDetailForm.price = 0
    channelDetailForm.disabled = false
    seriesList.value = []
    modelList.value = []
    materialList.value = []
    cascading = false
    channelDetailVisible.value = false
    ElMessage.success(t('admin.channel.cleared'))
  } catch (error) {
    logWarn('channel', `clearChannel failed: ${error}`)
    ElMessage.error(t('admin.channel.clearFailed'))
  } finally {
    saving.value = false
  }
}

const handleBatchAdjust = () => {
  batchStock.value = 0
  batchDialogVisible.value = true
}

const confirmBatchAdjust = async () => {
  saving.value = true
  try {
    const stock = clampStock(batchStock.value)
    batchStock.value = stock
    await update_slot_count_all(stock)
    batchDialogVisible.value = false
  } catch (error) {
    logWarn('channel', `confirmBatchAdjust failed: ${error}`)
    ElMessage.error(t('admin.channel.batchFailed'))
  } finally {
    saving.value = false
  }
}

const startScan = async () => {
  if (isScanning.value) return
  try {
    forceScanStopped = false
    // 新开识别前清空上一次识别态，并快照当前货道
    clearRecognitionState()
    preScanSnapshot = stocks.value.map(s => ({ ...s, scanning: false }))
    await start_scan_stock()
    isScanning.value = true
    ElMessage.info(t('admin.channel.scanStarted'))
  } catch (error) {
    preScanSnapshot = null
    logWarn('channel', `startScan failed: ${error}`)
    ElMessage.error(t('admin.channel.scanStartFailed'))
  }
}

const stopScan = async () => {
  try {
    forceScanStopped = true
    await cancel_scan_stock()
    isScanning.value = false
    // 清空本次识别状态，恢复识别前展示
    clearRecognitionState()
    if (preScanSnapshot) {
      stocks.value = preScanSnapshot.map(s => ({ ...s, scanning: false }))
    } else {
      stocks.value = stocks.value.map(s => ({ ...s, scanning: false }))
    }
    ElMessage.info(t('admin.channel.scanStopped'))
  } catch (error) {
    forceScanStopped = false
    logWarn('channel', `stopScan failed: ${error}`)
    ElMessage.error(t('admin.channel.scanStopFailed'))
  }
}

const materialLabel = (material: PcMaterialItem) => {
  const suffix = getMaterialKindLabel(material.material_id)
  const name = material.material_id
  return suffix ? `${name}（${suffix}）` : name
}

/** A=非磁吸，B=磁吸 */
const getMaterialKind = (materialId?: string): 'magnetic' | 'non-magnetic' | null => {
  if (!materialId) return null
  if (/B$/i.test(materialId)) return 'magnetic'
  if (/A$/i.test(materialId)) return 'non-magnetic'
  return null
}

const getMaterialKindLabel = (materialId?: string) => {
  const kind = getMaterialKind(materialId)
  if (kind === 'magnetic') return t('admin.channel.magnetic')
  if (kind === 'non-magnetic') return t('admin.channel.nonMagnetic')
  return ''
}

const getMaterialKindIcon = (materialId?: string) => {
  const kind = getMaterialKind(materialId)
  if (kind === 'magnetic') return magneticIcon
  if (kind === 'non-magnetic') return nonMagneticIcon
  return ''
}

const loadTpl = async () => {
  stock_tpl.value = await get_stock_tpl()
}

const setting_options = ref<SettingOptions | null>(null);

onMounted(async () => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  stockInfoUnlisten = await listen<StockInfoChanged>(StockEvent.STOCK_INFO_CHANGED, async () => {
    await loadTpl()
    await loadStocks()
  })
  stockScanUnlisten = await listen(StockEvent.STOCK_SCAN_STATUS, async () => {
    if (forceScanStopped) {
      isScanning.value = false
      clearRecognitionState()
      return
    }
    const wasScanning = isScanning.value
    if (wasScanning && !isScanning.value) {
      ElMessage.success(t('admin.channel.scanCompleted'))
    }
  })
  setting_options.value = await get_setting_options();
  await Promise.all([loadTpl(), loadStocks(), loadBrands()])
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewport)
  closeKeyboard()
  onDragEnd()
  closeChannelFilter()
  stockInfoUnlisten?.()
  stockScanUnlisten?.()
})



</script>

<template>
  <div class="flex flex-col h-full">
    <div class="channel-toolbar mb-15 flex justify-between items-center">
      <div class="flex items-center gap-16 bg-white rounded-12 px-20 py-16 shadow-md w-full flex-wrap">
        <h2 class="text-24 font-bold text-gray-800">{{ t('admin.channel.title') }}</h2>
        <button
          class="px-24 py-10 bg-blue-500 text-white text-14 rounded-6 hover:bg-blue-600 transition-colors disabled:opacity-50"
          :disabled="isScanning || saving" @click="handleBatchAdjust">
          {{ t('admin.channel.batchAdjust') }}
        </button>
        <!-- <button
          class="px-28 py-12 bg-gradient-to-r from-green-500 to-green-600 text-white text-15 font-medium rounded-8 hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          :disabled="isScanning" @click="startScan">
          {{ isScanning ? t('admin.channel.scanning') : t('admin.channel.visionScan') }}
        </button>
        <button v-if="isScanning"
          class="px-24 py-10 bg-red-500 text-white text-14 rounded-6 hover:bg-red-600 transition-colors"
          @click="stopScan">
          {{ t('admin.channel.stopScan') }}
        </button> -->

        <span class="text-14 text-gray-500">
          {{ t('admin.channel.currentConfig', { rows: gridRows, cols: gridCols, total: totalChannels }) }}
        </span>
      </div>
    </div>

    <div class="bg-white rounded-12 p-12 shadow-md flex-1 overflow-auto">
      <div v-if="!sortedStocks.length" class="h-full min-h-200 flex items-center justify-center text-gray-400 text-16">
        {{ t('admin.channel.noData') }}
      </div>
      <div v-else class="grid gap-6" :style="{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }">
        <div v-for="channel in sortedStocks" :key="channel.slot"
          class="channel-grid-cell relative bg-gray-50 rounded-8 p-1 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-all duration-200 border-2 min-h-120 max-h-200 overflow-hidden"
          :class="{
            'border-green-500': getScanState(channel.slot)?.status === 'success',
            'border-red-500': getScanState(channel.slot)?.status === 'error',
            'border-orange-400': channel.disabled && !getScanState(channel.slot),
            'border-dashed border-[#e0e0e0]': !getScanState(channel.slot) && !channel.disabled && !isOccupied(channel),
            'border-gray-200': !getScanState(channel.slot) && isOccupied(channel) && !channel.disabled,
          }" :style="{ fontSize: `${Math.min(14, Math.max(10, (channelWidth / 210) * 14))}px` }"
          @click="selectChannel(channel.slot)">
          <span class="absolute top-4 left-6 z-1 text-gray-700 font-medium"
            :style="{ fontSize: `${Math.min(18, Math.max(11, (channelWidth / 210) * 18))}px` }">
            {{ channel.slot }}
          </span>
          <span v-if="channel.disabled" class="absolute top-4 right-6 z-1 text-orange-500 text-12">
            {{ t('admin.channel.disabled') }}
          </span>

          <template v-if="getScanState(channel.slot)?.status === 'success'">
            <div class="relative z-1 text-center px-2 w-full flex flex-col items-center">
              <span class="channel-title text-green-600 font-bold w-full"
                :style="{ fontSize: `${Math.min(14, Math.max(10, (channelWidth / 210) * 14))}px` }">
                {{ getScanState(channel.slot)?.model }}
              </span>
              <div class="text-green-500 mt-2"
                :style="{ fontSize: `${Math.min(12, Math.max(8, (channelWidth / 210) * 12))}px` }">
                {{ t('admin.channel.scanQuantity') }}: {{ getScanState(channel.slot)?.quantity }}
              </div>
              <div v-if="getScanState(channel.slot)?.originalNum !== undefined" class="text-gray-400 mt-2"
                :style="{ fontSize: `${Math.min(10, Math.max(8, (channelWidth / 210) * 10))}px` }">
                {{ t('admin.channel.originalStock') }}: {{ getScanState(channel.slot)?.originalNum }}
              </div>
            </div>
          </template>
          <template v-else-if="getScanState(channel.slot)?.status === 'error'">
            <div class="relative z-1 text-center px-2 w-full">
              <span class="channel-title text-red-500 font-bold"
                :style="{ fontSize: `${Math.min(14, Math.max(10, (channelWidth / 210) * 14))}px` }">
                {{ getScanState(channel.slot)?.model }}
              </span>
              <div class="text-red-400 mt-2"
                :style="{ fontSize: `${Math.min(12, Math.max(8, (channelWidth / 210) * 12))}px` }">
                {{ t('admin.channel.quantity') }}: {{ getScanState(channel.slot)?.quantity }}
              </div>
            </div>
          </template>
          <template v-else-if="!channel.material_id">
            <img src="../../static/emptyPackage.png" :alt="t('admin.channel.idleAlt')"
              class="relative z-1 object-contain mb-4"
              :style="{ width: `${channelWidth * 0.42}px`, height: `${channelWidth * 0.42}px` }" />
            <span class="relative z-1 text-gray-500"
              :style="{ fontSize: `${Math.min(22, Math.max(13, (channelWidth / 210) * 22))}px` }">
              {{ t('admin.channel.idle') }}
            </span>
          </template>
          <template v-else>
            <div class="relative z-1 text-center px-2 w-full flex flex-col items-center">
              <span class="channel-title text-gray-700 font-medium w-full"
                :style="{ fontSize: `${Math.min(15, Math.max(10, (channelWidth / 210) * 15))}px` }">
                {{ getChannelTitle(channel) }}
              </span>
              <div v-if="getMaterialKindLabel(channel.material_id)" class="text-gray-500 mt-2"
                :style="{ fontSize: `${Math.min(12, Math.max(8, (channelWidth / 210) * 12))}px` }">
                {{ getMaterialKindLabel(channel.material_id) }}
              </div>
              <div class="text-gray-500 mt-2"
                :style="{ fontSize: `${Math.min(13, Math.max(10, (channelWidth / 210) * 13))}px` }">
                {{ t('admin.channel.stock') }}: {{ channel.count }}
              </div>
              <div class="text-gray-400 mt-1"
                :style="{ fontSize: `${Math.min(12, Math.max(8, (channelWidth / 210) * 12))}px` }">
                ¥{{ channel.price }}
              </div>
            </div>
          </template>

          <!-- 每次只对当前识别货道转圈 -->
          <div v-if="isScanning && currentScanningSlot === channel.slot"
            class="absolute inset-0 z-2 bg-black/50 rounded-8 flex items-center justify-center">
            <div class="scan-spinner"></div>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="channelDetailVisible" :title="t('admin.channel.dialogTitle', { slot: currentSlot })"
      width="550px" align-center append-to-body :close-on-click-modal="false" class="channel-detail-dialog"
      style="border-radius: 16px;">
      <div class="space-y-24 pb-16">
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.filterBrand') }}</label>
          <div class="channel-filter relative">
            <button type="button" class="channel-filter-trigger" :class="{ 'is-open': openChannelFilter === 'brand' }"
              @click="toggleChannelFilter('brand')">
              <span :class="brandFilterLabel ? 'text-gray-800' : 'text-gray-400'">
                {{ brandFilterLabel || t('admin.channel.selectBrand') }}
              </span>
              <span class="channel-filter-arrow">▾</span>
            </button>
            <button v-if="channelDetailForm.brand_id" type="button" class="channel-filter-clear"
              @click.stop="clearBrand">×</button>
            <div v-if="openChannelFilter === 'brand'" class="channel-filter-panel">
              <div ref="channelFilterScrollRef" class="channel-filter-scroll" @touchstart.passive="onFilterTouchStart">
                <button type="button" v-for="item in brands" :key="item.brand_id" class="channel-filter-option"
                  :class="{ 'is-active': item.brand_id === channelDetailForm.brand_id }"
                  @click="pickBrand(item.brand_id)">
                  {{ displayName(item.lang_id) || item.brand_id }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.filterSeries') }}</label>
          <div class="channel-filter relative">
            <button type="button" class="channel-filter-trigger" :class="{ 'is-open': openChannelFilter === 'series' }"
              :disabled="!channelDetailForm.brand_id" @click="toggleChannelFilter('series')">
              <span :class="seriesFilterLabel ? 'text-gray-800' : 'text-gray-400'">
                {{ seriesFilterLabel || t('admin.channel.selectSeries') }}
              </span>
              <span class="channel-filter-arrow">▾</span>
            </button>
            <button v-if="channelDetailForm.series_id" type="button" class="channel-filter-clear"
              @click.stop="clearSeries">×</button>
            <div v-if="openChannelFilter === 'series'" class="channel-filter-panel">
              <div ref="channelFilterScrollRef" class="channel-filter-scroll" @touchstart.passive="onFilterTouchStart">
                <button type="button" v-for="item in seriesList" :key="item.series_id" class="channel-filter-option"
                  :class="{ 'is-active': item.series_id === channelDetailForm.series_id }"
                  @click="pickSeries(item.series_id)">
                  {{ displayName(item.lang_id) || item.series_id }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.filterModel') }}</label>
          <div class="channel-filter relative">
            <button type="button" class="channel-filter-trigger" :class="{ 'is-open': openChannelFilter === 'model' }"
              :disabled="!channelDetailForm.series_id" @click="toggleChannelFilter('model')">
              <span :class="modelFilterLabel ? 'text-gray-800' : 'text-gray-400'">
                {{ modelFilterLabel || t('admin.channel.selectModel') }}
              </span>
              <span class="channel-filter-arrow">▾</span>
            </button>
            <button v-if="channelDetailForm.model_id" type="button" class="channel-filter-clear"
              @click.stop="clearModel">×</button>
            <div v-if="openChannelFilter === 'model'" class="channel-filter-panel">
              <div ref="channelFilterScrollRef" class="channel-filter-scroll" @touchstart.passive="onFilterTouchStart">
                <button type="button" v-for="item in modelList" :key="item.model_id" class="channel-filter-option"
                  :class="{ 'is-active': item.model_id === channelDetailForm.model_id }"
                  @click="pickModel(item.model_id)">
                  {{ displayName(item.lang_id) || item.model_id }}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.bindMaterial') }}</label>
          <div class="channel-filter relative">
            <button type="button" class="channel-filter-trigger"
              :class="{ 'is-open': openChannelFilter === 'material' }" :disabled="!channelDetailForm.model_id"
              @click="toggleChannelFilter('material')">
              <span :class="materialFilterLabel ? 'text-gray-800' : 'text-gray-400'">
                {{ materialFilterLabel || t('admin.channel.selectMaterial') }}
              </span>
              <span class="channel-filter-arrow">▾</span>
            </button>
            <button v-if="channelDetailForm.material_id" type="button" class="channel-filter-clear"
              @click.stop="clearMaterial">×</button>
            <div v-if="openChannelFilter === 'material'" class="channel-filter-panel">
              <div ref="channelFilterScrollRef" class="channel-filter-scroll" @touchstart.passive="onFilterTouchStart">
                <button type="button" v-for="item in materialList" :key="item.material_id" class="channel-filter-option"
                  :class="{ 'is-active': item.material_id === channelDetailForm.material_id }"
                  @click="pickMaterial(item.material_id)">
                  <span class="inline-flex items-center gap-10">
                    <img v-if="getMaterialKindIcon(item.material_id)" :src="getMaterialKindIcon(item.material_id)"
                      :alt="getMaterialKindLabel(item.material_id)" class="w-24 h-24 object-contain shrink-0" />
                    <span>{{ materialLabel(item) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.stockQuantity') }}</label>
          <AdminKeyboardFieldInput :model-value="String(channelDetailForm.stock)"
            :placeholder="t('admin.channel.enterStock')" @focus="openKeyboard('stock', 'numeric', $event)"
            @paste="onFieldPaste" />
          <p v-if="maxStock" class="mt-8 text-12 text-gray-400">{{ t('admin.channel.slotMax', { max: maxStock }) }}</p>
        </div>
        <div>
          <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.channelPrice') }}</label>
          <AdminKeyboardFieldInput
            :model-value="formatPriceDisplay(channelDetailForm.price).toFixed(setting_options?.currency_decimal ?? 2)"
            :placeholder="t('admin.channel.enterPrice')" @focus="openKeyboard('price', 'decimal', $event)"
            @paste="onFieldPaste" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-16 text-gray-700">{{ t('admin.channel.disableChannel') }}</label>
          <el-switch v-model="channelDetailForm.disabled" />
        </div>
      </div>

      <template #footer>
        <div class="pt-24 border-t border-gray-200">
          <div class="flex justify-end gap-16">
            <button
              class="px-32 py-12 bg-green-500 text-white text-16 rounded-10 hover:bg-green-600 transition-colors disabled:opacity-50"
              :disabled="saving" @click="saveChannelConfig">
              {{ t('admin.channel.saveConfig') }}
            </button>
            <button
              class="px-32 py-12 bg-yellow-500 text-white text-16 rounded-10 hover:bg-yellow-600 transition-colors disabled:opacity-50"
              :disabled="saving" @click="clearChannel">
              {{ t('admin.channel.clearChannel') }}
            </button>
            <button class="px-32 py-12 bg-gray-200 text-gray-700 text-16 rounded-10 hover:bg-gray-300 transition-colors"
              @click="channelDetailVisible = false">
              {{ t('admin.common.cancel') }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="batchDialogVisible" :title="t('admin.channel.batchTitle')" width="420px"
      :close-on-click-modal="false" style="border-radius: 16px;">
      <div class="px-8">
        <p class="text-14 text-gray-500 mb-16">{{ t('admin.channel.batchHint') }}</p>
        <label class="block text-16 text-gray-700 mb-12">{{ t('admin.channel.targetStock') }}</label>
        <AdminKeyboardFieldInput :model-value="String(batchStock)" :placeholder="t('admin.channel.enterTargetStock')"
          @focus="openKeyboard('batchStock', 'numeric', $event)" @paste="onFieldPaste" />
        <p v-if="maxStock" class="mt-8 text-12 text-gray-400">{{ t('admin.channel.slotMax', { max: maxStock }) }}</p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-16">
          <button class="px-32 py-12 bg-gray-200 text-gray-700 text-16 rounded-10 hover:bg-gray-300 transition-colors"
            @click="batchDialogVisible = false">
            {{ t('admin.common.cancel') }}
          </button>
          <button
            class="px-32 py-12 bg-blue-500 text-white text-16 rounded-10 hover:bg-blue-600 transition-colors disabled:opacity-50"
            :disabled="saving" @click="confirmBatchAdjust">
            {{ t('admin.common.confirm') }}
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 虚拟键盘：Teleport 到 body，避免被 append-to-body 的弹窗盖住 -->
    <Teleport to="body">
      <div v-if="keyboardVisible" class="keyboard-overlay">
        <div class="keyboard-panel" :style="{ transform: `translate(${keyboardPos.x}px, ${keyboardPos.y}px)` }"
          @mousedown.stop @click.stop>
          <AdminKeyboardDragBar @close="closeKeyboard" @drag-start="onDragStart" />
          <div class="keyboard-preview">
            <input ref="keyboardInputRef" v-model="keyboardDraft" class="keyboard-input" type="text" inputmode="none"
              :placeholder="t('admin.common.pleaseEnterField', { field: keyboardLabel })" @input="onNativeInput"
              @select="onNativeSelect" @keydown.enter="closeKeyboard" />
            <button v-if="keyboardDraft" type="button" class="keyboard-clear-btn" @click="onFeedbackClear">×</button>
          </div>
          <div class="keyboard-body" :class="{ 'is-numeric': keyboardType !== 'default' }">
            <Keyboard :model-value="keyboardDraft" :type="keyboardType" english-only :candidate-bar="false"
              @update:model-value="onVirtualKeyboardUpdate" @confirm="closeKeyboard" @close="closeKeyboard" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
@import '../../styles/admin-landscape.css';

.keyboard-preview {
  position: relative;
  margin-bottom: 12px;
}

.keyboard-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  padding: 1px 48px 1px 11px;
  font-size: 18px;
  line-height: 46px;
  color: #303133;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  outline: none;
  cursor: text;
  caret-color: #027bfc;
  -webkit-user-select: text;
  user-select: text;
}

.keyboard-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff inset;
}

.keyboard-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 16px;
  color: #909399;
  background: #f0f2f5;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.keyboard-clear-btn:hover {
  color: #606266;
  background: #e4e7ed;
}

.channel-filter-trigger {
  width: 100%;
  min-height: 44px;
  padding: 10px 40px 10px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  font-size: 16px;
  line-height: 1.4;
  position: relative;
}

.channel-filter-trigger:disabled {
  background: #f5f7fa;
  color: #c0c4cc;
  cursor: not-allowed;
}

.channel-filter-trigger.is-open {
  border-color: #409eff;
}

.channel-filter-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #a8abb2;
  pointer-events: none;
}

.channel-filter-clear {
  position: absolute;
  right: 36px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  color: #909399;
  background: #f0f2f5;
  z-index: 2;
}

.channel-filter-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 30;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.channel-filter-scroll {
  max-height: 274px;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: none;
  padding: 6px 0;
}

.channel-filter-option {
  display: block;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  font-size: 16px;
  color: #606266;
  background: transparent;
}

.channel-filter-option.is-active,
.channel-filter-option:active {
  color: #409eff;
  background: #f5f7fa;
}

.channel-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.scan-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: scan-spin 1s linear infinite;
}

@keyframes scan-spin {
  to {
    transform: rotate(360deg);
  }
}

.keyboard-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
  pointer-events: none;
}

.keyboard-panel {
  position: absolute;
  left: 50%;
  bottom: 24px;
  width: min(1100px, calc(100% - 48px));
  margin-left: calc(min(1100px, calc(100% - 48px)) / -2);
  background: #f4f4f3;
  border-radius: 16px;
  padding: 0 20px 24px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
  user-select: none;
  pointer-events: auto;
}

.keyboard-drag-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0 12px;
  cursor: grab;
  touch-action: none;
}

.keyboard-drag-bar:active {
  cursor: grabbing;
}

.drag-hint {
  font-size: 13px;
  color: #9ca3af;
}

.keyboard-body {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
}

.keyboard-body.is-numeric {
  padding: 12px 16px 8px;
  min-height: 0;
}

.keyboard-body.is-numeric :deep(.h-full) {
  height: auto !important;
  flex: none !important;
}

.keyboard-body.is-numeric :deep(.flex-1) {
  flex: none !important;
}
</style>
