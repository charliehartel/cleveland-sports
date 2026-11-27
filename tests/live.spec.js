// Simulated live game: the summary changes between updates, then the feed drops and recovers.
const fs = require('fs');
const path = require('path');
const { test, expect, ready } = require('./helpers');

const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'nfl-live-summary.json'), 'utf8'));
const EVENT = base.header.id || '401873081';

test('live gamecast updates every few seconds, highlights new plays and shows status', async ({ page }) => {
  test.setTimeout(120_000);
  let polls = 0, failing = false;
  await page.route(/summary\?event=/, async route => {
    if (failing) return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'unavailable' });
    polls++;
    const s = JSON.parse(JSON.stringify(base));
    s.meta = { ...(s.meta || {}), lastUpdatedAt: new Date(Date.now() - 2000).toISOString() };
    if (polls >= 3) {
      const play = { id: '999000111', type: { text: 'Pass Reception' }, text: 'TEST PLAY: touchdown pass', awayScore: 10, homeScore: 26,
        period: { number: 3 }, clock: { displayValue: '12:11' }, scoringPlay: true, start: { downDistanceText: '2nd & 7 at CHI 25' }, team: { id: '8' } };
      s.drives.current.plays.push(play);
      const prev = s.drives.previous.find(d => d.id === s.drives.current.id);
      if (prev) prev.plays.push(play);
      const hc = s.header.competitions[0];
      hc.competitors.find(c => c.homeAway === 'home').score = '26';
      hc.status.displayClock = '12:11'; hc.status.period = 3; hc.status.type.shortDetail = '12:11 - 3rd';
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(s) });
  });

  await page.goto(`/#/g/nfl/${EVENT}`);
  await ready(page, '#livebar');
  await expect(page.locator('#livebar')).toContainText(/Live · Last updated .* \(\d+s ago\) · ESPN data as of/);
  await expect(page.locator('.hero-grid')).toContainText('26', { timeout: 20_000 }); // score changed by the 3rd update
  expect(polls).toBeLessThanOrEqual(4); // ~5s cadence, not faster
  await expect(page.locator('.plays li.new')).toContainText(['TEST PLAY: touchdown pass']);
  await page.locator('[data-tab="box"]').click();
  await page.locator('[data-tab="gamecast"]').click();
  await expect(page.locator('.plays li.new')).toHaveCount(0); // highlight only once
  failing = true;
  await expect(page.locator('#livebar')).toContainText('Updates delayed', { timeout: 20_000 });
  failing = false;
  await expect(page.locator('#livebar')).toContainText('Live · Last updated', { timeout: 40_000 });
});
