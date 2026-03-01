# GrantFlow Changelog

## [2026-03-01] Apply with AI - End-to-End Polish

### Fixed
- **Budget tab now generates drafts.** Previously the "Generate Draft" button only appeared in the Proposal tab due to a hardcoded check. Budget tab now has its own "Generate Budget Plan" button with amber-themed draft display.
- **Budget draft uses financial-specific prompt.** Previously both proposal and budget drafts used the same narrative prompt. The API now returns structured budget plans with cost categories, co-financing breakdowns, cash flow timelines, and budget justification.

### Added
- **Auto-seed documents from strategy.** When clicking "Apply" on a grant that has a strategy, the Document Vault is pre-populated with all required documents including effort level, preparation notes, and AI assistance hints. No more empty documents tab.
- **PDF export.** Review tab's "Print / Save as PDF" button opens a print-optimized page with proposal narrative, budget plan, and document checklist. Works as browser print (Cmd+P to save as PDF).
- **Visible error messages for all AI operations.** Question generation, draft generation, and consultant matching now show a dismissible error banner instead of silently failing to console.
- **React Error Boundary.** Wraps all page content via AppShell. Catches unhandled JS errors and shows a friendly "Something went wrong" screen with reload button instead of white screen.
- **Database performance indexes.** 13 indexes across all major tables (grants, pipeline, applications, questions, documents, activity log, strategies). Zero risk, prevents slow queries as data grows.
- **6 top grants added to pipeline.** Bonus Restauro, Soprintendenza Heritage, Cultural Heritage Conservation, EAFRD, ISMEA Generazione Terra, ISMEA Investe - all set to "Researching" stage.

---

## [2026-03-01] Security Hardening + Documentation

### Added
- `src/lib/api-auth.ts` - Shared server-side auth validation. Checks `x-app-password` header against DB.
- `src/lib/api-fetch.ts` - Client-side authenticated fetch wrapper. Auto-includes password header.
- `ARCHITECTURE.md` - Complete project documentation.
- `CHANGELOG.md` - This file.

### Changed
- **All 9 AI API routes** now require `x-app-password` header (analyze-grant, application-draft, application-questions, discover, find-consultants, grant-qa, match-consultants, strategy, verify-grant).
- `src/lib/auth.ts` - Now stores actual password in sessionStorage (not just boolean), enabling API auth.
- `src/components/AuthGate.tsx` - Passes password to `setAuthenticated()`.
- All frontend pages with API calls updated to use `apiFetch()` instead of raw `fetch()`.
- `/api/verify-all` (cron) - Now passes app password when calling verify-grant internally.

### Security Impact
Previously, anyone who discovered the API URLs could trigger expensive Anthropic API calls. Now all AI routes are password-protected. Estimated exposure: ~$0.01-0.10 per unauthorized call.

---

## [2026-03-01] Apply Button + Consultant Removal

### Changed
- Grant detail page: "Apply with AI (Coming Soon)" button replaced with active "Apply" button.
- Apply button creates application workspace, sets pipeline stage to "Preparing Application", and navigates to workspace.
- Removed "Find Consultants" section from grant detail page (still available in pipeline detail and consultants page).

---

## [2026-03-01] Grant Verification System + Q&A

### Added
- Three-phase grant verification: URL validation, source quality scoring, Claude cross-reference.
- `/api/verify-grant` - Single grant verification endpoint.
- `/api/verify-all` - Nightly cron job (3AM UTC) for bulk verification.
- `src/components/VerificationBadge.tsx` - Verification status display component.
- `/api/grant-qa` - Grant Q&A with web search and source citations.
- Pipeline detail page: Q&A section with follow-up suggestions.
- DB migration: `verification_status`, `verification_confidence`, `last_verified_at`, `verification_details` columns on grants table.
- DB migration: `grant_verifications` table for detailed check logs.

### Changed
- Dashboard: Added "Verified" column in grant table.
- Grants list: Verification badge on each card.
- Grant detail: Full verification card in sidebar with "Verify Now" button.
- `vercel.json`: Cron configuration added.

---

## [2026-02-28] Realistic Projections + Consultant Fix + Stage CTA

### Added
- `src/lib/projections.ts` - Realistic grant projection engine (weights by relevance and status).
- 5W analysis protocol for bugs.

### Fixed
- Consultant search error handling (5W: JSON parsing failure on error responses).
- Pipeline detail CTA now stage-aware.

---

## [Pre-changelog] Foundation Build

### Features built (not individually dated)
- Complete grant database with CRUD, filtering, sorting by status/relevance.
- Pipeline management with 10-stage lifecycle (Discovered through Archived).
- AI grant discovery engine with web search.
- AI strategy generator (next steps, blockers, documents, improvements).
- AI consultant matching with web research.
- Application workspace with 4-tab structure (Proposal, Budget, Documents, Review).
- AI question generation and proposal draft writing.
- Project profile with onboarding flow.
- Blocker tracker on dashboard.
- Password-protected app with glassmorphism design system.
- Supabase schema: 15 tables.
- Vercel deployment with git-push workflow.
