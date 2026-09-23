import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/app-shell/top-bar";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { createClient, getUserId } from "@/lib/supabase/server";

export default async function GroupLayout({ children, params }: LayoutProps<"/g/[groupId]">) {
  const { groupId } = await params;
  const userId = await getUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/g/${groupId}`)}`);

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();

  if (error || !group) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <TopBar title={group.name} backHref="/g" />
      <main className="flex flex-1 flex-col pb-20">{children}</main>
      <BottomNav groupId={group.id} />
    </div>
  );
}
