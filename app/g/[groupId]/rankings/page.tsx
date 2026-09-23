import { BarChart3 } from "lucide-react";
import { es } from "@/messages/es";

export default function RankingsPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <BarChart3 className="size-10 text-muted-foreground" />
      <p className="font-medium">{es.nav.rankings}</p>
      <p className="text-sm text-muted-foreground">{es.common.comingSoon}</p>
    </div>
  );
}
