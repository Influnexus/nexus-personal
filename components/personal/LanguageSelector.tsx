'use client';
// Language selector for Nexus Personal. Present in desktop header and mobile menu.
//
// Design notes (Sprint P7.1):
//   - Options are sourced from the central LANGUAGE_REGISTRY. Adding a language
//     to the registry automatically adds a row here — no component change needed.
//   - We honestly separate 'Fully translated' from 'Available — English fallback'
//     so we never misrepresent coverage. Users always see which languages have
//     a verified dictionary vs. which will render mostly in English.
import { Globe, Check, Languages } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LANGUAGE_REGISTRY, getLanguage } from '@/lib/personal/i18n/config';
import { usePersonalI18n } from '@/components/personal/i18n-provider';

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = usePersonalI18n();
  const current = getLanguage(locale);

  const fullLanguages = LANGUAGE_REGISTRY.filter((l) => l.translationStatus === 'full');
  const fallbackLanguages = LANGUAGE_REGISTRY.filter((l) => l.translationStatus === 'fallback');

  const renderRow = (l: (typeof LANGUAGE_REGISTRY)[number], isFull: boolean) => (
    <DropdownMenuItem
      key={l.code}
      className="cursor-pointer justify-between gap-3"
      onSelect={() => setLocale(l.code)}
      data-testid={`lang-option-${l.code}`}
      data-translation-status={l.translationStatus}
    >
      <span className="flex min-w-0 items-center gap-2">
        {l.flag && <span aria-hidden className="shrink-0">{l.flag}</span>}
        <span className="flex min-w-0 flex-col">
          <span className="truncate" dir={l.direction}>{l.nativeName}</span>
          {!isFull && (
            <span className="text-[10px] leading-tight text-muted-foreground">English fallback</span>
          )}
        </span>
      </span>
      {locale === l.code && <Check className="h-3.5 w-3.5 shrink-0" />}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={t('nav.language')}
        data-testid="personal-language-selector"
      >
        <Globe className="h-4 w-4" />
        {!compact && (
          <span className="hidden sm:inline" dir={current.direction}>{current?.nativeName ?? 'English'}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
          <Languages className="h-3 w-3" /> {t('nav.language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fully translated
        </DropdownMenuLabel>
        {fullLanguages.map((l) => renderRow(l, true))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Available — English fallback
        </DropdownMenuLabel>
        {fallbackLanguages.map((l) => renderRow(l, false))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
