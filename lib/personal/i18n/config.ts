// Nexus Personal — Global Language Registry (Sprint P7.1).
//
// This module is the *single source of truth* for every locale Personal supports.
// Adding a new language later means adding one entry here (plus, optionally, a full
// dictionary file). No component, no route handler, and no test needs to change.
//
// Design rules (do not violate):
//   1. `Locale` is an open `string` — never a hard union. Anything else is a hard-code trap.
//   2. Every entry carries rich metadata (native name, English name, BCP-47 locale,
//      direction, formatting locale, and translation status).
//   3. A language is ONLY marked `translationStatus: 'full'` when a hand-verified
//      dictionary exists. Machine-translated or partial coverage MUST use 'fallback'.
//   4. English is the guaranteed fallback for every key at translator lookup time.
//   5. This registry is UI + AI + testing safe — it must never depend on Next.js server APIs.
//
// Enterprise/CFO code MUST NOT import from this module. Personal only.

export type LocaleCode = string; // open, forward-compatible with new registry entries
// Kept for backwards compatibility with existing Personal call sites.
export type Locale = LocaleCode;

export type TextDirection = 'ltr' | 'rtl';
export type TranslationStatus = 'full' | 'fallback';

export interface LanguageEntry {
  /** Short language code used everywhere (cookie value, URL params, dict key). */
  code: LocaleCode;
  /** How native speakers write the language name. Rendered in the language selector. */
  nativeName: string;
  /** Canonical English name, used for a11y labels and AI prompts. */
  englishName: string;
  /** BCP-47 locale for `Intl.NumberFormat` / `Intl.DateTimeFormat`. */
  formattingLocale: string;
  /** Text direction — enables RTL scaffolding for Arabic, Urdu, etc. */
  direction: TextDirection;
  /**
   * `full`     — hand-verified dictionary lives under `dictionaries/<code>.ts`.
   * `fallback` — registered but strings resolve to English (honest coverage claim).
   */
  translationStatus: TranslationStatus;
  /** Optional emoji flag for a friendly selector row. Purely decorative. */
  flag?: string;
}

// ---------------------------------------------------------------------------
// LANGUAGE REGISTRY — add rows here to expand Personal's language catalog.
// ---------------------------------------------------------------------------
// Full-translated set (verified this pass): en, hi, te, es, de.
// Everything else is honestly labeled as English-fallback until a verified
// dictionary is dropped in and its status flipped to 'full'.
export const LANGUAGE_REGISTRY: LanguageEntry[] = [
  // Fully translated
  { code: 'en', nativeName: 'English',   englishName: 'English',    formattingLocale: 'en',    direction: 'ltr', translationStatus: 'full',     flag: '🇬🇧' },
  { code: 'hi', nativeName: 'हिन्दी',    englishName: 'Hindi',      formattingLocale: 'hi-IN', direction: 'ltr', translationStatus: 'full',     flag: '🇮🇳' },
  { code: 'te', nativeName: 'తెలుగు',     englishName: 'Telugu',     formattingLocale: 'te-IN', direction: 'ltr', translationStatus: 'full',     flag: '🇮🇳' },
  { code: 'es', nativeName: 'Español',   englishName: 'Spanish',    formattingLocale: 'es-ES', direction: 'ltr', translationStatus: 'full',     flag: '🇪🇸' },
  { code: 'de', nativeName: 'Deutsch',   englishName: 'German',     formattingLocale: 'de-DE', direction: 'ltr', translationStatus: 'full',     flag: '🇩🇪' },

  // Registered — English fallback (honest coverage; add dict + flip status to promote)
  // Indian languages
  { code: 'gu', nativeName: 'ગુજરાતી',   englishName: 'Gujarati',   formattingLocale: 'gu-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'mr', nativeName: 'मराठी',     englishName: 'Marathi',    formattingLocale: 'mr-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'bn', nativeName: 'বাংলা',      englishName: 'Bengali',    formattingLocale: 'bn-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ',     englishName: 'Punjabi',    formattingLocale: 'pa-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'ta', nativeName: 'தமிழ்',      englishName: 'Tamil',      formattingLocale: 'ta-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'kn', nativeName: 'ಕನ್ನಡ',      englishName: 'Kannada',    formattingLocale: 'kn-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'ml', nativeName: 'മലയാളം',    englishName: 'Malayalam',  formattingLocale: 'ml-IN', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇳' },
  { code: 'ur', nativeName: 'اردو',         englishName: 'Urdu',       formattingLocale: 'ur-PK', direction: 'rtl', translationStatus: 'fallback', flag: '🇵🇰' },

  // European languages
  { code: 'fr', nativeName: 'Français',   englishName: 'French',     formattingLocale: 'fr-FR', direction: 'ltr', translationStatus: 'fallback', flag: '🇫🇷' },
  { code: 'pt', nativeName: 'Português',  englishName: 'Portuguese', formattingLocale: 'pt-PT', direction: 'ltr', translationStatus: 'fallback', flag: '🇵🇹' },
  { code: 'it', nativeName: 'Italiano',   englishName: 'Italian',    formattingLocale: 'it-IT', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇹' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch',      formattingLocale: 'nl-NL', direction: 'ltr', translationStatus: 'fallback', flag: '🇳🇱' },
  { code: 'ru', nativeName: 'Русский',   englishName: 'Russian',    formattingLocale: 'ru-RU', direction: 'ltr', translationStatus: 'fallback', flag: '🇷🇺' },
  { code: 'tr', nativeName: 'Türkçe',    englishName: 'Turkish',    formattingLocale: 'tr-TR', direction: 'ltr', translationStatus: 'fallback', flag: '🇹🇷' },

  // East / Southeast Asian languages
  { code: 'ja', nativeName: '日本語',      englishName: 'Japanese',   formattingLocale: 'ja-JP', direction: 'ltr', translationStatus: 'fallback', flag: '🇯🇵' },
  { code: 'ko', nativeName: '한국어',       englishName: 'Korean',     formattingLocale: 'ko-KR', direction: 'ltr', translationStatus: 'fallback', flag: '🇰🇷' },
  { code: 'zh', nativeName: '中文',        englishName: 'Chinese',    formattingLocale: 'zh-CN', direction: 'ltr', translationStatus: 'fallback', flag: '🇨🇳' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', formattingLocale: 'id-ID', direction: 'ltr', translationStatus: 'fallback', flag: '🇮🇩' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese', formattingLocale: 'vi-VN', direction: 'ltr', translationStatus: 'fallback', flag: '🇻🇳' },
  { code: 'th', nativeName: 'ไทย',        englishName: 'Thai',       formattingLocale: 'th-TH', direction: 'ltr', translationStatus: 'fallback', flag: '🇹🇭' },

  // Middle Eastern (RTL)
  { code: 'ar', nativeName: 'العربية',    englishName: 'Arabic',     formattingLocale: 'ar-SA', direction: 'rtl', translationStatus: 'fallback', flag: '🇸🇦' },
];

