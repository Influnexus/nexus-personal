// Shared core — linear what-if scenario engine (Sprint P1). Server-side generalization of the
// EXACT math the Enterprise Scenario Simulator runs client-side today
// (app/(app)/cfo/scenario/page.tsx lines 21-32):
//   adjRev = baselineDailyRev * (1 + revPct/100)
//   adjExp = baselineDailyExp * (1 + expPct/100)
//   delta  = (adjRev - adjExp) - (baselineDailyRev - baselineDailyExp)
//   scenario[i] = round(baseline[i].cash + delta * (i + 1))
// The Enterprise UI is intentionally NOT rewired in P1 (no behavior change); this module exists
// so both products share one scenario implementation going forward.
import { ForecastResult, LinearScenarioLevers, LinearScenarioResult, ScenarioPoint } from './types';

export function applyLinearScenario(forecast: Pick<ForecastResult, 'series' | 'baselineDailyRev' | 'baselineDailyExp'>, levers: LinearScenarioLevers): LinearScenarioResult {
  const { baselineDailyRev, baselineDailyExp, series } = forecast;
  const adjRev = baselineDailyRev * (1 + levers.revPct / 100);
  const adjExp = baselineDailyExp * (1 + levers.expPct / 100);
  const delta = (adjRev - adjExp) - (baselineDailyRev - baselineDailyExp);
  const points: ScenarioPoint[] = series.map((d, i) => ({ day: d.day, baseline: d.cash, scenario: Math.round(d.cash + delta * (i + 1)) }));
  const last = points.at(-1);
  return {
    points,
    baselineEnding: last?.baseline ?? null,
    scenarioEnding: last?.scenario ?? null,
    runsOutOfCashOn: points.find(p => p.scenario < 0)?.day ?? null,
  };
}
