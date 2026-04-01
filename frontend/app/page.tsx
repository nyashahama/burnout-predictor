"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Activity, ArrowRight, CalendarRange, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export default function Home() {
  useEffect(() => {
    fetch(`${API_BASE}/health`).catch(() => {});
  }, []);

  const pillars = [
    {
      icon: CalendarRange,
      title: "See the next crash coming",
      body: "Track check-ins, calendar density, and recovery signals in one place before they pile up into a bad week.",
    },
    {
      icon: TrendingUp,
      title: "Turn vague stress into patterns",
      body: "The dashboard surfaces what is actually getting worse, what is recovering, and where your week is bending out of shape.",
    },
    {
      icon: ShieldCheck,
      title: "Keep the signal practical",
      body: "No therapy-speak, no giant questionnaires. Just quick inputs, visible trends, and a plan you can act on today.",
    },
  ];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <AppLogo />
          <div className="flex items-center gap-3">
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Sign in</Link>
            <Link href="/login" className={buttonVariants()}>Start tracking</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-24">
        <div className="space-y-8">
          <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.18em]">
            Burnout, before impact
          </Badge>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl leading-none tracking-tight sm:text-6xl lg:text-7xl">
              Know before you <span className="italic text-primary">crash</span>.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
              Overload turns daily check-ins, workload context, and recovery patterns into an early warning system for burnout.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
              Create account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/dashboard/weekly" prefetch={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
              See the weekly view
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="bg-secondary/60">
              <CardContent className="p-5">
                <p className="text-3xl font-semibold">14 days</p>
                <p className="mt-2 text-sm text-muted-foreground">Lead time before your week turns into a wall.</p>
              </CardContent>
            </Card>
            <Card className="bg-secondary/60">
              <CardContent className="p-5">
                <p className="text-3xl font-semibold">10 sec</p>
                <p className="mt-2 text-sm text-muted-foreground">Typical time to complete a check-in.</p>
              </CardContent>
            </Card>
            <Card className="bg-secondary/60">
              <CardContent className="p-5">
                <p className="text-3xl font-semibold">1 view</p>
                <p className="mt-2 text-sm text-muted-foreground">Score, trend, pattern, and recovery in one dashboard.</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="overflow-hidden border-primary/10 bg-card shadow-xl shadow-primary/5">
          <CardHeader className="border-b border-border/70 bg-muted/50">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 text-primary" />
              This week at a glance
            </CardTitle>
            <CardDescription>
              The shadcn refactor keeps the product feeling sharp while making the UI system easier to evolve.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current strain</p>
                  <p className="mt-2 text-4xl font-semibold text-primary">61</p>
                </div>
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Watch this</Badge>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Meetings are stacking up by Thursday. Protect one morning now and the week bends back into shape.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                "Mon: clean start, low load",
                "Wed: pressure spike from context switching",
                "Fri: recovery likely if tonight stays light",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-border/70 px-4 py-3 text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <Card key={pillar.title} className="h-full">
              <CardHeader>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <pillar.icon className="h-5 w-5" />
                </div>
                <CardTitle>{pillar.title}</CardTitle>
                <CardDescription className="leading-6">{pillar.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
