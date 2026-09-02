// Sprint P2 — deterministic personal transaction seeding. Used by BOTH the personal onboarding
// flow (derives a realistic history from the user's stated profile) and Personal Demo Mode.
// No Math.random: variation is index-derived so results are reproducible. All data is fictional.
import { v4 as uuid } from 'uuid';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { PersonalProfile } from '@/lib/db/models';

export interface SeedTxInput {
  date: string; description: string; vendor: string; category: string; amount: number; currency: string;
}

const clampDay = (d: number) => Math.min(28, Math.max(1, d));

/** Date `monthsBack` months before `now`, on the given day-of-month (clamped to 28). */
function monthlyDate(now: Date, monthsBack: number, day: number): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, clampDay(day)));
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Generate ~`months` months of realistic personal transactions from a profile.
 * Essential categories are kept EXACT and steady (so recurring detection and resilience are
 * stable); discretionary categories get a small deterministic wiggle. An opening-balance
 * adjustment makes the final computed cash equal profile.cash exactly.
 */
export function generatePersonalTransactions(
  profile: PersonalProfile,
  opts: { months?: number; now?: Date; demo?: boolean } = {},
): SeedTxInput[] {
  const months = opts.months ?? 4;
  const now = opts.now ?? new Date();
  const c = profile.currency || 'INR';
  const out: SeedTxInput[] = [];
  const push = (date: Date, description: string, vendor: string, category: string, amount: number) => {
    if (date > now) return; // never seed the future
    out.push({ date: iso(date), description, vendor, category, amount: Math.round(amount), currency: c });
  };

  const E = profile.essentialMonthly;
  const D = profile.discretionaryMonthly;
  const wiggle = (m: number, i: number) => 1 + (((m * 7 + i * 13) % 9) - 4) / 100; // ±4%, deterministic

  const names = opts.demo
    ? {
        employer: 'BrightWorks Pvt Ltd (Demo Salary)', rent: 'Green Leaf Residency (Demo Rent)',
        utilities: 'City Power & Water (Demo)', transport: 'Metro & Fuel (Demo)', grocery: 'FreshMart Grocers (Demo)',
        dining: 'Spice Route Dining (Demo)', subs: 'StreamPlus Subscriptions (Demo)', fun: 'PVR Entertainment (Demo)',
        shop: 'UrbanBasket Shopping (Demo)', emi: 'First National Home Loan EMI (Demo)', sip: 'NiftyIndex SIP (Demo)',
        insurance: 'SecureLife Insurance (Demo)',
      }
    : {
        employer: 'Salary', rent: 'Rent', utilities: 'Utilities', transport: 'Transport & fuel', grocery: 'Groceries',
        dining: 'Dining out', subs: 'Subscriptions', fun: 'Entertainment', shop: 'Shopping', emi: 'Debt payment (EMI)',
        sip: 'Investment contribution', insurance: 'Insurance premium',
      };

  for (let m = months - 1; m >= 0; m--) {
    // Income — steady salary on the 1st (essential to income-stability detection)
    push(monthlyDate(now, m, 1), 'Monthly salary', names.employer, 'Income', profile.monthlyIncome);

    // Essential (exact split, steady): Housing 51%, Groceries 22% (4 weekly baskets), Utilities 9%, Transportation 11%, Insurance 7%
    push(monthlyDate(now, m, 2), 'Monthly rent', names.rent, 'Housing', -E * 0.51);
    for (let w = 0; w < 4; w++) push(monthlyDate(now, m, 5 + w * 7), 'Groceries', names.grocery, 'Groceries', -(E * 0.22) / 4);
    push(monthlyDate(now, m, 8), 'Electricity, water & internet', names.utilities, 'Utilities', -E * 0.09);
    push(monthlyDate(now, m, 9), 'Commute & fuel', names.transport, 'Transportation', -E * 0.11);
    push(monthlyDate(now, m, 12), 'Insurance premium', names.insurance, 'Insurance', -E * 0.07);

    // Discretionary (small deterministic wiggle): Dining 40% (2 tx), Subscriptions 10%, Entertainment 20%, Shopping 30%
    const dm = D * wiggle(m, 1);
    push(monthlyDate(now, m, 10), 'Dining out', names.dining, 'Dining', -(dm * 0.4) / 2);
    push(monthlyDate(now, m, 22), 'Dining out', names.dining, 'Dining', -(dm * 0.4) / 2);
    push(monthlyDate(now, m, 3), 'Streaming & apps', names.subs, 'Subscriptions', -D * 0.10);
    push(monthlyDate(now, m, 15), 'Weekend outing', names.fun, 'Entertainment', -dm * 0.2);
    push(monthlyDate(now, m, 18), 'Household & shopping', names.shop, 'Shopping', -dm * 0.3);

    // Debt payment (steady EMI)
    if (profile.monthlyDebtPayment > 0) push(monthlyDate(now, m, 7), 'Loan EMI', names.emi, 'Debt', -profile.monthlyDebtPayment);
    // Investment contribution (savings, not spending)
    if ((profile.sipMonthly ?? 0) > 0) push(monthlyDate(now, m, 4), 'Monthly SIP', names.sip, 'Investments', -(profile.sipMonthly as number));
  }

  // Demo storytelling: a visible dining bump this month so "What changed?" has something real to say.
  if (opts.demo) {
    push(monthlyDate(now, 0, 20), 'Family celebration dinner', names.dining, 'Dining', -4200);
  }

  // Opening balance so that current computed cash equals the stated reserve exactly.
  const generated = out.reduce((s, t) => s + t.amount, 0);
  const opening = Math.round(profile.cash - generated);
  out.unshift({
    date: iso(monthlyDate(now, months - 1, 1)),
    description: 'Opening balance', vendor: 'Opening balance', category: 'Other', amount: opening, currency: c,
  });
  return out;
}

export const personalSeedService = {
  /** Insert generated transactions for an org. Returns count inserted. */
  async seedFromProfile(orgId: string, profile: PersonalProfile, opts: { months?: number; now?: Date; demo?: boolean } = {}) {
    const rows = generatePersonalTransactions(profile, opts);
    if (rows.length === 0) return 0;
    await transactionsRepo.insertMany(rows.map(r => ({
      organizationId: orgId,
      date: r.date,
      description: r.description,
      vendor: r.vendor,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      source: (opts.demo ? 'demo_seed' : 'onboarding_seed') as any,
    })));
    return rows.length;
  },
};

// Fictional profile powering Personal Demo Mode (₹, clearly demo-labeled vendors).
export const PERSONAL_DEMO_PROFILE: PersonalProfile = {
  monthlyIncome: 200000,
  essentialMonthly: 82000,
  discretionaryMonthly: 32000,
  cash: 650000,
  investments: 800000,
  totalDebt: 300000,
  monthlyDebtPayment: 18000,
  sipMonthly: 25000,
  goal: 'Build a ₹10L emergency fund',
  currency: 'INR',
  updatedAt: new Date(),
};
