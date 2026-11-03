# Ascension agent handoff (living status)

_Last updated: 2026-11-03 by Claude Code_

| Field | Value |
|---|---|
| Current issue | #15 — P0 storage hardening |
| Branch | `feature/15-storage-compat` (from `main` @ `86025bc`) |
| PR | Draft, alternative to draft PR #16. Not merged, not deployed. |
| Last test | `npm test` — 86 passed (43 tests × desktop-chromium + iphone-viewport); `--repeat-each=3` 258/258. All 16 new or flipped tests fail against `main`'s pages and pass with the fix. |
| Unverified | Real iPhone Safari (bfcache, two tabs, recovery note), WebGL 3D path, service-worker offline, screen reader. |
| Blockers | Owner must pick this PR or #16 (they conflict). |

## Done
- #5 QA harness (PR #12, merged).
- #15 fixes for defects 1–5 on this branch: backward-compatible, inline, no new files, no service-worker change.

## Exact next action
1. Owner compares this PR with #16 and picks one; close the other.
2. Owner checks on a real iPhone: earn XP in World, go Back to the dashboard, tap a quest, and confirm the XP adds up.
3. Then #7 Gold Star engine (day attribution is now correct) or #6 onboarding.

## Coordination
- PR #16 (another agent) uses a `{v:2,…}` envelope format. Harness on it: 36 passed / 32 failed; old code resets progress on an envelope. Findings posted on #16.
