# Dashboard Skeleton Loading State

**Date:** 2026-03-23
**Status:** Approved

## Problem

The dashboard fetches data from the backend on load, including an AI-generated score card via DeepSeek that can take up to 30 seconds. During this time the page is blank, which looks broken and confuses users.

## Solution

A skeleton loading screen that mirrors the real dashboard layout. Skeleton blocks use a left-to-right shimmer animation (industry standard: LinkedIn, Vercel, Linear). Once data arrives the skeleton fades out and real content fades in.

## Component

**`components/dashboard/DashboardSkeleton.tsx`**

A single component that renders the skeleton layout. No props needed. Matches the dashboard structure:

1. **Greeting row** — one wide short block (mimics the "Good morning, X" line)
2. **Dashboard grid** — three columns matching `dash-grid`:
   - *Score card block* — tall card with a circular score placeholder, three signal rows, and a small `"Calculating your score…"` label in `--muted` so users understand the AI delay
   - *Forecast chart block* — a row of 7 varying-height bars mimicking the bar chart
   - *Check-in block* — a form-shaped card with label and button placeholders
3. **History chart block** — a wide short block at the bottom

## Animation

CSS `@keyframes skel-shimmer` added to `globals.css` under `/* ─── SKELETON */`:

```css
@keyframes skel-shimmer {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
```

Skeleton blocks use:
```css
background: linear-gradient(90deg, var(--paper-2) 25%, var(--paper-3) 50%, var(--paper-2) 75%);
background-size: 200% 100%;
animation: skel-shimmer 1.8s ease-in-out infinite;
```

Border radius matches real cards (`8px`). Colours use existing design tokens — no new variables.

## Integration

`DashboardPage` reads `loadingData` from `useDashboardData`. While true it renders `<DashboardSkeleton />`. Once `loadingData` is false it renders the real content with a short `opacity` transition (0.3s ease).

## CSS Naming

Class prefix: `skel-` following the existing BEM-ish convention.

Classes:
- `skel-wrap` — outer container, matches `dash-content` spacing
- `skel-block` — base block with shimmer (reused everywhere)
- `skel-greeting` — greeting row
- `skel-grid` — three-column grid wrapper
- `skel-score` — tall score card column
- `skel-score-circle` — circular score placeholder
- `skel-score-signals` — three signal row placeholders
- `skel-score-label` — "Calculating your score…" text
- `skel-forecast` — forecast column with bar placeholders
- `skel-bars` — row of 7 bars
- `skel-bar` — individual bar (height varies via inline style or modifier classes)
- `skel-checkin` — check-in column
- `skel-history` — history chart row

## Out of Scope

- Skeleton states for the History or Settings pages (not requested)
- Per-component skeleton states (all-or-nothing swap is sufficient)
- Dark/light mode variants (design tokens handle this automatically)
