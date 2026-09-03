// Nexus Personal — i18n configuration. Isolated to the Personal product (Enterprise/CFO untouched).
// Adding a new language later = add a dictionary file + one entry here. No app rewrite needed.

export const LOCALES = ['en', 'hi', 'te', 'ta', 'es', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'nexus_lang';

// Display metadata for the language selector. `native` is what a speaker calls their own language.
export const LOCALE_META: Record<Locale, { native: string; english: string; flag: string }> = {
  en: { native: 'English', english: 'English', flag: '🇬🇧' },
  hi: { native: 'हिन्दी', english: 'Hindi', flag: '🇮🇳' },
  te: { native: 'తెలుగు', english: 'Telugu', flag: '🇮🇳' },
  ta: { native: 'தமிழ்', english: 'Tamil', flag: '🇮🇳' },
  es: { native: 'Español', english: 'Spanish', flag: '🇪🇸' },
  de: { native: 'Deutsch', english: 'German', flag: '🇩🇪' },
};

// Languages Ask Nexus can converse in (kept in sync with LOCALES). Used to build the AI directive.
export const AI_LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  hi: 'Hindi (हिन्दी)',
  te: 'Telugu (తెలుగు)',
  ta: 'Tamil (தமிழ்)',
  es: 'Spanish (Español)',
  de: 'German (Deutsch)',
};

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x);
}

// Accepts 'hi', 'hi-IN', 'HI', undefined, etc. Falls back to English. RTL-ready shape (none RTL yet).
export function normalizeLocale(value?: string | null): Locale {
  if (!value) return DEFAULT_LOCALE;
  const base = value.toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? (base as Locale) : DEFAULT_LOCALE;
}
