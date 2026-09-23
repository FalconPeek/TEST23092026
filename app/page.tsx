import Link from "next/link";
import { ArrowRight, BarChart3, CreditCard, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { es } from "@/messages/es";

const FEATURE_ICONS = [CreditCard, Trophy, BarChart3, Star];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6">
      <section className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-primary">
          {es.app.name}
        </h1>
        <p className="text-balance text-lg text-muted-foreground">
          {es.app.tagline}
        </p>
        <Button asChild size="lg" className="mt-2 w-full sm:w-auto">
          <Link href="/login">
            {es.landing.cta}
            <ArrowRight />
          </Link>
        </Button>
      </section>

      <section className="mt-12 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {es.landing.features.map((feature, i) => {
          const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
          return (
            <Card key={feature.title}>
              <CardHeader>
                <Icon className="size-6 text-primary" />
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.body}</CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
