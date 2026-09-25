"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/client";
import { safeInternalUrl } from "@/lib/notifications/safe-url";

interface NotificationInsertRow {
  payload: { title?: string; body?: string; url?: string } | null;
}

/** Bell icon + unread count, kept live via a realtime subscription on new rows insert for this
 * user. The initial count is server-rendered (see top-bar.tsx); this only ever increments it. */
export function NotificationBell({ userId, initialCount }: { userId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: { new: NotificationInsertRow }) => {
          setCount((c) => c + 1);
          const row = payload.new.payload;
          const url = safeInternalUrl(row?.url);
          toast(row?.title ?? es.notificationsUi.title, {
            description: row?.body,
            action: url ? { label: es.notificationsUi.open, onClick: () => window.location.assign(url) } : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href="/notificaciones"
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"
      aria-label={es.notificationsUi.title}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
