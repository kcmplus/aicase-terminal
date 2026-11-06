export interface LayerData {
  id: string;
  type: 'image' | 'text' | 'sticker' | 'drawing';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
}

export type DrawingMode = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text';

export type PopupDrawingMode = DrawingMode | 'draw' | 'erase' | 'bucket' | null;

export interface FontOption {
  name: string;
  family: string;
  size?: number;
  weight?: string;
  style?: 'normal' | 'italic';
}

export function pickColor(): Promise<string> {
  return Promise.resolve('#3b82f6');
}

export const LayerPanel = {
  template: '<div>Layer Panel</div>'
};

export const VirtualKeyboardIME = {
  template: '<div>Virtual Keyboard</div>'
};