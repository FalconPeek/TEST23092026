"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Settings, Trophy } from "lucide-react";
import { cn } from "cn";
import { es } from "@/messages/es";

function navItems(groupId: string) {
  return [
    { href: `/g/${groupId}`, label: es.nav.home, icon: Home, exact: true },
    { href: `/g/${groupId}/partidos`, label: es.nav.matches, icon: CalendarDays, exact: false },
    { href: `/g/${groupId}/torneos`, label: es.nav.tournaments, icon: Trophy, exact: false },
    { href: `/g/${groupId}/rankings`, label: es.nav.rankings, icon: BarChart3, exact: false },
    { href: `/g/${groupId}/ajustes`, label: es.nav.settings, icon: Settings, exact: false },
  ];
}

export function BottomNav({ groupId }: { groupId: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={es.nav.groups}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {navItems(groupId).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground transition-colors",
              active && "text-primary",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
