# Ascension World Hybrid — Debug & Release Handoff

Status: **BLOCKED / DO NOT MERGE PR #2**. Production main must remain unchanged until real iPhone and desktop-browser checks pass.
Repository: `JelfferyDuran/-level-up-studio` (leading hyphen). Branch: `feature/ascension-world-v2`. Draft PR: https://github.com/JelfferyDuran/-level-up-studio/pull/2

## User report
On iPhone, "Nothing is clickable." Previous checklist: only no freezing/overlapping controls was marked PASS; all functional checks NOT VERIFIED. A successful Vercel build and static syntax check do NOT prove the JS module loaded or touch handlers executed.

## Suspected failure modes
1. `world.html` uses a **static CDN import** of Three.js `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`. If this import is blocked, slow, or fails, the whole module never executes, leaving the canvas and portal listeners uninitialized. Added a plain-script startup watchdog, retry, and dashboard fallback. Long-term fix: vendor/pin the library or bundle it locally; add offline-friendly caching if needed.
2. Portal selection previously depended on raycast and a tiny touch threshold, making normal taps unreliable. Increased tap tolerance to 12px and added feedback on misses. Direct portal tap and guide buttons now call `roomStart(type)` instead of requiring a second drawer click.
3. `world.html` is a large monolithic script with runtime dependencies and no automated browser smoke tests. Static `new Function` syntax verification was performed, **not** real browser execution.
4. Hybrid rooms use the same localStorage key `level-up-studio-pwa-v1` as `index.html`, but previews have separate origins. Validate schema and day rollover, and back up progress before first mutation. The snapshot key is `level-up-studio-before-hybrid-v1`.
5. Quest reward logic, focus completion, streak and duplicate-award guards need browser tests, including reload, midnight rollover, tab background/foreground and failed localStorage writes. Streak tracking and daily focus reset were aligned in a prior fix.
6. Rendering is Three.js via CDN and WebGL; iOS GPU/browser behavior has NOT been tested. Inspect Safari Web Inspector console and network errors.
7. HTML overlay focus trap, ARIA announcements, reduced motion, scene camera easing, persistent focus across navigation, offline support, and live visual world-growth after XP updates remain improvement opportunities.

## Latest changes on feature branch
- Added startup watchdog (9s), `__ascensionReady`, `__ascensionError`, error/rejection reporting, retry and dashboard fallback.
- Direct-open rooms via both 3D portal taps and destination guide buttons.
- Increased touch tap tolerance and added missed-tap hint.
- Functional Quest Gardens, Focus Chamber, Achievement Vault with shared legacy localStorage schema; camera approaches destination.
- Added streak calculation and focus eligibility reset on day rollover.
- Original classic dashboard preserved; no production deployment or merge.

## REQUIRED validation plan
1. Desktop Chromium + WebKit/Safari: open `/world.html`, verify canvas renders, `window.__ascensionReady` invoked, no console errors or failed CDN requests.
2. Tap guide buttons (Focus, Quests, Vault), return to island; tap each 3D portal. Verify room buttons are clickable and keyboard accessible.
3. Seed known localStorage data; complete normal quest; assert XP, stars, completed, done, date, best and history; reload and assert persistence; undo and assert reversal.
4. Focus timer: start/pause/resume/reset; use fake timers to advance a full configured session; assert exactly one sprint award, repeated sessions do not duplicate; simulate tab background/foreground and midnight rollover.
5. Refresh during timer: document expected behavior (currently focus session is not persisted; user should not silently assume otherwise).
6. Simulate CDN failure and WebGL failure. Confirm visible, clickable fallback to dashboard and no user data loss.
7. Test actual iPhone Safari and installed PWA; test portrait, landscape, safe areas, touch orbit/pinch, scroll, memory, reduced motion.
8. Confirm production and preview use separate storage. Do NOT copy preview storage into production or change schema without explicit migration.
9. Add automated Playwright tests and CI gate, or have Hermes/Claude Code run a browser smoke test and attach screenshots/logs to PR.

## Implementation best practices for Hermes / Claude Code
- Reproduce before rewriting. Inspect JS console, network, DOM stacking, CSS pointer-events, overlay z-index, and module loading.
- Extract `world.html` into small modules (storage adapter, focus state machine, room UI, renderer/input), use a pinned local Three.js bundle with dependency lock.
- Keep DOM controls accessible and independent from WebGL success. Prefer graceful fallback over blank/non-clickable UI.
- Add testable pure functions for rewards, day rollover, streak, and XP; use transactional storage mutation and immutable snapshots.
- Never overwrite existing localStorage with demo defaults if parse fails. Keep the classic dashboard functional.
- Keep PR #2 **draft** until explicit owner approval after acceptance tests. Do not deploy to production, merge, or change progress data in production.

## Commands for local developer
```sh
git clone https://github.com/JelfferyDuran/-level-up-studio.git
cd -- -level-up-studio
git checkout feature/ascension-world-v2
python3 -m http.server 8000
# Open http://localhost:8000/world.html and browser DevTools
```

## Owner-facing acceptance
All 3 rooms open/close; quest XP persists after refresh; focus timer controls work; full focus session credits once; iPhone has no frozen/unclickable overlays. Then request explicit approval before merge.
