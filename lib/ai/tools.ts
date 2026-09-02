// Deterministic tools the CFO Agent can call. Tools are typed, validated, and never depend on the LLM
// for arithmetic. The LLM only chooses *which* tool to call and how to summarize results.

import { financeService } from '@/lib/services/finance.service';
import { transactionsRepo } from '@/lib/repositories/transactions';
import { invoicesRepo } from '@/lib/repositories/invoices';
import { ToolSpec } from './provider';

export interface ToolContext { organizationId: string }

export type ToolHandler = (args: any, ctx: ToolContext) => Promise<any>;

interface RegisteredTool { spec: ToolSpec; handler: ToolHandler }

export const TOOLS: Record<string, RegisteredTool> = {
  get_kpis: {
    spec: {
      type: 'function',
      function: {
        name: 'get_kpis',
        description: 'Return the latest 30-day financial KPIs: revenue, expenses, profit, cash, burn rate, runway days, outstanding invoices, and growth deltas.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: (_args, ctx) => financeService.kpis(ctx.organizationId),
  },
  get_health_score: {
    spec: {
      type: 'function',
      function: {
        name: 'get_health_score',
        description: 'Compute the Business Health Score 0-100 with factor breakdown explaining what helps and hurts.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: (_args, ctx) => financeService.healthScore(ctx.organizationId),
  },
  get_expense_breakdown: {
    spec: {
      type: 'function',
      function: {
        name: 'get_expense_breakdown',
        description: 'Return expenses grouped by category over the last N days (default 30).',
        parameters: { type: 'object', properties: { days: { type: 'number', description: 'Lookback window in days', default: 30 } }, additionalProperties: false },
      },
    },
    handler: (args, ctx) => financeService.expenseBreakdown(ctx.organizationId, args?.days ?? 30),
  },
  get_top_vendors: {
    spec: {
      type: 'function',
      function: {
        name: 'get_top_vendors',
        description: 'Return the top vendors by total spend over the last N days (default 90).',
        parameters: { type: 'object', properties: { days: { type: 'number', default: 90 } }, additionalProperties: false },
      },
    },
    handler: (args, ctx) => financeService.topVendors(ctx.organizationId, args?.days ?? 90),
  },
  get_anomalies: {
    spec: {
      type: 'function',
      function: {
        name: 'get_anomalies',
        description: 'Return up to 5 unusual recent transactions detected statistically.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: (_args, ctx) => financeService.anomalies(ctx.organizationId),
  },
  list_overdue_invoices: {
    spec: {
      type: 'function',
      function: {
        name: 'list_overdue_invoices',
        description: 'Return all open invoices whose due date has passed.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: (_args, ctx) => financeService.overdueInvoices(ctx.organizationId),
  },
  list_recent_transactions: {
    spec: {
      type: 'function',
      function: {
        name: 'list_recent_transactions',
        description: 'List recent transactions, optionally filtered by category or vendor substring.',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 25 },
            category: { type: 'string' },
            vendor: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const all = await transactionsRepo.listByOrg(ctx.organizationId);
      const filtered = all.filter(t => (!args?.category || t.category === args.category) && (!args?.vendor || t.vendor.toLowerCase().includes(String(args.vendor).toLowerCase())));
      return filtered.slice(0, args?.limit ?? 25);
    },
  },
  forecast_cash: {
    spec: {
      type: 'function',
      function: {
        name: 'forecast_cash',
        description: 'Forecast daily cash position over the next N days (default 90).',
        parameters: { type: 'object', properties: { days: { type: 'number', default: 90 } }, additionalProperties: false },
      },
    },
    handler: (args, ctx) => financeService.cashflowForecast(ctx.organizationId, args?.days ?? 90),
  },
  get_recommendations: {
    spec: {
      type: 'function',
      function: {
        name: 'get_recommendations',
        description: 'Return up to 5 prioritized recommendations based on the latest financial state.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: (_args, ctx) => financeService.recommendations(ctx.organizationId),
  },
  list_invoices: {
    spec: {
      type: 'function',
      function: {
        name: 'list_invoices',
        description: 'List all invoices on file for this organization.',
        parameters: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'paid', 'overdue', 'void', 'draft'] } }, additionalProperties: false },
      },
    },
    handler: async (args, ctx) => {
      const inv = await invoicesRepo.listByOrg(ctx.organizationId);
      return args?.status ? inv.filter(i => i.status === args.status) : inv;
    },
  },
};

export function toolSpecs(): ToolSpec[] { return Object.values(TOOLS).map(t => t.spec); }
export async function runTool(name: string, argsJson: string, ctx: ToolContext) {
  const t = TOOLS[name];
  if (!t) return { error: `Unknown tool: ${name}` };
  let args: any = {};
  try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { args = {}; }
  try { return await t.handler(args, ctx); }
  catch (e: any) { return { error: e.message }; }
}
