import Link from "next/link";
import { Button } from "@/components/ui/button";
import { es } from "@/messages/es";

export const metadata = { title: es.auth.codeErrorTitle };

export default function AuthCodeErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">{es.auth.codeErrorTitle}</h1>
      <p className="max-w-sm text-muted-foreground">{es.auth.codeErrorBody}</p>
      <Button asChild>
        <Link href="/login">{es.auth.backToLogin}</Link>
      </Button>
    </main>
  );
}
