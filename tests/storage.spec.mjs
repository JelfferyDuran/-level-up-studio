// P0 storage-hardening browser tests (Playwright, harness style).
// These are the PR #12 defect scenarios, now expected to PASS:
//  1. stale tab / bfcache overwrite  2. corrupt save  3. missing done/quests
//  4. after-midnight credit  5. legacy save opened first in World.
// Run via CI (`npm test` per the harness workflow). Config pins UTC, so
// date math below uses UTC dates, matching the app's dateKey in tests.
// NOTE: not executed in the agent VM (no browser binary there); the
// harness CI run on the PR is the gate for this file.
import { test, expect } from '@playwright/test';

const KEY = 'level-up-studio-pwa-v1';

// Seed localStorage on the app origin, then reload so the app boots from it.
async function seed(page, url, setup, arg) {
  await page.goto(url);
  await page.evaluate(setup, arg);
  await page.reload();
}

// Read the stored progress state, accepting the v2 envelope or legacy bare JSON.
async function readState(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === 2 ? parsed.state : parsed;
  }, KEY);
}

const QUEST_CHECKS = '#questList .quest .check';

test('stale dashboard tab does not overwrite XP earned in World', async ({ browser }) => {
  const ctx = await browser.newContext();
  const first = await ctx.newPage();
  const second = await ctx.newPage();
  await first.goto('/index.html');
  await second.goto('/index.html');
  // Second tab earns Sleep (+50).
  await second.locator(QUEST_CHECKS).nth(0).click();
  await expect(second.locator('#xp')).toHaveText('50');
  // First tab is stale (it loaded at 0 XP). Completing MIT (+40) must merge
  // to 90, not overwrite back to 40.
  await first.locator(QUEST_CHECKS).nth(2).click();
  await expect(first.locator('#xp')).toHaveText('90');
  await expect(first.locator('#todayCount')).toHaveText('2/10');
  await ctx.close();
});

test('corrupt save is quarantined and the last good snapshot is restored', async ({ page }) => {
  await seed(page, '/index.html', () => {
    const key = 'level-up-studio-pwa-v1';
    const good = { xp: 1234, stars: 5, done: ['sleep'], date: new Date().toISOString().slice(0, 10) };
    localStorage.setItem(key + '.snapshots', JSON.stringify([
      { v: 2, rev: 7, savedAt: Date.now(), state: good },
    ]));
    localStorage.setItem(key, '{"xp":1234,"done":'); // truncated write
  });
  await expect(page.locator('#xp')).toHaveText('1234');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((k) => k.startsWith('level-up-studio-pwa-v1.corrupt.'))).toBe(true);
});

test('corrupt save with no snapshot starts fresh but keeps the damaged bytes', async ({ page }) => {
  await seed(page, '/index.html', () => {
    localStorage.setItem('level-up-studio-pwa-v1', 'not json at all{{{');
  });
  await expect(page.locator('#xp')).toHaveText('0');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((k) => k.startsWith('level-up-studio-pwa-v1.corrupt.'))).toBe(true);
});

test('save missing done/quests keeps XP instead of resetting everything', async ({ page }) => {
  await seed(page, '/index.html', () => {
    localStorage.setItem('level-up-studio-pwa-v1', JSON.stringify({
      xp: 1234, stars: 5, completed: 40, history: { '2026-10-25': 3 },
    }));
  });
  await expect(page.locator('#xp')).toHaveText('1234');
  await expect(page.locator('#todayCount')).toHaveText('0/10');
});

test('quest completed after midnight credits the new day, not yesterday', async ({ page }) => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await seed(page, '/index.html', () => {
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    localStorage.setItem('level-up-studio-pwa-v1', JSON.stringify({
      xp: 50, done: ['sleep'], date: y, history: {},
    }));
  });
  // Boot rolls yesterday over: today starts empty, history keeps yesterday.
  await expect(page.locator('#todayCount')).toHaveText('0/10');
  const rolled = await readState(page);
  expect(rolled.history[yesterday]).toBe(1);
  expect(rolled.done).toEqual([]);
  // Completing MIT now counts toward today.
  await page.locator(QUEST_CHECKS).nth(2).click();
  await expect(page.locator('#xp')).toHaveText('90');
  await expect(page.locator('#todayCount')).toHaveText('1/10');
});

test('legacy save opened first in World gains Time Alone with God', async ({ page }) => {
  const five = [
    { id: 'sleep', emoji: '😴', name: 'Sleep 7h+', xp: 50 },
    { id: 'sprint', emoji: '🎯', name: 'Focus Sprint', xp: 50 },
    { id: 'mit', emoji: '✅', name: 'MIT done', xp: 40 },
    { id: 'break', emoji: '🌿', name: 'Real break', xp: 30 },
    { id: 'park', emoji: '📵', name: 'Phone parked', xp: 30 },
  ];
  await seed(page, '/world.html', (quests) => {
    localStorage.setItem('level-up-studio-pwa-v1', JSON.stringify({
      xp: 100, done: [], date: new Date().toISOString().slice(0, 10), quests,
    }));
  }, five);
  await page.locator('[data-open="quests"]').click();
  await expect(page.locator('#roomContent')).toContainText('Time Alone with God');
  // A refresh must persist the migrated quest, not drop it again.
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  const stored = await readState(page);
  expect(stored.quests.some((q) => q.id === 'god')).toBe(true);
  expect(stored.xp).toBe(100);
});
