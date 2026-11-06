import { type KeyDef, type KeyboardLayout, c, a } from '../types';

/**
 * 创建带重音变体的 QWERTY 布局
 * @param lang 语言代码
 * @param name 显示名称
 * @param variants 重音变体映射 { char: [variants] }
 * @param extraSymbols 额外符号行（可选）
 */
export function createAccentLayout(
  lang: string,
  name: string,
  variants: Record<string, string[]>,
  extraSymbols?: KeyDef[],
): KeyboardLayout {
  const cv = (char: string): KeyDef => {
    const v = variants[char.toLowerCase()];
    return c(char, char.toUpperCase(), v);
  };

  return {
    lang,
    name,
    hasShift: true,
    hasIME: false,
    numberRow: [
      c('1'), c('2'), c('3'), c('4'), c('5'),
      c('6'), c('7'), c('8'), c('9'), c('0'),
    ],
    rows: [
      [cv('q'), cv('w'), cv('e'), cv('r'), cv('t'), cv('y'), cv('u'), cv('i'), cv('o'), cv('p')],
      [cv('a'), cv('s'), cv('d'), cv('f'), cv('g'), cv('h'), cv('j'), cv('k'), cv('l')],
      [
        a('shift', '⇧', 1.3),
        cv('z'), cv('x'), cv('c'), cv('v'), cv('b'), cv('n'), cv('m'),
        a('backspace', '⌫', 1.3),
      ],
      [
        a('number', '123', 1.3),
        a('lang', '🌐', 1),
        a('space', ' ', 4),
        c('.', ','),
        a('enter', '✓', 1.5),
      ],
    ],
  };
}
