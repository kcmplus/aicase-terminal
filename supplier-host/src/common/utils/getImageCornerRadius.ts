/**
 * 从手机壳 body 图分析外形：圆角 + 实心剪影 mask。
 *
 * 注意：Tauri convertFileSrc 直接用 <img> drawImage 会污染画布；
 * 必须走 fetch → blob → createImageBitmap。
 *
 * 仅用 border-radius 无法贴合带透明边距的壳图，白底会从壳外透出；
 * 打印预览应使用 maskUrl 做 CSS mask 裁切。
 */

export type ImageCornerRadiusSource =
  | string
  | HTMLImageElement
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageBitmap
  | Blob;

export interface GetImageCornerRadiusOptions {
  /** alpha 大于该值视为不透明，默认 24 */
  alphaThreshold?: number;
  /** 与四角背景色的 RGB 距离小于该值视为“空白”，默认 28 */
  colorTolerance?: number;
  /** 显示宽度（CSS px） */
  displayWidth?: number;
  /** 显示高度（CSS px） */
  displayHeight?: number;
  /** 检测失败时的回退半径，默认 65 */
  fallbackRadius?: number;
  /** 降采样最大边长，默认 640 */
  maxSampleSize?: number;
}

export interface ImageCornerRadiusResult {
  radius: number;
  sourceRadius: number;
  width: number;
  height: number;
}

export interface PhoneCaseClipResult extends ImageCornerRadiusResult {
  /** 实心剪影 PNG（壳外形内不透明，壳外透明），用于 CSS mask-image */
  maskUrl: string;
  /** 直接绑到预览容器的裁切样式 */
  clipStyle: Record<string, string>;
}

type Rgba = { r: number; g: number; b: number; a: number };

const pixelIndex = (x: number, y: number, w: number) => (y * w + x) * 4;

const readPixel = (data: Uint8ClampedArray, x: number, y: number, w: number): Rgba => {
  const i = pixelIndex(x, y, w);
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
};

const colorDist = (a: Rgba, b: Rgba) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

async function loadBitmapFromUrl(src: string): Promise<ImageBitmap> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`[getImageCornerRadius] fetch failed: HTTP ${res.status} ${src}`);
  }
  const blob = await res.blob();
  return createImageBitmap(blob);
}

async function resolveToImageBitmap(
  source: ImageCornerRadiusSource,
): Promise<{ bitmap: ImageBitmap; width: number; height: number; close: boolean }> {
  if (typeof source === 'string') {
    const bitmap = await loadBitmapFromUrl(source);
    return { bitmap, width: bitmap.width, height: bitmap.height, close: true };
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    const bitmap = await createImageBitmap(source);
    return { bitmap, width: bitmap.width, height: bitmap.height, close: true };
  }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    return { bitmap: source, width: source.width, height: source.height, close: false };
  }
  if (source instanceof HTMLImageElement) {
    const bitmap = await createImageBitmap(source);
    return {
      bitmap,
      width: source.naturalWidth || source.width || bitmap.width,
      height: source.naturalHeight || source.height || bitmap.height,
      close: true,
    };
  }
  if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
    const bitmap = await createImageBitmap(source as CanvasImageSource);
    return { bitmap, width: source.width, height: source.height, close: true };
  }
  throw new Error('[getImageCornerRadius] unsupported source type');
}

function sampleBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  alphaThreshold: number,
): Rgba | null {
  const corners = [
    readPixel(data, 0, 0, w),
    readPixel(data, w - 1, 0, w),
    readPixel(data, 0, h - 1, w),
    readPixel(data, w - 1, h - 1, w),
  ];
  if (corners.every((c) => c.a <= alphaThreshold)) {
    return null;
  }
  return {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length),
    a: 255,
  };
}

function isSolid(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  alphaThreshold: number,
  bg: Rgba | null,
  colorTolerance: number,
): boolean {
  const i = pixelIndex(x, y, w);
  const a = data[i + 3];
  if (a <= alphaThreshold) return false;
  if (bg) {
    const px = { r: data[i], g: data[i + 1], b: data[i + 2], a };
    if (colorDist(px, bg) <= colorTolerance) return false;
  }
  return true;
}

function detectSourceRadiusPx(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  solid: (x: number, y: number) => boolean,
): number {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return 0;

  const searchLimit = Math.floor(Math.min(maxX - minX + 1, maxY - minY + 1) / 2);

  const leftMostAt = (y: number) => {
    for (let x = minX; x <= maxX; x++) if (solid(x, y)) return x;
    return maxX + 1;
  };
  const rightMostAt = (y: number) => {
    for (let x = maxX; x >= minX; x--) if (solid(x, y)) return x;
    return minX - 1;
  };
  const topMostAt = (x: number) => {
    for (let y = minY; y <= maxY; y++) if (solid(x, y)) return y;
    return maxY + 1;
  };
  const bottomMostAt = (x: number) => {
    for (let y = maxY; y >= minY; y--) if (solid(x, y)) return y;
    return minY - 1;
  };

  const samples = [
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (topMostAt(minX + d) <= minY) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (leftMostAt(minY + d) <= minX) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (topMostAt(maxX - d) <= minY) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (rightMostAt(minY + d) >= maxX) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (bottomMostAt(minX + d) >= maxY) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (leftMostAt(maxY - d) <= minX) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (bottomMostAt(maxX - d) >= maxY) return d;
      return 0;
    })(),
    (() => {
      for (let d = 0; d <= searchLimit; d++) if (rightMostAt(maxY - d) >= maxX) return d;
      return 0;
    })(),
  ].filter((v) => v > 0);

  if (!samples.length) {
    return Math.max(0, Math.min(leftMostAt(minY) - minX, searchLimit));
  }
  samples.sort((a, b) => a - b);
  return Math.max(0, Math.min(samples[Math.floor(samples.length / 2)], searchLimit));
}

