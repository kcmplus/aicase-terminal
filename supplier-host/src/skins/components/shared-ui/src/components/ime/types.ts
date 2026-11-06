/**
 * 多语言 IME 虚拟键盘类型定义
 */

/** 字体信息 */
export interface FontOption {
  /** 显示名称 */
  name: string;
  /** CSS font-family 值 */
  family: string;
}

/** 按键定义 */
export interface KeyDef {
  /** 字符（普通按键） */
  char?: string;
  /** Shift 状态字符 */
  shift?: string;
  /** 功能键类型 */
  action?: 'shift' | 'backspace' | 'space' | 'enter' | 'lang' | 'number';
  /** 显示标签（覆盖默认） */
  label?: string;
  /** 宽度倍数（默认 1） */
  width?: number;
  /** 长按变体字符（重音等） */
  variants?: string[];
}

/** 键盘布局 */
export interface KeyboardLayout {
  /** 语言代码 */
  lang: string;
  /** 布局名称 */
  name: string;
  /** 按键行 */
  rows: KeyDef[][];
  /** 数字行 */
  numberRow: KeyDef[];
  /** 是否支持 Shift */
  hasShift: boolean;
  /** 是否使用 IME 引擎 */
  hasIME: boolean;
}

/** IME 引擎输出 */
export interface IMEOutput {
  /** 提交到输出的文本 */
  committed: string;
  /** 当前组合中的文本（显示在候选栏上方） */
  composition: string;
  /** 候选词列表 */
  candidates: string[];
}

/** IME 引擎状态 */
export interface IMEState {
  composition: string;
  candidates: string[];
  hasComposition: boolean;
}

/** IME 引擎接口 */
export interface IMEEngine {
  /** 输入一个字符 */
  input(char: string): IMEOutput;
  /** 处理退格 */
  backspace(): IMEOutput;
  /** 选择候选词 */
  select(index: number): IMEOutput;
  /** 获取当前状态 */
  getState(): IMEState;
  /** 重置引擎 */
  reset(): void;
  /** 销毁引擎（释放资源） */
  destroy?(): void;
}

/** 语言配置 */
export interface LanguageConfig {
  code: string;
  label: string;
  flag?: string;
  layout: KeyboardLayout;
  createEngine?: () => IMEEngine | Promise<IMEEngine>;
}

// ── 辅助函数 ──

/** 创建字符按键 */
export const c = (char: string, shift?: string, variants?: string[]): KeyDef => ({
  char,
  shift: shift ?? char.toUpperCase(),
  variants,
});

/** 创建功能按键 */
export const a = (action: KeyDef['action'], label: string, width?: number): KeyDef => ({
  action,
  label,
  width,
});

/** 批量创建字符按键行 */
export const charRow = (...chars: (string | [string, string] | [string, string, string[]])[]): KeyDef[] =>
  chars.map(ch => {
    if (typeof ch === 'string') return c(ch);
    if (ch.length === 2) return c(ch[0], ch[1]);
    return c(ch[0], ch[1], ch[2]);
  });
