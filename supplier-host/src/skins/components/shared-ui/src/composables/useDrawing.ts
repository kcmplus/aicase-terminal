import { ref, type Ref, watchEffect, watch } from 'vue';
import type { DrawPoint, DrawingMode } from '../types/drawing';

export interface UseDrawingOptions {
  canvasRef: Ref<HTMLCanvasElement | null>;
  mode: Ref<DrawingMode>;
  brushColor: Ref<string>;
  brushSize: Ref<number>;
  maxHistory?: number;
}

export interface UseDrawingReturn {
  historyIndex: Readonly<Ref<number>>;
  historyLength: Readonly<Ref<number>>;
  canUndo: Readonly<Ref<boolean>>;
  canRedo: Readonly<Ref<boolean>>;
  undo: () => boolean;
  redo: () => boolean;
  clear: () => void;
  initCanvas: (backgroundColor: string) => void;
  initTransparent: () => void;
  floodFill: (startX: number, startY: number, fillColor: string) => void;
  saveHistory: () => void;
  isEmpty: () => boolean;
  onHistoryChange: (callback: () => void) => void;
  markInitialized: () => void;

  handleMouseDown: (e: MouseEvent) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
  handleTouchEnd: (e: TouchEvent) => void;
}

const SAMPLE_DISTANCE_THRESHOLD = 2;

