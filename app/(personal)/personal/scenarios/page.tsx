'use client';
// Sprint P4 — Personal Decision Simulator. "Help me understand the financial consequences
// BEFORE I make a decision." All financial calculations are deterministic.
import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Loader2, ChevronRight, ArrowDownRight, ArrowUpRight, Minus, Shield, Heart, Wallet, TrendingUp, SlidersHorizontal, RotateCcw, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { track } from '@/lib/analytics/client';

// ---- Types ----
interface ScenarioSnapshot {
  cash: number; monthlyIncome: number; monthlySpending: number;
  monthlySurplus: number; resilienceMonths: number; healthScore: number;
  healthBand: string; projected90dCash: number;
}
interface ScenarioDelta { cash: number; surplus: number; resilience: number; health: number; projected90dCash: number; }
interface ScenarioVerdict { level: string; title: string; explanation: string; }
interface ScenarioAlternative {
  id: string; title: string; description: string;
  impact: ScenarioSnapshot; delta: ScenarioDelta; verdict: ScenarioVerdict;
}
interface ScenarioResult {
  baseline: ScenarioSnapshot; scenario: ScenarioSnapshot;
  delta: ScenarioDelta; verdict: ScenarioVerdict;
  alternatives: ScenarioAlternative[]; leversApplied: any;
}
interface ParsedLevers {
  description?: string; ambiguous?: boolean; clarificationNeeded?: string;
  oneTimePurchase?: { amount: number; date?: string };
  incomeChangePct?: number; incomeChangeAbsolute?: number;
  essentialChangePct?: number; essentialChangeAbsolute?: number;
  discretionaryChangePct?: number; discretionaryChangeAbsolute?: number;
  newRecurringExpense?: { amount: number; label?: string };
  removeRecurringExpense?: { vendor: string };
  additionalSavings?: number;
}

// ---- Helpers ----
function fmt(n: number, currency = 'INR'): string {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0); }
  catch { return `${currency} ${Math.round(n || 0).toLocaleString()}`; }
}
function fmtCompact(n: number, currency = 'INR'): string {
  const abs = Math.abs(n || 0); const sign = n < 0 ? '-' : '';
  if (currency === 'INR') {
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1).replace(/\.0$/, '')}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, '')}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return `${sign}₹${Math.round(abs)}`;
  }
  const sym = currency === 'USD' ? '$' : `${currency} `;
  if (abs >= 1000000) return `${sign}${sym}${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${sym}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${sym}${Math.round(abs)}`;
}

const VERDICT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  green: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/30' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-500/30' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-500/30' },
  red: { bg: 'bg-red-500/10', text: 'text-red-700 dark:text-red-400', border: 'border-red-500/30' },
};
const VERDICT_EMOJI: Record<string, string> = { green: '✅', yellow: '🟡', orange: '🟠', red: '🔴' };

