/**
 * 涂鸦功能类型定义
 */

/**
 * 绘制点坐标
 */
export interface DrawPoint {
  x: number;
  y: number;
}

/**
 * 绘制模式
 */
export type DrawingMode = 'draw' | 'erase' | 'disabled' | 'bucket';

/**
 * 弹出面板绘制模式（含油漆桶）
 */
export type PopupDrawingMode = 'draw' | 'erase' | 'bucket' | 'disabled';

/**
 * 绘制配置
 */
export interface DrawingConfig {
  color: string;
  size: number;
}
