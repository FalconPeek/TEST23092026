"use client";

import { useState, useTransition, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { es } from "@/messages/es";
import { updateNotificationPrefs } from "@/lib/actions/engagement";
import { getPushPermission, isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/lib/notifications/templates";

type PushStatus = "checking" | "unsupported" | "denied" | "enabled" | "disabled";

/** Notification.permission has no change event to subscribe to, and reading it during SSR/the
 * first client render would either crash or mismatch (no `window` server-side). Modeling it as an
 * external store with `useSyncExternalStore` sidesteps both: `getServerSnapshot` keeps SSR/hydration
 * consistent ("checking"), and React re-renders once more right after hydration to pick up the
 * real client value -- no effect, no setState-in-effect, and enable/disable naturally refresh this
 * too, since finishing their `useTransition` already triggers a re-render that reads it again. */
function noopSubscribe(): () => void {
  return () => {};
}

function getPushStatusSnapshot(): PushStatus {
  if (!isPushSupported()) return "unsupported";
  const permission = getPushPermission();
  if (permission === "denied") return "denied";
  return permission === "granted" ? "enabled" : "disabled";
}

function getPushStatusServerSnapshot(): PushStatus {
  return "checking";
}

function PushSection() {
  const status = useSyncExternalStore(noopSubscribe, getPushStatusSnapshot, getPushStatusServerSnapshot);
  const [pending, startTransition] = useTransition();

  function handleEnable() {
    startTransition(async () => {
      const result = await subscribeToPush();
      if (!result.ok) {
        if (result.error !== "permission_denied") toast.error(es.common.error);
        return;
      }
      toast.success(es.notificationsUi.pushEnabled);
    });
  }

  function handleDisable() {
    startTransition(async () => {
      const result = await unsubscribeFromPush();
      if (!result.ok) toast.error(es.common.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="text-sm font-medium">{es.notificationsUi.pushTitle}</h2>
      {status === "unsupported" && <p className="text-xs text-muted-foreground">{es.notificationsUi.pushUnsupported}</p>}
      {status === "denied" && <p className="text-xs text-muted-foreground">{es.notificationsUi.pushDenied}</p>}
      {status === "enabled" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{es.notificationsUi.pushEnabled}</span>
          <Button type="button" variant="outline" size="sm" onClick={handleDisable} disabled={pending}>
            {es.notificationsUi.pushDisable}
          </Button>
        </div>
      )}
      {status === "disabled" && (
        <Button type="button" variant="outline" size="sm" className="h-11 self-start" onClick={handleEnable} disabled={pending}>
          {es.notificationsUi.pushEnable}
        </Button>
      )}
    </div>
  );
}

export function PrefsForm({ initialPrefs }: { initialPrefs: Partial<Record<NotificationKind, boolean>> }) {
  const [prefs, setPrefs] = useState<Record<NotificationKind, boolean>>(
    () =>
      Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, initialPrefs[k] ?? true])) as Record<
        NotificationKind,
        boolean
      >,
  );

  function toggle(kind: NotificationKind, checked: boolean) {
    const previous = prefs[kind];
    setPrefs((prev) => ({ ...prev, [kind]: checked }));

    void (async () => {
      const result = await updateNotificationPrefs({ prefs: { [kind]: checked } });
      if (!result.ok) {
        setPrefs((prev) => ({ ...prev, [kind]: previous }));
        toast.error(result.error);
      }
    })();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-sm font-medium">{es.notificationsUi.prefsTitle}</h2>
        {NOTIFICATION_KINDS.map((kind) => (
          <label key={kind} className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-sm">{es.notificationsUi.kinds[kind]}</span>
            <Switch checked={prefs[kind]} onCheckedChange={(checked) => toggle(kind, checked)} />
          </label>
        ))}
      </div>

      <PushSection />
    </div>
  );
}
