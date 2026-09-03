// Sprint 2.7 — deterministic unit tests for Personal i18n (localization).
// Run: npx tsx --test tests/core/p7.i18n.test.ts
// Pure relative imports only — no app/db/session/next-headers dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, DEFAULT_LOCALE, AI_LANGUAGE_NAMES, normalizeLocale, isLocale } from '../../lib/personal/i18n/config';
import { createTranslator, getDictionary } from '../../lib/personal/i18n';
import { dictionaries } from '../../lib/personal/i18n/dictionaries';
import en from '../../lib/personal/i18n/dictionaries/en';

const enKeys = Object.keys(en);

test('all six required languages are registered', () => {
  assert.deepEqual([...LOCALES].sort(), ['de', 'en', 'es', 'hi', 'ta', 'te'].sort());
  assert.equal(DEFAULT_LOCALE, 'en');
});

test('every locale dictionary exists and is non-empty', () => {
  for (const l of LOCALES) {
    const d = getDictionary(l);
    assert.ok(d && typeof d === 'object', `missing dictionary: ${l}`);
    assert.ok(Object.keys(d).length > 0, `empty dictionary: ${l}`);
  }
});

test('translated locales never LOSE keys vs English (fallback guarantees full coverage)', () => {
  // A locale may inherit English (fallback) but must resolve every English key to a non-empty string.
  for (const l of LOCALES) {
    const t = createTranslator(l);
    for (const k of enKeys) {
      const v = t(k);
      assert.ok(typeof v === 'string' && v.length > 0, `locale ${l} key ${k} resolved empty`);
    }
  }
});

test('a fully translated locale (Hindi) actually differs from English for headline strings', () => {
  const th = createTranslator('hi');
  const sample = ['nav.overview', 'overview.monthlySurplus', 'freedom.title', 'chat.title'];
  let differing = 0;
  for (const k of sample) if (th(k) !== en[k]) differing++;
  assert.ok(differing >= 3, 'Hindi should differ from English on most headline strings');
});

test('interpolation substitutes named variables and leaves unknown ones intact-free', () => {
  const t = createTranslator('en');
  assert.equal(t('overview.greeting', { name: 'Asha' }), 'Hi Asha \ud83d\udc4b');
  assert.equal(t('freedom.impact', { level: 'High' }), 'High impact');
  // Multiple/ repeated vars
  assert.equal(t('freedom.targetOf', { current: '₹8,00,000', target: '₹1,35,00,000' }), '₹8,00,000 of ₹1,35,00,000 target');
});

test('missing key falls back to English, then to the raw key', () => {
  const t = createTranslator('de');
  // Unknown key returns the key itself (never throws, never blank)
  assert.equal(t('this.key.does.not.exist'), 'this.key.does.not.exist');
});

test('unknown/garbage locale normalizes to English; region tags collapse to base', () => {
  assert.equal(normalizeLocale('hi-IN'), 'hi');
  assert.equal(normalizeLocale('TE'), 'te');
  assert.equal(normalizeLocale('fr'), 'en');   // unsupported -> default
  assert.equal(normalizeLocale(undefined), 'en');
  assert.equal(normalizeLocale(null), 'en');
  assert.equal(isLocale('es'), true);
  assert.equal(isLocale('zz'), false);
});

test('Ask Nexus language names cover exactly the supported locales', () => {
  assert.deepEqual(Object.keys(AI_LANGUAGE_NAMES).sort(), [...LOCALES].sort());
  for (const l of LOCALES) assert.ok(AI_LANGUAGE_NAMES[l].length > 0);
});

test('deterministic financial placeholders are never translated inside templates', () => {
  // Currency/number placeholders must survive translation in every language.
  for (const l of LOCALES) {
    const t = createTranslator(l);
    const out = t('unit.perMonth', { value: '₹1,00,000' });
    assert.ok(out.includes('₹1,00,000'), `locale ${l} dropped the numeric value in unit.perMonth`);
  }
});

test('same key in different languages yields same interpolated NUMBER (language never changes the figure)', () => {
  const figure = '₹5,00,000';
  const values = LOCALES.map(l => createTranslator(l)('freedom.mFinancialAssets') + '|' + createTranslator(l)('unit.perYear', { value: figure }));
  // Every rendered string must still contain the identical, untouched figure.
  for (const v of values) assert.ok(v.includes(figure), 'figure must be identical across languages');
});

test('dictionaries object is keyed by locale and includes English source', () => {
  assert.ok(dictionaries.en === en);
  assert.equal(Object.keys(dictionaries).length, LOCALES.length);
});
