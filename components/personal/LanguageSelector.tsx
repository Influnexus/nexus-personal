'use client';
// Language selector for Nexus Personal. Present in desktop header and mobile menu.
import { Globe, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LOCALES, LOCALE_META } from '@/lib/personal/i18n/config';
import { usePersonalI18n } from '@/components/personal/i18n-provider';

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = usePersonalI18n();
  const current = LOCALE_META[locale];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={t('nav.language')}
        data-testid="personal-language-selector"
      >
        <Globe className="h-4 w-4" />
        {!compact && <span className="hidden sm:inline">{current?.native ?? 'English'}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {t('nav.language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((l) => {
          const meta = LOCALE_META[l];
          return (
            <DropdownMenuItem
              key={l}
              className="cursor-pointer justify-between"
              onSelect={() => setLocale(l)}
              data-testid={`lang-option-${l}`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{meta.flag}</span>
                <span>{meta.native}</span>
              </span>
              {locale === l && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
