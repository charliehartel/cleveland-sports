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

test('NHL penalties: power play, matching penalties and a power-play goal', async ({ page }) => {
  const r = await page.evaluate(() => {
    const pen = (id, team, per, clock, min, kind = 'Minor') => ({ id, team: { id: team }, period: { number: per }, clock: { displayValue: clock }, type: { text: 'Tripping', penaltyMinutes: String(min), penaltyType: kind }, participants: [{ athlete: { displayName: 'P' + id } }], text: 'P' + id + ' Tripping' });
    const goal = (id, team, per, clock) => ({ id, team: { id: team }, period: { number: per }, clock: { displayValue: clock }, type: { text: 'Goal' }, scoringPlay: true });
    const g = (plays, period, left) => ({ league: 'nhl', state: 'in', s: { plays, header: { season: { type: 2 } } }, comp: { status: { period, displayClock: left } },
      away: { team: { id: '18', abbreviation: 'SJ', displayName: 'San Jose Sharks' } }, home: { team: { id: '37', abbreviation: 'VGK', displayName: 'Vegas Golden Knights' } } });
    view.s = { header: { season: { type: 2 } } };
    // VGK minor at 5:00 of the 1st; at 6:00 elapsed (14:00 left) SJ has a 5-on-4 with 1:00 left
    const a = nhlPowerPlay(g([pen(1, '37', 1, '5:00', 2)], 1, '14:00'));
    // matching minors at the same moment: no power play, both in the box
    const b = g([pen(1, '37', 1, '5:00', 2), pen(2, '18', 1, '5:00', 2)], 1, '14:30');
    const bState = nhlPenaltyState(b);
    // SJ scores on the power play at 5:40: the minor ends, so at 6:00 it's even strength
    const c = nhlPowerPlay(g([pen(1, '37', 1, '5:00', 2), goal(9, '18', 1, '5:40')], 1, '14:00'));
    // a major doesn't end on a goal
    const d = nhlPowerPlay(g([pen(1, '37', 1, '5:00', 5, 'Major'), goal(9, '18', 1, '5:40')], 1, '14:00'));
    view.s = null;
    return { a: a && { pp: a.pp.abbr, strength: a.strength, left: Math.round(a.left * 60) }, b: nhlPowerPlay(b), inBox: bState.inBox.length, c, d: d && d.pp.abbr };
  });
  expect(r.a).toEqual({ pp: 'SJ', strength: '5-on-4', left: 60 });
  expect(r.b).toBeNull();
  expect(r.inBox).toBe(2);
  expect(r.c).toBeNull();
  expect(r.d).toBe('SJ');
});

test('NHL empty net: a team on the ice without a goalie', async ({ page }) => {
  const r = await page.evaluate(() => {
    const g = { league: 'nhl', state: 'in', away: { team: { id: '18', abbreviation: 'SJ' } }, home: { team: { id: '37', abbreviation: 'VGK' } }, s: {
      boxscore: { players: [{ team: { id: '18' }, statistics: [{ name: 'goalies', athletes: [{ athlete: { id: 'g1' } }] }] }, { team: { id: '37' }, statistics: [{ name: 'goalies', athletes: [{ athlete: { id: 'g2' } }] }] }] },
      onIce: [{ teamId: '18', entries: ['a', 'b', 'c', 'd', 'e', 'g1'].map(athleteid => ({ athleteid })) }, { teamId: '37', entries: ['f', 'h', 'i', 'j', 'k', 'l'].map(athleteid => ({ athleteid })) }] } };
    return nhlEmptyNets(g).map(t => t.abbr);
  });
  expect(r).toEqual(['VGK']);
});

test('NHL three stars render from ESPN featured athletes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ath = (id, name) => ({ id, displayName: name });
    const g = { league: 'nhl', state: 'post', s: { boxscore: { players: [] } }, byId: () => null,
      comp: { status: { featuredAthletes: [{ name: 'firstStar', athlete: ath('1', 'A One'), team: { id: '18' } }, { name: 'secondStar', athlete: ath('2', 'B Two'), team: { id: '37' } },
        { name: 'thirdStar', athlete: ath('3', 'C Three'), team: { id: '18' } }, { name: 'winningGoalie', athlete: ath('4', 'D Four') }] } } };
    const el = document.createElement('div'); el.innerHTML = nhlThreeStars(g);
    return { names: [...el.querySelectorAll('.nm')].map(e => e.textContent), note: el.querySelector('.note')?.textContent, map: Object.values(nhlStarMap(g)).map(x => x.n) };
  });
  expect(r.names).toEqual(['A One', 'B Two', 'C Three']);
  expect(r.note).toBe('Win: D Four');
  expect(r.map).toEqual([1, 2, 3]);
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
