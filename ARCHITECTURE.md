# GrantFlow Architecture

Last updated: 2026-03-01

## Overview

GrantFlow is an EU grant discovery, analysis, and application platform. Built as a single Next.js 14 application deployed on Vercel, backed by Supabase (PostgreSQL). Currently a single-tenant tool for Le Radici, designed for productization as a multi-tenant SaaS at $99/month.

## Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS | Single-page app feel with client components |
| Backend | Next.js API routes (serverless functions) | All AI/external calls server-side |
| Database | Supabase PostgreSQL (free tier, eu-central-1) | Project ID: `tozltypdqrcnrpcilkkj` |
| AI | Anthropic Claude API (Sonnet for analysis, web search for verification) | All calls through API routes |
| Hosting | Vercel Pro | Team: `dariusmora468s-projects`, 300s function timeout |
| Auth | App-level password (stored in `app_settings` table) | Frontend: sessionStorage, API: `x-app-password` header |

## Design System

Cool slate/blue glassmorphism with Inter font. NOT earth tones.

- Background: `bg-app` class (blue-grey gradient with ambient orbs)
- Cards: `glass` / `glass-solid` / `glass-subtle` classes (frosted glass effect)
- Primary buttons: `btn-primary` (blue-600)
- Accent colors: violet, emerald, amber (for status indicators)
- Typography: Inter font family, `tracking-tight` on headings
- All styles defined in `src/app/globals.css`

## File Structure

```
src/
  app/
    layout.tsx              # Root layout with AuthGate wrapper
    page.tsx                # Redirects to /dashboard
    globals.css             # Design system (glass, btn, card classes)
    dashboard/page.tsx      # Funding Command Center (stats, blockers, deadlines, grant table)
    grants/
      page.tsx              # Grant database list with filters
      new/page.tsx          # Add grant form
      [id]/page.tsx         # Grant detail (info, verification, Apply button)
    pipeline/
      page.tsx              # Pipeline board (kanban-style stages)
      [id]/page.tsx         # Pipeline detail (strategy, Q&A, projections)
    applications/
      page.tsx              # Applications list
      [id]/page.tsx         # Application workspace (proposal, budget, documents, review)
    consultants/page.tsx    # Consultant database with AI search
    strategy/page.tsx       # Strategy overview
    project/page.tsx        # Project profile editor
    settings/page.tsx       # App settings
    api/
      analyze-grant/        # AI grant analysis (relevance, fit assessment)
      application-draft/    # AI proposal narrative generation
      application-questions/# AI question generation for onboarding
      discover/             # AI grant discovery engine
      find-consultants/     # AI consultant search with web research
      grant-qa/             # AI Q&A with web search and citations
      health/               # System health check endpoint
      match-consultants/    # AI consultant matching + scoring
      strategy/             # AI strategy generation (comprehensive)
      verify-all/           # Cron: nightly bulk verification
      verify-grant/         # Single grant verification (URL + cross-reference)
      version/              # Version endpoint
  components/
    AppShell.tsx            # Layout wrapper (sidebar + content area)
    AuthGate.tsx            # Password login screen
    Sidebar.tsx             # Navigation sidebar
    VerificationBadge.tsx   # Grant verification status badge
  lib/
    api-auth.ts             # Server-side auth validation for API routes
    api-fetch.ts            # Client-side authenticated fetch wrapper
    auth.ts                 # Client-side auth helpers (login, session)
    discovery.ts            # Grant discovery engine logic
    projections.ts          # Realistic grant projection calculator
    supabase.ts             # Supabase client, types, constants
    utils.ts                # Shared utilities (formatCurrency, cn, etc.)
```

## Database Schema (15 tables)

### Core Tables
- **projects** - Project profile (one row for Le Radici). Stores entity type, location, qualifications, sectors, objectives.
- **grants** - Grant database. Name, amounts, dates, eligibility, verification status, AI-generated fields (why_relevant, risks, who_is_it_for).
- **grant_categories** - Category taxonomy for grants.
- **grant_applications** - Pipeline entries. Links a project to a grant with stage tracking (Discovered through Archived).
- **application_requirements** - Checklist items per pipeline entry.

### Application Workspace Tables
- **applications** - Application workspace instances. Links to a grant_application.
- **application_sections** - 4 sections per application (proposal, budget, documents, review).
- **application_questions** - AI-generated onboarding questions per section.
- **application_documents** - Required document tracking per application.

### Supporting Tables
- **consultants** - Consultant database (name, org, contact, specialization).
- **strategies** - AI-generated strategy documents per project/application.
- **grant_activity_log** - Activity timeline for pipeline entries.
- **grant_verifications** - Detailed verification check results.
- **project_blockers** - Structural blockers with status tracking.
- **app_settings** - Key-value settings (app_password, etc.).

## Authentication

Two layers:

1. **Frontend**: AuthGate component wraps entire app. Password checked against `app_settings` table. Stored in sessionStorage as both boolean flag and actual password.

2. **API routes**: All AI-powered routes validate `x-app-password` header via `validateAuth()` from `lib/api-auth.ts`. The client sends this header automatically via `apiFetch()` from `lib/api-fetch.ts`.

3. **Cron**: `/api/verify-all` uses `CRON_SECRET` env var (separate from app password).

## API Route Patterns

Every API route follows this pattern:
```typescript
import { validateAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  try {
    const authError = await validateAuth(req)
    if (authError) return authError

    // ... route logic ...

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Diagnostic mode
export async function GET() {
  return NextResponse.json({ status: 'ok', api_key_set: !!process.env.ANTHROPIC_API_KEY })
}
```

## Key Flows

### Grant Discovery
Project profile → `/api/discover` → Claude + web search → Grants saved to DB

### Grant Analysis
Grant + Project → `/api/analyze-grant` → Claude assessment → Stored in grant fields

### Strategy Generation
Pipeline entry → `/api/strategy` → Claude comprehensive analysis → Strategy with next steps, blockers, documents, improvements

### Application Workspace
1. Click "Apply" on grant detail → Creates application + 4 sections + navigates
2. Proposal tab: AI generates questions → User answers → AI generates draft narrative
3. Budget tab: Same question/answer/draft flow for financial planning
4. Documents tab: Track required documents (seeded from strategy)
5. Review tab: Completeness check, consultant matching, export

### Grant Verification
Single: `/api/verify-grant` → URL check + source quality + Claude cross-reference
Bulk: `/api/verify-all` (cron, 3AM UTC) → Processes pipeline grants + stale grants

## Deployment

Git push to main → Vercel auto-deploys. No build steps required beyond `next build`.

Environment variables (set in Vercel):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET` (optional, protects nightly verification)

## Development Workflow

Claude builds files locally → packages as tar → Darius extracts into repo → git push triggers deploy.

```bash
cd ~/Projects/le-radici-grant-crm
tar -xzf ~/Downloads/batch-name.tar.gz
git add . && git commit -m "description" && git push
```
