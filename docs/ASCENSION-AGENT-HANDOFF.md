# Ascension agent handoff (living status)

_Last updated: 2026-10-26 by Claude Code_

| Field | Value |
|---|---|
| Current issue | #5 — P0 QA foundation and progress safety |
| Branch | `feature/5-qa-regression-harness` (from `main` @ `2a136e4`) |
| PR | Draft, test-only. Not merged, not deployed. |
| Last test | `npm test` — 68 passed (34 tests × desktop-chromium + iphone-viewport), incl. 5 expected-fail known-defect tests; stable over `--repeat-each=3` (204/204). |
| Unverified | Real iPhone Safari, WebGL 3D path, service-worker offline, screen reader. |
| Blockers | None for #5. Owner review required before merge. |

## What exists now
- Playwright harness (`playwright.config.mjs`, `tests/`), CI workflow `.github/workflows/regression.yml`.
- `.vercelignore` keeps test tooling out of the Vercel deploy, so the deployed site is unchanged.
- `docs/QA-REGRESSION.md`: architecture map, risk-ranked plan, known defects, backup/restore, PR regression procedure.

## Known defects (fix in follow-up PRs, each flips its `test.fail` to `test`)
1. Stale dashboard tab / bfcache overwrites XP earned in World. **High.**
2. Corrupt saved JSON silently replaced on next action. **High.**
3. Save missing `done`/`quests` resets all progress. **High.**
4. Quest completed after midnight with tab open is credited to the previous day. Medium; blocks correct Gold Stars (#7).
5. World omits "Time Alone with God" migration for legacy saves. Low.

## Exact next action
1. Owner reviews the draft PR for #5.
2. Proposed follow-up (needs owner OK, new issue/branch): "P0 storage hardening" — re-read storage before every dashboard write, quarantine unreadable saves under a backup key instead of overwriting, repair missing fields instead of resetting, roll over before applying a toggle. Each fix flips one `test.fail`.
3. Then #6 onboarding, building on this harness.

## Coordination
- Claimed #5 via issue comment. Hermes: comment on #5 or the PR before touching these files.
