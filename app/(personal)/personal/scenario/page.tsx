// Placeholder — the Personal Scenario Engine ships in Sprint P4 (per approved roadmap).
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, ArrowLeft } from 'lucide-react';

export default function ScenarioPlaceholder() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center text-center" data-testid="personal-scenario-placeholder">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><SlidersHorizontal className="h-5 w-5" /></span>
      <h1 className="text-lg font-bold">Run a scenario</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Soon you'll be able to simulate life decisions — a salary change, a big purchase, a new EMI —
        and see exactly how they play out for your savings and resilience.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Arriving in an upcoming update.</p>
      <Button asChild variant="outline" className="mt-5"><Link href="/personal"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to overview</Link></Button>
    </div>
  );
}
