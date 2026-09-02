import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell } from 'lucide-react';

const items = [
  { title: 'Welcome to NexusAI', time: 'Just now', body: 'Your workspace is ready. Invite your team to get started.' },
  { title: 'Security tip', time: '2h ago', body: 'Enable two-factor authentication for extra safety.' },
  { title: 'Sprint 2 preview', time: 'Yesterday', body: 'AI CFO and Agents are coming soon to your workspace.' },
];

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Notifications</h1><p className="text-sm text-muted-foreground">Stay in the loop.</p></div>
      <Card><CardHeader><CardTitle className="text-base">Recent</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.title} className="flex gap-3 py-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><Bell className="h-4 w-4 text-muted-foreground" /></div>
                <div className="flex-1">
                  <div className="flex items-center justify-between"><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground">{n.time}</p></div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
