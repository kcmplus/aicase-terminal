/**
 * 油漆桶填充 composable
 * 提供纯色图片生成功能，用于背景填充等场景
 */

/**
 * 创建纯色图片的 data URL
 * @param color 填充颜色（CSS 颜色值）
 * @param width 图片宽度，默认 200
 * @param height 图片高度，默认 200
 * @returns PNG data URL，失败返回空字符串
 */
export function createSolidColorImage(
  color: string,
  width = 200,
  height = 200,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export function useBucketFill() {
  return { createSolidColorImage };
}
