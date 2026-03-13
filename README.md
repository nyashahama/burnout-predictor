# Overload

**A performance early warning system.** Overload watches your sleep, work patterns, and calendar — and tells you up to 14 days in advance when you're heading toward a burnout crash.

Not a wellness app. Not a mood journal. A dashboard for people who want to stay ahead of the wall.

---

## What it does

Overload synthesizes signals across your life — sleep deficit, calendar density, stress check-ins, exercise patterns — into a single daily cognitive load score. When that score trends upward, you get an early warning and a specific intervention, not a generic reminder to breathe.

**Key features**

- **Daily load score** — a 0–100 cognitive strain index updated each morning
- **14-day crash forecast** — see which days are likely to tip into high strain before they arrive
- **Signal breakdown** — sleep, calendar density, self-reported stress, and exercise tracked independently
- **Daily check-in** — a 30-second form that feeds into the model
- **Actionable suggestions** — specific calendar moves, not vague advice
- **30-day history** — a visual record of your strain over time

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19 |
| Styles | Tailwind CSS 4 |
| Email | Resend |

No database. No auth. The current version runs entirely on mock data — the architecture is designed for a real data layer to be added later.

---

## Project structure

```
app/
  page.tsx              # Marketing landing page
  layout.tsx            # Root layout
  dashboard/
    page.tsx            # Dashboard view
    layout.tsx          # Dashboard shell wrapper
    data.ts             # Mock data + scoring helpers
    loading.tsx         # Suspense loading state

components/
  Nav.tsx               # Top navigation
  Hero.tsx
  Recognition.tsx
  Benefits.tsx
  CrashTimeline.tsx
  HowItWorks.tsx
  Score.tsx
  Demo.tsx
  Testimonials.tsx
  Pricing.tsx
  FinalCta.tsx
  Footer.tsx
  dashboard/
    DashboardShell.tsx  # Sidebar layout (collapses to top nav on mobile)
    ScoreCard.tsx       # Today's score + signals + suggestion
    ForecastChart.tsx   # 7-day bar chart
    HistoryChart.tsx    # 30-day bar chart with hover tooltips
    CheckIn.tsx         # Daily stress check-in form

app/
  api/waitlist/
    route.ts            # Waitlist signup → Resend
```

---

## Getting started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in your Resend credentials (see below)

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page, and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to see the dashboard.

---

## Environment variables

Create a `.env.local` file in the project root:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=hello@yourdomain.com
OWNER_EMAIL=you@yourdomain.com
RESEND_AUDIENCE_ID=...
```

These are only required for the waitlist signup API route. The rest of the app works without them.

---

## Pricing tiers (as designed)

| | Free | Pro ($12/mo) |
|---|---|---|
| Daily score | Yes | Yes |
| Forecast | 3 days | 14 days |
| Crash window detection | — | Yes |
| Calendar interventions | Basic | Specific |
| Decision quality alerts | — | Yes |
| Weekly digest | — | Yes |

---

## Design notes

- All styles live in `app/globals.css` (~1800 lines, single file)
- CSS custom properties define the full color and typography system (`--ink`, `--paper`, `--red`, `--amber`, `--green`, `--font-serif`, `--font-sans`)
- Component styles use a BEM-ish prefix convention (`dash-`, `nav-`, `score-`, `pcard-`, etc.)
- The dashboard is fully responsive: sidebar collapses to a top nav on mobile, grid drops to single-column below 1024px

---

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```
