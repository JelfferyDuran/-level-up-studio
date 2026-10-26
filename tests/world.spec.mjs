// Regression tests for Ascension World (world.html). The Three.js CDN is always
// blocked by the fixture, so these exercise the 2D fallback path that must work
// without WebGL. They characterize CURRENT behavior on main.
import { test, expect, seed, readState, readRaw, legacyV1State, dateKey, HYBRID_BACKUP_KEY } from './fixtures.mjs';

const NOW = new Date('2026-10-26T15:00:00Z');
const TODAY = dateKey(NOW);

/** Tap on touch projects (iphone-viewport), click elsewhere. */
async function press(locator, hasTouch) {
  if (hasTouch) await locator.tap(); else await locator.click();
}
async function openWorld(page) {
  await page.goto('/world.html');
  await page.clock.fastForward(9500); // 3D never answers -> 2D fallback timer fires
  await expect(page.locator('#status')).toContainText('2D MODE');
}
const portal = (page, name) => page.locator('.portalGuide').getByRole('button', { name: new RegExp(name) });
const questRow = (page, name) => page.locator('.roomQuest', { hasText: name });
const completeBtn = row => row.getByRole('button', { name: 'Complete', exact: true });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
});

test.describe('2D fallback', () => {
  test('without Three.js the world switches to 2D mode, hides orbit controls and keeps destinations usable', async ({ page, hasTouch, external }) => {
    await openWorld(page);
    await expect(page.locator('#orbitControls')).toBeHidden();
    await expect(page.locator('#toast')).toContainText('3D island unavailable');
    for (const [name, title] of [['FOCUS', 'FOCUS CHAMBER'], ['QUESTS', 'QUEST GARDENS'], ['VAULT', 'ACHIEVEMENT VAULT']]) {
      await press(portal(page, name), hasTouch);
      await expect(page.locator('#room')).toBeVisible();
      await expect(page.locator('#roomTitle')).toHaveText(title);
      await press(page.getByRole('button', { name: '← Return to Island' }), hasTouch);
      await expect(page.locator('#room')).toBeHidden();
    }
    // The only external request is the pinned Three.js module (blocked here).
    expect(external.every(u => u.startsWith('https://cdn.jsdelivr.net/npm/three@0.170.0/'))).toBe(true);
  });

  test('destinations are keyboard operable and the room is an accessible dialog', async ({ page }) => {
    await openWorld(page);
    await portal(page, 'QUESTS').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'QUEST GARDENS' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: '← Return to Island' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
  });
});

