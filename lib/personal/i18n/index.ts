// Isomorphic translator (works on server and client — dictionaries are plain modules).
import { dictionaries, type Dictionary } from './dictionaries';
import { DEFAULT_LOCALE, type Locale } from './config';

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

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] || dictionaries[DEFAULT_LOCALE];
}

// Returns a translator that resolves: locale dict -> English fallback -> raw key.
export function createTranslator(locale: Locale): TFunc {
  const dict = getDictionary(locale);
  const en = dictionaries[DEFAULT_LOCALE];
  return (key: string, vars?: Vars) => {
    const raw = dict[key] ?? en[key] ?? key;
    return interpolate(raw, vars);
  };
}

export { DEFAULT_LOCALE };
export type { Locale };
