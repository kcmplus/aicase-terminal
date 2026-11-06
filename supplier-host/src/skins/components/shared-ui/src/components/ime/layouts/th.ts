import { type KeyboardLayout, c, a } from '../types';

/**
 * Thai Kedmanee (เกษมณี) layout
 * Standard Thai keyboard mapping
 */
export const thLayout: KeyboardLayout = {
  lang: 'th',
  name: 'ไทย',
  hasShift: true,
  hasIME: false,
  numberRow: [
    c('๐'), c('๑'), c('๒'), c('๓'), c('๔'),
    c('๕'), c('๖'), c('๗'), c('๘'), c('๙'),
  ],
  rows: [
    // Row 1 (QWERTY q-p positions)
    [
      c('ๆ', '๐'), c('ไ', '"'), c('ำ', '฿'), c('พ', 'ภ'), c('ะ', 'ธ'),
      c('ั', 'ู'), c('ี', '฿'), c('ร', 'ณ'), c('น', 'ฯ'), c('ย', 'ญ'),
      c('บ', 'ฐ'),
    ],
    // Row 2 (QWERTY a-l positions)
    [
      c('ฟ', 'ฤ'), c('ห', 'ฆ'), c('ก', 'ฏ'), c('ด', 'โ'), c('เ', 'ฌ'),
      c('้', '็'), c('่', '๋'), c('า', 'ษ'), c('ส', 'ศ'), c('ว', 'ซ'),
      c('ง', '.'),
    ],
    // Row 3 (QWERTY z-m positions + shift/backspace)
    [
      a('shift', '⇧', 1.3),
      c('ผ', '('), c('ป', ')'), c('แ', 'ฉ'), c('อ', 'ฮ'), c('ิ', 'ฺ'),
      c('ื', '์'), c('ท', '?'), c('ม', 'ฒ'),
      a('backspace', '⌫', 1.3),
    ],
    // Row 4 (bottom row)
    [
      a('number', '123', 1.3),
      a('lang', '🌐', 1),
      a('space', ' ', 4),
      c('.', ','),
      a('enter', '✓', 1.5),
    ],
  ],
};
