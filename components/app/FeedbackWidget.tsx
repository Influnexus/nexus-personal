'use client';
// Lightweight beta feedback widget (Sprint 6). Floating button shown on the dashboard and
// everywhere in demo mode. Two modes: quick experience rating + "Report a problem".
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquareHeart, Bug, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const RATINGS = [
  { value: 'very_useful', label: 'Very useful', emoji: '\u{1F929}' },
  { value: 'useful', label: 'Useful', emoji: '\u{1F642}' },
  { value: 'neutral', label: 'Neutral', emoji: '\u{1F610}' },
  { value: 'not_useful', label: 'Not useful', emoji: '\u{1F615}' },
  { value: 'broken', label: 'Broken', emoji: '\u{1F6A8}' },
];

const FEATURES = [
  { value: 'dashboard', label: 'Executive Dashboard' },
  { value: 'cfo_chat', label: 'AI CFO Chat' },
  { value: 'invoices', label: 'Invoice Upload' },
  { value: 'csv_import', label: 'CSV Import' },
  { value: 'reports', label: 'Reports' },
  { value: 'forecast', label: 'Forecast / Scenario' },
  { value: 'memory', label: 'Executive Memory' },
  { value: 'billing', label: 'Billing' },
  { value: 'demo', label: 'Demo Mode' },
  { value: 'other', label: 'Other' },
];

export function FeedbackWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'rating' | 'problem'>('rating');
  const [rating, setRating] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [feature, setFeature] = useState('');
  const [errorId, setErrorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const isDemo = !!session?.user?.isDemo;
  // Spec: accessible from the dashboard and demo mode (demo users see it everywhere).
  const visible = isDemo || pathname === '/dashboard';
  if (!visible) return null;

  const reset = () => { setMode('rating'); setRating(null); setText(''); setFeature(''); setErrorId(''); setDone(false); };

  const submit = async () => {
    if (mode === 'rating' && !rating) { toast.error('Please pick a rating first.'); return; }
    if (mode === 'problem' && !text.trim()) { toast.error('Please describe the problem.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mode,
          rating: mode === 'rating' ? rating : undefined,
          text: text.trim() || undefined,
          feature: feature || (mode === 'problem' ? 'other' : undefined),
          errorId: errorId.trim() || undefined,
          page: pathname,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || 'Could not send feedback — please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
      setTimeout(() => { setOpen(false); setTimeout(reset, 300); }, 1400);
    } catch {
      toast.error('Could not send feedback — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        data-testid="feedback-widget-button"
        onClick={() => { reset(); setOpen(true); }}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-card-foreground shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        <MessageSquareHeart className="h-4 w-4" />
        Feedback
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTimeout(reset, 300); }}>
        <DialogContent className="sm:max-w-md" data-testid="feedback-dialog">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-lg font-semibold">Thank you!</p>
              <p className="text-sm text-muted-foreground">Your feedback helps us build a better AI CFO.</p>
            </div>
          ) : mode === 'rating' ? (
            <>
              <DialogHeader>
                <DialogTitle>How was your experience?</DialogTitle>
                <DialogDescription>Quick beta feedback — takes 5 seconds.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-5 gap-2">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    data-testid={`feedback-rating-${r.value}`}
                    onClick={() => setRating(r.value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-all',
                      rating === r.value ? 'border-foreground bg-accent ring-1 ring-foreground' : 'border-border hover:bg-accent/60',
                    )}
                  >
                    <span className="text-xl">{r.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{r.label}</span>
                  </button>
                ))}
              </div>
              <Textarea
                data-testid="feedback-text"
                placeholder="Anything you'd like to add? (optional)"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={2000}
                rows={3}
              />
              <div className="flex items-center justify-between">
                <button
                  data-testid="feedback-report-problem-link"
                  onClick={() => setMode('problem')}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <Bug className="h-3.5 w-3.5" /> Report a problem
                </button>
                <Button data-testid="feedback-submit" onClick={submit} disabled={submitting}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Send feedback
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Report a problem</DialogTitle>
                <DialogDescription>Tell us what went wrong — we capture the page and time automatically. Please don't include passwords or financial details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Which feature?</Label>
                  <Select value={feature} onValueChange={setFeature}>
                    <SelectTrigger data-testid="problem-feature-select"><SelectValue placeholder="Select a feature" /></SelectTrigger>
                    <SelectContent>
                      {FEATURES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>What happened? *</Label>
                  <Textarea
                    data-testid="problem-description"
                    placeholder="Describe what you did and what went wrong…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={2000}
                    rows={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Error ID <span className="text-muted-foreground">(optional, if one was shown)</span></Label>
                  <Input data-testid="problem-error-id" value={errorId} onChange={(e) => setErrorId(e.target.value)} placeholder="e.g. req_ab12cd" maxLength={64} />
                </div>
                <p className="text-[11px] text-muted-foreground">Auto-captured: page ({pathname}) and timestamp. No file contents or conversation data are sent.</p>
              </div>
              <div className="flex items-center justify-between">
                <button onClick={() => setMode('rating')} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  ← Back to rating
                </button>
                <Button data-testid="problem-submit" onClick={submit} disabled={submitting}>
                  {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Send report
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
