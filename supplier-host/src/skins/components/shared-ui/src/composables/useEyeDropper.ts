/**
 * 屏幕取色 composable
 * - 触摸屏：透明覆盖层（页面样式不变）+ 按住预览 / 松手确认
 * - 优先从隐藏视口截图像素取样（所见即所得，避开 asset 污染与外观白底）
 * - DOM 取样作为补充（图库缩略图等）
 */

export type PickColorOptions = {
  /** 强制使用自定义覆盖层（触摸屏推荐） */
  forceOverlay?: boolean;
  /** 强制使用原生 EyeDropper（忽略触摸检测） */
  forceNative?: boolean;
};

/** 检查当前环境是否支持 EyeDropper API */
export function isEyeDropperSupported(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

/** 是否以触摸 / 粗指针为主（自助机触摸屏） */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  if (navigator.maxTouchPoints > 0) return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

let cssColorCtx: CanvasRenderingContext2D | null = null;
const parseCssColor = (color: string): string | null => {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  if (!cssColorCtx) {
    cssColorCtx = document.createElement('canvas').getContext('2d');
  }
  if (!cssColorCtx) return null;
  cssColorCtx.fillStyle = '#000';
  cssColorCtx.fillStyle = color;
  const parsed = cssColorCtx.fillStyle;
  if (typeof parsed !== 'string') return null;
  if (parsed.startsWith('#')) {
    if (parsed.length === 4) {
      return `#${parsed[1]}${parsed[1]}${parsed[2]}${parsed[2]}${parsed[3]}${parsed[3]}`.toUpperCase();
    }
    return parsed.toUpperCase();
  }
  const m = parsed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  return rgbToHex(+m[1], +m[2], +m[3]);
};

/** url → 可读像素 canvas */
const imagePixelCache = new Map<string, HTMLCanvasElement>();

/**
 * 本次取色会话：编辑区合成缓冲（不展示）。
 * origin* 为缓冲左上角对应的 client 坐标。
 */
type SurfaceCapture = {
  canvas: HTMLCanvasElement;
  /** 缓存 2d context，避免每帧 getContext */
  ctx: CanvasRenderingContext2D;
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
};
let sessionSurfaceCapture: SurfaceCapture | null = null;

const makeSurfaceCapture = (
  canvas: HTMLCanvasElement,
  originX: number,
  originY: number,
  scaleX: number,
  scaleY: number,
): SurfaceCapture | null => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  return { canvas, ctx, originX, originY, scaleX, scaleY };
};

/** 从截图缓冲快速取 1px 颜色（跟手预览热路径） */
const sampleSurfaceCapture = (clientX: number, clientY: number): string | null => {
  const cap = sessionSurfaceCapture;
  if (!cap) return null;
  const px = Math.floor((clientX - cap.originX) * cap.scaleX);
  const py = Math.floor((clientY - cap.originY) * cap.scaleY);
  if (px < 0 || py < 0 || px >= cap.canvas.width || py >= cap.canvas.height) return null;
  try {
    const [r, g, b, a] = cap.ctx.getImageData(px, py, 1, 1).data;
    if (a < 16) return null;
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
};

const canvasFromDrawable = (
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement | null => {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, width, height);
    ctx.getImageData(0, 0, 1, 1);
    return canvas;
  } catch {
    return null;
  }
};

