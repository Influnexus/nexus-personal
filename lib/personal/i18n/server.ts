// Server-side locale resolution for Personal Server Components (e.g. the Overview dashboard).
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale, type LocaleCode } from './config';
import { createTranslator, type TFunc } from './index';

export async function getServerLocale(): Promise<LocaleCode> {
  try {
    const store = await cookies();
    return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return normalizeLocale(null);
  }
}

export async function getServerT(): Promise<{ locale: LocaleCode; t: TFunc }> {
  const locale = await getServerLocale();
  return { locale, t: createTranslator(locale) };
}
