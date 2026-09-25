import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, Settings, User } from "lucide-react";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";
import { signOut } from "@/lib/actions/auth";
import { createClient, getUserId } from "@/lib/supabase/server";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export async function TopBar({
  title,
  backHref,
}: {
  title: ReactNode;
  backHref?: string;
}) {
  const userId = await getUserId();
  let displayName = "";
  let avatarUrl: string | null = null;
  let unreadCount = 0;

  if (userId) {
    const supabase = await createClient();
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle(),
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
    ]);
    displayName = profile?.display_name ?? "";
    avatarUrl = profile?.avatar_url ?? null;
    unreadCount = count ?? 0;
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
      {backHref && (
        <Button asChild variant="ghost" size="icon-sm" className="-ml-1.5 shrink-0">
          <Link href={backHref}>
            <ArrowLeft />
            <span className="sr-only">{es.nav.groups}</span>
          </Link>
        </Button>
      )}
      <div className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</div>
      {userId && (
        <>
          <NotificationBell userId={userId} initialCount={unreadCount} />
          <DropdownMenu>
            <DropdownMenuTrigger className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Avatar>
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback>{initials(displayName)}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/yo">
                  <User />
                  {es.nav.me}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/yo/ajustes">
                  <Settings />
                  {es.nav.settings}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild variant="destructive">
                <form action={signOut} className="contents">
                  <button type="submit" className="flex w-full items-center gap-1.5">
                    <LogOut />
                    {es.auth.signOut}
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </header>
  );
}
