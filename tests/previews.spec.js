// Basketball and football previews: injury report with stats, leaders with league ranks, streaks, milestones.
const { test, expect, ready } = require('./helpers');

for (const [league, id, rankLeague] of [['nba', '9', 'NBA'], ['nfl', '25', 'NFL'], ['college-football', '24', 'FBS']]) {
  test(`${league} preview: leaders with league ranks and streaks`, async ({ page }) => {
    await page.goto(`/?view=bayarea#/t/${league}/${id}`);
    await ready(page, '.srow');
    const next = page.locator('.schedcols section').first().locator('.srow').first();
    test.skip(!(await next.count()), 'no upcoming games (offseason)');
    await next.click();
    await ready(page, '.score-hero');
    await expect(page.locator('.tab')).toHaveText(['Preview']);
    const box = title => page.locator('.panel .box', { has: page.locator('h3', { hasText: new RegExp('^' + title) }) });
    await expect(box('Season leaders').locator('.lrk').first()).toHaveText(new RegExp(`in ${rankLeague}$`), { timeout: 60_000 });
    await expect(box('Streaks')).not.toContainText('Checking recent games', { timeout: 60_000 });
    // injured players carry their season numbers (college teams don't publish injury reports)
    if (await box('Injury report').count()) await expect(box('Injury report')).toContainText(/on team in|No stats this season/, { timeout: 60_000 });
    if (league !== 'college-football') await expect(box('Milestones')).not.toContainText('Checking career totals', { timeout: 60_000 });
  });
}