const loadImagePixelCanvasFromBlob = async (blob: Blob): Promise<HTMLCanvasElement | null> => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    const canvas = canvasFromDrawable(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return canvas;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('blob image load failed'));
      el.src = objectUrl;
    });
    return canvasFromDrawable(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadImagePixelCanvas = async (url: string): Promise<HTMLCanvasElement | null> => {
  if (!url || url.startsWith('data:image/svg')) return null;
  const cached = imagePixelCache.get(url);
  if (cached) return cached;

  try {
    // data URL：直接解码，永不污染
    if (url.startsWith('data:image/')) {
      const res = await fetch(url);
      const blob = await res.blob();
      const canvas = await loadImagePixelCanvasFromBlob(blob);
      if (canvas) imagePixelCache.set(url, canvas);
      return canvas;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const canvas = await loadImagePixelCanvasFromBlob(blob);
    if (canvas) imagePixelCache.set(url, canvas);
    return canvas;
  } catch {
    return null;
  }
};

/**
 * 从 asset.localhost / convertFileSrc URL 反解本地路径。
 * Tauri 会把整段路径 encodeURIComponent：http://asset.localhost/C%3A%5CUsers%5C...
 */
const tryParseAssetLocalPath = (url: string): string | null => {
  if (!url) return null;
  try {
    const stripped = url.split(/[?#]/)[0] || url;

    // 优先直接截取 host 后整段（保留 %5C 反斜杠编码）
    const assetIdx = stripped.search(/asset\.localhost\//i);
    if (assetIdx >= 0) {
      const rest = stripped.slice(assetIdx + 'asset.localhost/'.length);
      if (rest) {
        let path = decodeURIComponent(rest);
        if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
        if (path) return path;
      }
    }

    const assetProto = stripped.match(/^asset:\/\/(?:localhost)?\/(.+)$/i);
    if (assetProto?.[1]) {
      let path = decodeURIComponent(assetProto[1]);
      if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
      if (path.startsWith('/') && !/^[A-Za-z]:/.test(path)) {
        /* unix */
      }
      if (path) return path;
    }

    const u = new URL(url);
    const host = u.hostname || '';
    const isAsset =
      host === 'asset.localhost' ||
      u.protocol === 'asset:' ||
      host.endsWith('.asset.localhost');
    if (!isAsset) return null;
    let path = decodeURIComponent(u.pathname || '');
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
    return path || null;
  } catch {
    return null;
  }
};

/** 经 Rust 读本地文件 → data URL → 可读 canvas（图库 / 图层可靠路径） */
const loadImagePixelCanvasViaTauri = async (filePath: string): Promise<HTMLCanvasElement | null> => {
  if (!filePath) return null;
  const cached = imagePixelCache.get(filePath);
  if (cached) return cached;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    // rename_all=snake_case 与 camelCase 都试一次，避免参数名不匹配
    let dataUrl: string | null = null;
    try {
      dataUrl = await invoke<string>('read_local_image_data_url', { filePath });
    } catch {
      dataUrl = await invoke<string>('read_local_image_data_url', { file_path: filePath });
    }
    if (!dataUrl) return null;
    const canvas = await loadImagePixelCanvas(dataUrl);
    if (canvas) {
      imagePixelCache.set(filePath, canvas);
      imagePixelCache.set(dataUrl, canvas);
    }
    return canvas;
  } catch (err) {
    console.warn('[EyeDropper] read_local_image_data_url failed', filePath, err);
    return null;
  }
};

const imageUrlKeys = (img: HTMLImageElement): string[] => {
  const keys = [img.currentSrc, img.src, img.getAttribute('src') || ''].filter(Boolean);
  return [...new Set(keys)];
};

const rememberCachedCanvas = (keys: string[], canvas: HTMLCanvasElement) => {
  for (const key of keys) imagePixelCache.set(key, canvas);
};

const isAssetProtocolUrl = (url: string): boolean =>
  /asset\.localhost/i.test(url) || /^asset:/i.test(url);

/** 将 DOM 中已显示的图片转为可读像素缓存 */
const cacheImageElement = async (img: HTMLImageElement): Promise<HTMLCanvasElement | null> => {
  const keys = imageUrlKeys(img);
  for (const key of keys) {
    const hit = imagePixelCache.get(key);
    if (hit) {
      rememberCachedCanvas(keys, hit);
      return hit;
    }
  }

  // 收集可能的本地磁盘路径（图库 data-local-path / asset URL 反解）
  const localPaths = new Set<string>();
  if (img.dataset.localPath) localPaths.add(img.dataset.localPath);
  for (const key of keys) {
    const parsed = tryParseAssetLocalPath(key);
    if (parsed) localPaths.add(parsed);
  }

  const fromAsset = keys.some(isAssetProtocolUrl) || localPaths.size > 0;

  // 1) Tauri 读本地文件（asset 图最可靠）
  for (const filePath of localPaths) {
    const canvas = await loadImagePixelCanvasViaTauri(filePath);
    if (canvas) {
      rememberCachedCanvas(keys, canvas);
      return canvas;
    }
  }

  // 2) fetch→blob（EditCanvas 导出同款路径；对 asset.localhost 比 createImageBitmap(img) 可靠）
  for (const url of keys) {
    const canvas = await loadImagePixelCanvas(url);
    if (canvas) {
      rememberCachedCanvas(keys, canvas);
      return canvas;
    }
  }

  // 3) 非 asset：才允许从已解码 <img> 直接取样（asset 上 WebView2 可能“成功”但得到白图）
  if (!fromAsset) {
    try {
      if (!img.complete) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => resolve();
          const onErr = () => reject(new Error('img load failed'));
          img.addEventListener('load', onLoad, { once: true });
          img.addEventListener('error', onErr, { once: true });
        }).catch(() => undefined);
      }
      await img.decode().catch(() => undefined);
      if (img.naturalWidth > 0 && typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(img);
        const canvas = canvasFromDrawable(bitmap, bitmap.width, bitmap.height);
        bitmap.close();
        if (canvas) {
          rememberCachedCanvas(keys, canvas);
          return canvas;
        }
      }
    } catch {
      /* continue */
    }
  }

  return null;
};

const isVisuallySampleable = (el: HTMLElement): boolean => {
  let opacity = 1;
  let node: HTMLElement | null = el;
  while (node && node !== document.documentElement) {
    const st = getComputedStyle(node);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (node.classList.contains('is-inactive')) return false;
    opacity *= parseFloat(st.opacity || '1');
    if (opacity < 0.05) return false;
    node = node.parentElement;
  }
  return true;
};

/** 指尖是否落在已展开的图片库面板上 */
const findMediaSheetAtPoint = (clientX: number, clientY: number): HTMLElement | null => {
  for (const sheet of Array.from(document.querySelectorAll('.media-sheet'))) {
    if (!(sheet instanceof HTMLElement)) continue;
    if (!isVisuallySampleable(sheet)) continue;
    const rect = sheet.getBoundingClientRect();
    // 收起态在屏幕下方之外
    if (rect.height < 80 || rect.top >= window.innerHeight - 4) continue;
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return sheet;
    }
  }
  return null;
};

