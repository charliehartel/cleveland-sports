// Hockey pages, using the San Jose Sharks (ESPN team 18) with live data.
const { test, expect, ready } = require('./helpers');

test.describe('San Jose Sharks (NHL)', () => {
  test('schedule shows a W-L-OTL record and a result opens a hockey game page', async ({ page }) => {
    await page.goto('/#/t/nhl/18');
    await ready(page, '.team-hero');
    await expect(page.locator('.team-hero')).toContainText('San Jose Sharks');
    // no News tab: news only covers teams on the home screen
    await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings']);
    if (!(await page.locator('.srow .wl').count())) {
      await page.selectOption('[data-season]', { index: 1 });
      await expect(page.locator('.srow .wl').first()).toBeVisible();
    }
    await expect(page.locator('.toolbar span.small')).toHaveText(/^\d+–\d+–\d+ in completed games$/);
    await page.locator('.srow', { has: page.locator('.wl') }).first().click();
    await expect(page).toHaveURL(/#\/g\/nhl\/\d+/);
    await ready(page, '.score-hero');
    // line score: three periods (plus OT/SO columns when needed) and a total
    const heads = await page.locator('.line').first().locator('thead th').allTextContents(); // the line score (the shots table follows it)
    expect(heads.slice(1, 4)).toEqual(['1', '2', '3']);
    expect(heads[heads.length - 1]).toBe('T');
    for (const h of heads.slice(4, -1)) expect(h).toMatch(/^(OT|SO|\dOT)$/);
    // box score: forwards, defense and goalies for both teams, trimmed to hockey columns
    await expect(page.locator('.tab')).toHaveText(['Box Score', 'Team Stats', 'Summary', 'Play-by-Play']);
    await expect(page.locator('.grp-title')).toHaveText(['Forwards', 'Defense', 'Goalies', 'Forwards', 'Defense', 'Goalies']);
    await expect(page.locator('.panel table').first().locator('thead th')).toHaveText(['Forwards', 'G', 'A', 'PTS', '+/-', 'S', 'HIT', 'BLK', 'PIM', 'FO%', 'TOI']);
    // header: each team's division rank; shots by period under the line score, totals matching the box score
    await expect(page.locator('.hteam').first()).toContainText(/\d+(st|nd|rd|th) in \w+/);
    await expect(page.locator('.line').nth(1).locator('thead th').first()).toHaveText('Shots');
    // lines worked out from faceoff lineups
    await expect(page.locator('.panel .box h3', { hasText: 'Lines tonight' })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.panel .box', { has: page.locator('h3', { hasText: 'Lines tonight' }) }).locator('.tagx', { hasText: 'L1' })).toHaveCount(2);
    await page.locator('[data-tab="team"]').click();
    await expect(page.locator('.cmp').first()).toBeVisible();
    await page.locator('[data-tab="summary"]').click();
    await expect(page.locator('.panel .box h3').first()).toContainText('In-game insights');
    await page.locator('[data-tab="plays"]').click();
    await expect(page.locator('.pchips .chip').nth(1)).toHaveText('1st');
    expect(await page.locator('.plays li').count()).toBeGreaterThan(30);
  });

  test('team stats: hockey tiles, skater and goalie tables', async ({ page }) => {
    await page.goto('/#/t/nhl/18/stats');
    await ready(page, '.ptable');
    expect(await page.locator('.tile').count()).toBeGreaterThanOrEqual(8);
    await expect(page.locator('.tile .tl').first()).toHaveText('Goals / game');
    await expect(page.locator('[data-cat]')).toHaveText(['Skaters', 'Goalies']);
    await expect(page.locator('.ptable thead th').nth(4)).toContainText('PTS'); // Player, GP, G, A, PTS
    await page.locator('[data-cat="goalkeeping"]').click();
    await expect(page.locator('.ptable thead')).toContainText('SV%');
  });

  test('standings: points columns, wild-card view, full league', async ({ page }) => {
    await page.goto('/#/t/nhl/18/standings');
    await ready(page, 'table.stand');
    await page.locator('[data-sview="division"]').click();
    const first = page.locator('table.stand').first();
    await expect(first.locator('tr.me')).toHaveCount(1);
    await expect(first.locator('thead')).toContainText('OTL');
    // ranked by points
    const pts = (await first.locator('tbody tr td:nth-child(6)').allTextContents()).map(Number);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    // wild card: per conference, each division's top 3 and then the wild-card race
    await page.locator('[data-sview="conference"]').click();
    await expect(page.locator('[data-sview="conference"]')).toHaveText('Wild card');
    await expect(page.locator('table.stand')).toHaveCount(6);
    await expect(page.locator('table.stand tr.me')).toHaveCount(1);
    await expect(page.locator('table.stand tr.cut')).toHaveCount(2);
    await page.locator('[data-sview="league"]').click();
    await expect(page.locator('table.stand tbody tr')).toHaveCount(32);
    await page.locator('[data-sview="division"]').click();
  });
});

test('hockey preview: goalies, out tonight, leaders with league ranks, streaks and season series', async ({ page }) => {
  await page.goto('/#/t/nhl/18');
  await ready(page, '.srow');
  const next = page.locator('.schedcols section').first().locator('.srow').first();
  test.skip(!(await next.count()), 'no upcoming Sharks games');
  await next.click();
  await ready(page, '.score-hero');
  await expect(page.locator('.tab')).toHaveText(['Preview']);
  const box = title => page.locator('.panel .box', { has: page.locator('h3', { hasText: new RegExp('^' + title) }) });
  await expect(page.locator('.panel .box h3')).toContainText(['Game info', 'Goalies', 'Out tonight', 'Season leaders', 'Streaks', 'Season series']);
  // goalies with season numbers, and each one's last start once game logs load
  await expect(box('Goalies').locator('.pvl li').first()).toContainText(/GP · \d+-\d+-\d+ · /);
  await expect(box('Goalies')).toContainText(/Last start|No starts this season/);
  // league ranks for the leaders, and the streak check finishes
  await expect(box('Season leaders').locator('.lrk').first()).toHaveText(/in NHL$/);
  await expect(box('Streaks')).not.toContainText('Checking recent games');
  // career milestones: a list, or a clear "none" once career totals are in
  await expect(box('Milestones within reach')).not.toContainText('Checking career totals', { timeout: 60_000 });
  // this game is marked in the season series
  await expect(box('Season series')).toContainText('This game');
});
