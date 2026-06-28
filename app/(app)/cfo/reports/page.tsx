'use client';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Sparkles, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch('/api/cfo/report', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Report failed'); return; }
      setReport(d.markdown || '');
      toast.success('Report generated');
    } finally { setLoading(false); }
  }

  function download() {
    if (!report) return;
    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `nexusai-report-${new Date().toISOString().slice(0,10)}.md`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">AI Financial Reports</h1><p className="text-sm text-muted-foreground">Generate an executive monthly summary with the CFO’s analysis.</p></div>
        <div className="flex gap-2">
          {report && <Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" /> Export</Button>}
          <Button onClick={generate} disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="mr-2 h-4 w-4" /> Generate report</>}</Button>
        </div>
      </div>

      {!report && !loading && (
        <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No report generated yet</p>
          <p className="text-sm text-muted-foreground">Click “Generate report” to produce an executive monthly summary based on the latest data.</p>
        </CardContent></Card>
      )}
      {loading && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /><p className="mt-3">The CFO is drafting your report…</p></CardContent></Card>}
      {report && (
        <Card><CardContent className="p-6 md:p-10">
          <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-8 prose-h2:text-xl prose-h2:border-b prose-h2:pb-2 prose-p:leading-relaxed">
            <Md text={report} />
          </article>
        </CardContent></Card>
      )}
    </div>
  );
}
function Md({ text }: { text: string }) {
  const blocks = text.split(/\n\n+/);
  return <>{blocks.map((b, i) => {
    if (/^##\s/.test(b)) return <h2 key={i}>{b.replace(/^##\s/, '')}</h2>;
    if (/^#\s/.test(b)) return <h1 key={i}>{b.replace(/^#\s/, '')}</h1>;
    const lines = b.split('\n');
    if (lines.every(l => /^\s*[-*]\s|^\s*\d+\.\s/.test(l))) {
      const isNum = /^\s*\d+\.\s/.test(lines[0]);
      return isNum ? <ol key={i}>{lines.map((l, j) => <li key={j}><Inline t={l.replace(/^\s*\d+\.\s/, '')} /></li>)}</ol>
        : <ul key={i}>{lines.map((l, j) => <li key={j}><Inline t={l.replace(/^\s*[-*]\s/, '')} /></li>)}</ul>;
    }
    return <p key={i}><Inline t={b} /></p>;
  })}</>;
}
function Inline({ t }: { t: string }) {
  const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>)}</>;
}
