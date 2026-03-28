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
| **Backend** | Go 1.23, Chi router, pgx, sqlc |
| **Database** | PostgreSQL 16 |
| **Email** | Resend |
| **Payments** | Paddle (optional) |
| **AI** | DeepSeek API (optional) |
| **Authentication** | JWT |
| **Deployment** | Docker Compose (local), Render (Backend), Vercel (Frontend) |

---

## Project structure

```
burnout-predictor/
├── frontend/                    # Next.js frontend
│   ├── app/
│   │   ├── page.tsx            # Marketing landing page
│   │   ├── layout.tsx           # Root layout
│   │   ├── login/page.tsx       # Login & signup
│   │   ├── reset-password/      # Password reset flow
│   │   ├── verify-email/        # Email verification
│   │   ├── onboarding/page.tsx  # Onboarding flow
│   │   ├── dashboard/
│   │   │   ├── page.tsx         # Main dashboard (score card, forecast)
│   │   │   ├── layout.tsx       # Dashboard shell + sidebar
│   │   │   ├── data.ts          # Data fetching & types
│   │   │   ├── history/page.tsx # 30-day history view
│   │   │   ├── weekly/page.tsx  # Weekly summary
│   │   │   └── settings/page.tsx# User settings
│   │   ├── api/
│   │   │   └── waitlist/route.ts# Email waitlist signup
│   │   ├── globals.css          # All styles (~1800 lines)
│   │   └── middleware.ts        # Auth middleware
│   ├── components/
│   │   ├── Nav.tsx              # Navigation header
│   │   ├── Hero.tsx             # Landing page hero
│   │   ├── Demo.tsx             # Feature demo
│   │   ├── HowItWorks.tsx       # How it works section
│   │   ├── Pricing.tsx          # Pricing table
│   │   ├── Testimonials.tsx     # User testimonials
│   │   ├── Score.tsx            # Score visualization
│   │   ├── CrashTimeline.tsx    # Crash warning timeline
│   │   ├── Benefits.tsx         # Benefits section
│   │   ├── FinalCta.tsx         # Final call-to-action
│   │   ├── Footer.tsx           # Footer
│   │   ├── dashboard/           # Dashboard components
│   │   │   ├── DashboardShell.tsx
│   │   │   ├── ScoreCard.tsx
│   │   │   ├── ForecastChart.tsx
│   │   │   ├── HistoryChart.tsx
│   │   │   └── CheckIn.tsx
│   │   └── useScrollAppear.ts   # Scroll animation hook
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   └── Dockerfile              # Production build
│
├── backend/                     # Go backend (Chi router)
│   ├── cmd/server/
│   │   └── main.go             # Server entrypoint
│   ├── internal/
│   │   ├── api/                # HTTP handlers & middleware
│   │   │   ├── handler/        # Endpoint handlers
│   │   │   ├── middleware/     # Auth, logging, request ID
│   │   │   ├── respond/        # Response encoding
│   │   │   ├── validate/       # Input validation
│   │   │   └── server.go       # Router setup
│   │   ├── service/            # Business logic
│   │   │   ├── auth/           # Auth service
│   │   │   ├── billing/        # Paddle billing
│   │   │   ├── checkin/        # Check-in logic
│   │   │   ├── insight/        # Score & forecast logic
│   │   │   └── notification/   # Email/notification service
│   │   ├── store/              # Data access layer
│   │   ├── db/                 # Database queries
│   │   │   ├── migrations/     # SQL migrations
│   │   │   ├── queries/        # SQL query definitions
│   │   │   └── sqlc/           # Generated code
│   │   ├── ai/                 # LLM integrations
│   │   ├── email/              # Email sending (Resend)
│   │   ├── paddle/             # Paddle webhook handlers
│   │   ├── insights/           # Insight calculation
│   │   ├── score/              # Score calculation
│   │   ├── worker/             # Background jobs
│   │   ├── config/             # Configuration
│   │   └── reqid/              # Request ID middleware
│   ├── go.mod
│   ├── go.sum
│   ├── Dockerfile              # Production build
│   ├── sqlc.yaml               # sqlc codegen config
│   └── .env.example            # Environment template
│
├── docker-compose.yml          # Local dev environment
├── .gitignore
└── README.md
```

---

## Getting started

### Prerequisites
- Node.js 18+ (frontend)
- Go 1.23+ (backend)
- Docker & Docker Compose (optional, for local database)

### Full stack (with Docker Compose)

```bash
# Install dependencies (frontend)
npm install

# Copy environment files
cp backend/.env.example backend/.env
# Edit backend/.env and set DATABASE_URL, JWT_SECRET, etc.

# Start everything
docker-compose up
```

Services will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- Database: localhost:5432

### Frontend only

```bash
cd frontend

# Install dependencies
npm install

# Set environment variable
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > .env.local

# Start the dev server
npm run dev
```

### Backend only

```bash
cd backend

# Install dependencies
go mod download

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# Start the server (requires PostgreSQL running on localhost:5432)
go run ./cmd/main.go
```

---

## Environment variables

### Backend (`backend/.env`)

Required:
```env
DATABASE_URL=postgres://user:password@localhost:5432/burnout_predictor
JWT_SECRET=change-me-in-production
PORT=8080
CORS_ORIGIN=http://localhost:3000
APP_URL=https://overload.app
```

Optional:
```env
RESEND_API_KEY=re_...          # Email sending (Resend)
EMAIL_FROM=Overload <noreply@overload.app>
DEEPSEEK_API_KEY=sk-...        # AI features (DeepSeek)
PADDLE_WEBHOOK_SECRET=pdl_...  # Webhook verification
```

### Frontend (`frontend/.env.local`)

Required:
```env
NEXT_PUBLIC_API_URL=http://localhost:8080    # Backend API endpoint
```

Optional (for email waitlist):
```env
RESEND_API_KEY=re_...                        # Resend email API
EMAIL_FROM=noreply@yourdomain.com
OWNER_EMAIL=you@yourdomain.com
RESEND_AUDIENCE_ID=...
```

---

## Pricing tiers (as designed)

| | Free | Pro ($12/mo) |
|---|---|---|
| Daily load score | Yes | Yes |
| Forecast window | 3 days | 14 days |
| Crash prediction | — | Yes |
| Calendar suggestions | Basic | Specific |
| AI recovery plans | — | Yes |
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
go run ./cmd/main.go              # Run development server on :8080
go build -o server ./cmd/main.go  # Build binary
go test ./...                      # Run tests
```

---

## Deployment

### With Docker Compose (recommended for local/staging)

```bash
docker-compose up
```

Services start on:
- Frontend: http://localhost:3000
- Backend: http://localhost:8080
- Database: localhost:5432

### Backend (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repo
3. Set the **Root Directory** to `backend/`
4. Set environment variables (DATABASE_URL, JWT_SECRET, etc.)
5. Set **Build Command**: `go build -o server ./cmd/main.go`
6. Set **Start Command**: `./server`
7. Add a PostgreSQL service and link it via DATABASE_URL

### Frontend (Vercel or similar)

1. Connect your GitHub repo to your hosting platform
2. Set the **Root Directory** to `frontend/`
3. Set `NEXT_PUBLIC_API_URL` to your backend URL
4. Deploy automatically on push to `main`

---

## Design notes

- All frontend styles live in `frontend/app/globals.css` (~1800 lines, single file)
- CSS custom properties define the full color and typography system
- Component styles use a BEM-ish prefix convention
- The dashboard is fully responsive: sidebar collapses to a top nav on mobile
