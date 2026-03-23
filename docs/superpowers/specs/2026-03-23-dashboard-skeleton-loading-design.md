# Dashboard Skeleton Loading State

**Date:** 2026-03-23
**Status:** Pending review

## Problem

The dashboard has two loading phases:

1. **Route-level** — Next.js App Router shows `app/dashboard/loading.tsx` during navigation. Already works.
2. **Client-side data fetch** — once the page mounts, `DashboardDataContext` fetches from the backend (score card, check-ins, insights). The AI score card via DeepSeek can take up to 30 seconds. During this phase `loadingData` is `true` but the page renders with empty/default values, which looks broken.

Only phase 2 is broken. Phase 1 already has a skeleton.

## Solution

Extract the existing `loading.tsx` layout into a shared `DashboardSkeleton` component. Both `loading.tsx` and `DashboardPage` use it. Add a "Calculating your score…" label shown only during the client-side fetch so users understand the AI delay.

## What Already Exists (do not re-create)

- **`frontend/app/dashboard/loading.tsx`** — full skeleton layout using `.skel`.
- **`.skel` class + `@keyframes skel-shimmer`** — in `globals.css` lines 2892–2913. Pixel-based, 1.6s linear. No changes needed.

## Files to Create / Modify

### 1. New: `frontend/components/dashboard/DashboardSkeleton.tsx`

Copy the JSX from `loading.tsx` exactly, with two structural changes:

**a) Wrap `dash-grid` in `dash-hero`** — the real `page.tsx` renders `dash-grid` inside a `dash-hero` div. The skeleton must match this so mobile CSS rules (e.g. `dash-hero .dash-grid { order: -1 }`) apply consistently during loading:

```tsx
<div className="dash-hero">
  <div className="dash-grid">
    {/* score card and forecast skeletons */}
  </div>
</div>
{/* check-in and history skeletons below */}
```

**b) Accept one optional prop:**

```tsx
interface Props { showCalculatingLabel?: boolean; }
```

Inside the score card block, after the signal rows, conditionally render:

```tsx
{showCalculatingLabel && (
  <p className="skel-score-label">Calculating your score…</p>
)}
```

The outer `<div className="dash-content">` should carry accessibility attributes:

```tsx
<div className="dash-content" role="status" aria-label="Loading dashboard" aria-busy="true">
```

`role="status"` is required for `aria-label` to be announced by screen readers on a generic `div`.

### 2. Update: `frontend/app/dashboard/loading.tsx`

Replace its content with:

```tsx
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
```

No `showCalculatingLabel` prop — route-level transitions are fast, the label is not appropriate here.

### 3. Update: `frontend/app/dashboard/page.tsx`

Import `DashboardSkeleton`. Read `loadingData` from `useDashboardData()`.

**Loading state** (`loadingData === true`):
```tsx
if (loadingData) return <DashboardSkeleton showCalculatingLabel />;
```

**Loaded / error state** (`loadingData === false`): render the page. When `ready` is also false (fetch failed), `scoreCard` is null and `checkins` is `[]`. The existing fallback values (score defaults to 55, etc.) handle this gracefully — no dedicated error UI needed.

Wrap the content in `dash-fade-in` so it animates in after the skeleton:

```tsx
return (
  <div className="dash-fade-in">
    {/* existing page content */}
  </div>
);
```

The `dash-fade-in` class is a CSS animation, not a transition. It fires once when the element mounts (i.e. when the skeleton is replaced), which is exactly the right moment. No ref or state toggle needed.

### 4. Update: `frontend/app/globals.css`

Add under the existing `/* ─── SKELETON / LOADING */` section:

```css
@keyframes dash-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.dash-fade-in {
  animation: dash-fade-in 0.3s ease;
}

.skel-score-label {
  color: var(--muted);
  font-size: 0.75rem;
  text-align: center;
  margin-top: 4px;
}
```

## Out of Scope

- Skeleton states for History or Settings pages
- Dedicated error UI for failed fetches
- Dark/light mode variants (design tokens handle this automatically)
