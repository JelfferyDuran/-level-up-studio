# ASCENSION WORLD — North Star, Gold Stars & Agent Kanban (v0.1)
Owner: product. Status: planning baseline; **no changes to app behavior or production data**.

## Vision
A mobile-first, accessible, faith-optional, real-life growth game: teach practical principles, encourage meaningful actions, and help people build agency, discipline, knowledge, health, relationships and purpose. "Superhuman" means exceptional consistency and character, **not** medical/supernatural claims. Christian Scripture is an explicit opt-in preference; no forced religious framing for guests.

## North Star metric
**Weekly Meaningful Growth (WMG):** percentage of eligible active users who complete at least 3 distinct *intentional real-world actions* on at least 3 different days within a rolling 7-day period. Define eligible as opted-in users with 7 days since first onboarding; track locally first; count each quest at most once per day; exclude test/demo sessions. This is a product success proxy, not proof of life improvement. Baseline = TBD after opt-in instrumentation; 90-day aspirational target >=35%, revise after measurement.

## Gold Star system (separate from XP)
Gold stars measure healthy consistency and reflection, not raw clicks.
- Daily Gold Star: 1 star only if >=2 completed meaningful quests across >=2 categories **and** a short reflection or "what I learned" response. Limit 1/day.
- Weekly Gold Star: 1 star for >=3 Daily Gold Stars on distinct days plus a weekly reflection. Limit 1/week.
- XP remains the game progression currency. Never allow stars to be purchased, farmed with checklist subtasks, or earned from time spent in app.
- Display progress transparently; user can undo a quest and the day's star must recompute.
- A missed day does not erase earned stars; no punitive streaks. Pause/rest accommodations and accessible alternatives.
- Privacy: local-only by default, optional cloud sync later; reflection text never transmitted without opt-in. No analytics on sensitive faith content.
- Unit tests: idempotency, midnight rollover, undo, duplicate prevention, backup/restore, timezone change, partial data and storage errors.

## Confirmed product direction: private growth + community growth
**Both**, staged. Phase 1: private-by-default personal transformation, onboarding, personalized quests, local progress, Gold Stars and reflections. Phase 2: optional community accountability circles, cooperative quests, consent-based challenges and carefully scoped leaderboards. Each user controls what is shared; reflections, religious preferences, and private activity are never public by default. No public profile, automatic discovery, or child social features by default. Design account security, moderation/reporting, consent revocation, abuse prevention and data deletion before community launch. Community features are not implemented by this planning commit.

## Product pillars
1. **Initiation:** 4-step skippable intake (name/alias, goals, daily commitment, motivation preference); never overwrite existing XP/quests. Provide edit/restart without reset.
2. **Adaptive quests:** small personalized quest packs with three optional subtasks and an explanation of why each matters. Focus session gated by timer, not manual checkboxes.
3. **Learn → Do → Reflect:** every quest includes a concrete action, why it matters, optional Scripture or secular equivalent, and a 10-second reflection.
4. **World reacts to progress:** accessible labeled portals, 2D fallback independent of WebGL, mobile-first performance.
5. **Agency and trust:** data export/import, no manipulative reward loops, opt-in notifications, no shame for missing days.

## Free-first stack (verify current limits before adoption)
- GitHub Issues + Projects (board), PRs, Actions minutes subject to plan/repo limits.
- Vercel existing deployment and previews, subject to free plan/usage and commercial-use restrictions.
- Current HTML/CSS/JS, browser localStorage, 2D fallback, Three.js (bundle pinned locally); no paid AI runtime.
- Optional later: Supabase free tier for opt-in auth/sync **only after billing, RLS, quotas and data retention are understood**. Do not make Supabase a blocker.
- Playwright + Vitest for repeatable browser/unit checks; local execution and available CI quotas.
- Hermes/Claude Code as coding agents using repository handoff, one issue/branch/PR each, with human approval before merging.

## Kanban
Columns: **Backlog → Ready → In Progress → Review/QA → Done**; **Blocked** is a visible status. GitHub Issues are source of truth; GitHub Projects board is optional if API/permissions support it. Each issue has owner/agent, priority P0/P1/P2, dependencies, subtasks, acceptance criteria, test evidence, risk and explicit merge policy.

## Delivery order
P0: QA and preservation (baseline smoke tests, storage migration tests, backup safety).
P1: onboarding + personalized quest selection; gold-star engine and UI.
P1: accessible learning cards, reflection, verse preferences and secular alternative.
P1: progress measurement and privacy controls (local metrics first).
P2: opt-in accounts/sync, private accountability circles, cooperative community quests, consent-based sharing, moderation/privacy controls, richer world upgrades. Do not launch community before secure account isolation and consent controls.

## Agent contract
- Read this document, current app source, PRs and docs before coding.
- Claim exactly one Ready issue. Create a dedicated feature branch from current main; do not edit main.
- First add/adjust tests and reproduce the failure; then implement smallest change.
- Never erase `level-up-studio-pwa-v1` progress or silently reset XP/quests; migrations are additive and reversible.
- Submit PR with before/after behavior, tests, screenshots on mobile, accessibility, and rollback notes.
- Do not merge, publish, change pricing/billing, add external services, or collect sensitive data without owner approval.
- Keep `docs/ASCENSION-AGENT-HANDOFF.md` or PR notes current. No agent may claim browser validation from syntax checks alone.

## Release gates
iPhone Safari and desktop Chromium: onboarding skip/return, saved progress, quest and subtask persistence, Focus reward once, gold-star idempotency, 2D fallback, keyboard and touch, local backup/restore. Deployment READY is not a substitute for interactive testing.
