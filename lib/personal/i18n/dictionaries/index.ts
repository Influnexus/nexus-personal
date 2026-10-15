// Central registry of Personal locale dictionaries.
//
// A locale is included here ONLY when a hand-verified dictionary exists. All
// other registered locales resolve via the English fallback at translator
// lookup time (see ../index.ts). That fallback path is what lets us honestly
// register 25+ languages without pretending they are fully translated.
//
// To promote a language to 'full': (1) drop `./xx.ts` with the same keys as en,
// (2) import it here, (3) flip `translationStatus` to 'full' in config.ts.
import en from './en';
import hi from './hi';
import te from './te';
import es from './es';
import de from './de';
import type { LocaleCode } from '../config';

export type Dictionary = Record<string, string>;

// en is the canonical source of truth for keys; other locales fall back to en
// per-key at lookup time. Only fully-translated locales are registered here.
export const dictionaries: Record<LocaleCode, Dictionary> = { en, hi, te, es, de };
export { en };
