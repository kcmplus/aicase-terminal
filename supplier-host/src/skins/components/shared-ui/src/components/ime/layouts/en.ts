import { type KeyboardLayout, c, a, charRow } from '../types';

/** English QWERTY layout */
export const enLayout: KeyboardLayout = {
  lang: 'en',
  name: 'EN',
  hasShift: true,
  hasIME: false,
  numberRow: charRow('1', '2', '3', '4', '5', '6', '7', '8', '9', '0'),
  rows: [
    charRow('q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'),
    charRow('a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'),
    [
      a('shift', '⇧', 1.3),
      ...charRow('z', 'x', 'c', 'v', 'b', 'n', 'm'),
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