test.describe('quests in the world share dashboard progress', () => {
  test('legacy save: progress is preserved, new quests are appended, and a pre-hybrid backup is kept', async ({ page, hasTouch }) => {
    const legacy = legacyV1State(TODAY);
    await seed(page, legacy);
    await openWorld(page);
    const original = await readRaw(page);
    await expect(page.locator('#status')).toContainText('1234 XP');
    await press(portal(page, 'QUESTS'), hasTouch);
    await expect(questRow(page, 'Practice guitar')).toBeVisible();
    await press(completeBtn(questRow(page, 'Real break')), hasTouch);
    await expect(questRow(page, 'Real break').getByRole('button', { name: '✓ Done' })).toBeVisible();

    const s = await readState(page);
    expect(s).toMatchObject({ xp: 1264, stars: 38, completed: 38, history: legacy.history });
    expect(s.done).toEqual(['sleep', 'mit', 'break']);
    expect(s.quests.map(q => q.id)).toEqual(expect.arrayContaining([...legacy.quests.map(q => q.id), 'read', 'move', 'tidy', 'plan']));
    expect(s.quests.find(q => q.id === 'custom-1700000000000')).toEqual(legacy.quests[5]);
    // First world write snapshots the save as it was before that write.
    const snapshot = JSON.parse(await readRaw(page, HYBRID_BACKUP_KEY));
    expect(snapshot.xp).toBe(1234);
    expect(original).not.toBeNull();
  });

  test.fail('KNOWN DEFECT: a legacy save opened in the world first never gets "Time Alone with God"', async ({ page, hasTouch }) => {
    // safeRefresh() reloads the stored save and migrateQuests() only adds read/move/tidy/plan;
    // the 'god' migration runs once at load on the pre-refresh object and is discarded.
    await seed(page, legacyV1State(TODAY));
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    await expect(questRow(page, 'Time Alone with God')).toBeVisible({ timeout: 1000 });
  });

  test('XP earned in the world is shown on the dashboard', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    await press(completeBtn(questRow(page, 'Move 20 minutes')), hasTouch);
    await press(page.getByRole('button', { name: '← Return to Island' }), hasTouch);
    await page.getByRole('link', { name: '← Dashboard' }).click();
    await expect(page.locator('#xp')).toHaveText('40');
    await expect(page.locator('#homeList').getByRole('button', { name: 'Undo Move 20 minutes' })).toBeVisible();
  });

  test('undo in the world is symmetric', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    await press(completeBtn(questRow(page, 'Plan tomorrow')), hasTouch);
    await press(questRow(page, 'Plan tomorrow').getByRole('button', { name: '✓ Done' }), hasTouch);
    expect(await readState(page)).toMatchObject({ xp: 0, stars: 0, completed: 0, done: [] });
  });

  test('subtasks persist and award no XP', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    await press(page.getByRole('button', { name: 'Complete step: Begin with gratitude' }), hasTouch);
    await expect(page.getByRole('button', { name: 'Undo step: Begin with gratitude' })).toBeVisible();
    const s = await readState(page);
    expect(s.stepDone.god).toEqual([0]);
    expect(s).toMatchObject({ xp: 0, done: [] });
  });

  test('a new day archives yesterday and clears completions without touching XP', async ({ page, hasTouch }) => {
    await seed(page, { ...legacyV1State('2026-10-25'), done: ['sleep', 'park'], stepDone: { god: [1] } });
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    const s = await readState(page);
    expect(s).toMatchObject({ date: TODAY, done: [], stepDone: {}, xp: 1234, stars: 37 });
    expect(s.history['2026-10-25']).toBe(2);
  });

  test('a failed save rolls back in-memory progress and tells the user', async ({ page, dialogs, hasTouch }) => {
    await seed(page, legacyV1State(TODAY));
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    const before = await readRaw(page);
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    await press(completeBtn(questRow(page, 'Real break')), hasTouch);
    expect(dialogs).toContain('Progress could not be saved. Your previous data was preserved.');
    await expect(page.locator('#status')).toContainText('1234 XP');
    expect(await readRaw(page)).toBe(before);
  });
});

test.describe('focus chamber', () => {
  test('Focus Sprint cannot be completed by tapping; it opens the Focus Chamber', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'QUESTS'), hasTouch);
    await press(completeBtn(questRow(page, 'Focus Sprint')), hasTouch);
    await expect(page.locator('#roomTitle')).toHaveText('FOCUS CHAMBER');
    // Note: opening a room already persists a normalized save (date, defaults); no XP is awarded.
    expect(await readState(page)).toMatchObject({ xp: 0, stars: 0, done: [] });
  });

  test('a full session awards Focus Sprint exactly once, even after reset and a second session', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'FOCUS'), hasTouch);
    await press(page.getByRole('button', { name: '▶ Start' }), hasTouch);
    await page.clock.fastForward(25 * 60 * 1000 + 1000);
    await expect(page.getByText('Session finished — Focus Sprint credited')).toBeVisible();
    expect(await readState(page)).toMatchObject({ xp: 50, stars: 1, done: ['sprint'] });

    await press(page.getByRole('button', { name: '↺ Reset' }), hasTouch);
    await press(page.getByRole('button', { name: '▶ Start' }), hasTouch);
    await page.clock.fastForward(25 * 60 * 1000 + 1000);
    expect(await readState(page)).toMatchObject({ xp: 50, stars: 1, done: ['sprint'] });
  });

  test('pausing keeps remaining time and does not award early', async ({ page, hasTouch }) => {
    await openWorld(page);
    await press(portal(page, 'FOCUS'), hasTouch);
    await press(page.getByRole('button', { name: '▶ Start' }), hasTouch);
    await page.clock.fastForward(5 * 60 * 1000);
    await press(page.getByRole('button', { name: '⏸ Pause' }), hasTouch);
    await page.clock.fastForward(60 * 60 * 1000);
    await expect(page.locator('.roomClock')).toHaveText('20:00');
    expect(await readState(page)).toMatchObject({ xp: 0, stars: 0, done: [] });
  });
});
