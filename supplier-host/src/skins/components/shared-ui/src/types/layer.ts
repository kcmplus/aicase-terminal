/**
 * 图层管理类型定义
 */

/** 图层类型 */
export type LayerType = 'background' | 'sticker' | 'drawing' | 'frame' | 'text';

/** 图层变换信息 */
export interface LayerTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** 水平翻转，旧数据不存在时按 false 处理 */
  flipX?: boolean;
  flipY: boolean;
}

/** 图层裁切比例，按图片本地坐标保存 */
export interface LayerCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 统一图层数据 */
export interface LayerData {
  id: string;
  type: LayerType;
  url: string;
  /**
   * 本地磁盘路径（图库/素材原始 path）。
   * 用于取色等场景：asset.localhost 会污染 canvas，需经 Tauri 读文件。
   */
  localPath?: string;
  transform: LayerTransform;
  locked: boolean;
  visible: boolean;
  name: string;
  crop?: LayerCrop;
  /** 文字图层的编辑元数据（仅 type === 'text' 时存在） */
  textMeta?: {
    content: string;
    fontSize: number;
    color: string;
    fontFamily: string;
  };
}
