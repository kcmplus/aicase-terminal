import { type KeyboardLayout, c, a } from '../types';

/**
 * Korean Dubeolsik (두벌식) layout
 * Standard Korean keyboard mapping — keys produce jamo characters
 */
export const koLayout: KeyboardLayout = {
  lang: 'ko',
  name: '한',
  hasShift: true,
  hasIME: true,
  numberRow: [
    c('1'), c('2'), c('3'), c('4'), c('5'),
    c('6'), c('7'), c('8'), c('9'), c('0'),
  ],
  rows: [
    // Row 1: ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ (shift: ㅃㅉㄸㄲㅆ)
    [
      c('ㅂ', 'ㅃ'), c('ㅈ', 'ㅉ'), c('ㄷ', 'ㄸ'), c('ㄱ', 'ㄲ'), c('ㅅ', 'ㅆ'),
      c('ㅛ', 'ㅛ'), c('ㅕ', 'ㅕ'), c('ㅑ', 'ㅑ'), c('ㅐ', 'ㅒ'), c('ㅔ', 'ㅖ'),
    ],
    // Row 2: ㅁㄴㅇㄹㅎㅗㅓㅏㅣ
    [
      c('ㅁ', 'ㅁ'), c('ㄴ', 'ㄴ'), c('ㅇ', 'ㅇ'), c('ㄹ', 'ㄹ'), c('ㅎ', 'ㅎ'),
      c('ㅗ', 'ㅗ'), c('ㅓ', 'ㅓ'), c('ㅏ', 'ㅏ'), c('ㅣ', 'ㅣ'),
    ],
    // Row 3: ㅋㅌㅊㅍㅠㅜㅡ + shift/backspace
    [
      a('shift', '⇧', 1.3),
      c('ㅋ', 'ㅋ'), c('ㅌ', 'ㅌ'), c('ㅊ', 'ㅊ'), c('ㅍ', 'ㅍ'),
      c('ㅠ', 'ㅠ'), c('ㅜ', 'ㅜ'), c('ㅡ', 'ㅡ'),
      a('backspace', '⌫', 1.3),
    ],
    // Row 4: bottom row
    [
      a('number', '123', 1.3),
      a('lang', '🌐', 1),
      a('space', ' ', 4),
      c('.', ','),
      a('enter', '✓', 1.5),
    ],
  ],
};
