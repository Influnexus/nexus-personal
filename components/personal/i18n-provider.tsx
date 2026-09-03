'use client';
// Client i18n context for Nexus Personal. Initial locale comes from the server (cookie) to avoid
// hydration mismatch. Changing language persists to a cookie (so Server Components pick it up) and
// localStorage, then refreshes the router so server-rendered pages (Overview) re-render localized.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, DEFAULT_LOCALE, normalizeLocale, type Locale } from '@/lib/personal/i18n/config';
import { createTranslator, type TFunc } from '@/lib/personal/i18n';

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function PersonalI18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale || DEFAULT_LOCALE);

  const setLocale = useCallback(
    (l: Locale) => {
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
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function usePersonalI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider (keeps UI working in English).
    return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: createTranslator(DEFAULT_LOCALE) };
  }
  return ctx;
}

export function useT(): TFunc {
  return usePersonalI18n().t;
}

export function useLocale(): Locale {
  return usePersonalI18n().locale;
}
