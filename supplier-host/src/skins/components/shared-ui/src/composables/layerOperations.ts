import type { LayerData } from '../types/layer';

/** 获取非 frame 图层的最大索引（frame 图层始终在最顶层） */
function getMaxNonFrameIndex(layers: LayerData[]): number {
  for (let i = layers.length - 1; i >= 0; i--) {
    if (layers[i].type !== 'frame') return i;
  }
  return -1;
}

/** 上移图层（数组索引+1 = 更靠近顶层） */
export function moveLayerUp(layers: LayerData[], id: string): LayerData[] {
  const index = layers.findIndex(l => l.id === id);
  if (index === -1 || index >= layers.length - 1) return layers;
  // frame 图层不可移动
  if (layers[index].type === 'frame') return layers;
  // 不能移动到 frame 图层上方
  if (layers[index + 1].type === 'frame') return layers;
  const result = [...layers];
  [result[index], result[index + 1]] = [result[index + 1], result[index]];
  return result;
}

/** 下移图层（数组索引-1 = 更靠近底层） */
export function moveLayerDown(layers: LayerData[], id: string): LayerData[] {
  const index = layers.findIndex(l => l.id === id);
  if (index <= 0) return layers;
  // frame 图层不可移动
  if (layers[index].type === 'frame') return layers;
  const result = [...layers];
  [result[index], result[index - 1]] = [result[index - 1], result[index]];
  return result;
}

/** 移除图层 */
export function removeLayer(layers: LayerData[], id: string): LayerData[] {
  return layers.filter(l => l.id !== id);
}

/** 拖拽排序：将 fromIndex 处的图层移动到 toIndex */
export function reorderLayers(layers: LayerData[], fromIndex: number, toIndex: number): LayerData[] {
  if (fromIndex === toIndex) return layers;
  if (fromIndex < 0 || fromIndex >= layers.length) return layers;
  if (toIndex < 0 || toIndex >= layers.length) return layers;
  // frame 图层不参与拖拽排序
  if (layers[fromIndex].type === 'frame') return layers;
  // 不能拖到 frame 图层上方
  const maxNonFrame = getMaxNonFrameIndex(layers);
  if (toIndex > maxNonFrame) return layers;
  const result = [...layers];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result;
}

/** 切换图层可见性 */
export function toggleLayerVisibility(layers: LayerData[], id: string): LayerData[] {
  return layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l);
}
