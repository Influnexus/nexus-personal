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
  // Nexus Personal (Sprint P2)
  { match: (p) => p === '/personal', event: 'personal_dashboard_viewed' },
  { match: (p) => p === '/personal/onboarding', event: 'personal_onboarding_started' },
];

const HEARTBEAT_MS = 60_000;
const MAX_HEARTBEATS = 120; // stop after ~2h so idle tabs don't spam forever

// Module-scope dedupe guard: React can mount → unmount → remount this component during
// hydration or layout transitions, which resets refs and caused double-fired page views.
// A module-level key + short window survives remounts while still counting genuine
// repeat visits (different pathname, or same page after >2s of real navigation).
let lastTrackedKey = '';
let lastTrackedAt = 0;

export function AnalyticsTracker() {
  const pathname = usePathname();
  const beats = useRef(0);

  // Page-view events (deduped per pathname change, remount-safe)
  useEffect(() => {
    if (!pathname) return;
    const now = Date.now();
    if (pathname === lastTrackedKey && now - lastTrackedAt < 2000) return;
    lastTrackedKey = pathname;
    lastTrackedAt = now;
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
