// ============================================================================================
// Shared Financial Intelligence Core — types (Sprint P1)
// Pure, tenant-agnostic input/output contracts. NO database, session, org or LLM coupling.
// TransactionLike/InvoiceLike are STRUCTURAL: the existing Enterprise repo models satisfy them
// as-is, and future Nexus Personal models will too.
// ============================================================================================

export interface TransactionLike {
  id: string;
  date: string; // ISO yyyy-mm-dd
  description: string;
  vendor: string; // business: vendor · personal: merchant
  category: string;
  amount: number; // signed: + inflow, - outflow
  currency?: string;
}

export interface InvoiceLike {
  id?: string;
  vendor: string;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  amount: number;
  status: string; // 'open' | 'overdue' | 'paid' | ...
  direction?: string; // 'receivable' | 'payable'
}

// ---- metrics ----
export interface Kpis {
  revenue30d: number;
  expenses30d: number;
  profit30d: number;
  cash: number;
  burnRate: number;
  runwayDays: number | null;
  outstandingInvoices: number;
  outstandingAmount: number;
  revDeltaPct: number;
  expDeltaPct: number;
}
export interface ExpenseSlice { category: string; amount: number; share: number }
export interface VendorSpend { vendor: string; amount: number; count: number }
export interface Recommendation { id: string; title: string; reason: string; impact: 'high' | 'med' | 'low'; action: string }

// ---- health ----
export type HealthBand = 'excellent' | 'strong' | 'fair' | 'weak' | 'at_risk';
export interface HealthScoreBreakdown {
  score: number;
  band: HealthBand;
  factors: { label: string; impact: number; note: string }[];
}

// ---- anomalies ----
export interface Anomaly { transactionId: string; date: string; vendor: string; amount: number; category: string; reason: string }

// ---- recurring ----
export interface RecurringPattern { vendor: string; avgAmount: number; cadenceDays: number; sign: 1 | -1 }

// ---- forecast ----
export interface ForecastDriver { kind: 'recurring_revenue' | 'recurring_expense' | 'invoice_in' | 'invoice_out'; label: string; amount: number }
export interface ForecastDay {
  day: string;
  cash: number;
  net: number;
  drivers?: ForecastDriver[];
}
export interface ForecastResult {
  series: ForecastDay[];
  startingCash: number;
  endingCash: number;
  baselineDailyRev: number;
  baselineDailyExp: number;
  scheduledEvents: number;
  narrative: string;
  lowestDay: { day: string; cash: number };
}

// ---- scenario ----
export interface LinearScenarioLevers { revPct: number; expPct: number }
export interface ScenarioPoint { day: string; baseline: number; scenario: number }
export interface LinearScenarioResult {
  points: ScenarioPoint[];
  baselineEnding: number | null;
  scenarioEnding: number | null;
  runsOutOfCashOn: string | null; // first day scenario balance drops below zero
}

// ---- resilience ----
export interface ResilienceReport {
  cash: number;
  avgMonthlyExpense: number;      // trailing 90d average
  avgMonthlyIncome: number;       // trailing 90d average
  emergencyFundMonths: number;    // cash / avg monthly expense
  fixedMonthlyCommitments: number; // recurring outflows normalized to monthly
  fixedCostRatio: number;         // fixed commitments / avg monthly expense
  incomeStreams: number;          // distinct recurring inflow patterns
  incomeConcentration: number;    // share of 90d income from the single largest source (0..1)
  shockHorizonDays: number;       // days survivable at zero income, current spend
}

// ---- shared date helpers (pure) ----
export function dateKey(d: Date): string { return d.toISOString().slice(0, 10); }
export function daysAgoFrom(now: Date, n: number): Date { const d = new Date(now); d.setDate(d.getDate() - n); return d; }
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }
