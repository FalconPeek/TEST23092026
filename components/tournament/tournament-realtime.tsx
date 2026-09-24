"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const REFRESH_DEBOUNCE_MS = 500;

/**
 * Subscribes to `tournament_matches`/`tournaments` changes for this tournament (both in the
 * `supabase_realtime` publication, RLS-filtered) and debounces a `router.refresh()` so bracket
 * results and status changes show up live in every open tab without a manual reload. Renders
 * nothing. `matches` is also in that publication, but it has no `tournament_id` column to filter
 * on -- its progress already surfaces here indirectly, since the finalizer syncs the linked
 * `tournament_matches` row whenever a real match finalizes.
 */
export function TournamentRealtime({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function scheduleRefresh() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`tournament-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  return null;
}
