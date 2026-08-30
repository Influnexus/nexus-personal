// Sprint P5 — Personal AI Tool Registry. Deterministic financial tools for the Personal agent.
// Each tool returns STRUCTURED DATA. The LLM receives the data and explains it — it NEVER
// calculates financial numbers itself. Tools are completely separate from Enterprise CFO tools.
import { ToolSpec } from './provider';
import { transactionsRepo } from '@/lib/repositories/transactions';
import {
  computePersonalState, computePersonalHealth, computePersonalResilience,
  computeWhatChanged, computeExpenseBreakdown, forecastCash, computeAnomalies,
  computePersonalAlerts, getTopAlerts, detectRecurring, evaluatePersonalScenario,
  ESSENTIAL_CATEGORIES, SAVINGS_CATEGORIES,
  PersonalState, PersonalHealth, PersonalResilience,
} from '@/lib/core/finance';
import type { TransactionLike } from '@/lib/core/finance';

export interface PersonalToolContext {
  organizationId: string;
  txs: TransactionLike[];
  profile?: { monthlyDebtPayment?: number; currency?: string; goal?: string };
  currency: string;
}

export type PersonalToolHandler = (args: any, ctx: PersonalToolContext) => Promise<any>;

interface PersonalRegisteredTool { spec: ToolSpec; handler: PersonalToolHandler }

