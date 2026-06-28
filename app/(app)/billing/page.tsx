import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';

const plans = [
  { name: 'Starter', price: '$0', features: ['Up to 3 members','Basic dashboard','Community support'], cta: 'Current plan', current: true },
  { name: 'Pro', price: '$29', features: ['Unlimited members','Advanced analytics','Priority support'], cta: 'Upgrade' },
  { name: 'Enterprise', price: 'Custom', features: ['SSO & SAML','Audit logs','Dedicated CSM'], cta: 'Contact sales' },
];

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div><h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Billing</h1><p className="text-sm text-muted-foreground">Choose the plan that fits your team.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className={p.current ? 'border-foreground' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{p.name}</CardTitle>
                {p.current && <Badge>Current</Badge>}
              </div>
              <CardDescription><span className="text-2xl font-semibold text-foreground">{p.price}</span>{p.price.startsWith('$') && p.price !== '$0' && <span className="text-muted-foreground"> /mo</span>}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {p.features.map(f => <li key={f} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground/70" /> {f}</li>)}
              </ul>
              <Button className="w-full" variant={p.current ? 'outline' : 'default'} disabled={p.current}>{p.cta}</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
