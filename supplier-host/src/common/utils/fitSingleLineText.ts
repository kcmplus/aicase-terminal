export interface FitSingleLineLengthHint {
  /** 文本长度大于该值时使用对应字号作为起始值 */
  longerThan: number;
  fontSize: number;
}

export interface FitSingleLineTextOptions {
  maxFontSize: number;
  minFontSize: number;
  /** 宽度约束容器；默认使用文字元素自身 */
  container?: HTMLElement | null;
  /**
   * 是否从容器宽度中扣除左右 padding。
   * 当 container 与文字元素不同时默认 true，否则默认 false。
   */
  subtractPadding?: boolean;
  /** 按字数给出更小的起始字号（从 longerThan 大到小匹配） */
  lengthBasedSizes?: FitSingleLineLengthHint[];
  /** 仍溢出时收紧字间距的下限；不传则不调整字间距 */
  minLetterSpacing?: number;
  letterSpacingStep?: number;
  lineHeight?: string;
}

/** 计算容器可用于单行文字的宽度 */
export function getAvailableTextWidth(container: HTMLElement, subtractPadding = false): number {
  if (!subtractPadding) {
    return container.clientWidth;
  }
  const style = getComputedStyle(container);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(0, container.clientWidth - padX);
}

function resolveStartFontSize(
  textLength: number,
  maxFontSize: number,
  lengthBasedSizes?: FitSingleLineLengthHint[],
): number {
  if (!lengthBasedSizes?.length) {
    return maxFontSize;
  }
  const sorted = [...lengthBasedSizes].sort((a, b) => b.longerThan - a.longerThan);
  for (const hint of sorted) {
    if (textLength > hint.longerThan) {
      return hint.fontSize;
    }
  }
  return maxFontSize;
}

/**
 * 将文字压缩到单行完整显示：必要时缩小字号，可选收紧字间距。
 * @returns 最终字号（px）
 */
export function fitSingleLineText(el: HTMLElement, options: FitSingleLineTextOptions): number {
  const {
    maxFontSize,
    minFontSize,
    container = el,
    lengthBasedSizes,
    minLetterSpacing,
    letterSpacingStep = 0.15,
    lineHeight,
  } = options;

  const measureTarget = container ?? el;
  const subtractPadding = options.subtractPadding ?? measureTarget !== el;
  const available = getAvailableTextWidth(measureTarget, subtractPadding);
  if (available <= 0) {
    return maxFontSize;
  }

  const textLength = (el.textContent || '').trim().length;
  let fontSize = resolveStartFontSize(textLength, maxFontSize, lengthBasedSizes);

  el.style.whiteSpace = 'nowrap';
  el.style.fontSize = `${fontSize}px`;
  if (lineHeight !== undefined) {
    el.style.lineHeight = lineHeight;
  }
  if (minLetterSpacing !== undefined) {
    el.style.letterSpacing = '0px';
  }

  if (el.scrollWidth <= available) {
    return fontSize;
  }

  // 有字间距压缩时，先按比例跳到接近可用宽度的字号
  if (minLetterSpacing !== undefined) {
    const ratio = available / el.scrollWidth;
    fontSize = Math.max(minFontSize, Math.floor(maxFontSize * ratio));
    el.style.fontSize = `${fontSize}px`;

    let letterSpacing = 0;
    while (el.scrollWidth > available && letterSpacing > minLetterSpacing) {
      letterSpacing -= letterSpacingStep;
      el.style.letterSpacing = `${letterSpacing.toFixed(2)}px`;
    }
  }

  while (fontSize > minFontSize && el.scrollWidth > available) {
    fontSize -= 1;
    el.style.fontSize = `${fontSize}px`;
  }

  return fontSize;
}

/** 合并多次 fit 请求到下一帧，避免频繁强制重排 */
export function createRafScheduler() {
  let frame = 0;

  return {
    schedule(fn: () => void) {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        fn();
      });
    },
    cancel() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
  };
}