const stackingHint = (el: HTMLElement): number => {
  let score = 0;
  let depth = 0;
  let node: HTMLElement | null = el;
  while (node) {
    const z = getComputedStyle(node).zIndex;
    const zNum = Number.parseInt(z, 10);
    if (!Number.isNaN(zNum)) score += zNum * Math.max(1, 100 - depth);
    depth += 1;
    node = node.parentElement;
  }
  return score;
};

/** 壳外观图：叠在最上层，透明洞/白底占位不应挡住下方图片图层取色 */
const isAppearanceMedia = (el: Element): boolean =>
  el instanceof HTMLElement &&
  (el.classList.contains('appearance-image') || !!el.closest('.appearance-layer'));

/** 编辑区内容图层（贴纸/背景/涂鸦），取色应优先于外观边框 */
const isContentMedia = (el: Element): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (isAppearanceMedia(el)) return false;
  return (
    el.classList.contains('element-image') ||
    el.classList.contains('drawing-canvas') ||
    !!el.closest('.element-image-layer') ||
    !!el.closest('.drawing-canvas-layer') ||
    !!el.closest('.layers-stack')
  );
};

/** 通过 Tauri 截取窗口客户区，得到与屏幕一致的合成像素 */
const captureWindowSurfaceBuffer = async (): Promise<SurfaceCapture | null> => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{
      dataUrl?: string;
      data_url?: string;
      width: number;
      height: number;
    }>('capture_window_data_url');
    const dataUrl = result.dataUrl || result.data_url;
    if (!dataUrl || !result.width || !result.height) return null;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('window capture image load failed'));
      el.src = dataUrl;
    });

    const canvas = canvasFromDrawable(img, result.width, result.height);
    if (!canvas) return null;

    return makeSurfaceCapture(
      canvas,
      0,
      0,
      canvas.width / window.innerWidth,
      canvas.height / window.innerHeight,
    );
  } catch (err) {
    console.warn('[EyeDropper] capture_window_data_url failed', err);
    return null;
  }
};

/**
 * 手动合成编辑区（canvas-wrapper）可读像素：只画内容图层。
 * 不插入 DOM，页面样式不变；窗口截图失败时的备份。
 */
const captureEditSurfaceBuffer = async (): Promise<SurfaceCapture | null> => {
  const wrapper = document.querySelector('.canvas-wrapper, .canvas-container');
  if (!(wrapper instanceof HTMLElement)) return null;
  const rect = wrapper.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nodes = Array.from(wrapper.querySelectorAll('img, canvas')).filter(
    (n): n is HTMLImageElement | HTMLCanvasElement =>
      (n instanceof HTMLImageElement || n instanceof HTMLCanvasElement) &&
      isVisuallySampleable(n),
  );

  // 只合成内容图层，不画外观壳图（壳常有白底，会盖住贴纸真实颜色）
  const content = nodes.filter((n) => !isAppearanceMedia(n));

  const drawEl = async (el: HTMLImageElement | HTMLCanvasElement) => {
    const elRect = el.getBoundingClientRect();
    const dx = ((elRect.left - rect.left) / rect.width) * canvas.width;
    const dy = ((elRect.top - rect.top) / rect.height) * canvas.height;
    const dw = (elRect.width / rect.width) * canvas.width;
    const dh = (elRect.height / rect.height) * canvas.height;
    if (dw < 1 || dh < 1) return;

    if (el instanceof HTMLCanvasElement) {
      try {
        if (el.width > 0 && el.height > 0) ctx.drawImage(el, dx, dy, dw, dh);
      } catch {
        /* tainted */
      }
      return;
    }

    const pixels = await cacheImageElement(el);
    if (!pixels) {
      console.warn('[EyeDropper] layer image unreadable', el.currentSrc || el.src);
      return;
    }

    const fit = getComputedStyle(el).objectFit || 'fill';
    const cw = pixels.width;
    const ch = pixels.height;
    if (fit === 'contain' || fit === 'cover') {
      const scale =
        fit === 'contain' ? Math.min(dw / cw, dh / ch) : Math.max(dw / cw, dh / ch);
      const tw = cw * scale;
      const th = ch * scale;
      const ox = dx + (dw - tw) / 2;
      const oy = dy + (dh - th) / 2;
      ctx.drawImage(pixels, ox, oy, tw, th);
    } else {
      ctx.drawImage(pixels, dx, dy, dw, dh);
    }
  };

  for (const el of content) await drawEl(el);

  return makeSurfaceCapture(
    canvas,
    rect.left,
    rect.top,
    canvas.width / rect.width,
    canvas.height / rect.height,
  );
};

const mediaPriority = (el: HTMLElement): number => {
  if (isAppearanceMedia(el)) return 0;
  if (isContentMedia(el)) return 1000;
  if (el.closest('.media-sheet')) return 800;
  return 100;
};

