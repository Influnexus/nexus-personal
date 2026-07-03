'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Brain, Building2, Target, GitCommit, LineChart, Sliders, Plus, Pencil, Trash2, Sparkles, User, RotateCcw, Check, X } from 'lucide-react';

const fetcher = (u: string) => fetch(u).then(r => r.json());

type Category = 'business' | 'financial' | 'goal' | 'decision' | 'preference';

const CATEGORY_META: Record<Category, { label: string; icon: any; hint: string; placeholder: { label: string; value: string } }> = {
  business: { label: 'Business', icon: Building2, hint: 'Company profile — industry, fiscal year, currency, vendors, tools.', placeholder: { label: 'Industry', value: 'B2B SaaS, mid-market' } },
  financial: { label: 'Financial', icon: LineChart, hint: 'Budget assumptions and financial context beyond live KPIs.', placeholder: { label: 'Budget assumption', value: 'Planning for 20% MoM growth this quarter' } },
  goal: { label: 'Goals', icon: Target, hint: 'Targets the CFO should track progress against.', placeholder: { label: 'Extend runway', value: 'Reach 12 months of runway by Q4 2026' } },
  decision: { label: 'Decisions', icon: GitCommit, hint: 'Decisions made so the CFO can follow up on progress.', placeholder: { label: 'Cut AWS spend', value: 'Reduce AWS bill by renegotiating reserved instances' } },
  preference: { label: 'Preferences', icon: Sliders, hint: 'How you want the CFO to communicate.', placeholder: { label: 'Reporting style', value: 'Keep answers under 3 bullets, always show $ amounts' } },
};
const ORDER: Category[] = ['business', 'financial', 'goal', 'decision', 'preference'];

export default function MemoryPage() {
  const { data, mutate, isLoading } = useSWR('/api/memory', fetcher, { revalidateOnMount: true, revalidateOnFocus: true, dedupingInterval: 0 });
  const grouped = data?.memories || { business: [], financial: [], goal: [], decision: [], preference: [] };
  const [addOpen, setAddOpen] = useState<Category | null>(null);
  const [form, setForm] = useState({ label: '', value: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', value: '' });
  const [saving, setSaving] = useState(false);

  const totalCount = ORDER.reduce((s, c) => s + (grouped[c]?.length || 0), 0);

  async function addMemory(category: Category) {
    if (!form.label.trim() || !form.value.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, label: form.label, value: form.value }) });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Could not add memory'); return; }
      toast.success('Memory added');
      setAddOpen(null); setForm({ label: '', value: '' });
      mutate();
    } finally { setSaving(false); }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) });
      if (!res.ok) { toast.error('Could not update memory'); return; }
      toast.success('Memory updated');
      setEditingId(null);
      mutate();
    } finally { setSaving(false); }
  }

  async function deleteMemory(id: string) {
    const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Could not delete memory'); return; }
    toast.success('Memory deleted');
    mutate();
  }

  async function resetAll(category?: Category) {
    const url = category ? `/api/memory?category=${category}` : '/api/memory';
    const res = await fetch(url, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) { toast.error('Could not reset memory'); return; }
    toast.success(`Cleared ${d.deleted} memor${d.deleted === 1 ? 'y' : 'ies'}`);
    mutate();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Brain className="h-5 w-5" /><h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">Executive Memory</h1></div>
          <p className="mt-1 text-sm text-muted-foreground">What the AI CFO remembers about your business — view, edit, delete or reset anytime.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={totalCount === 0}><RotateCcw className="mr-2 h-4 w-4" /> Reset all memory</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all memory?</AlertDialogTitle>
              <AlertDialogDescription>This permanently deletes every Business, Financial, Goal, Decision and Preference memory for this organization. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetAll()}>Reset everything</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {isLoading ? (
        <div className="space-y-4"><Skeleton className="h-10 w-full shimmer" /><Skeleton className="h-64 w-full shimmer" /></div>
      ) : (
        <Tabs defaultValue="business">
          <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/50 p-1">
            {ORDER.map(cat => {
              const Meta = CATEGORY_META[cat];
              const count = grouped[cat]?.length || 0;
              return (
                <TabsTrigger key={cat} value={cat} className="gap-1.5 data-[state=active]:bg-background">
                  <Meta.icon className="h-3.5 w-3.5" /> {Meta.label}
                  {count > 0 && <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 justify-center px-1 text-[10px]">{count}</Badge>}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ORDER.map(cat => {
            const Meta = CATEGORY_META[cat];
            const items = grouped[cat] || [];
            return (
              <TabsContent key={cat} value={cat} className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{Meta.hint}</p>
                  <div className="flex gap-2">
                    {items.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button size="sm" variant="ghost">Clear category</Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Clear all {Meta.label} memories?</AlertDialogTitle><AlertDialogDescription>This deletes every memory in this category only.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => resetAll(cat)}>Clear</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button size="sm" onClick={() => { setAddOpen(cat); setForm({ label: '', value: '' }); }}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add</Button>
                  </div>
                </div>

                {items.length === 0 ? (
                  <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <Meta.icon className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-medium">No {Meta.label.toLowerCase()} memory yet</p>
                    <p className="text-xs text-muted-foreground">Add one manually, or just mention it in chat — the CFO will remember automatically.</p>
                  </CardContent></Card>
                ) : (
                  <div className="space-y-2.5">
                    {items.map((m: any) => (
                      <Card key={m.id} className="transition-shadow hover:shadow-sm">
                        <CardContent className="p-4">
                          {editingId === m.id ? (
                            <div className="space-y-2">
                              <Input value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} placeholder="Label" />
                              <Textarea value={editForm.value} onChange={e => setEditForm({ ...editForm, value: e.target.value })} placeholder="Detail" rows={2} />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
                                <Button size="sm" onClick={() => saveEdit(m.id)} disabled={saving}><Check className="mr-1 h-3.5 w-3.5" /> Save</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{m.label}</p>
                                  {m.source === 'ai_extracted' ? (
                                    <Badge variant="secondary" className="gap-1 text-[10px]"><Sparkles className="h-2.5 w-2.5" /> Auto-detected</Badge>
                                  ) : (
                                    <Badge variant="outline" className="gap-1 text-[10px]"><User className="h-2.5 w-2.5" /> Added by you</Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{m.value}</p>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(m.id); setEditForm({ label: m.label, value: m.value }); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:text-rose-700 dark:text-rose-400" onClick={() => deleteMemory(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <Dialog open={!!addOpen} onOpenChange={(o) => !o && setAddOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addOpen ? CATEGORY_META[addOpen].label : ''} memory</DialogTitle>
            <DialogDescription>The AI CFO will reference this naturally in future conversations.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Label</Label><Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder={addOpen ? CATEGORY_META[addOpen].placeholder.label : ''} /></div>
            <div className="space-y-1.5"><Label>Detail</Label><Textarea value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder={addOpen ? CATEGORY_META[addOpen].placeholder.value : ''} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(null)}>Cancel</Button>
            <Button onClick={() => addOpen && addMemory(addOpen)} disabled={saving || !form.label.trim() || !form.value.trim()}>{saving ? 'Saving…' : 'Add memory'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
