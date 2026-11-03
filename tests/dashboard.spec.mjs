// Regression tests for the dashboard (index.html). These characterize CURRENT
// behavior on main; they do not change the app.
import { test, expect, seed, readState, readRaw, legacyV1State, dateKey, KEY, DEFAULT_IDS } from './fixtures.mjs';

const NOW = new Date('2026-10-26T15:00:00Z');
const TODAY = dateKey(NOW);
const home = page => page.locator('#homeList');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
});

test.describe('first run', () => {
  test('loads with defaults, writes nothing until the user acts, and makes no external requests', async ({ page, external }) => {
    await page.goto('/');
    await expect(page.locator('#xp')).toHaveText('0');
    await expect(home(page).locator('.quest')).toHaveCount(DEFAULT_IDS.length);
    await expect(page.locator('#todayCount')).toHaveText('0/10');
    expect(await readRaw(page)).toBeNull();
    expect(external).toEqual([]);
  });
});

test.describe('legacy data migration (level-up-studio-pwa-v1)', () => {
  test('keeps XP, stars, custom quests, history and today\'s completions; appends new default quests', async ({ page }) => {
    const legacy = legacyV1State(TODAY);
    await seed(page, legacy);
    await page.goto('/');
    await expect(page.locator('#xp')).toHaveText('1234');
    await expect(page.locator('#stars')).toHaveText('37 ⭐');
    await expect(page.locator('#todayCount')).toHaveText('2/11');
    await expect(home(page).getByText('Practice guitar')).toBeVisible();
    // The migration is in memory until the next save; trigger one.
    await home(page).getByRole('button', { name: 'Complete Real break' }).click();
    const s = await readState(page);
    expect(s.xp).toBe(1234 + 30);
    expect(s.quests.map(q => q.id)).toEqual([...legacy.quests.map(q => q.id), 'god', 'read', 'move', 'tidy', 'plan']);
    expect(s.quests[5]).toEqual(legacy.quests[5]);
    expect(s.history).toEqual(legacy.history);
    expect(s.done).toEqual(['sleep', 'mit', 'break']);
    expect(Object.values(s.stepDone).flat()).toEqual([]); // rendering creates empty step lists; none are checked
    expect(s.name).toBe('Tester');
  });

  test('migration is idempotent across reloads (no duplicate quests)', async ({ page }) => {
    await seed(page, legacyV1State(TODAY));
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Real break' }).click();
    await page.reload();
    await home(page).getByRole('button', { name: 'Undo Real break' }).click();
    const ids = (await readState(page)).quests.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(11);
  });
});

test.describe('quest completion and XP', () => {
  test('complete then undo is symmetric and persists across reload', async ({ page }) => {
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    await expect(page.locator('#xp')).toHaveText('50');
    let s = await readState(page);
    expect(s).toMatchObject({ xp: 50, stars: 1, completed: 1, done: ['sleep'], date: TODAY });

    await page.reload();
    await expect(page.locator('#xp')).toHaveText('50');
    await home(page).getByRole('button', { name: 'Undo Sleep 7h+' }).click();
    s = await readState(page);
    expect(s).toMatchObject({ xp: 0, stars: 0, completed: 0, done: [] });
  });

  test('undo never drives XP, stars or completed below zero', async ({ page }) => {
    await seed(page, { ...legacyV1State(TODAY), xp: 10, stars: 0, completed: 0, done: ['sleep'] });
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Undo Sleep 7h+' }).click();
    expect(await readState(page)).toMatchObject({ xp: 0, stars: 0, completed: 0 });
  });

  test('both quest lists stay in sync and a quest cannot be counted twice in one day', async ({ page }) => {
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete MIT done' }).click();
    await page.locator('nav').getByRole('button', { name: /Quests/ }).click();
    await expect(page.locator('#questList').getByRole('button', { name: 'Undo MIT done' })).toBeVisible();
    expect((await readState(page)).done).toEqual(['mit']);
  });

  test('custom quest can be created, completed and deleted (deletion refunds its XP)', async ({ page, dialogs }) => {
    await page.goto('/');
    await page.locator('nav').getByRole('button', { name: /Quests/ }).click();
    await page.getByLabel('Quest name').fill('Call a friend');
    await page.getByLabel('XP reward').selectOption('20');
    await page.getByRole('button', { name: '+ Create Quest' }).click();
    const list = page.locator('#questList');
    await list.getByRole('button', { name: 'Complete Call a friend' }).click();
    expect((await readState(page)).xp).toBe(20);
    await list.getByRole('button', { name: 'Delete Call a friend' }).click();
    expect(dialogs).toContain('Delete this quest?');
    const s = await readState(page);
    expect(s.xp).toBe(0);
    expect(s.quests.some(q => q.name === 'Call a friend')).toBe(false);
  });
});

