import { Trophy } from "lucide-react";
import { es } from "@/messages/es";

export default function TournamentsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Trophy className="size-10 text-muted-foreground" />
      <p className="font-medium">{es.nav.tournaments}</p>
      <p className="text-sm text-muted-foreground">{es.common.comingSoon}</p>
    </div>
  );
}
