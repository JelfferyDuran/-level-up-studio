# CLAUDE.md — Ascension World / Level Up Studio

## Start here (October 2026)
You are working in `JelfferyDuran/-level-up-studio` (the leading hyphen is part of the repo name). Production: https://level-up-studio-three.vercel.app/ ; world: /world.html. This is a **real deployed app**, not a greenfield rewrite. Read the current `index.html`, `world.html`, `sw.js` if present, and `docs/ASCENSION-ROADMAP-GOLD-STARS-KANBAN.md` before changes.

**Owner's confirmed direction: BOTH private personal growth AND community growth, in that order.** Private-by-default first; later voluntary groups, accountability circles, shared challenges and opt-in leaderboards. Never publish private progress, reflections, religious preferences, or children’s data to others by default. Community sharing is an explicit, granular user action; no public profile by default. Keep a secular motivation option alongside opt-in Christian Scripture. The user wants a free-first stack, measurable growth, and agents working from GitHub issues.

## Immediate assignment and work order
1. **Claim GitHub Issue #5 first** (P0 QA and progress safety). Add a browser regression harness before major refactors. Inspect the current source rather than assuming older handoff descriptions still match it.
2. Then work from issues #6 onboarding, #7 Gold Stars, #8 quest lessons, #9 privacy-safe metrics, #10 mobile reliability. Respect dependencies; one issue per branch/PR. Coordinate with Hermes via issue comments or PRs; never assume another agent has completed an issue.
3. Propose community work only after user profiles, data separation, explicit sharing consent, privacy controls, and reliable progress synchronization are designed and tested. Create separate P2 issues if authorized.
4. Add `docs/ASCENSION-AGENT-HANDOFF.md` as a living status document when implementation starts; include current issue, branch, last test, blockers, and exact next action.

## Product contract
- **North Star:** Weekly Meaningful Growth (WMG): percentage of eligible users with 3 distinct real-world actions on at least 3 different days in rolling 7 days; 90-day 35% is a hypothesis/aspirational target, not measured performance.
- **Gold Stars:** daily requires 2 meaningful quests in 2 categories plus reflection, max 1/day; weekly requires 3 distinct daily stars plus weekly reflection, max 1/week. XP is independent. No points for checklist subtasks alone. Idempotent, undo-aware, no punitive streak loss.
- **Initiation:** 4 steps, skippable, editable; alias, goal, daily time budget, motivation/faith preference. Existing users keep all saved XP/quests.
- **Quest loop:** Learn → Do → Reflect. Explanations, 3 optional checklist steps, optional Scripture or nonreligious equivalent. "Time Alone with God" should be available to opt-in users.
- **Accessibility:** iPhone Safari touch-first, 2D fallback works without Three.js/WebGL; keyboard and screen-reader friendly; reduced motion; clear portal names.
- **Privacy:** existing browser storage stays local by default; no cloud tracking or sensitive-data transmission without explicit opt-in. If accounts/cloud sync later, design tenant/user isolation and security rules first.

## Known implementation risks
- Existing persistence key: `level-up-studio-pwa-v1`. Preserve legacy data and migrations; don't silently reset, change key, overwrite progress or seed demo values as real achievements.
- PR #2 was merged, PR #4 (quest subtasks + four quests) was subsequently merged to main; PR #3 was a 2D fallback predecessor. **Do not treat historical draft/preview warnings as current PR status.** Read GitHub current state.
- A deployment marked READY is not evidence that iPhone touch, Focus reward idempotency, persistence, or accessibility passed.
- Feature branch previews and production have separate origins/localStorage. Do not conflate test XP with production XP.
- No paid services, surprise cloud providers, billing changes, auto-merges, or production deployment without owner authorization.

## Working protocol
1. Read issue and latest main. Reproduce, capture expected vs actual, and identify safety constraints.
2. Create `feature/<issue-number>-<topic>` from current main. Do not commit directly to main.
3. Add deterministic tests for storage migration, day rollover, quest/subtask persistence, focus one-time rewards, Gold Star idempotency and UI interaction where relevant.
4. Implement small, reviewable changes. Verify iPhone Safari if possible; otherwise clearly mark unverified. Attach screenshots, logs, tests and rollback steps.
5. Open PR as draft; write exact acceptance checklist and dependencies. **Wait for owner review/approval before merge or production changes.**
6. Update issue state/checklists and handoff. Never claim a tool was run if it wasn't.

## Free-first tools
GitHub Issues/PRs/optional Projects, Vercel existing deployment and previews, vanilla web stack, localStorage, pinned Three.js with 2D fallback, Playwright/Vitest (subject to actual environment and quotas). Optional Supabase only after separate security/usage/billing decision.

## Useful links
- Roadmap: `docs/ASCENSION-ROADMAP-GOLD-STARS-KANBAN.md`
- Historical debug context: `docs/ASCENSION-HYBRID-DEBUG-HANDOFF.md` (historical PR #2 status; not current)
- GitHub issues: https://github.com/JelfferyDuran/-level-up-studio/issues
- Production: https://level-up-studio-three.vercel.app/world.html

## First Claude Code task
Inspect main and issue #5; return a concise architecture map and risk-ranked test plan, then create a small test-only feature branch/PR. Do not replace the app or enable accounts/community services in that PR.
