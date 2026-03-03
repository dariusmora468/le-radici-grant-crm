# GrantFlow CRM - Project Memory

## Project Overview
GrantFlow CRM for Le Radici (Tuscan agricultural estate). Non-technical founder: Darius Moravcik.
- Live: https://le-radici-grant-crm.vercel.app (password: radici2026)
- Supabase project ID: tozltypdqrcnrpcilkkj
- Tech: Next.js 14 App Router, Supabase, Vercel, Claude API

## Deploy Workflow (CRITICAL)
1. Claude commits changes in worktree: `cd /Users/dariusmora/le-radici-grant-crm/.claude/worktrees/busy-moore && git add -A && git commit -m "..."`
2. Darius runs from main repo: `cd ~/le-radici-grant-crm && git merge claude/busy-moore && git push`
- Use `git add -A` (not path-specific) due to zsh glob issue with `[id]` in paths
- If vim opens for merge commit: type `:wq` Enter to save and exit
- If merge commit got stuck (vim exited without save): `git commit` in main repo to finalize

## Key Patterns
- All API routes use `validateAuth()` from `@/lib/api-auth`
- Client API calls use `apiFetch()` from `@/lib/api-fetch`
- Use `cn()` from `@/lib/utils` for classnames
- Design system: glassmorphism, slate/blue palette, Inter font
- Claude Haiku for cheap/fast AI tasks, Sonnet for complex grant analysis

## Completed Features (as of March 2026)
- Dashboard command center
- Grants list with pipeline stages
- Grant detail pages with verification
- Grant Intelligence Layer: call_text, scoring_criteria, edit panel, URL warnings
- Pipeline drag-and-drop (Trello-style)
- Dynamic relevance scoring based on project profile
- Grant discovery + onboarding flow

## Database
- grants table has: call_text TEXT, scoring_criteria JSONB (added March 2026)
- See supabase.ts for full Grant interface

## Pending / Next Up
- Mobile responsiveness
- Proper Supabase Auth (replace password check)
- Grant application workspace (Apply with AI)
- Content engine (SEO articles in 5 languages)
- Stripe subscriptions
