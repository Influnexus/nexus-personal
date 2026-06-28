'use client';
import { useSession, signOut } from 'next-auth/react';
import { ThemeToggle } from '@/components/app/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Bell, LogOut, Search, User, Settings, Menu } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { AppSidebar } from './AppSidebar';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

export function TopNav() {
  const { data } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (data?.user?.name || data?.user?.email || '?').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl md:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden rounded-full" aria-label="Open menu"><Menu className="h-5 w-5" /></Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex-1" />
      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search…" className="h-9 w-72 rounded-full border-border/80 pl-8 pr-16 focus-visible:ring-1 focus-visible:ring-ring/50" />
        <kbd className="pointer-events-none absolute right-2 top-1.5 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">⌘ K</kbd>
      </div>
      <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Notifications">
        <Bell className="h-[1.1rem] w-[1.1rem]" />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-foreground" />
      </Button>
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-0.5 outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="h-8 w-8"><AvatarImage src={data?.user?.image || undefined} /><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{data?.user?.name || 'Account'}</span>
              <span className="text-xs font-normal text-muted-foreground">{data?.user?.email}</span>
              {data?.user?.role && <Badge variant="secondary" className="mt-2 w-fit">{data.user.role}</Badge>}
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
