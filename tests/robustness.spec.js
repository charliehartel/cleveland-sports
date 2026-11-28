// How the app behaves when ESPN data is unusual: shared games, failures, hung requests. All ESPN data here is simulated.
const fs = require('fs');
const path = require('path');
const { test, expect, ready, withPairView } = require('./helpers');

const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const noNews = page => page.route(/raw\.githubusercontent\.com\/.*news\.json/, r => r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'Not Found' }));

// Giants at Athletics in two days, as both teams' schedules list it
const shared = () => ({ id: '401999001', date: new Date(Date.now() + 2 * 864e5).toISOString(), competitions: [{ status: { type: { state: 'pre' } }, broadcasts: [], competitors: [
  { homeAway: 'home', team: { id: '11', abbreviation: 'ATH', displayName: 'Athletics', shortDisplayName: 'Athletics' } },
  { homeAway: 'away', team: { id: '26', abbreviation: 'SF', displayName: 'San Francisco Giants', shortDisplayName: 'Giants' } }] }] });

test('two teams in one league: their game is one card, under both filters, from one scoreboard request', async ({ page }) => {
  let mlbBoards = 0;
  await withPairView(page);
  await noNews(page);
  await page.route(/site\.api\.espn\.com/, r => {
    const u = r.request().url();
    if (/baseball\/mlb\/teams\/(sf|ath)\/schedule\?seasontype=2/.test(u)) return json(r, { events: [shared()] });
    if (/baseball\/mlb\/scoreboard$/.test(u)) mlbBoards++;
    return json(r, { events: [] });
  });
  await page.goto('/?view=pair#/');
  await ready(page, '.card');
  await expect(page.locator('.card')).toHaveCount(1);
  expect(mlbBoards).toBe(1);
  for (const team of ['athletics', 'giants']) {
    await page.locator(`[data-filter="${team}"]`).click();
    await expect(page.locator('.card')).toHaveCount(1);
  }
  await page.locator('[data-filter="all"]').click();
});

test('home: one team failing shows a retry note for it; everything failing shows the offline message', async ({ page }) => {
  let down = /basketball\/nba\//;
  await noNews(page);
  await page.route(/site\.api\.espn\.com/, r => down.test(r.request().url()) ? json(r, { error: 'down' }, 503) : json(r, { events: [] }));
  await page.goto('/#/');
  await ready(page, '.err');
  await expect(page.locator('.err')).toHaveText([/Couldn't load the Cavaliers schedule\. Retrying automatically\./]);
  down = /./;
  await page.reload();
  await expect(page.locator('.err')).toHaveText([/Can't reach ESPN for scores/]);
});

test('live game: a request that never answers times out, shows "Updates delayed", and updates resume', async ({ page }) => {
  test.setTimeout(120_000);
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-live-summary.json'), 'utf8'));
  const EVENT = base.header.id || '401873081';
  let polls = 0;
  await page.route(/football\/nfl\/scoreboard/, r => json(r, { events: [] }));
  await page.route(/summary\?event=/, r => {
    polls++;
    if (polls === 2) return; // hangs: never answered
    const s = JSON.parse(JSON.stringify(base));
    s.meta = { ...(s.meta || {}), lastUpdatedAt: new Date().toISOString() };
    return json(r, s);
  });
  await page.goto(`/#/g/nfl/${EVENT}`);
  await ready(page, '#livebar');
  await expect(page.locator('#livebar')).toContainText('Live · Last updated');
  await expect(page.locator('#livebar')).toContainText('Updates delayed', { timeout: 25_000 }); // after the 15s time limit, not the 30s staleness check
  await expect(page.locator('#livebar')).toContainText('Live · Last updated', { timeout: 30_000 });
  expect(polls).toBeGreaterThanOrEqual(3);
});

test('"Latest from each team" uses college logos for Stanford', async ({ page }) => {
  const now = Date.now();
  const item = (team, title) => ({ team, source: 'espn', sourceName: 'ESPN', title, url: `https://example.org/${team}`, published: new Date(now - 60e3).toISOString(), summary: '', image: '' });
  const body = JSON.stringify({ updated: new Date(now).toISOString(), sources: [], items: [item('stanford', 'Stanford story'), item('warriors', 'Warriors story')] });
  await page.route(/raw\.githubusercontent\.com\/.*news\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body }));
  await page.route(/site\.api\.espn\.com/, r => json(r, { events: [] }));
  await page.goto('/?view=bayarea#/');
  await ready(page, '.latest');
  const src = t => page.locator('.lrow', { hasText: t }).locator('.llogo').getAttribute('src');
  expect(await src('Stanford story')).toBe('https://a.espncdn.com/i/teamlogos/ncaa/500/24.png');
  expect(await src('Warriors story')).toBe('https://a.espncdn.com/i/teamlogos/nba/500/gs.png');
});
