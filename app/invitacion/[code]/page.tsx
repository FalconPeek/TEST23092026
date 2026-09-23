import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { JoinButton } from "@/components/invite/join-button";
import { es } from "@/messages/es";
import { createClient, getUserId } from "@/lib/supabase/server";

const CODE_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;

export const metadata = { title: es.invite.title };

function InvalidState() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">{es.invite.title}</h1>
      <p className="text-sm text-muted-foreground">{es.invite.invalid}</p>
      <Button asChild>
        <Link href="/g">{es.invite.goHome}</Link>
      </Button>
    </main>
  );
}

export default async function InvitePage({ params }: PageProps<"/invitacion/[code]">) {
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) return <InvalidState />;

  const userId = await getUserId();
  if (!userId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">{es.invite.title}</h1>
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(`/invitacion/${code}`)}`}>
            {es.invite.signInToJoin}
          </Link>
        </Button>
      </main>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invite_preview", { p_code: code });
  const preview = data?.[0];

  if (error || !preview || !preview.valid) return <InvalidState />;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">{es.invite.title}</h1>
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-2 py-4">
          <p className="text-lg font-medium">{preview.group_name}</p>
          <Badge variant="outline">{es.groups.members(preview.member_count)}</Badge>
          <p className="text-sm text-muted-foreground">{es.invite.joinAs(preview.role)}</p>
        </CardContent>
      </Card>
      <JoinButton code={code} />
    </main>
  );
}
