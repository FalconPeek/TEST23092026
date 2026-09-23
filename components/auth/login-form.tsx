"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { es } from "@/messages/es";
import { sendMagicLink, signInWithOAuth, signInWithPassword } from "@/lib/actions/auth";
import type { ActionResult } from "@/lib/actions/result";

const initialState: ActionResult<void> | null = null;

export function LoginForm({ next }: { next: string }) {
  const [oauthPending, startOAuthTransition] = useTransition();
  const [magicState, magicAction, magicPending] = useActionState(sendMagicLink, initialState);
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    initialState,
  );

  function handleOAuth(provider: "google" | "discord") {
    startOAuthTransition(async () => {
      const result = await signInWithOAuth(provider, next);
      if (result && !result.ok) {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={oauthPending}
          onClick={() => handleOAuth("google")}
        >
          {es.auth.withGoogle}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={oauthPending}
          onClick={() => handleOAuth("discord")}
        >
          {es.auth.withDiscord}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">{es.auth.orEmail}</span>
        <Separator className="flex-1" />
      </div>

      <Tabs defaultValue="magic">
        <TabsList className="w-full">
          <TabsTrigger value="magic" className="flex-1">
            {es.auth.magicLinkTab}
          </TabsTrigger>
          <TabsTrigger value="password" className="flex-1">
            {es.auth.passwordTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="magic">
          <form action={magicAction} noValidate className="flex flex-col gap-3 pt-3">
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="magic-email">{es.auth.emailLabel}</Label>
              <Input
                id="magic-email"
                name="email"
                type="email"
                placeholder={es.auth.emailPlaceholder}
                required
              />
            </div>
            {magicState && !magicState.ok && (
              <p className="text-sm text-destructive" role="alert">
                {magicState.error}
              </p>
            )}
            {magicState?.ok && (
              <p className="text-sm text-muted-foreground" role="status">
                {es.auth.magicLinkSent}
              </p>
            )}
            <Button type="submit" disabled={magicPending}>
              {es.auth.sendMagicLink}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="password">
          <form action={passwordAction} noValidate className="flex flex-col gap-3 pt-3">
            <input type="hidden" name="next" value={next} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password-email">{es.auth.emailLabel}</Label>
              <Input
                id="password-email"
                name="email"
                type="email"
                placeholder={es.auth.emailPlaceholder}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{es.auth.passwordLabel}</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            {passwordState && !passwordState.ok && (
              <p className="text-sm text-destructive" role="alert">
                {passwordState.error}
              </p>
            )}
            <Button type="submit" disabled={passwordPending}>
              {es.auth.signInWithPassword}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
