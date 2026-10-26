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

  test.fail('KNOWN DEFECT: a quest completed after midnight without a reload is credited to the previous day', async ({ page }) => {
    // Page opened at 23:58, user taps a quest at 00:01 with the tab still open.
    await page.clock.setFixedTime(new Date('2026-10-26T23:58:00Z'));
    await page.goto('/');
    await page.clock.setFixedTime(new Date('2026-10-27T00:01:00Z'));
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    const s = await readState(page);
    // Expected: the completion counts for 2026-10-27.
    expect(s.date).toBe('2026-10-27');
    expect(s.done).toEqual(['sleep']);
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
    expect(s.quests.map(q => q.id)).toEqual(expect.arrayContaining(['read', 'move', 'tidy', 'plan', 'custom-1700000000000']));
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
  test.fail('KNOWN DEFECT: unreadable saved data is silently replaced on the next action', async ({ page }) => {
    const corrupt = '{"xp":900,"quests":[{"id":"sleep"'; // e.g. truncated write
    await seed(page, corrupt);
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    // Expected: the original bytes are kept somewhere recoverable.
    const all = await page.evaluate(() => Object.values(localStorage));
    expect(all).toContain(corrupt);
  });

  test.fail('KNOWN DEFECT: a save missing "done" resets ALL progress (XP, history) on next action', async ({ page }) => {
    const { done, ...noDone } = legacyV1State(TODAY);
    await seed(page, noDone);
    await page.goto('/');
    await home(page).getByRole('button', { name: 'Complete Sleep 7h+' }).click();
    expect((await readState(page)).xp).toBeGreaterThanOrEqual(1234);
  });

  test.fail('KNOWN DEFECT: a stale dashboard tab overwrites XP earned in Ascension World', async ({ page, context }) => {
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

    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await home(page).getByRole('button', { name: 'Complete MIT done' }).click();
    // Expected: 50 (world) + 40 (dashboard).
    expect((await readState(page)).xp).toBe(90);
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
