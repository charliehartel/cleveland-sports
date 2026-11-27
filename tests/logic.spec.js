// Deterministic checks of the app's own calculations (no live data needed beyond loading the page).
const { test, expect } = require('./helpers');

test.beforeEach(async ({ page }) => {
  await page.route(/site\.api\.espn\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[]}' }));
  await page.goto('/#/');
  await page.waitForFunction(() => typeof bayArea === 'function');
});

test('Bay Area TV rules', async ({ page }) => {
  const r = await page.evaluate(() => {
    const cle = { abbr: 'CLE', short: 'Cavaliers' };
    const sunday1pmET = new Date('2026-12-06T18:00:00Z');
    const sundayNightET = new Date('2026-11-30T01:20:00Z');
    return {
      nbc: bayArea('nfl', sundayNightET, [{ name: 'NBC', market: 'national' }], cle, { abbr: 'LV' })?.label,
      regional: bayArea('nfl', sunday1pmET, [{ name: 'CBS', market: 'national' }], cle, { abbr: 'CIN' })?.label,
      niners: bayArea('nfl', sunday1pmET, [{ name: 'Fox', market: 'national' }], cle, { abbr: 'SF', short: '49ers' })?.label,
      rsn: bayArea('nba', new Date(), [{ name: 'DAZN CLE', market: 'home' }], cle, { abbr: 'MIA' }),
      warriors: bayArea('nba', new Date(), [{ name: 'DAZN CLE', market: 'away' }], { abbr: 'GS', short: 'Warriors' }, cle)?.label,
      prime: bayArea('nba', new Date(), [{ name: 'Prime Video', market: 'national' }], cle, { abbr: 'BOS' })?.label,
      pkgOnly: bayArea('mlb', new Date(), [{ name: 'MLB.TV', market: 'national' }], cle, { abbr: 'KC' }),
      nothing: bayArea('nba', new Date(), [], cle, { abbr: 'BOS' }),
    };
  });
  expect(r.nbc).toBe('KNTV 11 · NBC');
  expect(r.regional).toBe('Maybe · CBS regional');
  expect(r.niners).toBe('KTVU 2 · FOX');
  expect(r.rsn).toMatchObject({ lvl: 0, label: 'Not on Bay Area TV', sub: 'NBA League Pass' });
  expect(r.warriors).toBe('NBC Sports Bay Area');
  expect(r.prime).toBe('Prime Video');
  expect(r.pkgOnly).toBeNull();
  expect(r.nothing).toBeNull();
});

test('a regional Browns game is "not on Bay Area TV" when the 49ers have the same network and slot', async ({ page }) => {
  const label = await page.evaluate(async () => {
    sfCache['20261206'] = Promise.resolve({ events: [{ id: 'sf', date: '2026-12-06T18:00Z', competitions: [{ competitors: [{ team: { abbreviation: 'SF' } }], broadcasts: [{ market: 'national', names: ['CBS'] }] }] }] });
    const g = { id: 'cle', league: 'nfl', date: new Date('2026-12-06T18:00Z') };
    g.bay = bayArea('nfl', g.date, [{ name: 'CBS', market: 'national' }], { abbr: 'CLE' }, { abbr: 'CIN' });
    await refineBay([g]);
    return `${g.bay.label} / ${g.bay.sub}`;
  });
  expect(label).toBe('Not on Bay Area TV / KPIX 5 has the 49ers');
});

test('NBA rating formulas', async ({ page }) => {
  const m = await page.evaluate(() => nbaMetrics({ gp: 19, pts: 2230, pa: 2223, fga: 1692, fgm: 797, fta: 461, tpm: 278, tpa: 770, oreb: 214, tov: 256, ast: 506, reb: 858, astTo: 1.98 }));
  expect(m.ortg).toBeCloseTo(115.1, 1);
  expect(m.drtg).toBeCloseTo(114.8, 1);
  expect(m.ts).toBeCloseTo(58.8, 1);
  expect(m.efg).toBeCloseTo(55.3, 1);
});

test('NHL: Bay Area TV, period labels and points sorting', async ({ page }) => {
  const r = await page.evaluate(() => {
    const sj = { abbr: 'SJ', short: 'Sharks' };
    view.s = { header: { season: { type: 2 } } };
    const reg = [1, 3, 4, 5].map(nhlPerLabel);
    view.s = { header: { season: { type: 3 } } };
    const playoffs = [4, 5, 6].map(nhlPerLabel);
    view.s = null;
    const row = (id, w, l, otl, rw) => ({ team: { id }, stats: [['wins', w], ['losses', l], ['otLosses', otl], ['points', 2 * w + otl], ['gamesPlayed', w + l + otl], ['regWins', rw]].map(([name, value]) => ({ name, value })) });
    return {
      sharksHome: bayArea('nhl', new Date(), [{ name: 'ESPN+', market: 'national' }, { name: 'NBC Sports BA', market: 'home' }], sj, { abbr: 'VGK' })?.label,
      espnPlusOnly: bayArea('nhl', new Date(), [{ name: 'ESPN+', market: 'national' }, { name: 'NESN', market: 'home' }], { abbr: 'BOS', short: 'Bruins' }, { abbr: 'TOR' }),
      tnt: bayArea('nhl', new Date(), [{ name: 'TNT', market: 'national' }], { abbr: 'BOS' }, { abbr: 'TOR' })?.label,
      reg, playoffs,
      // equal points: fewer games played ranks first, then more regulation wins
      order: standRows([row('a', 10, 8, 2, 9), row('b', 11, 9, 0, 8), row('c', 10, 6, 2, 7), row('d', 10, 6, 2, 9)]).sort(byRecord).map(x => x.id),
    };
  });
  expect(r.sharksHome).toBe('NBC Sports Bay Area');
  expect(r.espnPlusOnly).toMatchObject({ lvl: 0, label: 'Not on Bay Area TV', sub: 'ESPN+' });
  expect(r.tnt).toBe('TNT');
  expect(r.reg).toEqual(['1', '3', 'OT', 'SO']);
  expect(r.playoffs).toEqual(['OT', '2OT', '3OT']);
  expect(r.order).toEqual(['d', 'c', 'a', 'b']);
});

// Guard check: an ESPN endpoint that doesn't allow web pages (the team-info endpoint that once
// broke team pages) must be reported in these tests, the same way a phone's browser blocks it.
const { test: plain, expect: plainExpect } = require('@playwright/test');
const { relay } = require('./helpers');
plain('ESPN endpoints without browser access are reported, as a phone would block them', async ({ page }) => {
  const problems = [];
  await relay(page, problems);
  await page.goto('/#/');
  await page.evaluate(async () => {
    await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/5/schedule?seasontype=2'); // allowed
    await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/5').catch(() => {});      // not allowed
  });
  plainExpect(problems).toEqual([expect.stringContaining('/basketball/nba/teams/5 (no Access-Control-Allow-Origin header)')]);
});