/** 按几何位置收集指尖下的 img/canvas（不依赖 pointer-events） */
const collectMediaCandidates = (
  clientX: number,
  clientY: number,
  ignoreRoot: HTMLElement | null | undefined,
  scopeRoot: ParentNode | null,
): Array<HTMLImageElement | HTMLCanvasElement> => {
  const root: ParentNode = scopeRoot || document;
  const list: Array<HTMLImageElement | HTMLCanvasElement> = [];
  root.querySelectorAll('img, canvas').forEach((node) => {
    if (!(node instanceof HTMLImageElement || node instanceof HTMLCanvasElement)) return;
    if (ignoreRoot && (node === ignoreRoot || ignoreRoot.contains(node))) return;
    if (!isVisuallySampleable(node)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return;
    }
    list.push(node);
  });

  list.sort((a, b) => {
    // 内容图层优先于外观边框（外观常有白底/透明洞，会误取成白色）
    const pDiff = mediaPriority(b) - mediaPriority(a);
    if (pDiff !== 0) return pDiff;
    const zDiff = stackingHint(b) - stackingHint(a);
    if (zDiff !== 0) return zDiff;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
    return 0;
  });
  return list;
};

const prepareVisibleImageCache = async (): Promise<void> => {
  const imgs = Array.from(document.images).filter(isVisuallySampleable);
  // 优先预热图片库里已显示的缩略图
  const ordered = [
    ...imgs.filter((img) => !!img.closest('.media-sheet')),
    ...imgs.filter((img) => !img.closest('.media-sheet')),
  ];
  await Promise.all(ordered.map((img) => cacheImageElement(img)));
};

/** 预热指尖下图片的可读像素（图库 lazy / Tauri asset） */
const ensurePixelCacheUnderPoint = async (clientX: number, clientY: number): Promise<void> => {
  const sheet = findMediaSheetAtPoint(clientX, clientY);
  const candidates = collectMediaCandidates(clientX, clientY, null, sheet);
  await Promise.all(
    candidates
      .filter((el): el is HTMLImageElement => el instanceof HTMLImageElement)
      .map((img) => cacheImageElement(img)),
  );
};

const readPixel = (canvas: HTMLCanvasElement, px: number, py: number): string | null => {
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    if (a < 16) return null;
    return rgbToHex(r, g, b);
  } catch {
    return null;
  }
};

/**
 * 将视口坐标映射到图片/画布内容像素（支持 object-fit: contain / cover / fill）
 * 使用 getBoundingClientRect，对纯缩放/位移图层准确；旋转图层为近似
 */
const mapToContentPixel = (
  clientX: number,
  clientY: number,
  rect: DOMRect,
  contentW: number,
  contentH: number,
  objectFit: string,
): { x: number; y: number } | null => {
  if (rect.width <= 0 || rect.height <= 0 || contentW <= 0 || contentH <= 0) return null;

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return null;

  let offsetX = 0;
  let offsetY = 0;
  let dispW = rect.width;
  let dispH = rect.height;

  if (objectFit === 'contain') {
    const scale = Math.min(rect.width / contentW, rect.height / contentH);
    dispW = contentW * scale;
    dispH = contentH * scale;
    offsetX = (rect.width - dispW) / 2;
    offsetY = (rect.height - dispH) / 2;
  } else if (objectFit === 'cover') {
    const scale = Math.max(rect.width / contentW, rect.height / contentH);
    dispW = contentW * scale;
    dispH = contentH * scale;
    offsetX = (rect.width - dispW) / 2;
    offsetY = (rect.height - dispH) / 2;
  } else if (objectFit === 'none') {
    dispW = contentW;
    dispH = contentH;
    offsetX = (rect.width - dispW) / 2;
    offsetY = (rect.height - dispH) / 2;
  }
  // fill / default: stretch to element box

  const xIn = localX - offsetX;
  const yIn = localY - offsetY;
  if (xIn < 0 || yIn < 0 || xIn > dispW || yIn > dispH) return null;

  return {
    x: Math.min(contentW - 1, Math.max(0, Math.floor((xIn / dispW) * contentW))),
    y: Math.min(contentH - 1, Math.max(0, Math.floor((yIn / dispH) * contentH))),
  };
};

