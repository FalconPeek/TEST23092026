import { CalendarDays } from "lucide-react";
import { es } from "@/messages/es";

export default function MatchesPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <CalendarDays className="size-10 text-muted-foreground" />
      <p className="font-medium">{es.nav.matches}</p>
      <p className="text-sm text-muted-foreground">{es.common.comingSoon}</p>
    </div>
  );
}
