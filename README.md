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
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4 |
| **Backend** | Go 1.22, Chi router, pgx/sqlc, Goose migrations |
| **Database** | PostgreSQL 16 |
| **Email** | Resend |
| **Payments** | PayFast |
| **AI** | OpenAI API |
| **Deployment** | Render (Docker), Vercel (Frontend) |

---

## Project structure

```
burnout-predictor/
├── frontend/                    # Next.js frontend
│   ├── app/
│   │   ├── page.tsx            # Marketing landing page
│   │   ├── layout.tsx           # Root layout
│   │   ├── login/page.tsx       # Login page
│   │   ├── onboarding/page.tsx  # Onboarding flow
│   │   ├── dashboard/
│   │   │   ├── page.tsx         # Main dashboard
│   │   │   ├── layout.tsx       # Dashboard shell
│   │   │   ├── data.ts          # Mock data + scoring
│   │   │   ├── history/page.tsx # 30-day history view
│   │   │   └── settings/page.tsx# User settings
│   │   ├── api/waitlist/route.ts # Waitlist signup
│   │   └── globals.css          # All styles (~1800 lines)
│   ├── components/
│   │   ├── Nav.tsx              # Navigation
│   │   ├── Hero.tsx
│   │   ├── dashboard/           # Dashboard components
│   │   │   ├── DashboardShell.tsx
│   │   │   ├── ScoreCard.tsx
│   │   │   ├── ForecastChart.tsx
│   │   │   ├── HistoryChart.tsx
│   │   │   └── CheckIn.tsx
│   │   └── ...
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── Dockerfile              # Production build
│
├── backend/                     # Go backend
│   ├── cmd/
│   │   └── main.go             # Server entrypoint
│   ├── internal/
│   │   ├── handlers/           # HTTP handlers
│   │   ├── models/             # Data models
│   │   ├── db/                 # Database queries (sqlc)
│   │   └── middleware/         # Auth, logging, etc.
│   ├── migrations/             # Goose SQL migrations
│   ├── go.mod
│   ├── Dockerfile              # Production build
│   └── sqlc.yaml               # sqlc config
│
├── docker-compose.yml          # Local dev environment
├── .gitignore
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 18+ (frontend)
- Go 1.22+ (backend)
- Docker & Docker Compose (optional, for local database)

### Local development (full stack)

```bash
# Start everything with Docker Compose
docker-compose up

# This runs:
# - PostgreSQL on :5432
# - Backend API on :8080
# - Frontend dev server on :3000
```

### Frontend only (with mock data)

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in your Resend credentials (see below)

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page, and [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to see the dashboard.

### Backend only

```bash
cd backend

# Install dependencies
go mod download

# Run migrations
goose -dir migrations postgres "your-db-connection-string" up

# Start the server
go run ./cmd/main.go
```

---

## Environment variables

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
RESEND_API_KEY=re_...
EMAIL_FROM=hello@yourdomain.com
OWNER_EMAIL=you@yourdomain.com
RESEND_AUDIENCE_ID=...
```

### Backend (`backend/.env.local`)

```env
DATABASE_URL=postgres://user:pass@localhost:5432/burnout_predictor
PORT=8080
PAYFAST_KEY=pk_...
PAYFAST_SECRET=sk_...
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key
```

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

## Scripts

### Frontend

```bash
cd frontend
npm run dev      # Start development server on :3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Backend

```bash
cd backend
go run ./cmd/main.go          # Run development server on :8080
go build -o main ./cmd/main.go # Build binary
goose status                   # Check migration status
goose up                       # Run pending migrations
```

---

## Deployment

### Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set the **Root Directory** to `frontend/`
3. Set environment variables (RESEND_API_KEY, etc.)
4. Deploy automatically on push to `main`

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repo
3. Set the **Root Directory** to `backend/`
4. Set environment variables (DATABASE_URL, PAYFAST_KEY, etc.)
5. Set **Build Command**: `go build -o main ./cmd/main.go`
6. Set **Start Command**: `./main`
7. Add a PostgreSQL service and link it via DATABASE_URL

---

## Design notes

- All frontend styles live in `frontend/app/globals.css` (~1800 lines, single file)
- CSS custom properties define the full color and typography system
- Component styles use a BEM-ish prefix convention
- The dashboard is fully responsive: sidebar collapses to a top nav on mobile