const sampleCanvasEl = (canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null => {
  const rect = canvas.getBoundingClientRect();
  const fit = getComputedStyle(canvas).objectFit || 'fill';
  const mapped = mapToContentPixel(clientX, clientY, rect, canvas.width, canvas.height, fit);
  if (!mapped) return null;
  return readPixel(canvas, mapped.x, mapped.y);
};

const sampleImageEl = (
  img: HTMLImageElement,
  pixelCanvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): string | null => {
  const rect = img.getBoundingClientRect();
  const fit = getComputedStyle(img).objectFit || 'fill';
  const mapped = mapToContentPixel(
    clientX,
    clientY,
    rect,
    pixelCanvas.width,
    pixelCanvas.height,
    fit,
  );
  if (!mapped) return null;
  return readPixel(pixelCanvas, mapped.x, mapped.y);
};

/**
 * EditCanvas 图层大量使用 pointer-events:none，elementsFromPoint 会穿透过去。
 * 取样前短暂恢复可命中，取完立刻还原，不影响页面交互样式。
 */
const withHitTestEnabled = <T>(ignoreRoot: HTMLElement | null | undefined, fn: () => T): T => {
  const patched: { el: HTMLElement; value: string }[] = [];
  const patch = (el: Element | null | undefined) => {
    if (!(el instanceof HTMLElement)) return;
    if (ignoreRoot && (el === ignoreRoot || ignoreRoot.contains(el))) return;
    patched.push({ el, value: el.style.pointerEvents });
    el.style.pointerEvents = 'auto';
  };

  document.querySelectorAll('img, canvas').forEach(patch);
  document.querySelectorAll(
    '.element-image-layer, .element-image, .drawing-canvas-layer, .drawing-canvas, .appearance-layer, .appearance-image, .layers-stack, .canvas-wrapper, .canvas-container',
  ).forEach(patch);

  const prevIgnore = ignoreRoot?.style.pointerEvents;
  if (ignoreRoot) ignoreRoot.style.pointerEvents = 'none';

  try {
    return fn();
  } finally {
    if (ignoreRoot) ignoreRoot.style.pointerEvents = prevIgnore || '';
    for (let i = patched.length - 1; i >= 0; i--) {
      patched[i].el.style.pointerEvents = patched[i].value;
    }
  }
};

const isStructuralChrome = (el: HTMLElement): boolean => {
  const cls = el.classList;
  return (
    cls.contains('layers-stack') ||
    cls.contains('element-image-layer') ||
    cls.contains('appearance-layer') ||
    cls.contains('control-layer') ||
    cls.contains('selection-layer') ||
    cls.contains('canvas-wrapper') ||
    cls.contains('canvas-container') ||
    cls.contains('editable-area') ||
    cls.contains('drawing-canvas-layer') ||
    cls.contains('stack-freeze-canvas') ||
    el.tagName === 'BODY' ||
    el.tagName === 'HTML'
  );
};

type ImageSampleResult =
  | { kind: 'color'; hex: string }
  | { kind: 'empty' }
  | { kind: 'unreadable' };

const sampleImageElement = (
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
): ImageSampleResult => {
  const keys = imageUrlKeys(img);
  let cached: HTMLCanvasElement | undefined;
  for (const key of keys) {
    cached = imagePixelCache.get(key);
    if (cached) break;
  }
  // 禁止对 asset 图同步 drawImage：WebView2 上可能不抛错却读成白色并污染缓存
  if (
    !cached &&
    img.complete &&
    img.naturalWidth > 0 &&
    !keys.some(isAssetProtocolUrl) &&
    !img.dataset.localPath
  ) {
    cached = canvasFromDrawable(img, img.naturalWidth, img.naturalHeight) ?? undefined;
    if (cached) rememberCachedCanvas(keys, cached);
  }
  if (!cached) return { kind: 'unreadable' };
  const hex = sampleImageEl(img, cached, clientX, clientY);
  if (hex) return { kind: 'color', hex };
  return { kind: 'empty' };
};

const trySampleMediaEl = (
  el: HTMLImageElement | HTMLCanvasElement,
  clientX: number,
  clientY: number,
): string | null => {
  if (el instanceof HTMLCanvasElement) {
    return sampleCanvasEl(el, clientX, clientY);
  }
  const result = sampleImageElement(el, clientX, clientY);
  return result.kind === 'color' ? result.hex : null;
};

/**
 * 从当前页面坐标实时取色。
 * - 优先：系统窗口截图（所见即所得，含贴纸叠在白底上的真实颜色）
 * - 其次：内容图层 DOM 像素
 * - 上层贴纸不可读时，禁止穿透到下层白底
 */
export function sampleColorAtPoint(
  clientX: number,
  clientY: number,
  ignoreRoot?: HTMLElement | null,
): string | null {
  // 0) 窗口截图：与屏幕合成一致
  const fromWindow = sampleSurfaceCapture(clientX, clientY);
  if (fromWindow) return fromWindow;

  const mediaSheet = findMediaSheetAtPoint(clientX, clientY);
  const candidates = collectMediaCandidates(clientX, clientY, ignoreRoot, mediaSheet);
  const contentCandidates = candidates.filter((el) => !isAppearanceMedia(el));
  const appearanceCandidates = candidates.filter((el) => isAppearanceMedia(el));

  // 1) 内容图层（贴纸/图库/涂鸦）
  // 上层贴纸若不可读，绝不能继续采到下层白底背景（否则永远是 #FFFFFF）
  let hadUnreadableContent = false;
  for (const el of contentCandidates) {
    if (el instanceof HTMLCanvasElement) {
      const hex = sampleCanvasEl(el, clientX, clientY);
      if (hex) return hex;
      continue;
    }
    const result = sampleImageElement(el, clientX, clientY);
    if (result.kind === 'color') return result.hex;
    if (result.kind === 'empty') continue; // 透明处：看下一层
    if (result.kind === 'unreadable') {
      hadUnreadableContent = true;
      break;
    }
  }

  // 指尖下有图片图层但像素尚未可读：不要采外观白底
  if (hadUnreadableContent) return null;

  // 图片库区域：禁止穿透半透明底板取到后面页面白色
  if (mediaSheet) return null;

  // 3) 外观边框（仅在没有内容图层时）
  if (contentCandidates.length === 0) {
    for (const el of appearanceCandidates) {
      const hex = trySampleMediaEl(el, clientX, clientY);
      if (hex) return hex;
    }
  }

  return withHitTestEnabled(ignoreRoot, () => {
    const punched: { el: HTMLElement; pointerEvents: string }[] = [];
    const punch = (el: HTMLElement) => {
      punched.push({ el, pointerEvents: el.style.pointerEvents });
      el.style.pointerEvents = 'none';
    };

    try {
      for (let i = 0; i < 48; i++) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el || el === document.documentElement || el === document.body) break;
        if (!(el instanceof HTMLElement)) break;
        if (ignoreRoot && (el === ignoreRoot || ignoreRoot.contains(el))) {
          punch(ignoreRoot);
          continue;
        }

        if (el instanceof HTMLCanvasElement) {
          const hex = sampleCanvasEl(el, clientX, clientY);
          if (hex) return hex;
          punch(el);
          continue;
        }

        if (el instanceof HTMLImageElement) {
          if (isAppearanceMedia(el) && contentCandidates.length > 0) {
            punch(el);
            continue;
          }
          const result = sampleImageElement(el, clientX, clientY);
          if (result.kind === 'color') {
            if (isAppearanceMedia(el) && (result.hex === '#FFFFFF' || result.hex === '#FEFEFE')) {
              punch(el);
              continue;
            }
            return result.hex;
          }
          punch(el);
          continue;
        }

        if (isStructuralChrome(el) || isAppearanceMedia(el)) {
          punch(el);
          continue;
        }

        const style = getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
          punch(el);
          continue;
        }

        const bg = parseCssColor(style.backgroundColor);
        const rect = el.getBoundingClientRect();
        const largeSurface =
          rect.width * rect.height > window.innerWidth * window.innerHeight * 0.25;

        if (
          bg &&
          bg !== '#FFFFFF' &&
          !largeSurface &&
          parseFloat(style.opacity || '1') > 0.05
        ) {
          return bg;
        }

        punch(el);
      }

      return null;
    } finally {
      for (let i = punched.length - 1; i >= 0; i--) {
        punched[i].el.style.pointerEvents = punched[i].pointerEvents;
      }
    }
  });
}

