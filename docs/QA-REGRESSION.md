# QA regression procedure (Issue #5)

## Architecture map (main @ 2a136e4)

| Piece | What it does | Notes for testers |
|---|---|---|
| `index.html` | Dashboard PWA. All logic inline. State object `s` loaded once at page load from `localStorage['level-up-studio-pwa-v1']`. | Never re-reads storage after load (even on `visibilitychange`). |
| `world.html` (plain script) | Ascension World rooms, quests, Focus timer. Re-reads storage before each write (`safeRefresh`). | Works without Three.js; enters 2D mode after a 9 s timeout. |
| `world.html` (module) | Three.js 0.170.0 from jsDelivr CDN, visuals only. | Only external request in the app. |
| `sw.js` | Network-first cache of `/`, `/index.html`, manifest, icon. | Does not cache `world.html`. |
| Storage | One key, `level-up-studio-pwa-v1`, shared by both pages. World also writes a one-time snapshot to `level-up-studio-before-hybrid-v1` before its first write. | Preview and production origins have **separate** storage. |

Saved state shape: `{ xp, stars, completed, best, quests[{id,emoji,name,xp}], done[id], date 'YYYY-MM-DD' (local), history{date: count}, stepDone{questId: [stepIndex]}, name, message, minutes }`.

Migrations (additive, on load): add `god` if missing; add `read/move/tidy/plan` if missing; default `stepDone` to `{}`. Day rollover: if `date` ≠ today, `history[date] = done.length` (only if > 0), clear `done` and `stepDone`.

"Stars" today means +1 per quest completion. That is **not** the Gold Star contract (#7); the harness only checks current behavior.

## Running the tests

```bash
npm ci
npx playwright install chromium   # skip if a matching Chromium is already installed
npm test                          # both projects: desktop-chromium + iphone-viewport
npx playwright test --project=iphone-viewport -g "focus"   # narrow run
```

The harness:
- serves the repo with a zero-dependency static server (`tests/static-server.mjs`);
- blocks **every** non-local request and service workers, so world.html always exercises the 2D fallback and any new external call shows up in the test output;
- uses Playwright's fake clock (pinned to UTC) for midnight rollover and Focus timer tests;
- seeds `localStorage` once per tab, so reload tests see the app's own writes.

`iphone-viewport` is Chromium with iPhone 13 size + touch. **It is not iPhone Safari.** Real-device checks remain a manual release gate.

## Known defects captured as `test.fail()`

These tests describe the *expected* behavior and currently fail on purpose. When a fix lands, Playwright reports the test as "unexpectedly passed": flip it to a normal `test()` in the fix PR.

| # | Defect | Risk | Test |
|---|---|---|---|
| 1 | A stale dashboard tab (or a back-navigation restored from bfcache) overwrites XP earned in Ascension World. | **High** — real XP loss, likely on iPhone Safari. | `dashboard.spec.mjs` › stale dashboard tab |
| 2 | Unreadable (truncated/corrupt) saved JSON is replaced with a fresh save on the next action; original bytes are gone. | **High** — silent total reset. | `dashboard.spec.mjs` › unreadable saved data |
| 3 | A save missing `done` (or `quests`) resets all progress on the next action. | **High** — silent total reset. | `dashboard.spec.mjs` › missing "done" |
| 4 | Completing a quest after midnight with the dashboard still open credits the previous day and leaves today empty. | Medium — wrong day, affects streak/Gold Stars. | `dashboard.spec.mjs` › after midnight |
| 5 | A legacy save first opened in World never gets "Time Alone with God" there. | Low — dashboard adds it on its next load. | `world.spec.mjs` › Time Alone with God |

Also observed, not a test failure: opening any World room persists a normalized save even if the user did nothing.

## Risk-ranked test plan (what's covered vs. still open)

1. **Saved-progress safety** — legacy migration (both pages), idempotent migration, invalid backup rejected, World rollback on storage write failure ✅; defects 1–3 captured ❗.
2. **XP / completion integrity** — complete/undo symmetry, never below zero, lists in sync, custom quest delete refunds XP ✅.
3. **Focus reward once** — tapping does not award; full session awards once; second session / reset does not double; pause keeps time ✅ (both pages).
4. **Day rollover** — archive to history, clear done + steps, XP/stars untouched, no entry for empty days, streak ✅; open-tab midnight ❗ (defect 4).
5. **Subtasks** — persist, award no XP, don't complete the quest ✅ (both pages).
6. **2D fallback + touch + keyboard** — 2D mode without Three.js, all three destinations by tap and keyboard, dialog semantics ✅.
7. **Backup/restore** — download contains full state; restore re-applies migrations ✅.
8. **Privacy** — dashboard makes zero external requests; World only requests the pinned Three.js module ✅.
9. **Still open (manual / future):** real iPhone Safari (bfcache, touch, Add to Home Screen), WebGL 3D path, service-worker offline behavior, timezone change mid-day, screen-reader pass, storage-full on dashboard.

## Backup and restore (user-facing procedure)

1. Dashboard → **Studio** tab → **Download Backup**. Saves `level-up-backup.json` (the full saved state).
2. To restore: **Studio** → **Restore Backup** → choose the file → confirm. This **replaces** current progress on this device; new default quests are re-added.
3. A file without `quests`, `done` and a numeric `xp` is rejected and nothing changes.
4. Preview deployments and production are different origins: a backup is the only way to move progress between them.

For agents: before any change touching storage, export a backup from the environment you test in, and never test with production data.

## Regression procedure for every PR

1. `npm test` locally — all green, no unexpected passes.
2. CI "Regression tests" workflow green on the PR.
3. If the PR fixes a `test.fail()` defect, convert that test to `test()` in the same PR.
4. Manual on a real iPhone (Safari) when touch, storage or timers changed: onboarding skip/return, quest + subtask persistence after reload, Focus reward once, World 2D/3D, backup/restore. Record device + iOS version in the PR, or mark **unverified**.
5. Rollback: revert the PR commit; the storage key and schema are unchanged by tests.
