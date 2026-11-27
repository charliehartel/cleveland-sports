const { test, expect, ready } = require('./helpers');

test('home screen shows team quick links, game sections and Bay Area TV badges', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.quick');
  await expect(page.locator('.qteam')).toHaveCount(3);
  await expect(page.locator('.qteam')).toHaveText([/Cavaliers/, /Browns/, /Guardians/]);
  for (const name of ['Today', 'Next 7 days']) await expect(page.locator('h2.sec', { hasText: name })).toBeVisible();
  // "Last 36 hours" has its own section unless both it and Today are empty, which show one line instead
  if (!(await page.locator('h2.sec', { hasText: 'Last 36 hours' }).count())) await expect(page.locator('.empty.slim')).toHaveText('No games today or in the last 36 hours.');
  await expect(page.locator('.err')).toHaveCount(0); // no "couldn't load" banners
  // every game card has a Bay Area TV badge
  const cards = await page.locator('.card').count();
  if (cards) expect(await page.locator('.card .bay').count()).toBe(cards);
});

test('quick link opens the team page', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.qteam');
  await page.locator('.qteam', { hasText: 'Browns' }).click();
  await expect(page).toHaveURL(/#\/t\/nfl\/5$/);
  await expect(page.locator('.team-hero')).toContainText('Cleveland Browns');
});

test('team filter shows only that team', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.chips');
  await page.locator('[data-filter="cavs"]').click();
  for (const lg of await page.locator('.card .lg').allTextContents()) expect(lg).toBe('NBA');
  await page.locator('[data-filter="all"]').click();
});

test('tapping a logo on a game card opens that team, not the game', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.chips');
  const logo = page.locator('.card .tlink').first();
  test.skip(!(await logo.count()), 'no games in the home screen windows right now');
  await logo.click();
  await expect(page).toHaveURL(/#\/t\/(nba|nfl|mlb)\/\d+/);
  await ready(page, '.team-hero');
});
