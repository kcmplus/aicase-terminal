import { type KeyboardLayout } from '../types';
import { createAccentLayout } from './qwerty';

/** Portuguese QWERTY layout with accent variants */
export const ptLayout: KeyboardLayout = createAccentLayout('pt', 'PT', {
  a: ['á', 'à', 'â', 'ã', 'ä'],
  e: ['é', 'è', 'ê'],
  i: ['í'],
  o: ['ó', 'ò', 'ô', 'õ'],
  u: ['ú', 'ù'],
  c: ['ç'],
});