test.describe('subtasks', () => {
  test('steps persist, award no XP, and do not complete the quest', async ({ page }) => {
    await page.goto('/');
    const row = home(page).locator('.quest', { hasText: 'Read 20 minutes' });
    for (const step of ['Pick your book', 'Read 20 minutes', 'Note one takeaway']) {
      await row.getByRole('button', { name: 'Complete step: ' + step }).click();
    }
    await expect(row.getByText('3/3 steps')).toBeVisible();
    let s = await readState(page);
    expect(s.stepDone.read.sort()).toEqual([0, 1, 2]);
    expect(s).toMatchObject({ xp: 0, stars: 0, done: [] });

    await page.reload();
    await expect(home(page).locator('.quest', { hasText: 'Read 20 minutes' }).getByText('3/3 steps')).toBeVisible();
    await home(page).getByRole('button', { name: 'Undo step: Pick your book' }).click();
    s = await readState(page);
    expect(s.stepDone.read.sort()).toEqual([1, 2]);
  });
});

test.describe('day rollover', () => {
  test('a new day archives yesterday\'s count to history and clears done + steps without touching XP', async ({ page }) => {
    await seed(page, { ...legacyV1State('2026-10-25'), done: ['sleep', 'mit', 'park'], stepDone: { read: [0] } });
    await page.goto('/');
    const s = await readState(page);
    expect(s.date).toBe(TODAY);
    expect(s.done).toEqual([]);
    expect(s.stepDone).toEqual({});
    expect(s.history['2026-10-25']).toBe(3);
    expect(s.history['2026-10-20']).toBe(3);
    expect(s).toMatchObject({ xp: 1234, stars: 37, completed: 37 });
    await expect(page.locator('#todayCount')).toHaveText('0/11');
  });

  test('a skipped day with nothing completed writes no history entry and preserves earned stars', async ({ page }) => {
    await seed(page, { ...legacyV1State('2026-10-22'), done: [] });
    await page.goto('/');
    const s = await readState(page);
    expect(Object.keys(s.history).sort()).toEqual(['2026-10-20', '2026-10-21']);
    expect(s.stars).toBe(37);
  });

  test('streak counts consecutive days from history', async ({ page }) => {
    await seed(page, { ...legacyV1State(TODAY), done: ['sleep'], history: { '2026-10-25': 2, '2026-10-24': 1, '2026-10-22': 4 } });
    await page.goto('/');
    await expect(page.locator('#streak')).toHaveText('3 🔥');
  });

  test('a quest completed after midnight with the tab still open counts for the new day (was defect 4)', async ({ page }) => {
    // Page opened at 23:58, user taps a quest at 00:01 with the tab still open.
    await page.clock.setFixedTime(new Date('2026-10-26T23:58:00Z'));
    await page.goto('/');
    await page.clock.setFixedTime(new Date('2026-10-27T00:01:00Z'));
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    const s = await readState(page);
    // Expected: the completion counts for 2026-10-27.
    expect(s.date).toBe('2026-10-27');
    expect(s.done).toEqual(['sleep']);
    expect(s.history['2026-10-26']).toBeUndefined();
  });
});

test.describe('focus session reward', () => {
  test('tapping Focus Sprint does not award XP; it routes to Focus Mode', async ({ page, dialogs }) => {
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Focus Sprint' }).click();
    await expect(page.locator('#focus')).toHaveClass(/active/);
    expect(dialogs).toContain('Complete a focus session to earn this quest.');
    expect(await readRaw(page)).toBeNull();
  });

  test('a full timer awards Focus Sprint exactly once, even after a second full session', async ({ page }) => {
    await page.goto('/?destination=focus');
    await page.getByRole('button', { name: '▶ Start' }).click();
    await page.clock.fastForward(25 * 60 * 1000 + 2000);
    await expect(page.locator('#clock')).toHaveText('25:00');
    let s = await readState(page);
    expect(s).toMatchObject({ xp: 50, stars: 1, done: ['sprint'] });

    await page.getByRole('button', { name: '▶ Start' }).click();
    await page.clock.fastForward(25 * 60 * 1000 + 2000);
    s = await readState(page);
    expect(s).toMatchObject({ xp: 50, stars: 1, done: ['sprint'] });
  });

  test('pausing keeps remaining time and does not award early', async ({ page }) => {
    await page.goto('/?destination=focus');
    await page.getByRole('button', { name: '▶ Start' }).click();
    await page.clock.runFor(10 * 60 * 1000);
    await page.getByRole('button', { name: '⏸ Pause' }).click();
    await page.clock.runFor(60 * 60 * 1000);
    await expect(page.locator('#clock')).toHaveText('15:00');
    expect(await readRaw(page)).toBeNull();
  });
});