/**
 * 从边缘洪水填充“壳外”背景，再把壳内（含开孔）填成不透明白底剪影。
 * 这样 CSS mask 能裁掉壳外白边，又不会挖掉中间图案区。
 */
function buildFilledSilhouetteMaskUrl(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  isBackground: (x: number, y: number) => boolean,
): string {
  const exterior = new Uint8Array(w * h);
  const stack: number[] = [];

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (exterior[i]) return;
    if (!isBackground(x, y)) return;
    exterior[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const out = ctx.createImageData(w, h);
  const od = out.data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (exterior[i]) {
      od[o] = 0;
      od[o + 1] = 0;
      od[o + 2] = 0;
      od[o + 3] = 0;
    } else {
      od[o] = 255;
      od[o + 1] = 255;
      od[o + 2] = 255;
      od[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

function analyzePhoneCaseImage(
  data: Uint8ClampedArray,
  sampleW: number,
  sampleH: number,
  sampleScale: number,
  width: number,
  height: number,
  options: GetImageCornerRadiusOptions,
): PhoneCaseClipResult {
  const {
    alphaThreshold = 24,
    colorTolerance = 28,
    fallbackRadius = 65,
  } = options;

  const bg = sampleBackground(data, sampleW, sampleH, alphaThreshold);
  const solid = (x: number, y: number) =>
    isSolid(data, x, y, sampleW, alphaThreshold, bg, colorTolerance);
  const isBackground = (x: number, y: number) => !solid(x, y);

  const sampleRadius = detectSourceRadiusPx(data, sampleW, sampleH, solid);
  const sourceRadius = sampleScale > 0 ? sampleRadius / sampleScale : sampleRadius;

  const displayWidth = options.displayWidth ?? width;
  const displayHeight = options.displayHeight ?? (displayWidth * height) / width;
  const scaleX = displayWidth / width;
  const scaleY = displayHeight / height;
  const displayRadius = Math.round(sourceRadius * ((scaleX + scaleY) / 2));
  const radius = displayRadius > 0 ? displayRadius : fallbackRadius;

  const maskUrl = buildFilledSilhouetteMaskUrl(data, sampleW, sampleH, isBackground);
  const clipStyle: Record<string, string> = maskUrl
    ? {
        WebkitMaskImage: `url(${maskUrl})`,
        maskImage: `url(${maskUrl})`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }
    : {
        borderRadius: `${radius}px`,
      };

  return {
    radius,
    sourceRadius: Math.round(sourceRadius),
    width,
    height,
    maskUrl,
    clipStyle,
  };
}

async function sampleImageData(
  source: ImageCornerRadiusSource,
  maxSampleSize: number,
): Promise<{
  data: Uint8ClampedArray;
  sampleW: number;
  sampleH: number;
  sampleScale: number;
  width: number;
  height: number;
  closeBitmap: boolean;
  bitmap: ImageBitmap | null;
}> {
  const resolved = await resolveToImageBitmap(source);
  const { bitmap, width, height, close: closeBitmap } = resolved;
  if (!width || !height) {
    if (closeBitmap) bitmap.close?.();
    throw new Error('[getImageCornerRadius] empty image');
  }

  const sampleScale = Math.min(1, maxSampleSize / Math.max(width, height));
  const sampleW = Math.max(1, Math.round(width * sampleScale));
  const sampleH = Math.max(1, Math.round(height * sampleScale));

  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
  if (!ctx) {
    if (closeBitmap) bitmap.close?.();
    throw new Error('[getImageCornerRadius] no 2d context');
  }

  ctx.clearRect(0, 0, sampleW, sampleH);
  ctx.drawImage(bitmap, 0, 0, sampleW, sampleH);
  if (closeBitmap) bitmap.close?.();

  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  return {
    data,
    sampleW,
    sampleH,
    sampleScale,
    width,
    height,
    closeBitmap: false,
    bitmap: null,
  };
}

/** 仅返回圆角（兼容旧用法） */
export async function getImageCornerRadius(
  source: ImageCornerRadiusSource,
  options: GetImageCornerRadiusOptions = {},
): Promise<ImageCornerRadiusResult> {
  const result = await getPhoneCaseClip(source, options);
  return {
    radius: result.radius,
    sourceRadius: result.sourceRadius,
    width: result.width,
    height: result.height,
  };
}

/**
 * 分析手机壳外形，返回圆角 + 实心剪影 mask（推荐用于打印预览裁切）。
 */
export async function getPhoneCaseClip(
  source: ImageCornerRadiusSource,
  options: GetImageCornerRadiusOptions = {},
): Promise<PhoneCaseClipResult> {
  const { fallbackRadius = 65, maxSampleSize = 640 } = options;
  const empty: PhoneCaseClipResult = {
    radius: fallbackRadius,
    sourceRadius: 0,
    width: 0,
    height: 0,
    maskUrl: '',
    clipStyle: { borderRadius: `${fallbackRadius}px` },
  };

  try {
    const sampled = await sampleImageData(source, maxSampleSize);
    return analyzePhoneCaseImage(
      sampled.data,
      sampled.sampleW,
      sampled.sampleH,
      sampled.sampleScale,
      sampled.width,
      sampled.height,
      options,
    );
  } catch (err) {
    console.warn('[getPhoneCaseClip]', err);
    return empty;
  }
}
