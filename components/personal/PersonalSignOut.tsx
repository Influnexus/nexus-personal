'use client';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function PersonalSignOut() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      data-testid="personal-signout"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
