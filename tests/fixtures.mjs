// Shared fixtures for the regression harness.
// - Every request that leaves the local static server is aborted and recorded,
//   so tests are deterministic (Three.js CDN never loads -> world.html runs in
//   2D fallback) and privacy regressions (unexpected network calls) are visible.
// - alert/confirm dialogs are auto-accepted and recorded.
// - Uncaught page errors are recorded and fail the test.
import { test as base, expect } from '@playwright/test';

export const KEY = 'level-up-studio-pwa-v1';
export const HYBRID_BACKUP_KEY = 'level-up-studio-before-hybrid-v1';
export const ORIGINAL_IDS = ['sleep', 'sprint', 'mit', 'break', 'park'];
export const DEFAULT_IDS = ['sleep', 'sprint', 'mit', 'break', 'park', 'god', 'read', 'move', 'tidy', 'plan'];

export const test = base.extend({
  external: async ({}, use) => { await use([]); },
  dialogs: async ({}, use) => { await use([]); },
  pageErrors: async ({}, use) => { await use([]); },
  page: async ({ page, external, dialogs, pageErrors }, use) => {
    await page.route(url => !/^http:\/\/127\.0\.0\.1:\d+\//.test(url.href), route => {
      external.push(route.request().url());
      return route.abort();
    });
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    page.on('pageerror', e => pageErrors.push(String(e)));
    await use(page);
    expect(pageErrors, 'uncaught page errors').toEqual([]);
  },
});
export { expect };

/** Seed localStorage once per tab (survives reloads without re-seeding). */
export async function seed(page, state, extra = {}) {
  await page.addInitScript(([key, raw, extraEntries]) => {
    if (sessionStorage.getItem('__seeded')) return;
    if (raw !== null) localStorage.setItem(key, raw);
    for (const [k, v] of Object.entries(extraEntries)) localStorage.setItem(k, v);
    sessionStorage.setItem('__seeded', '1');
  }, [KEY, typeof state === 'string' ? state : JSON.stringify(state), extra]);
}

export async function readRaw(page, key = KEY) {
  return page.evaluate(k => localStorage.getItem(k), key);
}
export async function readState(page) {
  const raw = await readRaw(page);
  return raw === null ? null : JSON.parse(raw);
}

/** Local-time date key exactly as the app computes it. */
export function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** A pre-subtask, pre-"god" save as written by the original PWA (commit 959a447 era). */
export function legacyV1State(today) {
  return {
    xp: 1234, stars: 37, completed: 37, best: 6,
    quests: [
      { id: 'sleep', emoji: '😴', name: 'Sleep 7h+', xp: 50 },
      { id: 'sprint', emoji: '🎯', name: 'Focus Sprint', xp: 50 },
      { id: 'mit', emoji: '✅', name: 'MIT done', xp: 40 },
      { id: 'break', emoji: '🌿', name: 'Real break', xp: 30 },
      { id: 'park', emoji: '📵', name: 'Phone parked', xp: 30 },
      { id: 'custom-1700000000000', emoji: '🎸', name: 'Practice guitar', xp: 75 },
    ],
    done: ['sleep', 'mit'],
    date: today,
    history: { '2026-10-20': 3, '2026-10-21': 5 },
    name: 'Tester', message: 'Keep going', minutes: 25,
  };
}
