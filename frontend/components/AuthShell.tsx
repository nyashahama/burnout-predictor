import { AppLogo } from "@/components/AppLogo";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(137,59,35,0.12),_transparent_40%),linear-gradient(to_bottom,_rgba(255,255,255,0.8),_rgba(255,255,255,0.95))] px-4 py-16">
      <Card className="w-full max-w-md border-border/70 bg-card/95 backdrop-blur">
        <CardHeader className="space-y-6 pb-0">
          <AppLogo />
        </CardHeader>
        <CardContent className="space-y-6 pt-6">{children}</CardContent>
      </Card>
    </main>
  );
}