/**
 * 自定义覆盖层取色：
 * - 同步立即挂上全屏透明挡板，避免触摸落到画布变成涂鸦
 * - 后台截图；就绪后：按住预览、松手确认（样式与操作保持原交互）
 */
export function pickColorFromOverlay(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    // —— 同步挂挡板：必须在任何 await 之前，挡住涂鸦 ——
    const root = document.createElement('div');
    root.dataset.eyedropperIgnore = 'true';
    root.setAttribute('data-no-press', '');
    root.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      touch-action: none;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      background: transparent;
    `;

    // 放大镜取色盘：低分辨率 canvas + CSS 放大，跟手更轻
    const LOUPE = 132;
    const MAG_RES = 48; // 内部分辨率（像素少，drawImage 更快）
    const ZOOM = 3.5;
    const SRC_CSS = LOUPE / ZOOM; // 屏幕上取样区域边长（CSS px）
    const CENTER = 22;
    const GRID = LOUPE / (SRC_CSS); // ≈ ZOOM，CSS 网格格宽
    const loupe = document.createElement('div');
    loupe.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: ${LOUPE}px;
      height: ${LOUPE}px;
      margin: 0;
      border-radius: 999px;
      border: 3px solid #fff;
      box-shadow: 0 6px 18px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(0,0,0,0.2);
      pointer-events: none;
      display: none;
      overflow: hidden;
      background: #222;
      contain: layout style paint;
      will-change: transform;
      transform: translate3d(-9999px, -9999px, 0);
    `;
    const magCanvas = document.createElement('canvas');
    magCanvas.width = MAG_RES;
    magCanvas.height = MAG_RES;
    magCanvas.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 999px;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      pointer-events: none;
    `;
    const magCtx = magCanvas.getContext('2d', { alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (magCtx) {
      magCtx.imageSmoothingEnabled = false;
    }
    loupe.appendChild(magCanvas);

    // 网格用 CSS 叠层，避免每帧 stroke
    const gridOverlay = document.createElement('div');
    gridOverlay.style.cssText = `
      position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
      background-image:
        linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px);
      background-size: ${GRID}px ${GRID}px;
      z-index: 1;
    `;
    loupe.appendChild(gridOverlay);

    // 中心取样色圆
    const centerDot = document.createElement('div');
    centerDot.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: ${CENTER}px;
      height: ${CENTER}px;
      margin: ${-CENTER / 2}px 0 0 ${-CENTER / 2}px;
      border-radius: 999px;
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35);
      background: #888;
      pointer-events: none;
      z-index: 2;
    `;
    loupe.appendChild(centerDot);

    // 十字准星（中心留空给取样色圆），标明放大中心 = 指尖取样点
    const gap = CENTER / 2 + 4;
    const mkReticle = (horizontal: boolean) => {
      const a = document.createElement('div');
      const b = document.createElement('div');
      const line = `
        position: absolute; background: rgba(255,255,255,0.9);
        box-shadow: 0 0 0 0.5px rgba(0,0,0,0.5); pointer-events: none; z-index: 1;
      `;
      if (horizontal) {
        a.style.cssText = `${line} left: 8%; width: calc(42% - ${gap}px); top: 50%; height: 1px; margin-top: -0.5px;`;
        b.style.cssText = `${line} right: 8%; width: calc(42% - ${gap}px); top: 50%; height: 1px; margin-top: -0.5px;`;
      } else {
        a.style.cssText = `${line} top: 8%; height: calc(42% - ${gap}px); left: 50%; width: 1px; margin-left: -0.5px;`;
        b.style.cssText = `${line} bottom: 8%; height: calc(42% - ${gap}px); left: 50%; width: 1px; margin-left: -0.5px;`;
      }
      loupe.appendChild(a);
      loupe.appendChild(b);
    };
    mkReticle(true);
    mkReticle(false);
    root.appendChild(loupe);

    // 指尖精确位置标记（取色盘偏移时仍能看到落点）
    const tipMark = document.createElement('div');
    tipMark.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: 18px;
      height: 18px;
      margin: 0;
      border-radius: 999px;
      border: 2px solid #fff;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35);
      pointer-events: none;
      display: none;
      will-change: transform;
      transform: translate3d(-9999px, -9999px, 0);
      z-index: 1;
    `;
    const tipCrossH = document.createElement('div');
    tipCrossH.style.cssText = `
      position: absolute; left: 3px; right: 3px; top: 50%; height: 1px;
      margin-top: -0.5px; background: rgba(255,255,255,0.95); pointer-events: none;
    `;
    const tipCrossV = document.createElement('div');
    tipCrossV.style.cssText = `
      position: absolute; top: 3px; bottom: 3px; left: 50%; width: 1px;
      margin-left: -0.5px; background: rgba(255,255,255,0.95); pointer-events: none;
    `;
    tipMark.appendChild(tipCrossH);
    tipMark.appendChild(tipCrossV);
    root.appendChild(tipMark);
    document.body.appendChild(root);

    let settled = false;
    let captureReady = false;
    /** 手指/鼠标是否正按下（按下预览，抬起才提交） */
    let fingerDown = false;
    let loupeShown = false;
    let activePointerId: number | null = null;
    let lastHex: string | null = null;
    let paintedHex: string | null | undefined = undefined;
    let lastX = window.innerWidth / 2;
    let lastY = window.innerHeight / 2;
    let commitPending = false;
    /** 截图未完成就松手：等就绪后按松手坐标提交 */
    let pendingRelease: { x: number; y: number } | null = null;
    /** 忽略开启取色后极短时间内的抬起（防止点吸管按钮的那次 pointerup 误提交） */
    const ignoreReleaseUntil = performance.now() + 320;

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('touchstart', onBlockTouch, true);
      window.removeEventListener('touchmove', onBlockTouch, true);
      window.removeEventListener('click', onSwallowClick, true);
      if (root.parentNode) root.parentNode.removeChild(root);
      sessionSurfaceCapture = null;
    };

    const finish = (hex: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(hex);
    };

    /** 位置 + 放大镜同步跟手（48px 绘制很轻，不再 rAF 延迟一帧） */
    const moveLoupeTo = (x: number, y: number) => {
      if (!loupeShown) {
        loupeShown = true;
        loupe.style.display = 'block';
        tipMark.style.display = 'block';
      }
      // 更贴手指，减少“漂”感
      const above = y >= 140;
      const lx = x - LOUPE / 2;
      const ly = above ? y - LOUPE - 18 : y + 22;
      loupe.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      tipMark.style.transform = `translate3d(${x - 9}px, ${y - 9}px, 0)`;
    };

    const drawMagnifier = (clientX: number, clientY: number) => {
      const cap = sessionSurfaceCapture;
      if (!magCtx || !cap) return;
      const half = SRC_CSS * 0.5;
      const sx = (clientX - cap.originX - half) * cap.scaleX;
      const sy = (clientY - cap.originY - half) * cap.scaleY;
      const sw = SRC_CSS * cap.scaleX;
      const sh = SRC_CSS * cap.scaleY;
      try {
        magCtx.drawImage(cap.canvas, sx, sy, sw, sh, 0, 0, MAG_RES, MAG_RES);
      } catch {
        magCtx.fillStyle = '#2a2a2a';
        magCtx.fillRect(0, 0, MAG_RES, MAG_RES);
      }
    };

    const paintCenterColor = (hex: string | null) => {
      if (hex === paintedHex) return;
      paintedHex = hex;
      centerDot.style.background = hex || '#888';
    };

    /** 按下/拖动：位置与放大内容同事件更新，最大化跟手 */
    const updatePreview = (x: number, y: number) => {
      lastX = x;
      lastY = y;
      moveLoupeTo(x, y);
      if (!captureReady) return;
      drawMagnifier(x, y);
      const hex = sampleSurfaceCapture(x, y);
      if (hex) lastHex = hex;
      paintCenterColor(lastHex);
    };

    const paintPreviewFrame = () => {
      if (!captureReady) return;
      drawMagnifier(lastX, lastY);
      const hex = sampleSurfaceCapture(lastX, lastY);
      if (hex) lastHex = hex;
      paintCenterColor(lastHex);
    };

    /** 松手：对松手位置取色并结束 */
    const commitPickAt = (x?: number, y?: number) => {
      if (settled || commitPending) return;

      const cx = typeof x === 'number' && Number.isFinite(x) ? x : lastX;
      const cy = typeof y === 'number' && Number.isFinite(y) ? y : lastY;
      lastX = cx;
      lastY = cy;
      fingerDown = false;
      activePointerId = null;

      if (!captureReady) {
        pendingRelease = { x: cx, y: cy };
        moveLoupeTo(cx, cy);
        return;
      }

      commitPending = true;
      const hex = sampleColorAtPoint(cx, cy, root) || lastHex;
      if (hex) {
        lastHex = hex;
        moveLoupeTo(cx, cy);
        paintCenterColor(lastHex);
      }
      finish(hex);
    };

    const beginPress = (pointerId: number, x: number, y: number) => {
      if (settled) return;
      if (fingerDown && activePointerId !== null && activePointerId !== pointerId) return;
      fingerDown = true;
      activePointerId = pointerId;
      pendingRelease = null;
      updatePreview(x, y);
    };

    const movePress = (pointerId: number, x: number, y: number) => {
      if (settled || !fingerDown) return;
      if (activePointerId !== null && activePointerId !== pointerId) return;
      updatePreview(x, y);
    };

    const endPress = (pointerId: number, x?: number, y?: number) => {
      if (settled) return;
      if (activePointerId !== null && activePointerId !== pointerId) return;
      if (!fingerDown && !pendingRelease) return;
      if (performance.now() < ignoreReleaseUntil) {
        fingerDown = false;
        activePointerId = null;
        loupeShown = false;
        loupe.style.display = 'none';
        tipMark.style.display = 'none';
        return;
      }
      commitPickAt(x, y);
    };

    // WebView2 触摸也走 Pointer Events；用 pointer 才能稳定跟手
    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      beginPress(e.pointerId, e.clientX, e.clientY);
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!fingerDown) return;
      e.preventDefault();
      e.stopPropagation();
      if (activePointerId !== null && e.pointerId !== activePointerId) return;
      // 合并中间移动点，只用最新坐标，减少无效绘制
      const coalesced =
        typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
      const pt =
        coalesced && coalesced.length > 0 ? coalesced[coalesced.length - 1] : e;
      movePress(e.pointerId, pt.clientX, pt.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endPress(e.pointerId, e.clientX, e.clientY);
    };

    const onPointerCancel = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      endPress(e.pointerId, lastX, lastY);
    };

    /** 仅阻止默认滚动，手势由 pointer 负责 */
    const onBlockTouch = (e: TouchEvent) => {
      if (settled) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onSwallowClick = (e: MouseEvent) => {
      if (settled) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('touchstart', onBlockTouch, { capture: true, passive: false });
    window.addEventListener('touchmove', onBlockTouch, { capture: true, passive: false });
    window.addEventListener('click', onSwallowClick, true);
    window.addEventListener('keydown', onKeyDown, true);

    // —— 挡板已挂上，再后台截图（透明挡板不影响像素）——
    void (async () => {
      try {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => setTimeout(r, 32));
        if (settled) return;

        // 截图时若未按下则先隐藏放大镜，避免截进取色 UI
        if (!fingerDown) {
          loupeShown = false;
          loupe.style.display = 'none';
          tipMark.style.display = 'none';
        }
        imagePixelCache.clear();
        // 优先窗口截图（跟手预览只依赖它）；失败再预热 DOM 图并手动画合成
        sessionSurfaceCapture = await captureWindowSurfaceBuffer();
        if (!sessionSurfaceCapture) {
          await prepareVisibleImageCache();
          if (settled) return;
          sessionSurfaceCapture = await captureEditSurfaceBuffer();
        }
        if (settled) return;

        captureReady = true;

        // 截图完成时手指仍按着：立刻刷新预览
        if (fingerDown) {
          updatePreview(lastX, lastY);
        } else if (pendingRelease) {
          const { x, y } = pendingRelease;
          pendingRelease = null;
          commitPickAt(x, y);
        }
      } catch (err) {
        console.warn('[EyeDropper] prepare failed', err);
        if (!settled) {
          captureReady = true;
          if (fingerDown) {
            updatePreview(lastX, lastY);
          } else if (pendingRelease) {
            const { x, y } = pendingRelease;
            pendingRelease = null;
            commitPickAt(x, y);
          }
        }
      }
    })();
  });
}

/** 原生 Chromium EyeDropper（WebView2 / Chrome） */
export async function pickColorNative(): Promise<string | null> {
  if (!isEyeDropperSupported()) return null;
  try {
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    const hex = result?.sRGBHex;
    return typeof hex === 'string' ? hex.toUpperCase() : null;
  } catch {
    // 用户 Esc 取消
    return null;
  }
}

/**
 * 打开取色器，返回 sRGBHex（如 '#FF0000'）；取消或不支持时返回 null
 * 默认：原生 Chromium EyeDropper（须在用户手势内调用 open）
 */
export async function pickColor(options: PickColorOptions = {}): Promise<string | null> {
  const { forceOverlay = false, forceNative = false } = options;

  if (forceOverlay) {
    return pickColorFromOverlay();
  }

  if (isEyeDropperSupported()) {
    return pickColorNative();
  }

  if (forceNative) return null;
  return pickColorFromOverlay();
}
