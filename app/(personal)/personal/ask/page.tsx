// Placeholder — Ask Nexus Personal ships in Sprint P5 (per approved roadmap).
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MessageCircle, ArrowLeft } from 'lucide-react';

export default function AskNexusPlaceholder() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center text-center" data-testid="personal-ask-placeholder">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><MessageCircle className="h-5 w-5" /></span>
      <h1 className="text-lg font-bold">Ask Nexus</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Soon you'll be able to ask anything about your money — “Can I afford a ₹30K trip next month?” —
        and get answers grounded in your real numbers.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Arriving in an upcoming update.</p>
      <Button asChild variant="outline" className="mt-5"><Link href="/personal"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back to overview</Link></Button>
    </div>
  );
}
