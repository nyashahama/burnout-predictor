import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  showCalculatingLabel?: boolean;
}

export default function DashboardSkeleton({ showCalculatingLabel }: Props) {
  const forecastHeights = [74, 68, 52, 35, 47, 42, 33];
  const historyHeights = Array.from(
    { length: 30 },
    (_, i) => 20 + ((i * 17 + 23) % 55)
  );

  return (
    <div role="status" aria-label="Loading dashboard" aria-busy="true" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-4 w-44" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
            <div className="rounded-2xl border border-border/70 bg-primary/5 p-6">
              <Skeleton className="mx-auto h-16 w-24" />
              <Skeleton className="mx-auto mt-3 h-3 w-20" />
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="rounded-lg border border-border/70 p-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-3 h-8 w-12" />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-4 w-full" />
                ))}
              </div>
              {showCalculatingLabel && (
                <p className="text-sm text-muted-foreground">Calculating your score…</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-44" />
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-20 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-36 items-end gap-2">
              {forecastHeights.map((height, index) => (
                <Skeleton
                  key={index}
                  className="w-full rounded-md"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-32 items-end gap-1">
              {historyHeights.map((height, index) => (
                <Skeleton
                  key={index}
                  className="w-full rounded-sm"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <Skeleton className="h-4 w-72" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
