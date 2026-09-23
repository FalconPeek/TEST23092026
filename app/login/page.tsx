import { redirect } from "next/navigation";
import { getUserId } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/env";
import { es } from "@/messages/es";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: es.auth.title };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext);

  const userId = await getUserId();
  if (userId) {
    redirect(next);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-2xl font-semibold">{es.auth.title}</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
