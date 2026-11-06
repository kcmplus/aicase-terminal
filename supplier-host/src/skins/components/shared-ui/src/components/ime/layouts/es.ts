import { type KeyboardLayout } from '../types';
import { createAccentLayout } from './qwerty';

/** Spanish QWERTY layout with accent variants */
export const esLayout: KeyboardLayout = createAccentLayout('es', 'ES', {
  a: ['á', 'à', 'ä'],
  e: ['é', 'è', 'ë'],
  i: ['í', 'ì', 'ï'],
  o: ['ó', 'ò', 'ö'],
  u: ['ú', 'ù', 'ü'],
  n: ['ñ'],
});
