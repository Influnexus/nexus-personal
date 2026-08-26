'use client';
// Sprint P1 — creates the user's personal workspace and switches the active session workspace
// to it (same session-update mechanism the OrgSwitcher uses). Minimal by design.
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export function PersonalWorkspaceButton() {
  const [loading, setLoading] = useState(false);
  const { update } = useSession();
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/personal/workspace', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || !j.workspace) {
        toast.error(j.error || 'Could not create your personal workspace.');
        setLoading(false);
        return;
      }
      await update({ activeOrgId: j.workspace.id }); // refresh JWT → workspaceKind: 'personal'
      toast.success(j.created ? 'Personal workspace created.' : 'Switched to your personal workspace.');
      router.refresh();
    } catch {
      toast.error('Could not create your personal workspace.');
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleClick} disabled={loading} data-testid="create-personal-workspace">
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wallet className="mr-1.5 h-4 w-4" />}
      {loading ? 'Setting up…' : 'Create my personal workspace'}
    </Button>
  );
}