const getDistance = (p1: DrawPoint, p2: DrawPoint): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export function useDrawing(options: UseDrawingOptions): UseDrawingReturn {
  const { canvasRef, mode, brushColor, brushSize, maxHistory = 30 } = options;

  // 非响应式上下文与历史，避免 ImageData/Canvas 进入 Vue 代理
  let ctx: CanvasRenderingContext2D | null = null;
  const historyStack: HTMLCanvasElement[] = [];
  let historyIndexRaw = -1;
  const historyIndex = ref(-1);
  const historyLength = ref(0);
  const canUndo = ref(false);
  const canRedo = ref(false);

  let isInitialized = false;
  let historyChangeCallbacks: (() => void)[] = [];
  let knownEmpty = true;

  const onHistoryChange = (callback: () => void) => {
    historyChangeCallbacks.push(callback);
  };

  const triggerHistoryChange = () => {
    if (!isInitialized) return;
    historyChangeCallbacks.forEach(cb => cb());
  };

  const markInitialized = () => {
    isInitialized = true;
  };

  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;
  let bgOffscreenCanvas: HTMLCanvasElement | null = null;
  let bgOffscreenCtx: CanvasRenderingContext2D | null = null;

  let isDrawing = false;
  let lastPoint: DrawPoint | null = null;
  let lastRenderedPoint: DrawPoint | null = null;
  let prevMidPoint: DrawPoint | null = null;

  // 缓存画布坐标变换，避免每次 move 触发 layout
  let cachedRect: DOMRect | null = null;
  let scaleX = 1;
  let scaleY = 1;

  let rafId: number | null = null;
  let pendingRender = false;

  let cachedSolidColor = '';
  let cachedAlpha = 1;
  let cachedBrushColor = '';
  let cachedLineCap: CanvasLineCap = 'round';
  let cachedLineJoin: CanvasLineJoin = 'round';
  let cachedCompositeOperation: GlobalCompositeOperation = 'source-over';

  const updateColorCache = () => {
    if (brushColor.value === cachedBrushColor) return;
    cachedBrushColor = brushColor.value;
    const rgbaMatch = brushColor.value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (rgbaMatch) {
      cachedSolidColor = `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
      cachedAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
    } else {
      cachedSolidColor = brushColor.value;
      cachedAlpha = 1;
    }
  };

  const setupDrawStyles = (context: CanvasRenderingContext2D) => {
    updateColorCache();
    if (context.lineCap !== cachedLineCap) context.lineCap = cachedLineCap;
    if (context.lineJoin !== cachedLineJoin) context.lineJoin = cachedLineJoin;
    if (context.globalCompositeOperation !== cachedCompositeOperation) {
      context.globalCompositeOperation = cachedCompositeOperation;
    }
    if (context.strokeStyle !== cachedSolidColor) context.strokeStyle = cachedSolidColor;
    if (context.lineWidth !== brushSize.value) context.lineWidth = brushSize.value;
    if (context.fillStyle !== cachedSolidColor) context.fillStyle = cachedSolidColor;
  };

  const setupEraseStyles = (context: CanvasRenderingContext2D) => {
    if (context.lineCap !== cachedLineCap) context.lineCap = cachedLineCap;
    if (context.lineJoin !== cachedLineJoin) context.lineJoin = cachedLineJoin;
    if (context.globalCompositeOperation !== 'destination-out') {
      context.globalCompositeOperation = 'destination-out';
    }
    if (context.lineWidth !== brushSize.value) context.lineWidth = brushSize.value;
  };

  const syncCanvasSize = (width: number, height: number) => {
    if (offscreenCanvas && (offscreenCanvas.width !== width || offscreenCanvas.height !== height)) {
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
    }
    if (bgOffscreenCanvas && (bgOffscreenCanvas.width !== width || bgOffscreenCanvas.height !== height)) {
      bgOffscreenCanvas.width = width;
      bgOffscreenCanvas.height = height;
    }
  };

  const ensureContexts = (canvas: HTMLCanvasElement) => {
    // 实时笔迹不使用 willReadFrequently，避免整幅画布偏向 CPU 路径导致卡顿
    // getImageData（油漆桶/空检测）仍可用，只是偶发操作稍慢
    ctx = canvas.getContext('2d');
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
    if (!bgOffscreenCanvas) {
      bgOffscreenCanvas = document.createElement('canvas');
      bgOffscreenCtx = bgOffscreenCanvas.getContext('2d');
    }
    syncCanvasSize(canvas.width, canvas.height);
  };

  watchEffect(() => {
    if (canvasRef.value) {
      ensureContexts(canvasRef.value);
    }
  });

  watch(
    [() => canvasRef.value?.width, () => canvasRef.value?.height],
    ([newWidth, newHeight], [oldWidth, oldHeight]) => {
      if (canvasRef.value && ctx && newWidth && newHeight) {
        if (newWidth !== oldWidth || newHeight !== oldHeight) {
          if (historyIndexRaw >= 0 && historyStack[historyIndexRaw]) {
            // 尺寸变化重绘前复位合成模式，避免仍停留在 destination-out（橡皮擦）时把快照“擦没”
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, newWidth, newHeight);
            ctx.drawImage(historyStack[historyIndexRaw], 0, 0);
          }
          syncCanvasSize(newWidth, newHeight);
        }
      }
    }
  );

  const updateHistoryState = () => {
    historyIndex.value = historyIndexRaw;
    historyLength.value = historyStack.length;
    canUndo.value = historyIndexRaw > 0;
    canRedo.value = historyStack.length > 0 && historyIndexRaw < historyStack.length - 1;
  };

  const cloneCanvasSnapshot = (source: HTMLCanvasElement): HTMLCanvasElement => {
    const snap = document.createElement('canvas');
    snap.width = source.width;
    snap.height = source.height;
    const snapCtx = snap.getContext('2d');
    if (snapCtx) {
      snapCtx.drawImage(source, 0, 0);
    }
    return snap;
  };

  const saveHistory = () => {
    if (!canvasRef.value || !ctx) return;

    historyStack.length = historyIndexRaw + 1;
    historyStack.push(cloneCanvasSnapshot(canvasRef.value));

    if (historyStack.length > maxHistory) {
      historyStack.shift();
    } else {
      historyIndexRaw++;
    }

    updateHistoryState();
    triggerHistoryChange();
  };

  /** 保证至少有一帧可回退基底；否则第一笔会落在 index 0，无法撤回 */
  const ensureHistoryBase = () => {
    if (!canvasRef.value || !ctx) return;
    if (historyStack.length > 0) return;
    historyStack.push(cloneCanvasSnapshot(canvasRef.value));
    historyIndexRaw = 0;
    updateHistoryState();
  };

  const restoreFromHistory = () => {
    if (!ctx || !canvasRef.value || historyIndexRaw < 0) return;

    const snapshot = historyStack[historyIndexRaw];
    // 橡皮擦会把 ctx 留在 destination-out；若不复位，drawImage 会按擦除合成，撤回后变成空白
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    ctx.drawImage(snapshot, 0, 0);
  };

  const scanIsEmpty = (): boolean => {
    if (!canvasRef.value || !ctx) return true;

    const imageData = ctx.getImageData(
      0,
      0,
      canvasRef.value.width,
      canvasRef.value.height
    );
    const data = imageData.data;

    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) {
        return false;
      }
    }

    return true;
  };

  const undo = (): boolean => {
    if (historyIndexRaw <= 0) return false;

    historyIndexRaw--;
    restoreFromHistory();
    knownEmpty = scanIsEmpty();
    updateHistoryState();
    return true;
  };

  const redo = (): boolean => {
    if (historyIndexRaw >= historyStack.length - 1) return false;

    historyIndexRaw++;
    restoreFromHistory();
    knownEmpty = scanIsEmpty();
    updateHistoryState();
    return true;
  };

  const clear = () => {
    if (!canvasRef.value || !ctx) return;

    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    knownEmpty = true;
    saveHistory();
  };

  const initCanvas = (backgroundColor: string) => {
    if (!canvasRef.value || !ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    knownEmpty = false;
    historyStack.length = 0;
    historyIndexRaw = -1;
    saveHistory();
  };

  const initTransparent = () => {
    if (!canvasRef.value || !ctx) return;

    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    knownEmpty = true;
    historyStack.length = 0;
    historyIndexRaw = -1;
    saveHistory();
  };

  const floodFill = (startX: number, startY: number, fillColor: string) => {
    if (!ctx || !canvasRef.value) return;

    ensureHistoryBase();

    const canvas = canvasRef.value;
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const startIX = Math.round(startX);
    const startIY = Math.round(startY);

    if (startIX < 0 || startIX >= width || startIY < 0 || startIY >= height) return;

    const startIndex = (startIY * width + startIX) * 4;
    const targetR = data[startIndex];
    const targetG = data[startIndex + 1];
    const targetB = data[startIndex + 2];
    const targetA = data[startIndex + 3];

    // 支持 rgba / #RRGGBB / #RRGGBB:alpha
    let alpha = 1;
    let fillR = 0;
    let fillG = 0;
    let fillB = 0;
    const rgbaMatch = fillColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
    if (rgbaMatch) {
      fillR = parseInt(rgbaMatch[1], 10);
      fillG = parseInt(rgbaMatch[2], 10);
      fillB = parseInt(rgbaMatch[3], 10);
      alpha = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    } else {
      const parts = fillColor.split(':');
      const hex = parts[0].replace('#', '');
      fillR = parseInt(hex.substring(0, 2), 16) || 0;
      fillG = parseInt(hex.substring(2, 4), 16) || 0;
      fillB = parseInt(hex.substring(4, 6), 16) || 0;
      alpha = parts[1] !== undefined ? parseFloat(parts[1]) : 1;
    }
    const fillA = Math.round(Math.min(1, Math.max(0, alpha)) * 255);

    const isTargetTransparent = targetA < 128;
    // 硬边界：近空才可漫水；抗锯齿毛边稍后整像素划给填充，笔芯不动
    const emptyAlpha = 8;

    const colorMatches = (r: number, g: number, b: number, a: number): boolean => {
      if (isTargetTransparent) {
        return a < emptyAlpha;
      }
      const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
      return diff < 60 && Math.abs(a - targetA) < 80;
    };

    const directions4: [number, number][] = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
    ];
    const directions8: [number, number][] = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [-1, 1], [1, -1], [1, 1],
    ];

    const visited = new Uint8Array(width * height);
    const toFill = new Uint8Array(width * height);

    let queueHead = 0;
    const queue: [number, number][] = [[startIX, startIY]];
    visited[startIY * width + startIX] = 1;

    let wallMaxA = 0;

    while (queueHead < queue.length) {
      const [x, y] = queue[queueHead++];
      const idx = (y * width + x) * 4;

      if (!colorMatches(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        continue;
      }

      toFill[y * width + x] = 1;

      for (const [dx, dy] of directions4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;

        const nDataIdx = nIdx * 4;
        if (colorMatches(data[nDataIdx], data[nDataIdx + 1], data[nDataIdx + 2], data[nDataIdx + 3])) {
          queue.push([nx, ny]);
        } else {
          const wallA = data[nDataIdx + 3];
          if (wallA > wallMaxA) wallMaxA = wallA;
        }
      }
    }

    // 把低于笔芯的抗锯齿毛边整像素划给填充（纯填充色，不混合），
    // 接近 wallMaxA 的笔芯像素完全保留 → 交界硬切：无缝且不重叠
    if (isTargetTransparent && wallMaxA > emptyAlpha) {
      const coreMinA = Math.max(emptyAlpha + 1, wallMaxA - 2);
      for (let pass = 0; pass < 8; pass++) {
        const absorb: number[] = [];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (toFill[y * width + x] !== 1) continue;
            for (const [dx, dy] of directions8) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              const nIdx = ny * width + nx;
              if (toFill[nIdx] === 1) continue;
              const a = data[nIdx * 4 + 3];
              if (a >= emptyAlpha && a < coreMinA) {
                absorb.push(nIdx);
              }
            }
          }
        }
        if (absorb.length === 0) break;
        for (const nIdx of absorb) {
          toFill[nIdx] = 1;
        }
      }
    }

    let hasPixels = false;
    for (let i = 0; i < width * height; i++) {
      if (toFill[i] !== 1) continue;
      const idx = i * 4;
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;
      hasPixels = true;
    }

    if (hasPixels) {
      ctx.putImageData(imageData, 0, 0);
      knownEmpty = false;
    }

    saveHistory();
  };

  // O(1) 空画布判断；undo/redo 时会重新扫描校准
  const isEmpty = (): boolean => knownEmpty;

  const drawPointOnOffscreen = (point: DrawPoint) => {
    if (!offscreenCtx) return;
    setupDrawStyles(offscreenCtx);
    offscreenCtx.beginPath();
    offscreenCtx.arc(point.x, point.y, brushSize.value / 2, 0, Math.PI * 2);
    offscreenCtx.fill();
  };

  // 增量二次曲线，避免每帧整笔重绘
  const drawIncrementalSegment = (from: DrawPoint, to: DrawPoint) => {
    if (!offscreenCtx || !prevMidPoint) return;
    setupDrawStyles(offscreenCtx);
    const mid: DrawPoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
    };
    offscreenCtx.beginPath();
    offscreenCtx.moveTo(prevMidPoint.x, prevMidPoint.y);
    offscreenCtx.quadraticCurveTo(from.x, from.y, mid.x, mid.y);
    offscreenCtx.stroke();
    prevMidPoint = mid;
  };

  const drawPoint = (point: DrawPoint, context: CanvasRenderingContext2D) => {
    context.beginPath();
    context.arc(point.x, point.y, brushSize.value / 2, 0, Math.PI * 2);
    context.fill();
  };

  const drawLine = (from: DrawPoint, to: DrawPoint, context: CanvasRenderingContext2D) => {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  };

  const compositeStroke = () => {
    if (!ctx || !offscreenCanvas || !canvasRef.value || !bgOffscreenCanvas) return;

    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    ctx.drawImage(bgOffscreenCanvas, 0, 0);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = cachedAlpha;
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.globalAlpha = 1;
  };

  const renderFrame = () => {
    if (!pendingRender || !isDrawing) {
      pendingRender = false;
      rafId = null;
      return;
    }

    if (mode.value === 'draw') {
      compositeStroke();
    }

    pendingRender = false;
    rafId = null;
  };

  const scheduleRender = () => {
    if (!pendingRender) {
      pendingRender = true;
      rafId = requestAnimationFrame(renderFrame);
    }
  };

  const takePreStrokeSnapshot = () => {
    if (!ctx || !canvasRef.value || !bgOffscreenCtx || !bgOffscreenCanvas) return;

    bgOffscreenCtx.clearRect(0, 0, bgOffscreenCanvas.width, bgOffscreenCanvas.height);
    bgOffscreenCtx.drawImage(canvasRef.value, 0, 0);
  };

  const clearOffscreen = () => {
    if (!offscreenCtx || !offscreenCanvas) return;
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  };

  const mergeStrokeToCanvas = () => {
    if (!ctx || !offscreenCanvas || !canvasRef.value || !bgOffscreenCanvas) return;

    // 保留绘制时的抗锯齿，避免松手后 harden 半透明边缘导致折线感/锯齿
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    ctx.drawImage(bgOffscreenCanvas, 0, 0);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = cachedAlpha;
    ctx.drawImage(offscreenCanvas, 0, 0);
    ctx.globalAlpha = 1;

    clearOffscreen();
  };

  const cacheCanvasTransform = (canvas: HTMLCanvasElement) => {
    cachedRect = canvas.getBoundingClientRect();
    scaleX = cachedRect.width > 0 ? canvas.width / cachedRect.width : 1;
    scaleY = cachedRect.height > 0 ? canvas.height / cachedRect.height : 1;
  };

  const clientToCanvas = (clientX: number, clientY: number): DrawPoint => {
    if (!cachedRect) {
      return { x: 0, y: 0 };
    }
    return {
      x: (clientX - cachedRect.left) * scaleX,
      y: (clientY - cachedRect.top) * scaleY,
    };
  };

  const finishStroke = () => {
    if (!isDrawing) return;

    // 收尾：把最后一段画到终点，避免笔迹截断
    if (mode.value === 'draw' && lastPoint && prevMidPoint && offscreenCtx) {
      setupDrawStyles(offscreenCtx);
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(prevMidPoint.x, prevMidPoint.y);
      offscreenCtx.lineTo(lastPoint.x, lastPoint.y);
      offscreenCtx.stroke();
    }

    isDrawing = false;
    lastPoint = null;
    lastRenderedPoint = null;
    prevMidPoint = null;
    cachedRect = null;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      pendingRender = false;
    }

    if (mode.value === 'draw') {
      mergeStrokeToCanvas();
    } else if (mode.value === 'erase' && ctx) {
      // 笔划结束后复位，避免后续 undo/redo/导出仍受 destination-out 影响
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    knownEmpty = false;
    saveHistory();
  };

  const startStrokeAt = (x: number, y: number) => {
    // 落笔前写入基底快照，确保第一笔也能撤回到空白
    ensureHistoryBase();

    isDrawing = true;
    lastPoint = { x, y };
    lastRenderedPoint = null;
    prevMidPoint = { x, y };

    if (mode.value === 'draw') {
      takePreStrokeSnapshot();
      clearOffscreen();
      updateColorCache();
      drawPointOnOffscreen(lastPoint);
      scheduleRender();
    } else if (mode.value === 'erase') {
      if (!ctx) return;
      setupEraseStyles(ctx);
      drawPoint(lastPoint, ctx);
    }
  };

  const continueStrokeAt = (x: number, y: number) => {
    if (!isDrawing || !lastPoint) return;

    const currentPoint: DrawPoint = { x, y };

    if (mode.value === 'draw') {
      const distance = getDistance(lastPoint, currentPoint);
      if (distance >= SAMPLE_DISTANCE_THRESHOLD) {
        drawIncrementalSegment(lastPoint, currentPoint);
        scheduleRender();
        lastPoint = currentPoint;
      }
    } else if (mode.value === 'erase') {
      if (!ctx) return;
      setupEraseStyles(ctx);
      drawLine(lastRenderedPoint || lastPoint, currentPoint, ctx);
      lastRenderedPoint = currentPoint;
      lastPoint = currentPoint;
      knownEmpty = false;
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (mode.value === 'disabled') return;

    const canvas = canvasRef.value;
    if (!canvas) return;

    cacheCanvasTransform(canvas);
    const { x, y } = clientToCanvas(e.clientX, e.clientY);

    if (mode.value === 'bucket') {
      floodFill(x, y, brushColor.value);
      return;
    }

    startStrokeAt(x, y);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !lastPoint) return;
    if (!cachedRect && canvasRef.value) {
      cacheCanvasTransform(canvasRef.value);
    }
    const { x, y } = clientToCanvas(e.clientX, e.clientY);
    continueStrokeAt(x, y);
  };

  const handleMouseUp = () => {
    finishStroke();
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (mode.value === 'disabled' || e.touches.length !== 1) return;

    e.preventDefault();
    const canvas = canvasRef.value;
    if (!canvas) return;

    const touch = e.touches[0];
    cacheCanvasTransform(canvas);
    const { x, y } = clientToCanvas(touch.clientX, touch.clientY);

    if (mode.value === 'bucket') {
      floodFill(x, y, brushColor.value);
      return;
    }

    startStrokeAt(x, y);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDrawing || !lastPoint || e.touches.length !== 1) return;

    e.preventDefault();
    if (!cachedRect && canvasRef.value) {
      cacheCanvasTransform(canvasRef.value);
    }
    const touch = e.touches[0];
    const { x, y } = clientToCanvas(touch.clientX, touch.clientY);
    continueStrokeAt(x, y);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (isDrawing) {
      e.preventDefault();
      finishStroke();
    }
  };

  return {
    historyIndex: historyIndex as Readonly<Ref<number>>,
    historyLength: historyLength as Readonly<Ref<number>>,
    canUndo: canUndo as Readonly<Ref<boolean>>,
    canRedo: canRedo as Readonly<Ref<boolean>>,
    undo,
    redo,
    clear,
    initCanvas,
    initTransparent,
    floodFill,
    saveHistory,
    isEmpty,
    onHistoryChange,
    markInitialized,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