// ---------------------------------------------------------------------------
// Derived helpers — the rest of the codebase should only use these.
// ---------------------------------------------------------------------------
export const DEFAULT_LOCALE: LocaleCode = 'en';
export const LOCALE_COOKIE = 'nexus_lang';

// Fast lookup keyed by code. Rebuilt once at module load.
const REGISTRY_BY_CODE: Record<string, LanguageEntry> = Object.fromEntries(
  LANGUAGE_REGISTRY.map((l) => [l.code, l])
);

/** All registered locale codes (open list, order preserved). */
export const LOCALES: LocaleCode[] = LANGUAGE_REGISTRY.map((l) => l.code);

/** Locales that ship a verified, hand-translated dictionary. */
export const FULL_LOCALES: LocaleCode[] = LANGUAGE_REGISTRY.filter((l) => l.translationStatus === 'full').map((l) => l.code);

/** Locales registered but rendered via English fallback. */
export const FALLBACK_LOCALES: LocaleCode[] = LANGUAGE_REGISTRY.filter((l) => l.translationStatus === 'fallback').map((l) => l.code);

export function getLanguage(code: LocaleCode | undefined | null): LanguageEntry {
  if (code && REGISTRY_BY_CODE[code]) return REGISTRY_BY_CODE[code];
  return REGISTRY_BY_CODE[DEFAULT_LOCALE];
}

export function isLocale(x: unknown): x is LocaleCode {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(REGISTRY_BY_CODE, x);
}

/** Accepts 'hi', 'hi-IN', 'HI', undefined, etc. Falls back to English. */
export function normalizeLocale(value?: string | null): LocaleCode {
  if (!value) return DEFAULT_LOCALE;
  const raw = String(value).toLowerCase().trim();
  // Note: because `LocaleCode = string`, the TS predicate `isLocale` narrows the
  // false branch to `never`. We therefore read `raw` through a fresh alias to
  // keep plain-string typing on the fallback path.
  const alias: string = raw;
  if (isLocale(alias)) return alias;
  const base: string = raw.split(/[-_]/)[0] ?? '';
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

export function isFullyTranslated(code: LocaleCode): boolean {
  return getLanguage(code).translationStatus === 'full';
}

export function getDirection(code: LocaleCode): TextDirection {
  return getLanguage(code).direction;
}

export function isRtl(code: LocaleCode): boolean {
  return getDirection(code) === 'rtl';
}

// ---------------------------------------------------------------------------
// Back-compat surface for the previous 6-locale API. Kept so we don't have to
// churn every legacy import in one commit. New code should prefer `getLanguage`.
// ---------------------------------------------------------------------------
export const LOCALE_META: Record<string, { native: string; english: string; flag: string }> = Object.fromEntries(
  LANGUAGE_REGISTRY.map((l) => [l.code, { native: l.nativeName, english: l.englishName, flag: l.flag ?? '' }])
);

export const AI_LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGE_REGISTRY.map((l) => [l.code, l.nativeName === l.englishName ? l.englishName : `${l.englishName} (${l.nativeName})`])
);
