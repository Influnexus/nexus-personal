'use client';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { Check, ChevronsUpDown, Plus, Building2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function OrgSwitcher() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const { data, mutate } = useSWR('/api/organizations', fetcher);
  const orgs = data?.organizations || [];
  const active = orgs.find((o: any) => o.id === session?.user?.activeOrgId) || orgs[0];
  const [open, setOpen] = useState(false);

  async function pick(id: string, name: string) {
    setOpen(false);
    await update({ activeOrgId: id });
    await mutate();
    toast.success(`Switched to ${name}`);
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" role="combobox" aria-expanded={open}
          className="h-9 w-full justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/30 px-2.5 text-left text-sm font-normal hover:bg-sidebar-accent">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[10px] font-semibold text-background">
              {(active?.name || 'N').slice(0,1).toUpperCase()}
            </span>
            <span className="truncate font-medium">{active?.name || 'No workspace'}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search workspace…" className="h-9" />
          <CommandList>
            <CommandEmpty>No workspaces.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {orgs.map((o: any) => (
                <CommandItem key={o.id} value={o.name} onSelect={() => pick(o.id, o.name)} className="gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium">{o.name.slice(0,1).toUpperCase()}</span>
                  <span className="flex-1 truncate">{o.name}</span>
                  <Check className={cn('h-4 w-4', active?.id === o.id ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <Link href="/organization" onClick={() => setOpen(false)}>
                <CommandItem className="gap-2"><Plus className="h-4 w-4" /> Create workspace</CommandItem>
              </Link>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
