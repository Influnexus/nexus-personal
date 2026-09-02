import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { Button } from '@/components/ui/button';
import { DemoButton } from '@/components/app/DemoButton';
import { PersonalDemoButton } from '@/components/personal/PersonalDemoButton';
import { ArrowRight, Sparkles, ShieldCheck, Workflow, Layers, Zap, LineChart, Building2, Wallet } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 grid-fade opacity-[0.35] dark:opacity-20" />
        <div className="pointer-events-none absolute inset-0 glow" />
        <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-24 text-center md:pt-32">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Introducing the AI Workforce platform
          </div>
          <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight md:text-7xl">
            Meet NexusAI CFO —<br className="hidden md:block" />
            <span className="bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent"> your AI finance executive.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
            Instant cash-flow forecasts, invoice intelligence and a CFO you can chat with 24/7 — no spreadsheets required. Try it with real data in the next 30 seconds, no signup.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoButton size="lg" variant="default" className="px-6" label="Try live demo — no signup" />
            <Link href="/register">
              <Button size="lg" variant="outline" className="rounded-full px-6">Start for free <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Bank-grade encryption · Privacy-first · You control your data</p>

          {/* Product chooser — Sprint P2.9 */}
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 text-left sm:grid-cols-2" data-testid="product-chooser">
            <div className="rounded-2xl border border-border bg-background/60 p-6 backdrop-blur transition-shadow hover:shadow-md" data-testid="chooser-business">
              <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4" /> For your business</div>
              <p className="mt-1.5 text-sm text-muted-foreground">An AI CFO that forecasts cash, reads invoices and answers like a real finance leader.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DemoButton size="sm" variant="default" className="px-4" label="Try business demo" />
                <Link href="/register" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Start for free →</Link>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-6 backdrop-blur transition-shadow hover:shadow-md" data-testid="chooser-personal">
              <div className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4" /> For you</div>
              <p className="mt-1.5 text-sm text-muted-foreground">Nexus Personal — know your financial health, resilience and what changed, in minutes.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <PersonalDemoButton className="h-9 px-4 text-sm" label="Try the Personal demo" />
                <Link href="/register?product=personal" className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" data-testid="personal-get-started">Get started →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo strip */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6 py-8 text-sm font-medium text-muted-foreground">
          <span>ACME</span><span>Northwind</span><span>Globex</span><span>Initech</span><span>Hooli</span><span>Umbrella</span><span>Vandelay</span>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Built for the next era of work.</h2>
          <p className="mt-3 text-muted-foreground">A unified foundation: identity, governance, observability and a design system engineered for enterprise scale.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'Enterprise-grade security', desc: 'Role-based access control, audit logs, secure sessions and SSO-ready architecture.' },
            { icon: Workflow, title: 'Organization workflows', desc: 'Multi-tenant orgs, team invitations and granular roles built-in from day one.' },
            { icon: Layers, title: 'Composable architecture', desc: 'Service layer, repositories and typed APIs designed for long-term maintainability.' },
            { icon: Zap, title: 'Lightning performance', desc: 'Edge-ready Next.js App Router, server components and optimized data flows.' },
            { icon: LineChart, title: 'Insights you can trust', desc: 'Real-time analytics with first-class observability and audit trails.' },
            { icon: Sparkles, title: 'AI-ready foundation', desc: 'Designed to plug in the AI workforce — agents, copilots and autonomous workflows.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 transition hover:border-border">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 text-foreground"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-4 font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-foreground to-foreground/80 px-8 py-14 text-background md:px-14 md:py-20">
          <div className="max-w-2xl">
            <h3 className="text-3xl font-semibold tracking-tight md:text-4xl">Deploy your AI workforce.</h3>
            <p className="mt-3 text-background/70">Get started in minutes with a free workspace. Invite your team and explore the platform.</p>
            <Link href="/register" className="mt-7 inline-block">
              <Button variant="secondary" size="lg" className="rounded-full bg-background text-foreground hover:bg-background/90">Create your workspace <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} NexusAI, Inc.</div>
          <div className="flex gap-6"><a className="hover:text-foreground" href="#">Privacy</a><a className="hover:text-foreground" href="#">Terms</a><a className="hover:text-foreground" href="#">Security</a></div>
        </div>
      </footer>
    </div>
  );
}
