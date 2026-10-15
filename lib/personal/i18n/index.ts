// Isomorphic translator (works on server and client — dictionaries are plain modules).
import { dictionaries, type Dictionary } from './dictionaries';
import { DEFAULT_LOCALE, getLanguage, type LocaleCode } from './config';

export type Vars = Record<string, string | number>;
export type TFunc = (key: string, vars?: Vars) => string;

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  let out = str;
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(String(vars[k]));
  }
  return out;
}

/**
 * Returns the dictionary for a locale. Registered-but-not-translated locales
 * transparently resolve to English — that's the promise made by the registry.
 */
export function getDictionary(locale: LocaleCode): Dictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}

/**
 * Creates a translator that resolves in this order:
 *   1. Locale dictionary (if fully translated)
 *   2. English fallback (guaranteed)
 *   3. The raw key (defensive, never blank)
 *
 * Interpolation variables are substituted last so numeric/currency figures
 * from the deterministic finance engine flow through untouched.
 */
export function createTranslator(locale: LocaleCode): TFunc {
  const dict = getDictionary(locale);
  const en = dictionaries[DEFAULT_LOCALE];
  return (key: string, vars?: Vars) => {
    const raw = dict[key] ?? en[key] ?? key;
    return interpolate(raw, vars);
  };
}

/**
 * Locale-aware number formatting. Falls back to en-US on unknown locales so
 * we never throw. This is display-only — the underlying number never changes.
 */
export function formatNumber(value: number, locale: LocaleCode, opts?: Intl.NumberFormatOptions): string {
  const formattingLocale = getLanguage(locale).formattingLocale;
  try {
    return new Intl.NumberFormat(formattingLocale, opts).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', opts).format(value);
  }
}

export { DEFAULT_LOCALE };
export type { LocaleCode as Locale };
