"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NextDayFeedbackCardProps {
  whatWorked: { action: string; improvement: number; evidence: string } | null;
}

export default function NextDayFeedbackCard({ whatWorked }: NextDayFeedbackCardProps) {
  if (!whatWorked) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>🌱 What worked for you</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{whatWorked.evidence}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          -{whatWorked.improvement} points from your average
        </p>
      </CardContent>
    </Card>
  );
}