test.describe('backup and restore', () => {
  test('download backup contains the full saved state', async ({ page }) => {
    const legacy = legacyV1State(TODAY);
    await seed(page, legacy);
    await page.goto('/?destination=settings');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download Backup' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('level-up-backup.json');
    const body = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
    expect(body).toMatchObject({ xp: legacy.xp, stars: legacy.stars, done: legacy.done, history: legacy.history });
    expect(body.quests.find(q => q.id === 'custom-1700000000000')).toEqual(legacy.quests[5]);
  });

  test('restore replaces progress after confirmation and re-applies quest migrations', async ({ page, dialogs }) => {
    await page.goto('/?destination=settings');
    const backup = legacyV1State(TODAY);
    await page.locator('#restore').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect.poll(() => dialogs).toContain('Backup restored');
    const s = await readState(page);
    expect(s.xp).toBe(1234);
    expect(s.quests.map(q => q.id)).toEqual(expect.arrayContaining(['god', 'read', 'move', 'tidy', 'plan', 'custom-1700000000000']));
  });

  test('an invalid backup is rejected and current progress is untouched', async ({ page, dialogs }) => {
    await seed(page, legacyV1State(TODAY));
    await page.goto('/?destination=settings');
    const before = await readRaw(page);
    await page.locator('#restore').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"xp":"lots"}') });
    await expect.poll(() => dialogs).toContain('Invalid backup');
    expect(await readRaw(page)).toBe(before);
  });
});

test.describe('storage safety', () => {
  test('unreadable saved data is kept under a .corrupt key before anything is rebuilt (was defect 2)', async ({ page }) => {
    const corrupt = '{"xp":900,"quests":[{"id":"sleep"'; // e.g. truncated write
    await seed(page, corrupt);
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    // Expected: the original bytes are kept somewhere recoverable.
    const all = await page.evaluate(() => Object.values(localStorage));
    expect(all).toContain(corrupt);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter(k => k.startsWith(KEY + '.corrupt.'))).toHaveLength(1);
    await page.locator('nav').getByRole('button', { name: /Studio/ }).click();
    await expect(page.locator('#status')).toContainText('Recovered a damaged save');
  });

  test('a damaged save is copied only once, however often the page re-reads it', async ({ page }) => {
    await seed(page, '{"xp":900');
    await page.goto('/');
    for (let i = 0; i < 3; i++) await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.filter(k => k.includes('.corrupt.'))).toHaveLength(1);
  });

  test('a save missing "done" keeps XP, stars and history (was defect 3)', async ({ page }) => {
    const { done, ...noDone } = legacyV1State(TODAY);
    await seed(page, noDone);
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    const s = await readState(page);
    expect(s).toMatchObject({ xp: 1234 + 50, stars: 38, completed: 38, history: noDone.history, done: ['sleep'] });
    expect(s.quests.find(q => q.id === 'custom-1700000000000')).toBeTruthy();
    expect(await page.evaluate(() => Object.keys(localStorage).some(k => k.includes('.corrupt.')))).toBe(true);
  });

  test('a save missing "quests" keeps XP and rebuilds the default quests', async ({ page }) => {
    const { quests, ...noQuests } = legacyV1State(TODAY);
    await seed(page, noQuests);
    await page.goto('/');
    await expect(page.locator('#xp')).toHaveText('1234');
    await expect(home(page).locator('.quest')).toHaveCount(DEFAULT_IDS.length);
  });

  test('the saved format is still the plain legacy object (old code and backups can read it)', async ({ page }) => {
    await seed(page, legacyV1State(TODAY));
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Real break' }).click();
    const s = await readState(page);
    expect(Array.isArray(s.quests) && Array.isArray(s.done) && Number.isFinite(s.xp)).toBe(true);
    expect(Object.keys(s).sort()).toEqual(['best', 'completed', 'date', 'done', 'history', 'message', 'minutes', 'name', 'quests', 'stars', 'stepDone', 'xp']);
  });

  test('a stale dashboard tab does not overwrite XP earned in Ascension World (was defect 1)', async ({ page, context }) => {
    // Dashboard open in one tab; user earns XP in world.html in another tab
    // (or returns via a bfcache'd page on iPhone Safari), then acts on the dashboard.
    await page.goto('/');
    const world = await context.newPage();
    await world.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.abort());
    await world.goto('/world.html');
    await world.getByRole('button', { name: /QUESTS/ }).click();
    await world.locator('.roomQuest', { hasText: 'Sleep 7h+' }).getByRole('button', { name: 'Complete', exact: true }).click();
    await expect.poll(async () => (await readState(world)).xp).toBe(50);
    await world.close();

    // No visibilitychange/pageshow here: the tap itself must re-read storage.
    await home(page).getByRole('button', { name: 'Complete MIT done' }).click();
    // Expected: 50 (world) + 40 (dashboard).
    expect((await readState(page)).xp).toBe(90);
  });
});