export const PERSONAL_TOOLS: Record<string, PersonalRegisteredTool> = {
  get_financial_state: {
    spec: {
      type: 'function',
      function: {
        name: 'get_financial_state',
        description: 'Get the current personal financial state: cash, income, spending, surplus, savings rate, essential/discretionary breakdown, and fixed commitments for the last 30 days.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const state = computePersonalState(ctx.txs);
      return {
        metric: 'financial_state',
        cash: state.cash,
        income30d: state.income30d,
        spend30d: state.spend30d,
        surplus30d: state.surplus30d,
        savingsRate: state.savingsRate,
        essential30d: state.essential30d,
        discretionary30d: state.discretionary30d,
        investing30d: state.investing30d,
        fixedMonthly: state.fixedMonthly,
        spendingTrendPct: state.spendingTrendPct,
        incomeTrendPct: state.incomeTrendPct,
        transactionCount: state.transactionCount,
        currency: ctx.currency,
      };
    },
  },

  get_financial_health: {
    spec: {
      type: 'function',
      function: {
        name: 'get_financial_health',
        description: 'Get the Financial Health score (0-100) with a transparent 5-factor breakdown: savings rate, emergency fund, debt pressure, income stability, spending trend.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const state = computePersonalState(ctx.txs);
      const health = computePersonalHealth(state, ctx.profile);
      return {
        metric: 'financial_health',
        score: health.score,
        band: health.band,
        factors: health.factors,
        disclaimer: health.disclaimer,
      };
    },
  },

  get_financial_resilience: {
    spec: {
      type: 'function',
      function: {
        name: 'get_financial_resilience',
        description: 'Get Financial Resilience: how many months of essential spending the liquid reserve covers if income stopped today.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const resilience = computePersonalResilience(ctx.txs, { monthlyDebtPayment: ctx.profile?.monthlyDebtPayment });
      return {
        metric: 'financial_resilience',
        value: resilience.resilienceMonths,
        unit: 'months',
        context: {
          liquidReserve: resilience.liquidReserve,
          essentialMonthlySpend: resilience.essentialMonthly,
          fixedMonthlyCommitments: resilience.fixedMonthlyCommitments,
          debtMonthly: resilience.debtMonthly,
        },
        definition: resilience.definition,
        currency: ctx.currency,
      };
    },
  },

  get_cash_forecast: {
    spec: {
      type: 'function',
      function: {
        name: 'get_cash_forecast',
        description: 'Get the 90-day cash position forecast: starting cash, ending cash, lowest point, daily surplus/deficit, and a narrative summary.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const forecast = forecastCash(ctx.txs, [], 90);
      return {
        metric: 'cash_forecast',
        startingCash: forecast.startingCash,
        endingCash: forecast.endingCash,
        change: forecast.endingCash - forecast.startingCash,
        changePct: forecast.startingCash > 0 ? Math.round(((forecast.endingCash - forecast.startingCash) / forecast.startingCash) * 100) : 0,
        lowestDay: forecast.lowestDay,
        narrative: forecast.narrative,
        baselineDailyRev: forecast.baselineDailyRev,
        baselineDailyExp: forecast.baselineDailyExp,
        currency: ctx.currency,
      };
    },
  },

  get_financial_alerts: {
    spec: {
      type: 'function',
      function: {
        name: 'get_financial_alerts',
        description: 'Get current financial alerts sorted by severity (critical, warning, info). Returns what needs attention and recommended actions.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const state = computePersonalState(ctx.txs);
      const resilience = computePersonalResilience(ctx.txs, { monthlyDebtPayment: ctx.profile?.monthlyDebtPayment });
      const forecast = ctx.txs.length >= 3 ? forecastCash(ctx.txs, [], 90) : null;
      const anomalies = ctx.txs.length >= 4 ? computeAnomalies(ctx.txs) : [];
      const alerts = computePersonalAlerts({ state, resilience, forecast, anomalies, currency: ctx.currency });
      return {
        metric: 'financial_alerts',
        alerts: alerts.map(a => ({ type: a.type, severity: a.severity, title: a.title, explanation: a.explanation, metric: a.metric, recommendation: a.recommendation })),
        summary: { critical: alerts.filter(a => a.severity === 'critical').length, warning: alerts.filter(a => a.severity === 'warning').length, info: alerts.filter(a => a.severity === 'info').length },
      };
    },
  },

  get_spending_breakdown: {
    spec: {
      type: 'function',
      function: {
        name: 'get_spending_breakdown',
        description: 'Get spending breakdown by category for the last 30 days, excluding investment contributions.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const filtered = ctx.txs.filter(t => !SAVINGS_CATEGORIES.includes(t.category));
      const breakdown = computeExpenseBreakdown(filtered, 30);
      return {
        metric: 'spending_breakdown',
        categories: breakdown.map(c => ({ category: c.category, amount: c.amount, share: Math.round(c.share * 100) })),
        currency: ctx.currency,
      };
    },
  },

  get_what_changed: {
    spec: {
      type: 'function',
      function: {
        name: 'get_what_changed',
        description: 'Get significant financial changes in the last month: spending trend, income change, biggest category shift, reserve movement, savings rate change.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const changes = computeWhatChanged(ctx.txs);
      return {
        metric: 'what_changed',
        changes: changes.map(c => ({ kind: c.kind, direction: c.direction, tone: c.tone, pct: c.pct, amount: c.amount, category: c.category, detail: c.detail })),
        currency: ctx.currency,
      };
    },
  },

  evaluate_scenario: {
    spec: {
      type: 'function',
      function: {
        name: 'evaluate_scenario',
        description: 'Evaluate a financial "what-if" scenario. Accepts structured levers and returns baseline vs scenario comparison with a deterministic verdict. Use this for "Can I afford..." type questions.',
        parameters: {
          type: 'object',
          properties: {
            incomeChangePct: { type: 'number', description: 'Income change as percentage, e.g., -20 for 20% drop, -100 for zero income' },
            oneTimePurchaseAmount: { type: 'number', description: 'One-time purchase amount' },
            essentialChangePct: { type: 'number', description: 'Essential spending change %' },
            discretionaryChangePct: { type: 'number', description: 'Discretionary spending change %' },
            newRecurringExpenseAmount: { type: 'number', description: 'New monthly recurring expense amount' },
            newRecurringExpenseLabel: { type: 'string', description: 'Label for the new expense' },
            additionalSavings: { type: 'number', description: 'Additional monthly savings/investment amount' },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const levers: any = {};
      if (args.incomeChangePct != null) levers.incomeChangePct = args.incomeChangePct;
      if (args.oneTimePurchaseAmount) levers.oneTimePurchase = { amount: args.oneTimePurchaseAmount };
      if (args.essentialChangePct != null) levers.essentialChangePct = args.essentialChangePct;
      if (args.discretionaryChangePct != null) levers.discretionaryChangePct = args.discretionaryChangePct;
      if (args.newRecurringExpenseAmount) levers.newRecurringExpense = { amount: args.newRecurringExpenseAmount, label: args.newRecurringExpenseLabel || 'New expense' };
      if (args.additionalSavings) levers.additionalSavings = args.additionalSavings;

      const result = evaluatePersonalScenario({ txs: ctx.txs, levers, profile: ctx.profile });
      return {
        metric: 'scenario_evaluation',
        verdict: result.verdict,
        baseline: result.baseline,
        scenario: result.scenario,
        delta: result.delta,
        alternatives: result.alternatives.map(a => ({ title: a.title, description: a.description, verdict: a.verdict.level, impact: { health: a.impact.healthScore, resilience: a.impact.resilienceMonths } })),
      };
    },
  },

  get_recurring_commitments: {
    spec: {
      type: 'function',
      function: {
        name: 'get_recurring_commitments',
        description: 'Get detected recurring financial commitments: regular bills, subscriptions, and income patterns with their cadence and amounts.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const recurring = detectRecurring(ctx.txs);
      const catOf = (vendor: string) => ctx.txs.find(t => t.vendor === vendor)?.category || 'Other';
      return {
        metric: 'recurring_commitments',
        patterns: recurring.map(r => ({
          vendor: r.vendor,
          category: catOf(r.vendor),
          avgAmount: Math.round(r.avgAmount),
          cadenceDays: r.cadenceDays,
          direction: r.sign > 0 ? 'inflow' : 'outflow',
          monthlyEquivalent: Math.round(r.avgAmount * (30 / r.cadenceDays)),
        })).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent),
        currency: ctx.currency,
      };
    },
  },
};

export function personalToolSpecs(): ToolSpec[] {
  return Object.values(PERSONAL_TOOLS).map(t => t.spec);
}

export async function runPersonalTool(name: string, argsJson: string, ctx: PersonalToolContext) {
  const t = PERSONAL_TOOLS[name];
  if (!t) return { error: `Unknown tool: ${name}` };
  let args: any = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { args = {}; }
  try { return await t.handler(args, ctx); }
  catch (e: any) { return { error: `Tool ${name} failed: ${e.message}` }; }
}
