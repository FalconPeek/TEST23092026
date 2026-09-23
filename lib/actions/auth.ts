"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { es } from "@/messages/es";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, siteUrl } from "@/lib/supabase/env";
import { ok, fail, type ActionResult } from "@/lib/actions/result";

const oauthProviderSchema = z.enum(["google", "discord"]);

function callbackUrl(next?: string | null): string {
  return `${siteUrl()}auth/callback?next=${encodeURIComponent(safeNextPath(next))}`;
}

export async function signInWithOAuth(
  provider: "google" | "discord",
  next?: string,
): Promise<ActionResult<void>> {
  const parsedProvider = oauthProviderSchema.safeParse(provider);
  if (!parsedProvider.success) return fail(es.common.error);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsedProvider.data,
    options: { redirectTo: callbackUrl(next) },
  });

  if (error || !data.url) return fail(es.common.error);
  redirect(data.url);
}

const magicLinkSchema = z.object({
  email: z.email(),
  next: z.string().optional(),
});

export async function sendMagicLink(
  _prevState: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return fail(es.auth.invalidEmail);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: callbackUrl(parsed.data.next),
      shouldCreateUser: true,
    },
  });

  if (error) return fail(es.common.error);
  return ok(undefined);
}

const passwordSignInSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  next: z.string().optional(),
});

export async function signInWithPassword(
  _prevState: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  const parsed = passwordSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return fail(es.auth.invalidCredentials);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return fail(es.auth.invalidCredentials);
  redirect(safeNextPath(parsed.data.next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
