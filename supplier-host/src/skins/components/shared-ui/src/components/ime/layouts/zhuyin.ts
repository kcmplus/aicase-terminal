import { type KeyDef, type KeyboardLayout, a } from '../types';

const z = (char: string): KeyDef => ({ char, shift: char });

/**
 * 注音大千式 (Standard Bopomofo) layout
 * Displays bopomofo symbols directly on the virtual keyboard
 */
export const zhuyinLayout: KeyboardLayout = {
  lang: 'zh-TW',
  name: '注',
  hasShift: false,
  hasIME: true,
  numberRow: [
    z('1'), z('2'), z('3'), z('4'), z('5'),
    z('6'), z('7'), z('8'), z('9'), z('0'),
  ],
  rows: [
    // Row 1: 声母 (initials) 
    [
      z('ㄅ'), z('ㄆ'), z('ㄇ'), z('ㄈ'), z('ㄉ'), z('ㄊ'), z('ㄋ'), z('ㄌ'),
      z('ㄍ'), z('ㄎ'), z('ㄏ'),
    ],
    // Row 2: 声母 (initials) + 介母 (medials)
    [
      z('ㄐ'), z('ㄑ'), z('ㄒ'), z('ㄓ'), z('ㄔ'), z('ㄕ'), z('ㄖ'),
      z('ㄗ'), z('ㄘ'), z('ㄙ'),
    ],
    // Row 3: 韵母 (finals)
    [
      z('ㄧ'), z('ㄨ'), z('ㄩ'), z('ㄚ'), z('ㄛ'), z('ㄜ'), z('ㄝ'),
      z('ㄞ'), z('ㄟ'), z('ㄠ'), z('ㄡ'),
    ],
    // Row 4: 韵母 (finals) + 声调 (tones)
    [
      z('ㄢ'), z('ㄣ'), z('ㄤ'), z('ㄥ'), z('ㄦ'),
      z('ˊ'), z('ˇ'), z('ˋ'), z('˙'),
      a('backspace', '⌫', 1.3),
    ],
    // Row 5: bottom row
    [
      a('number', '123', 1.3),
      a('lang', '🌐', 1),
      a('space', ' ', 4),
      z('。'),
      a('enter', '✓', 1.5),
    ],
  ],
};