function DeltaIndicator({ value, suffix = '', invert = false }: { value: number; suffix?: string; invert?: boolean }) {
  const isPositive = invert ? value < 0 : value > 0;
  const isNeg = invert ? value > 0 : value < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : isNeg ? 'text-red-500' : 'text-muted-foreground'}`}>
      {value > 0 ? <ArrowUpRight className="h-3 w-3" /> : value < 0 ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {value > 0 ? '+' : ''}{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}{suffix}
    </span>
  );
}

function CompareCard({ label, icon: Icon, baseline, scenario, delta, format, suffix = '', invert = false }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <div>
          <span className="text-sm text-muted-foreground line-through">{format(baseline)}</span>
          <span className="ml-2 text-lg font-bold">{format(scenario)}</span>
        </div>
        <DeltaIndicator value={delta} suffix={suffix} invert={invert} />
      </div>
    </div>
  );
}

// ---- Main Component ----
export default function PersonalScenariosPage() {
  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [parsedLevers, setParsedLevers] = useState<ParsedLevers | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [history, setHistory] = useState<{ input: string; result: ScenarioResult }[]>([]);
  const [mode, setMode] = useState<'input' | 'sliders' | 'result'>('input');
  const [error, setError] = useState<string | null>(null);

  // Slider state
  const [sliderLevers, setSliderLevers] = useState({
    incomeChangePct: 0,
    essentialChangePct: 0,
    discretionaryChangePct: 0,
    oneTimePurchase: 0,
    newRecurringExpense: 0,
    additionalSavings: 0,
  });

  const currency = 'INR';
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse natural language
  const handleParse = useCallback(async () => {
    if (!input.trim()) return;
    setParsing(true); setError(null);
    try {
      const res = await fetch('/api/personal/scenarios/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (data.levers) {
        setParsedLevers(data.levers);
        if (!data.levers.ambiguous) {
          // Auto-evaluate
          await handleEvaluate(data.levers);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to parse scenario');
    } finally {
      setParsing(false);
    }
  }, [input]);

  // Evaluate scenario
  const handleEvaluate = useCallback(async (levers: any) => {
    setEvaluating(true); setError(null);
    try {
      // Clean levers — remove null/undefined/description/ambiguous fields
      const cleanLevers: any = {};
      if (levers.incomeChangePct != null) cleanLevers.incomeChangePct = levers.incomeChangePct;
      if (levers.incomeChangeAbsolute != null) cleanLevers.incomeChangeAbsolute = levers.incomeChangeAbsolute;
      if (levers.essentialChangePct != null) cleanLevers.essentialChangePct = levers.essentialChangePct;
      if (levers.essentialChangeAbsolute != null) cleanLevers.essentialChangeAbsolute = levers.essentialChangeAbsolute;
      if (levers.discretionaryChangePct != null) cleanLevers.discretionaryChangePct = levers.discretionaryChangePct;
      if (levers.discretionaryChangeAbsolute != null) cleanLevers.discretionaryChangeAbsolute = levers.discretionaryChangeAbsolute;
      if (levers.oneTimePurchase?.amount) cleanLevers.oneTimePurchase = levers.oneTimePurchase;
      if (levers.newRecurringExpense?.amount) cleanLevers.newRecurringExpense = levers.newRecurringExpense;
      if (levers.removeRecurringExpense?.vendor) cleanLevers.removeRecurringExpense = levers.removeRecurringExpense;
      if (levers.additionalSavings) cleanLevers.additionalSavings = levers.additionalSavings;

      const res = await fetch('/api/personal/scenarios/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levers: cleanLevers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ScenarioResult = await res.json();
      setResult(data);
      setMode('result');
      track('personal_scenario_completed');
      // Add to history (max 3)
      setHistory(prev => [{ input: input || 'Manual scenario', result: data }, ...prev].slice(0, 3));
    } catch (e: any) {
      setError(e.message || 'Failed to evaluate scenario');
    } finally {
      setEvaluating(false);
    }
  }, [input]);

  // Evaluate from sliders
  const handleSliderEvaluate = useCallback(async () => {
    const levers: any = {};
    if (sliderLevers.incomeChangePct !== 0) levers.incomeChangePct = sliderLevers.incomeChangePct;
    if (sliderLevers.essentialChangePct !== 0) levers.essentialChangePct = sliderLevers.essentialChangePct;
    if (sliderLevers.discretionaryChangePct !== 0) levers.discretionaryChangePct = sliderLevers.discretionaryChangePct;
    if (sliderLevers.oneTimePurchase > 0) levers.oneTimePurchase = { amount: sliderLevers.oneTimePurchase };
    if (sliderLevers.newRecurringExpense > 0) levers.newRecurringExpense = { amount: sliderLevers.newRecurringExpense, label: 'New expense' };
    if (sliderLevers.additionalSavings > 0) levers.additionalSavings = sliderLevers.additionalSavings;
    setParsedLevers(levers);
    await handleEvaluate(levers);
  }, [sliderLevers, handleEvaluate]);

  const handleReset = () => {
    setInput(''); setParsedLevers(null); setResult(null); setError(null); setMode('input');
    setSliderLevers({ incomeChangePct: 0, essentialChangePct: 0, discretionaryChangePct: 0, oneTimePurchase: 0, newRecurringExpense: 0, additionalSavings: 0 });
  };

  const handleAlternativeSelect = (alt: ScenarioAlternative) => {
    track('personal_scenario_alternative_selected', { feature: alt.id });
    setResult(prev => prev ? { ...prev, scenario: alt.impact, delta: alt.delta, verdict: alt.verdict } : prev);
  };

  // ---- Render ----
  return (
    <div className="space-y-6 pt-8" data-testid="personal-scenarios-page">
      <div className="flex items-center gap-2">
        <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-xl font-bold">Decision Simulator</h1>
      </div>

      {/* Mode: Input */}
      {mode === 'input' && (
        <div className="space-y-6">
          <div className="text-center py-6">
            <h2 className="text-2xl font-bold tracking-tight">What&apos;s on your mind?</h2>
            <p className="mt-2 text-muted-foreground">Describe a financial decision and see its impact before you commit.</p>
          </div>

          {/* Natural language input */}
          <Card data-testid="scenario-input-card">
            <CardContent className="p-4">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="e.g., Buy a ₹2 lakh laptop"
                  className="flex-1 text-base"
                  onKeyDown={e => e.key === 'Enter' && handleParse()}
                  data-testid="scenario-input"
                />
                <Button onClick={handleParse} disabled={parsing || !input.trim()} data-testid="scenario-submit">
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="ml-1.5">{parsing ? 'Analyzing...' : 'Simulate'}</span>
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Buy a ₹2 lakh laptop', 'Move to ₹60K rent', 'Take 3 months off work', 'Start ₹15K EMI'].map(ex => (
                  <button key={ex} onClick={() => { setInput(ex); }} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ambiguous response */}
          {parsedLevers?.ambiguous && (
            <Card className="border-amber-500/30">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Need more details</p>
                <p className="mt-1 text-sm text-muted-foreground">{parsedLevers.clarificationNeeded}</p>
              </CardContent>
            </Card>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or use manual controls</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Sliders */}
          <Button variant="outline" className="w-full" onClick={() => setMode('sliders')} data-testid="open-sliders">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Manual Scenario Builder
          </Button>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          {/* History */}
          {history.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Recent scenarios</h3>
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <button key={i} onClick={() => { setResult(h.result); setMode('result'); }}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left hover:bg-accent transition-colors">
                    <span className="text-sm truncate">{h.input}</span>
                    <span className="ml-2 shrink-0 text-sm">{VERDICT_EMOJI[h.result.verdict.level]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Mode: Sliders */}
      {mode === 'sliders' && (
        <div className="space-y-5">
          <Card data-testid="scenario-sliders">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Scenario Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Income change</span><span className="font-mono">{sliderLevers.incomeChangePct > 0 ? '+' : ''}{sliderLevers.incomeChangePct}%</span></div>
                <Slider value={[sliderLevers.incomeChangePct]} min={-100} max={100} step={5}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, incomeChangePct: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Essential spending</span><span className="font-mono">{sliderLevers.essentialChangePct > 0 ? '+' : ''}{sliderLevers.essentialChangePct}%</span></div>
                <Slider value={[sliderLevers.essentialChangePct]} min={-50} max={100} step={5}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, essentialChangePct: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Lifestyle spending</span><span className="font-mono">{sliderLevers.discretionaryChangePct > 0 ? '+' : ''}{sliderLevers.discretionaryChangePct}%</span></div>
                <Slider value={[sliderLevers.discretionaryChangePct]} min={-100} max={100} step={5}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, discretionaryChangePct: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>One-time purchase</span><span className="font-mono">{fmt(sliderLevers.oneTimePurchase)}</span></div>
                <Slider value={[sliderLevers.oneTimePurchase]} min={0} max={1000000} step={10000}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, oneTimePurchase: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>New monthly expense</span><span className="font-mono">{fmt(sliderLevers.newRecurringExpense)}/mo</span></div>
                <Slider value={[sliderLevers.newRecurringExpense]} min={0} max={100000} step={1000}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, newRecurringExpense: v }))} />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1"><span>Additional monthly savings</span><span className="font-mono">{fmt(sliderLevers.additionalSavings)}/mo</span></div>
                <Slider value={[sliderLevers.additionalSavings]} min={0} max={100000} step={1000}
                  onValueChange={([v]) => setSliderLevers(p => ({ ...p, additionalSavings: v }))} />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setMode('input')}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Button>
            <Button className="flex-1" onClick={handleSliderEvaluate} disabled={evaluating} data-testid="slider-evaluate">
              {evaluating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              Evaluate
            </Button>
          </div>
        </div>
      )}

      {/* Mode: Result */}
      {mode === 'result' && result && (
        <div className="space-y-5" data-testid="scenario-result">
          {/* Parsed description */}
          {parsedLevers?.description && (
            <p className="text-sm text-muted-foreground">{parsedLevers.description}</p>
          )}

          {/* Verdict */}
          <Card className={`${VERDICT_COLORS[result.verdict.level]?.border || 'border-border'} ${VERDICT_COLORS[result.verdict.level]?.bg || ''}`} data-testid="scenario-verdict">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">{VERDICT_EMOJI[result.verdict.level]}</span>
                <div>
                  <p className={`text-sm font-bold ${VERDICT_COLORS[result.verdict.level]?.text || ''}`}>{result.verdict.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{result.verdict.explanation}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Before vs After comparison */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Current vs After Decision</h3>
            <div className="grid gap-2 sm:grid-cols-2" data-testid="scenario-comparison">
              <CompareCard label="Financial Health" icon={Heart}
                baseline={result.baseline.healthScore} scenario={result.scenario.healthScore}
                delta={result.delta.health} format={(v: number) => `${v}/100`} suffix=" pts" />
              <CompareCard label="Financial Resilience" icon={Shield}
                baseline={result.baseline.resilienceMonths} scenario={result.scenario.resilienceMonths}
                delta={result.delta.resilience} format={(v: number) => `${v} mo`} suffix=" mo" />
              <CompareCard label="90-Day Cash" icon={TrendingUp}
                baseline={result.baseline.projected90dCash} scenario={result.scenario.projected90dCash}
                delta={result.delta.projected90dCash} format={(v: number) => fmtCompact(v, currency)} />
              <CompareCard label="Monthly Surplus" icon={Wallet}
                baseline={result.baseline.monthlySurplus} scenario={result.scenario.monthlySurplus}
                delta={result.delta.surplus} format={(v: number) => fmt(v, currency)} />
            </div>
          </div>

          {/* Alternatives: "Make it safer" */}
          {result.alternatives.length > 0 && (
            <section data-testid="scenario-alternatives">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-muted-foreground">What would make this safer?</h3>
              </div>
              <div className="space-y-2">
                {result.alternatives.map(alt => (
                  <button key={alt.id} onClick={() => handleAlternativeSelect(alt)}
                    className="w-full text-left rounded-xl border border-border bg-card p-3 hover:shadow-sm transition-shadow"
                    data-testid={`alt-${alt.id}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{alt.title}</p>
                        <p className="text-xs text-muted-foreground">{alt.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{VERDICT_EMOJI[alt.verdict.level]}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <span>Health: {alt.impact.healthScore}/100</span>
                      <span>Resilience: {alt.impact.resilienceMonths}mo</span>
                      <span>90d: {fmtCompact(alt.impact.projected90dCash, currency)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleReset} data-testid="scenario-reset">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> New Scenario
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setMode('sliders')}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Adjust
            </Button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground">
            All financial projections are deterministic and based on your current data.
            This is planning support, not regulated financial advice.
          </p>
        </div>
      )}

      {evaluating && mode !== 'result' && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Calculating consequences...</span>
          </div>
        </div>
      )}
    </div>
  );
}
