/**
 * 事件总线与颜色历史存储
 * 提供全局事件发布订阅机制，以及颜色历史记录的共享存储
 * 
 * 引用文件:
 * - src/skins/default/pages/Home.vue
 * - src/skins/default/pages/Customize.vue
 * - src/skins/default/components/EditCanvas.vue
 * - src/skins/default/components/ColorWheel.vue
 * - src/skins/japan/pages/Customize.vue
 * - src/skins/japan/components/EditCanvas.vue
 * - src/skins/japan/components/ColorWheel.vue
 */
import { reactive } from 'vue';
import type { ComponentInternalInstance } from 'vue';

type EventHandler<T = unknown> = (eventData: T) => void;

// 颜色历史记录项接口
export interface ColorHistoryItem {
  color: string;        // 颜色值（hex 或 rgba）
  brightness: number;   // 亮度 0-100
  opacity: number;      // 透明度 0-100
  hue: number;          // 色相 0-360
  saturation: number;   // 饱和度 0-100
}

const hexToHSB = (hex: string) => {
  const normalized = hex.replace('#', '').split(':')[0];
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return {
    h: h * 360,
    s: s * 100,
    b: v * 100,
  };
};

export const DEFAULT_COLOR_HISTORY: (ColorHistoryItem | null)[] = [
  { color: '#03ff03', brightness: 100, opacity: 100, hue: 120, saturation: 98.8 },
  { color: '#33cf45', brightness: 76.5, opacity: 100, hue: 126, saturation: 65.3 },
  { color: '#084f0b', brightness: 31, opacity: 100, hue: 124, saturation: 78.6 },
  { color: '#fef8f9', brightness: 99.2, opacity: 100, hue: 350, saturation: 66.7 },
  { color: '#d9d9d9', brightness: 85.1, opacity: 100, hue: 0, saturation: 0 },
  { color: '#000000', brightness: 0, opacity: 100, hue: 0, saturation: 0 },
  { color: '#192a31', brightness: 16.5, opacity: 100, hue: 195, saturation: 45 },
  { color: '#397f9b', brightness: 49.8, opacity: 100, hue: 195, saturation: 50 },
  { color: '#ff5d99', brightness: 69.8, opacity: 100, hue: 340, saturation: 100 },
  { color: '#ffd2e2', brightness: 91.8, opacity: 100, hue: 350, saturation: 70 },
  { color: '#ff6f37', brightness: 63.7, opacity: 100, hue: 25, saturation: 100 },
  { color: '#ff0088', brightness: 50, opacity: 100, hue: 320, saturation: 100 },
  null, null, null, null,
];

/** 以 color 字段为准同步 HSB，避免亮度元数据与 hex 不一致导致重进页面顺序/颜色错乱 */
export const normalizeColorHistoryItem = (item: ColorHistoryItem): ColorHistoryItem => {
  const raw = item.color.trim().toLowerCase();
  // 支持 rgba() / hex / hex:alpha
  const rgbaMatch = raw.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i);
  let hex: string;
  let opacity: number;
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3], 10).toString(16).padStart(2, '0');
    hex = `#${r}${g}${b}`;
    opacity = rgbaMatch[4] !== undefined
      ? Math.round(parseFloat(rgbaMatch[4]) * 100)
      : (item.opacity ?? 100);
  } else {
    hex = raw.split(':')[0];
    opacity = raw.includes(':')
      ? Math.round(parseFloat(raw.split(':')[1]) * 100)
      : (item.opacity ?? 100);
  }
  const hsb = hexToHSB(hex);

  return {
    color: opacity < 100 ? `${hex}:${(opacity / 100).toFixed(2)}` : hex,
    brightness: hsb.b,
    opacity,
    hue: hsb.h,
    saturation: hsb.s,
  };
};

export const loadColorHistoryFromStorage = (): void => {
  try {
    const stored = localStorage.getItem('colorHistorySlots');
    if (stored) {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          colorHistoryStore.history = parsed.map((color: string | null) => {
            if (!color) return null;
            const hex = color.split(':')[0];
            const hsb = hexToHSB(hex);
            return normalizeColorHistoryItem({
              color: color.toLowerCase(),
              brightness: hsb.b,
              opacity: color.includes(':') ? parseFloat(color.split(':')[1]) * 100 : 100,
              hue: hsb.h,
              saturation: hsb.s,
            });
          });
        } else {
          colorHistoryStore.history = parsed.map((item: ColorHistoryItem | null) =>
            item ? normalizeColorHistoryItem(item) : null,
          );
        }
        saveColorHistoryToStorage();
        return;
      }
    }
    if (colorHistoryStore.history.length === 0) {
      colorHistoryStore.history = [...DEFAULT_COLOR_HISTORY];
    }
  } catch (e) {
    console.error('Failed to load color history:', e);
    if (colorHistoryStore.history.length === 0) {
      colorHistoryStore.history = [...DEFAULT_COLOR_HISTORY];
    }
  }
};

export const saveColorHistoryToStorage = (): void => {
  try {
    localStorage.setItem('colorHistorySlots', JSON.stringify(colorHistoryStore.history));
  } catch (e) {
    console.error('Failed to save color history:', e);
  }
};

// 全局共享的颜色历史存储
export const colorHistoryStore = reactive({
  history: [] as (ColorHistoryItem | null)[]
});

interface EventListener<T = unknown> {
  handler: EventHandler<T>;
  context?: ComponentInternalInstance | null;
}

class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();

  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push({ handler: handler as EventHandler });
  }

  off<T = unknown>(event: string, handler?: EventHandler<T>): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    if (handler) {
      const index = eventListeners.findIndex(listener => listener.handler === handler);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    } else {
      this.listeners.set(event, []);
    }
  }

  emit<T = unknown>(event: string, eventData: T): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    eventListeners.forEach(({ handler }) => {
      try {
        handler(eventData);
      } catch (error) {
        console.error(`Error emitting event ${event}:`, error);
      }
    });
  }

  once<T = unknown>(event: string, handler: EventHandler<T>): void {
    const onceHandler: EventHandler<T> = (eventData) => {
      handler(eventData);
      this.off(event, onceHandler);
    };
    this.on(event, onceHandler);
  }
}

export const eventBus = new EventBus();

export const DrawingEvents = {
  COLOR_USED: 'drawing:color-used',
  BUCKET_USED: 'drawing:bucket-used',
  DRAWING_COMPLETED: 'drawing:completed',
  COLOR_HISTORY_UPDATED: 'drawing:color-history-updated',
  DRAWING_START: 'drawing:start',
};

export interface ColorUsedEvent {
  color: string;
  brightness: number;
  opacity: number;
  hue: number;
  saturation: number;
  mode: 'draw' | 'bucket';
}