test.describe('multiple tabs', () => {
  // Writing from inside `page` simulates another tab whose storage event never arrived
  // (frozen or bfcache'd pages on iPhone Safari): a document gets no storage event for its own writes.
  const writeBehindTheTabsBack = (page, patch) => page.evaluate(([k, p]) => {
    const s = JSON.parse(localStorage.getItem(k) || 'null');
    localStorage.setItem(k, JSON.stringify({ ...(s || {}), date: '2026-10-26', history: {}, ...p }));
  }, [KEY, patch]);

  test('a tap in a stale tab never undoes what another tab completed', async ({ page }) => {
    await page.goto('/');
    await writeBehindTheTabsBack(page, { xp: 1284, stars: 38, completed: 38, done: ['sleep'], quests: [{ id: 'sleep', emoji: '😴', name: 'Sleep 7h+', xp: 50 }] });
    // The tab still shows "Complete Sleep 7h+"; tapping it must not flip the quest back off.
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    expect(await readState(page)).toMatchObject({ xp: 1284, stars: 38, completed: 38, done: ['sleep'] });
    await expect(home(page).getByRole('button', { name: 'Undo Sleep 7h+' })).toBeVisible();
  });

  test('a stale subtask tap never unticks a step another tab ticked', async ({ page }) => {
    await page.goto('/');
    await writeBehindTheTabsBack(page, { xp: 300, done: [], stepDone: { read: [0] }, quests: [{ id: 'read', emoji: '📚', name: 'Read 20 minutes', xp: 30 }] });
    await home(page).getByRole('button', { name: 'Complete step: Pick your book' }).click();
    const s = await readState(page);
    expect(s.stepDone.read).toEqual([0]);
    expect(s.xp).toBe(300);
  });

  test('other tabs\' changes appear without a reload (storage event)', async ({ page, context }) => {
    await page.goto('/');
    const other = await context.newPage();
    await other.goto('/');
    await home(other).getByRole('button', { name: 'Complete MIT done' }).click();
    await expect(page.locator('#xp')).toHaveText('40');
  });

  test('a page restored from the back/forward cache re-reads storage', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(k => {
      const s = JSON.parse(localStorage.getItem(k) || 'null') || {};
      localStorage.setItem(k, JSON.stringify({ ...s, xp: 777, stars: 3, completed: 3, quests: [{ id: 'sleep', emoji: '😴', name: 'Sleep 7h+', xp: 50 }], done: [], date: '2026-10-26', history: {} }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    }, KEY);
    await expect(page.locator('#xp')).toHaveText('777');
  });

  test('a focus session finishing in a stale tab does not undo a Focus Sprint already earned elsewhere', async ({ page, context }) => {
    await page.goto('/?destination=focus');
    await page.getByRole('button', { name: '▶ Start' }).click();
    const other = await context.newPage();
    await other.goto('/');
    await other.evaluate(k => {
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      localStorage.setItem(k, JSON.stringify({ ...(s || {}), xp: 500, stars: 9, completed: 9, done: ['sprint'], date: '2026-10-26', history: {}, quests: [{ id: 'sprint', emoji: '🎯', name: 'Focus Sprint', xp: 50 }] }));
    }, KEY);
    await page.clock.fastForward(25 * 60 * 1000 + 2000);
    expect(await readState(page)).toMatchObject({ xp: 500, stars: 9, done: ['sprint'] });
  });
});

test.describe('accessibility smoke', () => {
  test('every quest control has an accessible name and the nav is keyboard operable', async ({ page }) => {
    await page.goto('/');
    const unnamed = await page.locator('#homeList button').evaluateAll(bs => bs.filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
    expect(unnamed).toBe(0);
    await page.locator('nav').getByRole('button', { name: /Journey/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#journey')).toHaveClass(/active/);
  });
});
