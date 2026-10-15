// Sprint P7.1 — deterministic unit tests for the Global Language Registry.
// Run: npx tsx --test tests/core/p7.i18n.test.ts
// Pure relative imports only — no app/db/session/next-headers dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_REGISTRY,
  LOCALES,
  FULL_LOCALES,
  FALLBACK_LOCALES,
  DEFAULT_LOCALE,
  AI_LANGUAGE_NAMES,
  normalizeLocale,
  isLocale,
  isFullyTranslated,
  getDirection,
  getLanguage,
  isRtl,
} from '../../lib/personal/i18n/config';
import { createTranslator, getDictionary, formatNumber } from '../../lib/personal/i18n';
import { dictionaries } from '../../lib/personal/i18n/dictionaries';
import en from '../../lib/personal/i18n/dictionaries/en';

const enKeys = Object.keys(en);

// -----------------------------------------------------------------------------
// Registry shape & openness
// -----------------------------------------------------------------------------
test('language registry contains all five verified full translations', () => {
  for (const code of ['en', 'hi', 'te', 'es', 'de']) {
    const entry = LANGUAGE_REGISTRY.find((l) => l.code === code);
    assert.ok(entry, `full locale ${code} missing from registry`);
    assert.equal(entry!.translationStatus, 'full', `${code} should be marked full`);
  }
  assert.equal(DEFAULT_LOCALE, 'en');
});

test('registry is open and honestly labels fallback languages (no false full claims)', () => {
  // We expect >= 20 languages registered globally.
  assert.ok(LANGUAGE_REGISTRY.length >= 20, `expected >= 20 languages, got ${LANGUAGE_REGISTRY.length}`);
  // Full set is exactly the 5 verified locales — nothing else may sneak in.
  assert.deepEqual([...FULL_LOCALES].sort(), ['de', 'en', 'es', 'hi', 'te'].sort());
  // Every non-full locale must be marked fallback (no other status is allowed).
  for (const l of LANGUAGE_REGISTRY) {
    assert.ok(l.translationStatus === 'full' || l.translationStatus === 'fallback',
      `locale ${l.code} has invalid status ${l.translationStatus}`);
  }
});

test('every registry entry has complete metadata (native, English, formatting, direction)', () => {
  for (const l of LANGUAGE_REGISTRY) {
    assert.ok(l.code && typeof l.code === 'string', `code missing on ${JSON.stringify(l)}`);
    assert.ok(l.nativeName && l.nativeName.length > 0, `nativeName missing on ${l.code}`);
    assert.ok(l.englishName && l.englishName.length > 0, `englishName missing on ${l.code}`);
    assert.ok(l.formattingLocale && /^[a-z]{2}(-[A-Z]{2})?$/.test(l.formattingLocale),
      `formattingLocale malformed on ${l.code}: ${l.formattingLocale}`);
    assert.ok(l.direction === 'ltr' || l.direction === 'rtl',
      `direction invalid on ${l.code}: ${l.direction}`);
  }
});

test('adding a language is a registry-only change (all locales resolve every key)', () => {
  // The Personal UI must never crash for a registered locale, even if it has no dictionary.
  for (const l of LOCALES) {
    const t = createTranslator(l);
    for (const k of enKeys) {
      const v = t(k);
      assert.ok(typeof v === 'string' && v.length > 0, `locale ${l} key ${k} resolved empty`);
    }
  }
});

// -----------------------------------------------------------------------------
// Translator: full-translation coverage, fallback honesty
// -----------------------------------------------------------------------------
test('fully translated locales actually differ from English on headline strings', () => {
  const sample = ['nav.overview', 'overview.monthlySurplus', 'freedom.title', 'chat.title'];
  for (const code of FULL_LOCALES) {
    if (code === 'en') continue;
    const t = createTranslator(code);
    let differing = 0;
    for (const k of sample) if (t(k) !== en[k]) differing++;
    assert.ok(differing >= 3, `full locale ${code} looks identical to English (only ${differing} differ)`);
  }
});

test('fallback locales resolve to the English string (transparent, byte-for-byte)', () => {
  const sample = ['nav.overview', 'overview.monthlySurplus', 'freedom.title', 'chat.title'];
  for (const code of FALLBACK_LOCALES) {
    const t = createTranslator(code);
    for (const k of sample) {
      assert.equal(t(k), en[k], `fallback locale ${code} key ${k} should be English`);
    }
  }
});

test('missing key falls back to English, then to the raw key', () => {
  const t = createTranslator('de');
  assert.equal(t('this.key.does.not.exist'), 'this.key.does.not.exist');
});

test('interpolation substitutes named variables and preserves numeric figures', () => {
  const t = createTranslator('en');
  assert.equal(t('overview.greeting', { name: 'Asha' }), 'Hi Asha \ud83d\udc4b');
  assert.equal(t('freedom.impact', { level: 'High' }), 'High impact');
  assert.equal(
    t('freedom.targetOf', { current: '\u20b98,00,000', target: '\u20b91,35,00,000' }),
    '\u20b98,00,000 of \u20b91,35,00,000 target'
  );
});

