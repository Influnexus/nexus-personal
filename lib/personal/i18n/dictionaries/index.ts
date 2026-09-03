// Central registry of Personal locale dictionaries. English is the canonical/fallback set.
import en from './en';
import hi from './hi';
import te from './te';
import ta from './ta';
import es from './es';
import de from './de';
import type { Locale } from '../config';

export type Dictionary = Record<string, string>;

// en is the source of truth for keys; other locales fall back to en per-key at lookup time.
export const dictionaries: Record<Locale, Dictionary> = { en, hi, te, ta, es, de };
export { en };
