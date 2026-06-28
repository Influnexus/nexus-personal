import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">The page you are looking for doesn’t exist or has been moved.</p>
        <Link href="/" className="mt-6 inline-block"><Button>Back home</Button></Link>
      </div>
    </div>
  );
}
