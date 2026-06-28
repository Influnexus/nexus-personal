'use client';
import { useSession, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Bell, LogOut, Search, User, Settings } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';

export function TopNav({ title }: { title?: string }) {
  const { data } = useSession();
  const initials = (data?.user?.name || data?.user?.email || '?').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex-1">
        {title ? <h1 className="text-sm font-medium text-foreground/90">{title}</h1> : null}
      </div>
      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search…" className="h-9 w-64 rounded-full pl-8" />
      </div>
      <Button variant="ghost" size="icon" className="rounded-full" aria-label="Notifications"><Bell className="h-[1.1rem] w-[1.1rem]" /></Button>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-1 transition hover:bg-accent">
            <Avatar className="h-8 w-8"><AvatarImage src={data?.user?.image || undefined} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{data?.user?.name || 'Account'}</span>
              <span className="text-xs text-muted-foreground">{data?.user?.email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/profile"><User className="mr-2 h-4 w-4" /> Profile</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings"><Settings className="mr-2 h-4 w-4" /> Settings</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
