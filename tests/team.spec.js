const { test, expect, ready } = require('./helpers');

const TEAMS = [
  { league: 'nba', name: 'Cleveland Cavaliers', leagueSize: 30 },
  { league: 'nfl', name: 'Cleveland Browns', leagueSize: 32 },
  { league: 'mlb', name: 'Cleveland Guardians', leagueSize: 30 },
];

for (const t of TEAMS) {
  test.describe(t.name, () => {
    test('schedule lists games and a result opens the game page', async ({ page }) => {
      await page.goto(`/#/t/${t.league}/5`);
      await ready(page, '.team-hero');
      await expect(page.locator('.team-hero')).toContainText(t.name);
      await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings', 'News']);
      // Offseason: the current season may have no results yet, so fall back to last season.
      if (!(await page.locator('.srow .wl').count())) {
        await page.selectOption('[data-season]', { index: 1 });
        await expect(page.locator('.srow .wl').first()).toBeVisible();
      }
      // long lists show 10 with a "Show all" button
      for (const list of await page.locator('.schedcols section').all()) {
        const total = Number(await list.locator('.count').textContent() || 0);
        expect(await list.locator('.srow').count()).toBe(Math.min(total, 10));
      }
      await page.locator('.srow', { has: page.locator('.wl') }).first().click();
      await expect(page).toHaveURL(new RegExp(`#/g/${t.league}/\\d+`));
      await ready(page, '.score-hero');
      // finished game: box score with player rows for both teams, plus team stats and play-by-play
      await expect(page.locator('.tab')).toHaveText(['Box Score', 'Team Stats', 'Summary', 'Play-by-Play']);
      expect(await page.locator('.panel .box').count()).toBeGreaterThanOrEqual(2);
      expect(await page.locator('.panel tbody tr').count()).toBeGreaterThan(10);
      await page.locator('[data-tab="team"]').click();
      await expect(page.locator('.cmp').first()).toBeVisible();
      await page.locator('[data-tab="plays"]').click();
      expect(await page.locator('.plays li').count()).toBeGreaterThan(10);
    });

    test('team stats: tiles, sortable player table', async ({ page }) => {
      await page.goto(`/#/t/${t.league}/5/stats`);
      await ready(page, '.ptable');
      expect(await page.locator('.tile').count()).toBeGreaterThanOrEqual(8);
      // click a numeric column: sorts descending, click again: ascending
      const header = page.locator('.ptable thead th').nth(2);
      const col = 2;
      const values = () => page.locator(`.ptable tbody tr td:nth-child(${col + 1})`).allTextContents()
        .then(v => v.map(x => parseFloat(x.replace(/,/g, ''))).filter(n => !isNaN(n)));
      await header.locator('button').click();
      let v = await values();
      if ((await header.getAttribute('aria-sort')) === 'ascending') await header.locator('button').click();
      v = await values();
      expect(v).toEqual([...v].sort((a, b) => b - a));
      await header.locator('button').click();
      v = await values();
      expect(v).toEqual([...v].sort((a, b) => a - b));
      // "show every stat" adds columns
      const before = await page.locator('.ptable thead th').count();
      await page.locator('[data-allcols]').check();
      expect(await page.locator('.ptable thead th').count()).toBeGreaterThan(before);
    });

    test('standings: own row highlighted, three views', async ({ page }) => {
      await page.goto(`/#/t/${t.league}/5/standings`);
      await ready(page, 'table.stand');
      await page.locator('[data-sview="division"]').click();
      await expect(page.locator('table.stand').first().locator('tr.me')).toHaveCount(1);
      await page.locator('[data-sview="conference"]').click();
      await expect(page.locator('table.stand tr.me')).toHaveCount(1);
      expect(await page.locator('table.stand tr.cut').count()).toBeGreaterThanOrEqual(2);
      await page.locator('[data-sview="league"]').click();
      await expect(page.locator('table.stand tbody tr')).toHaveCount(t.leagueSize);
      await page.locator('[data-sview="division"]').click();
    });
  });
}

test('NBA team stats: ratings with league ranks and a last-10 view', async ({ page }) => {
  await page.goto('/#/t/nba/5/stats');
  await ready(page, '.tile.ranked');
  await expect(page.locator('.tile.ranked .tl')).toContainText(['Offensive rating', 'Defensive rating', 'Net rating', 'Pace']);
  const ranks = await page.locator('.tile.ranked .rk').allTextContents();
  expect(ranks.length).toBe(12);
  for (const r of ranks) expect(r).toMatch(/^\d+(st|nd|rd|th)$/);
  await page.locator('[data-rmode="last10"]').click();
  await expect(page.locator('.ratehead + .tiles + .note')).toContainText(/Last \d+ games \(\d+–\d+\)/, { timeout: 60_000 });
  await page.locator('[data-rmode="season"]').click();
});

test('another team (Knicks) opens from a game page header', async ({ page }) => {
  await page.goto('/#/t/nba/18');
  await ready(page, '.team-hero');
  await expect(page.locator('.team-hero')).toContainText('New York Knicks');
});