// -----------------------------------------------------------------------------
// Locale normalization & helpers
// -----------------------------------------------------------------------------
test('normalizeLocale accepts region tags and falls back to English on unknown input', () => {
  assert.equal(normalizeLocale('hi-IN'), 'hi');
  assert.equal(normalizeLocale('TE'), 'te');
  assert.equal(normalizeLocale('gu-IN'), 'gu');
  assert.equal(normalizeLocale('ar_SA'), 'ar');
  assert.equal(normalizeLocale('zz'), 'en');
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale(null), 'en');
  assert.equal(isLocale('es'), true);
  assert.equal(isLocale('fr'), true); // fr is now registered (fallback)
  assert.equal(isLocale('xx'), false);
});

test('isFullyTranslated is honest for both statuses', () => {
  for (const c of ['en', 'hi', 'te', 'es', 'de']) assert.equal(isFullyTranslated(c), true, `${c} should be full`);
  for (const c of ['gu', 'fr', 'ja', 'ar', 'ta']) assert.equal(isFullyTranslated(c), false, `${c} should be fallback`);
});

// -----------------------------------------------------------------------------
// RTL readiness
// -----------------------------------------------------------------------------
test('RTL languages are registered with direction=rtl (Arabic + Urdu)', () => {
  assert.equal(getDirection('ar'), 'rtl');
  assert.equal(getDirection('ur'), 'rtl');
  assert.equal(isRtl('ar'), true);
  assert.equal(isRtl('en'), false);
  assert.equal(isRtl('ja'), false);
});

test('LTR remains the default for all Latin/CJK/Indic scripts', () => {
  for (const c of ['en', 'hi', 'te', 'es', 'de', 'fr', 'ja', 'zh', 'ko', 'gu', 'ta']) {
    assert.equal(getDirection(c), 'ltr', `${c} should be LTR`);
  }
});

// -----------------------------------------------------------------------------
// Deterministic financial figures must never change because of language
// -----------------------------------------------------------------------------
test('deterministic financial placeholders survive translation in every registered language', () => {
  for (const l of LOCALES) {
    const t = createTranslator(l);
    const out = t('unit.perMonth', { value: '\u20b91,00,000' });
    assert.ok(out.includes('\u20b91,00,000'), `locale ${l} dropped the numeric value in unit.perMonth`);
  }
});

test('identical figure renders identically across full and fallback locales', () => {
  const figure = '\u20b95,00,000';
  const results = LOCALES.map((l) => createTranslator(l)('unit.perYear', { value: figure }));
  for (const r of results) assert.ok(r.includes(figure), 'figure must be identical across languages');
});

test('Intl.NumberFormat helper never throws for any registered locale', () => {
  for (const l of LOCALES) {
    const out = formatNumber(1234567.89, l, { maximumFractionDigits: 2 });
    assert.ok(typeof out === 'string' && out.length > 0, `formatNumber failed for ${l}`);
  }
});

// -----------------------------------------------------------------------------
// AI language directive is language-agnostic (no whitelist)
// -----------------------------------------------------------------------------
test('AI language names are derived from the registry (every locale has one)', () => {
  assert.deepEqual(Object.keys(AI_LANGUAGE_NAMES).sort(), [...LOCALES].sort());
  for (const l of LOCALES) assert.ok(AI_LANGUAGE_NAMES[l].length > 0);
  // Fallback locales expose their native name too — the AI can still speak them.
  assert.ok(AI_LANGUAGE_NAMES['ja'].includes('Japanese'));
  assert.ok(AI_LANGUAGE_NAMES['ar'].includes('Arabic'));
  assert.ok(AI_LANGUAGE_NAMES['gu'].includes('Gujarati'));
});

// -----------------------------------------------------------------------------
// Dictionary registry integrity
// -----------------------------------------------------------------------------
test('dictionaries object only contains fully-translated locales', () => {
  assert.ok(dictionaries.en === en);
  // Dictionary keys must equal FULL_LOCALES exactly — otherwise we would be silently
  // claiming translations we don't have.
  assert.deepEqual(Object.keys(dictionaries).sort(), [...FULL_LOCALES].sort());
});

test('getDictionary transparently returns English for fallback locales', () => {
  for (const code of FALLBACK_LOCALES) {
    assert.equal(getDictionary(code), dictionaries[DEFAULT_LOCALE]);
  }
});

test('getLanguage always returns an entry (even for unknown codes, falls back to en)', () => {
  assert.equal(getLanguage(undefined as any).code, 'en');
  assert.equal(getLanguage(null as any).code, 'en');
  assert.equal(getLanguage('xx').code, 'en');
  assert.equal(getLanguage('ja').code, 'ja');
  assert.equal(getLanguage('ar').direction, 'rtl');
});
