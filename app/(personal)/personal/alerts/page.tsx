'use client';
// Sprint P3 — Personal Alerts page. Organized by severity: Critical → Warning → Info.
// All alerts are computed deterministically by lib/core/finance/alerts.ts.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { track } from '@/lib/analytics/client';

interface PersonalAlert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  explanation: string;
  metric?: string;
  context?: string;
  recommendation?: string;
  timestamp: string;
}

interface AlertsData {
  alerts: PersonalAlert[];
  currency: string;
  summary: { critical: number; warning: number; info: number; total: number };
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    label: 'Critical',
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/20',
    badge: 'bg-red-500/15 text-red-700 dark:text-red-400',
    dot: '🔴',
  },
  warning: {
    icon: AlertCircle,
    label: 'Warning',
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    dot: '🟠',
  },
  info: {
    icon: Info,
    label: 'Informational',
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-500/20',
    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
    dot: '🟢',
  },
};

function AlertCard({ alert }: { alert: PersonalAlert }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[alert.severity];
  const Icon = config.icon;

  return (
    <div
      className={`rounded-xl border ${config.border} ${config.bg} p-4 transition-all ${expanded ? 'shadow-sm' : ''}`}
      data-testid={`alert-card-${alert.type}`}
    >
      <button
        className="flex w-full items-start gap-3 text-left"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded) track('personal_alert_opened', { feature: alert.type });
        }}
      >
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${config.bg} ${config.text}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{alert.title}</p>
            {alert.metric && (
              <Badge variant="outline" className="shrink-0 text-[10px] font-mono">{alert.metric}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{alert.explanation}</p>
        </div>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 ml-10 space-y-2 border-t border-border/50 pt-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">What happened</p>
            <p className="mt-0.5 text-sm">{alert.explanation}</p>
          </div>
          {alert.recommendation && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">What Nexus recommends checking</p>
              <p className="mt-0.5 text-sm">{alert.recommendation}</p>
            </div>
          )}
          {alert.context && (
            <p className="text-[11px] text-muted-foreground">Context: {alert.context}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AlertSection({ title, alerts, severity }: { title: string; alerts: PersonalAlert[]; severity: 'critical' | 'warning' | 'info' }) {
  const filtered = alerts.filter(a => a.severity === severity);
  if (filtered.length === 0) return null;
  const config = SEVERITY_CONFIG[severity];

  return (
    <section data-testid={`alerts-section-${severity}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">{config.dot}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge className={`${config.badge} text-[10px]`}>{filtered.length}</Badge>
      </div>
      <div className="space-y-2">
        {filtered.map(alert => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>
    </section>
  );
}

export default function PersonalAlertsPage() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/personal/alerts');
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(json);
      track('personal_alerts_viewed');
    } catch (e: any) {
      setError(e.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  if (loading) {
    return (
      <div className="space-y-6 pt-8">
        <div className="flex items-center gap-2">
          <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold">Financial Alerts</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pt-8">
        <div className="flex items-center gap-2">
          <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold">Financial Alerts</h1>
        </div>
        <Card><CardContent className="py-12 text-center text-muted-foreground">{error}</CardContent></Card>
      </div>
    );
  }

  const alerts = data?.alerts || [];
  const summary = data?.summary || { critical: 0, warning: 0, info: 0, total: 0 };

  return (
    <div className="space-y-6 pt-8" data-testid="personal-alerts-page">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Link href="/personal" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <h1 className="text-xl font-bold">Financial Alerts</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.total === 0
            ? 'No alerts right now — your finances are on track.'
            : `${summary.total} alert${summary.total !== 1 ? 's' : ''} based on your current financial data.`}
        </p>
      </div>

      {/* Summary badges */}
      {summary.total > 0 && (
        <div className="flex gap-2">
          {summary.critical > 0 && <Badge className={`${SEVERITY_CONFIG.critical.badge}`}>{summary.critical} critical</Badge>}
          {summary.warning > 0 && <Badge className={`${SEVERITY_CONFIG.warning.badge}`}>{summary.warning} warning</Badge>}
          {summary.info > 0 && <Badge className={`${SEVERITY_CONFIG.info.badge}`}>{summary.info} informational</Badge>}
        </div>
      )}

      {/* Alert sections by severity */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <Info className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">All clear</p>
            <p className="mt-1 text-xs text-muted-foreground">No financial alerts at this time. We&apos;ll notify you if something needs attention.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <AlertSection title="Requires immediate attention" alerts={alerts} severity="critical" />
          <AlertSection title="Worth reviewing" alerts={alerts} severity="warning" />
          <AlertSection title="Good to know" alerts={alerts} severity="info" />
        </div>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Alerts are computed deterministically from your financial data. They are not regulated financial advice.
        Language such as &ldquo;consider reviewing&rdquo; indicates planning suggestions, not mandatory actions.
      </p>
    </div>
  );
}
