// Views: Cleveland (default) and Bay Area (?view=bayarea), chosen from the header title.
const { test, expect, ready } = require('./helpers');

const BAY = ['Warriors', '49ers', 'Giants', 'Sharks', 'Athletics', 'Raiders', 'Valkyries', 'Stanford'];

test('Bay Area view shows its six teams and its own title', async ({ page }) => {
  await page.goto('/?view=bayarea#/');
  await ready(page, '.quick');
  await expect(page).toHaveTitle('My Sports · Bay Area');
  await expect(page.locator('#view')).toHaveValue('bayarea');
  await expect(page.locator('.qteam .qname')).toHaveText(BAY);
  await expect(page.locator('[data-filter]')).toHaveCount(BAY.length + 1);
  await expect(page.locator('#home-news')).toHaveCount(1);
  await expect(page.locator('.err')).toHaveCount(0);
  const cards = await page.locator('.card').count();
  if (cards) expect(await page.locator('.card .bay').count()).toBe(cards);
  // the Sharks link keeps the view and opens a hockey team page with a News tab
  await page.locator('.qteam', { hasText: 'Sharks' }).click();
  await expect(page).toHaveURL(/\?view=bayarea#\/t\/nhl\/18$/);
  await ready(page, '.team-hero');
  await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings', 'News']);
  await expect(page).toHaveTitle('San Jose Sharks · My Sports');
});

test('the header title switches views', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.qteam');
  await expect(page.locator('#view')).toHaveValue('cleveland');
  await expect(page.locator('#view option')).toHaveText(['Cleveland', 'Bay Area', 'NYC Cool', 'NYC Lame']);
  await page.selectOption('#view', 'bayarea');
  await expect(page).toHaveURL(/\?view=bayarea#\/$/);
  await ready(page, '.qteam');
  await expect(page.locator('.qteam .qname')).toHaveText(BAY);
  // from a team page too, back to Cleveland's home
  await page.locator('.qteam', { hasText: 'Giants' }).click();
  await ready(page, '.team-hero');
  await page.selectOption('#view', 'cleveland');
  await expect(page).toHaveURL(/\/#\/$/);
  await ready(page, '.qteam');
  await expect(page.locator('.qteam .qname')).toHaveText(['Cavaliers', 'Browns', 'Guardians']);
  await expect(page).toHaveTitle('My Sports · Cleveland');
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
  await expect(page.locator('.qteam .qname')).toHaveText(BAY);
});

test('news in each view covers only that view\'s teams', async ({ page }) => {
  const now = Date.now();
  const item = (team, title) => ({ team, source: 'espn', sourceName: 'ESPN', title, url: `https://example.org/${team}`, published: new Date(now - 60e3).toISOString(), summary: '', image: '' });
  const body = JSON.stringify({ updated: new Date(now).toISOString(), sources: [], items: [item('browns', 'Browns story'), item('giants', 'Giants story'), item('raiders', 'Raiders story')] });
  await page.route(/raw\.githubusercontent\.com\/.*news\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }));
  await page.goto('/?view=bayarea#/');
  await ready(page, '.latest');
  await expect(page.locator('.latest .ltitle')).toHaveText(['Giants story', 'Raiders story']);
  await page.goto('/#/');
  await ready(page, '.latest');
  await expect(page.locator('.latest .ltitle')).toHaveText(['Browns story']);
});

test('box score lists my team first, even when it is the home team', async ({ page }) => {
  await page.goto('/?view=bayarea#/t/nhl/18');
  await ready(page, '.srow');
  if (!(await page.locator('.srow .wl').count())) await page.selectOption('[data-season]', { index: 1 });
  // a finished home game ("vs"), where the Sharks would otherwise be listed second
  await page.locator('.srow').filter({ has: page.locator('.wl') }).filter({ has: page.locator('.vs', { hasText: /^vs$/ }) }).first().click();
  await ready(page, '.score-hero');
  await expect(page.locator('.panel .box .teamhead').first()).toContainText('San Jose Sharks');
});

test('NYC Cool and NYC Lame groups', async ({ page }) => {
  await page.goto('/#/');
  await ready(page, '.qteam');
  await page.selectOption('#view', 'nyccool');
  await expect(page).toHaveURL(/\?view=nyccool#\/$/);
  await ready(page, '.qteam');
  await expect(page).toHaveTitle('My Sports · NYC Cool');
  await expect(page.locator('.qteam .qname')).toHaveText(['Mets', 'Giants', 'Knicks']);
  // the football Giants, not San Francisco's baseball Giants
  await page.locator('.qteam', { hasText: 'Giants' }).click();
  await ready(page, '.team-hero');
  await expect(page.locator('.team-hero')).toContainText('New York Giants');
  await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings', 'News']);
  await page.selectOption('#view', 'nyclame');
  await expect(page).toHaveURL(/\?view=nyclame#\/$/);
  await ready(page, '.qteam');
  await expect(page.locator('.qteam .qname')).toHaveText(['Yankees', 'Jets', 'Knicks']);
  await expect(page.locator('#view')).toHaveValue('nyclame');
});

test('Valkyries (WNBA) and Stanford (college football) team pages', async ({ page }) => {
  for (const [path, name] of [['/?view=bayarea#/t/wnba/129689', 'Golden State Valkyries'], ['/?view=bayarea#/t/college-football/24', 'Stanford Cardinal']]) {
    await page.goto(path);
    await ready(page, '.team-hero');
    await expect(page.locator('.team-hero')).toContainText(name);
    if (!(await page.locator('.srow .wl').count())) await page.selectOption('[data-season]', { index: 1 });
    await expect(page.locator('.srow .wl').first()).toBeVisible();
    // standings: conference tables (no divisions in either league), own row highlighted
    await page.locator('.tab', { hasText: 'Standings' }).click();
    await ready(page, 'table.stand');
    await expect(page.locator('table.stand tr.me')).toHaveCount(1);
    await expect(page.locator('[data-sview="division"]')).toHaveText('Conference');
    // a finished game opens with a box score
    await page.locator('.tab', { hasText: 'Schedule' }).click();
    await ready(page, '.srow');
    await page.locator('.srow', { has: page.locator('.wl') }).first().click();
    await ready(page, '.score-hero');
    expect(await page.locator('.panel tbody tr').count()).toBeGreaterThan(10);
  }
  // league labels on the home screen links
  await page.goto('/?view=bayarea#/');
  await ready(page, '.qteam');
  await expect(page.locator('.qteam', { hasText: 'Stanford' }).locator('.qlg')).toHaveText('NCAAF');
  await expect(page.locator('.qteam', { hasText: 'Valkyries' }).locator('.qlg')).toHaveText('WNBA');
});
