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
    const heads = await page.locator('.line thead th').allTextContents();
    expect(heads.slice(1, 4)).toEqual(['1', '2', '3']);
    expect(heads[heads.length - 1]).toBe('T');
    for (const h of heads.slice(4, -1)) expect(h).toMatch(/^(OT|SO|\dOT)$/);
    // box score: forwards, defense and goalies for both teams, trimmed to hockey columns
    await expect(page.locator('.tab')).toHaveText(['Box Score', 'Team Stats', 'Summary', 'Play-by-Play']);
    await expect(page.locator('.grp-title')).toHaveText(['Forwards', 'Defense', 'Goalies', 'Forwards', 'Defense', 'Goalies']);
    await expect(page.locator('.panel table').first().locator('thead th')).toHaveText(['Forwards', 'G', 'A', 'PTS', '+/-', 'S', 'HIT', 'BLK', 'PIM', 'FO%', 'TOI']);
    await page.locator('[data-tab="team"]').click();
    await expect(page.locator('.cmp').first()).toBeVisible();
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
    await expect(page.locator('.ptable thead th').nth(3)).toContainText('PTS');
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
