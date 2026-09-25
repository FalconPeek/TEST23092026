import { redirect } from "next/navigation";
import { TopBar } from "@/components/app-shell/top-bar";
import { PrefsForm } from "@/components/notifications/prefs-form";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/templates";

export default async function NotificationSettingsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?next=%2Fyo%2Fajustes");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", userId)
    .maybeSingle();

  const rawPrefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
  const initialPrefs: Partial<Record<NotificationKind, boolean>> = Object.fromEntries(
    NOTIFICATION_KINDS.filter((kind) => typeof rawPrefs[kind] === "boolean").map((kind) => [kind, rawPrefs[kind]]),
  );

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={es.notificationsUi.prefsTitle} backHref="/yo" />
      <main className="flex flex-1 flex-col gap-4 px-4 py-6">
        <PrefsForm initialPrefs={initialPrefs} />
      </main>
    </div>
  );
}
