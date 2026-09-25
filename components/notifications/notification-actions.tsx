"use client";

import { useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";
import { markNotificationsRead } from "@/lib/actions/engagement";

/** Renders a `<Link>` (which marks this notification read on click) when `href` is a safe
 * same-origin path, else a plain non-interactive container -- an unsafe/missing url means there's
 * nowhere for this notification to send you, so it isn't clickable at all. */
export function NotificationRow({
  id,
  href,
  className,
  children,
}: {
  id: string;
  href: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!href) {
    return <div className={className}>{children}</div>;
  }

  return (
    <Link href={href} className={className} onClick={() => void markNotificationsRead({ ids: [id] })}>
      {children}
    </Link>
  );
}

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await markNotificationsRead();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={pending}>
      {es.notificationsUi.markAllRead}
    </Button>
  );
}
