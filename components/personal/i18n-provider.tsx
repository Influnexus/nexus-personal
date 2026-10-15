'use client';
// Client i18n context for Nexus Personal.
//
// Sprint P7.1 changes:
//   - `locale` is now an open string (any registry code, including RTL & fallback locales).
//   - When the locale changes we sync `document.documentElement.dir` so RTL languages
//     (Arabic, Urdu, …) render mirrored without every component knowing about direction.
//   - Language preference persists in a cookie (server rendering) + localStorage (UX polish).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LOCALE_COOKIE,
  DEFAULT_LOCALE,
  normalizeLocale,
  getDirection,
  getLanguage,
  type LocaleCode,
} from '@/lib/personal/i18n/config';
import { createTranslator, type TFunc } from '@/lib/personal/i18n';

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (l: LocaleCode) => void;
  t: TFunc;
  direction: 'ltr' | 'rtl';
  isFullyTranslated: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function PersonalI18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: LocaleCode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<LocaleCode>(normalizeLocale(initialLocale) || DEFAULT_LOCALE);

  // Keep <html dir> in sync so global chrome (dropdowns, dialogs) renders correctly for RTL.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const dir = getDirection(locale);
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', locale);
    return () => {
      // Reset when the Personal shell unmounts (Enterprise/CFO expects LTR/English).
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', 'en');
    };
  }, [locale]);

  const setLocale = useCallback(
    (l: LocaleCode) => {
      const next = normalizeLocale(l);
      setLocaleState(next);
      try {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        window.localStorage.setItem(LOCALE_COOKIE, next);
      } catch {
        /* storage may be unavailable — cookie is best-effort */
      }
      // Re-render Server Components (e.g. the Overview dashboard) with the new cookie.
      router.refresh();
    },
    [router]
  );

  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      direction: getDirection(locale),
      isFullyTranslated: getLanguage(locale).translationStatus === 'full',
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function usePersonalI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider (keeps UI working in English).
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: createTranslator(DEFAULT_LOCALE),
      direction: 'ltr',
      isFullyTranslated: true,
    };
  }
  return ctx;
}

export function useT(): TFunc {
  return usePersonalI18n().t;
}

export function useLocale(): LocaleCode {
  return usePersonalI18n().locale;
}
