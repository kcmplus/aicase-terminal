import { type KeyboardLayout } from '../types';
import { createAccentLayout } from './qwerty';

/** French QWERTY layout with accent variants */
export const frLayout: KeyboardLayout = createAccentLayout('fr', 'FR', {
  a: ['à', 'â', 'æ', 'ä'],
  e: ['é', 'è', 'ê', 'ë'],
  i: ['î', 'ï'],
  o: ['ô', 'œ', 'ö'],
  u: ['ù', 'û', 'ü'],
  c: ['ç'],
  y: ['ÿ'],
});
