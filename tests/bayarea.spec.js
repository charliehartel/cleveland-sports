// The Bay Area view (?view=bayarea): its own teams, title and filter, and no Cleveland news.
const { test, expect, ready } = require('./helpers');

test('Bay Area view shows the Warriors, 49ers and Sharks, without the Cleveland news feed', async ({ page }) => {
  await page.goto('/?view=bayarea#/');
  await ready(page, '.quick');
  await expect(page).toHaveTitle('Bay Area Sports');
  await expect(page.locator('.brand')).toHaveText('Bay Area Sports');
  await expect(page.locator('.qteam')).toHaveText([/Warriors/, /49ers/, /Sharks/]);
  await expect(page.locator('#home-news')).toHaveCount(0);
  await expect(page.locator('.err')).toHaveCount(0);
  const cards = await page.locator('.card').count();
  if (cards) expect(await page.locator('.card .bay').count()).toBe(cards);
  // the Sharks link keeps the view and opens a hockey team page with no News tab
  await page.locator('.qteam', { hasText: 'Sharks' }).click();
  await expect(page).toHaveURL(/\?view=bayarea#\/t\/nhl\/18$/);
  await ready(page, '.team-hero');
  await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings']);
  await expect(page).toHaveTitle('San Jose Sharks · Bay Area Sports');
});

test('each view keeps its own team filter', async ({ page }) => {
  await page.goto('/?view=bayarea#/');
  await ready(page, '.chips');
  await page.locator('[data-filter="sharks"]').click();
  for (const lg of await page.locator('.card .lg').allTextContents()) expect(lg).toBe('NHL');
  await page.goto('/#/');
  await ready(page, '.chips');
  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#home-news')).toHaveCount(1);
});

test('the bayarea/ shortcut forwards to the Bay Area view', async ({ page }) => {
  await page.goto('/bayarea/index.html');
  await expect(page).toHaveURL(/\/\?view=bayarea$/);
  await ready(page, '.quick');
  await expect(page.locator('.qteam')).toHaveText([/Warriors/, /49ers/, /Sharks/]);
});
