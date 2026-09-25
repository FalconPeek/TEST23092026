import { redirect } from "next/navigation";
import { cn } from "cn";
import { TopBar } from "@/components/app-shell/top-bar";
import { MarkAllReadButton, NotificationRow } from "@/components/notifications/notification-actions";
import { es } from "@/messages/es";
import { formatRelative } from "@/lib/format";
import { createClient, getUserId } from "@/lib/supabase/server";
import { safeInternalUrl } from "@/lib/notifications/safe-url";

export default async function NotificationsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=%2Fnotificaciones");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, kind, payload, created_at, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = rows ?? [];
  const hasUnread = notifications.some((n) => n.read_at === null);

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={es.notificationsUi.title} backHref="/g" />
      <main className="flex flex-1 flex-col gap-4 px-4 py-6">
        {hasUnread && (
          <div className="flex justify-end">
            <MarkAllReadButton />
          </div>
        )}

        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">{es.notificationsUi.empty}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => {
              const payload = n.payload as { title?: string; body?: string; url?: string } | null;
              const href = safeInternalUrl(payload?.url);
              const unread = n.read_at === null;

              return (
                <NotificationRow
                  key={n.id}
                  id={n.id}
                  href={href}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-lg p-3 ring-1",
                    unread ? "bg-primary/10 ring-primary/30" : "bg-card ring-foreground/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{payload?.title ?? n.kind}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(n.created_at)}</span>
                  </div>
                  {payload?.body && <p className="text-sm text-muted-foreground">{payload.body}</p>}
                </NotificationRow>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
