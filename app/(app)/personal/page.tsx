// Sprint P1 — Nexus Personal routing SCAFFOLD (placeholder shell, NOT the product).
// Purpose: prove the full chain — authenticated session → active personal workspace → kind-aware
// routing → shared Financial Intelligence Core — without touching any Enterprise surface.
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { orgsRepo } from '@/lib/repositories/organizations';
import { personalService } from '@/lib/services/personal.service';
import { PersonalWorkspaceButton } from '@/components/app/PersonalWorkspaceButton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Wallet, Sparkles } from 'lucide-react';

export default async function PersonalScaffoldPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const orgId = session.user.activeOrgId;
  const org = orgId ? await orgsRepo.findById(orgId) : null;
  const isPersonal = org?.kind === 'personal';

  if (!isPersonal) {
    // Active workspace is a business org — offer to create/switch to a personal workspace.
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-10">
        <Card className="max-w-lg text-center" data-testid="personal-gate">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><Wallet className="h-6 w-6" /></div>
            <div>
              <p className="text-lg font-semibold">Nexus Personal</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Financial intelligence for you — powered by the same engine as your business CFO.
                Your current workspace ({org?.name || 'none'}) is a business workspace.
              </p>
            </div>
            <PersonalWorkspaceButton />
            <p className="text-[11px] text-muted-foreground">Your business workspace is untouched — you can switch between them anytime.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Personal workspace active → prove the shared core end-to-end with a minimal snapshot.
  const snapshot = await personalService.getStateSnapshot(orgId!);
  const checks = [
    { label: 'Authenticated session', note: session.user.email || '' },
    { label: 'Active personal workspace', note: org!.name },
    { label: 'Workspace kind in session', note: `kind: ${session.user.workspaceKind}` },
    { label: 'Shared financial core reachable', note: `computed over ${snapshot.transactionCount} transaction(s)` },
  ];

  return (
    <div className="container max-w-3xl space-y-6 py-10" data-testid="personal-scaffold">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted"><Wallet className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nexus Personal</h1>
          <p className="text-sm text-muted-foreground">Foundation scaffold — the full experience arrives in Sprint P2.</p>
        </div>
        <Badge variant="secondary" className="ml-auto"><Sparkles className="mr-1 h-3 w-3" /> P1 scaffold</Badge>
      </div>

      <Card data-testid="personal-arch-checks">
        <CardHeader className="pb-3"><CardTitle className="text-base">Architecture verification</CardTitle><CardDescription>Session → personal workspace → kind routing → shared core</CardDescription></CardHeader>
        <CardContent className="space-y-2.5">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-2.5 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">{c.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{c.note}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card data-testid="personal-core-proof">
        <CardHeader className="pb-3"><CardTitle className="text-base">Shared core — live computation</CardTitle><CardDescription>lib/core/finance · same deterministic engine as the Enterprise CFO</CardDescription></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Cash on hand</p><p className="text-lg font-bold tabular-nums">${snapshot.cashOnHand.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Income (30d)</p><p className="text-lg font-bold tabular-nums">${snapshot.income30d.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Spending (30d)</p><p className="text-lg font-bold tabular-nums">${snapshot.spend30d.toLocaleString()}</p></div>
            <div><p className="text-xs text-muted-foreground">Savings rate</p><p className="text-lg font-bold tabular-nums">{Math.round(snapshot.savingsRate * 100)}%</p></div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">No data yet? That's expected — personal data import, dashboard, forecast, goals and Ask Nexus Personal ship in Sprint P2+.</p>
        </CardContent>
      </Card>
    </div>
  );
}
