'use client';
// Global page-view + session tracker (Sprint 6). Mounted once in the root layout.
// Tracks only WHICH key pages are visited (never content), plus a low-frequency
// heartbeat so session duration and returning-user metrics can be computed server-side.
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { track, getSessionStart } from '@/lib/analytics/client';

const PAGE_EVENTS: { match: (p: string) => boolean; event: string }[] = [
  { match: (p) => p === '/', event: 'landing_page_visit' },
  { match: (p) => p === '/register', event: 'signup_page_viewed' },
  { match: (p) => p === '/dashboard', event: 'dashboard_viewed' },
  { match: (p) => p === '/billing' || p.startsWith('/billing/'), event: 'billing_page_viewed' },
  { match: (p) => p === '/cfo/scenario', event: 'forecast_viewed' },
  { match: (p) => p === '/cfo/reports', event: 'reports_page_viewed' },
  { match: (p) => p === '/cfo/chat', event: 'cfo_chat_viewed' },
  { match: (p) => p === '/memory', event: 'memory_page_viewed' },
];

const HEARTBEAT_MS = 60_000;
const MAX_HEARTBEATS = 120; // stop after ~2h so idle tabs don't spam forever

export function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);
  const beats = useRef(0);

  // Page-view events (deduped per pathname change)
  useEffect(() => {
    if (!pathname || pathname === lastTracked.current) return;
    lastTracked.current = pathname;
    const hit = PAGE_EVENTS.find((r) => r.match(pathname));
    if (hit) track(hit.event);
  }, [pathname]);

  // Session heartbeat — only while the tab is visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (beats.current >= MAX_HEARTBEATS) return;
      beats.current += 1;
      track('session_heartbeat', { durationSec: Math.round((Date.now() - getSessionStart()) / 1000) });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
