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

test('football scoring tags and hockey goal tags', async ({ page }) => {
  const r = await page.evaluate(() => {
    const tag = (league, p) => { const el = document.createElement('div'); el.innerHTML = fbScoreTag({ league }, p) + nhlGoalTag({ league }, p); return el.textContent; };
    return {
      td: tag('nfl', { scoringType: { name: 'touchdown' } }), fg: tag('college-football', { scoringType: { name: 'field-goal' } }), safety: tag('nfl', { scoringType: { name: 'safety' } }),
      nbaNone: tag('nba', { scoringType: { name: 'touchdown' } }),
      pp: tag('nhl', { scoringPlay: true, strength: { abbreviation: 'power-play' } }), sh: tag('nhl', { scoringPlay: true, strength: { abbreviation: 'short-handed' } }),
      en: tag('nhl', { scoringPlay: true, strength: { abbreviation: 'empty-net' } }), even: tag('nhl', { scoringPlay: true, strength: { abbreviation: 'even-strength' } }),
    };
  });
  expect(r).toEqual({ td: 'TD', fg: 'FG', safety: 'Safety', nbaNone: '', pp: 'Power-play goal', sh: 'Shorthanded goal', en: 'Empty-net goal', even: '' });
});

test('preview streaks: games he sat out are skipped and a miss ends the streak', async ({ page }) => {
  const r = await page.evaluate(() => {
    const log = st => ({ st, date: new Date() });
    view.px = { logs: {
      b1: [log({ minutes: '34', points: '25' }), log({ minutes: '0', points: '0' }), log({ minutes: '30', points: '22' }), log({ minutes: '31', points: '21' }), log({ minutes: '29', points: '10' }), log({ minutes: '33', points: '30' })],
      q1: [log({ passingYards: '320', passingTouchdowns: '1', interceptions: '1' }), log({ passingYards: '305', passingTouchdowns: '0', interceptions: '1' }), log({ passingYards: '250', passingTouchdowns: '3', interceptions: '1' }), log({ passingYards: '400', interceptions: '0' })],
    } };
    const p = (id, vals) => ({ id, vals: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { value: v }])) });
    const out = {
      ball: pxStreaksFor({ league: 'nba' }, { p: p('b1', { avgPoints: 22 }), role: 'ball', rank: 1 }),
      qb: pxStreaksFor({ league: 'nfl' }, { p: p('q1', {}), role: 'qb', rank: 1 }),
    };
    view.px = null;
    return out;
  });
  expect(r.ball.map(x => x.text)).toEqual(['20+ points in 3 straight games']);
  expect(r.qb).toEqual([{ hot: true, text: '300+ passing yards in 2 straight games' }, { hot: false, text: 'an interception in 3 straight games' }]);
});

test('preview milestones: skips out players and negative paces, counts this game, singular units', async ({ page }) => {
  const texts = await page.evaluate(() => {
    const p = (id, name, vals) => ({ id, name, pos: 'QB', vals: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { value: v }])) });
    view.px = { playersDone: true, careerDone: true, logs: {},
      players: {
        '25': { passing: [p('q1', 'Starter', { passingYards: 3000, passingTouchdowns: 20, gamesPlayed: 10 }), p('q2', 'Hurt QB', { passingYards: 3500, passingTouchdowns: 25, gamesPlayed: 10 })],
                rushing: [p('q1', 'Starter', { rushingYards: -20, gamesPlayed: 10 })] },
        '13': {} },
      career: { q1: { passingYards: 19800, passingTouchdowns: 99, rushingYards: 990, gamesPlayed: 49 }, q2: { passingYards: 29900, gamesPlayed: 99 } } };
    const g = { league: 'nfl', s: { injuries: [{ team: { id: '25' }, injuries: [{ status: 'Out', athlete: { id: 'q2' } }] }] },
      away: { team: { id: '25', abbreviation: 'SF' } }, home: { team: { id: '13', abbreviation: 'LV' } } };
    const el = document.createElement('div'); el.innerHTML = pxMilestones(g);
    view.px = null;
    return [...el.querySelectorAll('.meta')].map(e => e.textContent);
  });
  expect(texts).toEqual([
    'This would be his 50th career game',
    "200 passing yards from 20,000 career passing yards · about 1 game at this season's pace",
    "1 TD pass from 100 career TD passes · about 1 game at this season's pace",
  ]);
});

test('a game between two of my teams shows once and under both team filters', async ({ page }) => {
  const r = await page.evaluate(() => {
    const ev = id => ({ id, date: new Date(Date.now() + 2 * 864e5).toISOString(), competitions: [{ status: { type: { state: 'pre' } }, competitors: [
      { homeAway: 'home', team: { id: '11', abbreviation: 'ATH', displayName: 'Athletics' } }, { homeAway: 'away', team: { id: '26', abbreviation: 'SF', displayName: 'San Francisco Giants' } }] }] });
    const a = { key: 'giants', league: 'mlb' }, b = { key: 'athletics', league: 'mlb' };
    const games = mergeGames([[norm(ev('1'), a), norm(ev('2'), a)], [norm(ev('1'), b)]]);
    return { n: games.length, keys: games.find(g => g.id === '1').keys, giants: buckets(games, 'giants').upcoming.length, athletics: buckets(games, 'athletics').upcoming.map(g => g.id) };
  });
  expect(r).toEqual({ n: 2, keys: ['giants', 'athletics'], giants: 2, athletics: ['1'] });
});

test('requests time out instead of hanging, and one league scoreboard request is shared', async ({ page }) => {
  let scoreboards = 0;
  await page.route(/never-answers/, () => {}); // left pending on purpose
  await page.route(/football\/nfl\/scoreboard$/, async r => { scoreboards++; await new Promise(res => setTimeout(res, 300));
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"events":[{"id":"x"}]}' }); });
  const r = await page.evaluate(async () => {
    const timedOut = await getJSON('https://site.api.espn.com/never-answers', { timeout: 500 }).then(() => 'answered', e => e.message);
    const [a, b] = await Promise.all([leagueScoreboard('nfl'), leagueScoreboard('nfl')]);
    const mapped = await Promise.all(['https://site.api.espn.com/football/nfl/scoreboard'].map(getJSON)); // .map passes an index, which must not become a time limit
    await leagueScoreboard('nfl'); // after the first settles, a fresh request
    return { timedOut, same: a === b, ids: a.events.map(e => e.id), mapped: mapped[0].events.length };
  });
  expect(r).toEqual({ timedOut: 'timed out', same: true, ids: ['x'], mapped: 1 });
  expect(scoreboards).toBe(3);
});

test('ESPN text is escaped before it reaches the page', async ({ page }) => {
  const r = await page.evaluate(() => {
    const evil = '<img src=x onerror="window.pwned=1">';
    const ev = { id: '1"><b>', date: new Date().toISOString(), competitions: [{ status: { type: { state: 'pre', shortDetail: evil } }, venue: { fullName: evil }, competitors: [
      { homeAway: 'home', team: { id: '1', abbreviation: evil, displayName: evil, logo: 'javascript:alert(1)' } }, { homeAway: 'away', team: { id: '2', abbreviation: 'B', displayName: evil } }] }] };
    const el = document.createElement('div');
    el.innerHTML = card(norm(ev, { key: 'browns', league: 'nfl', color: 'red' }));
    return { injected: el.querySelectorAll('img[onerror], b').length, badSrc: [...el.querySelectorAll('img')].some(i => !i.getAttribute('src').startsWith('https://')), text: el.textContent.includes('<img') };
  });
  expect(r).toEqual({ injected: 0, badSrc: false, text: true });
});

test('upcoming cards show record, division rank and streak from the standings', async ({ page }) => {
  const r = await page.evaluate(() => {
    const stat = (name, value, displayValue) => ({ name, value, displayValue: displayValue ?? String(value) });
    const entry = (id, abbr, st) => ({ team: { id, abbreviation: abbr, displayName: abbr }, stats: st });
    const nhl = { children: [{ name: 'Western Conference', children: [{ name: 'Pacific Division', standings: { entries: [ // ESPN's order isn't rank order
      entry('18', 'SJ', [stat('wins', 12), stat('losses', 10), stat('otLosses', 3), stat('points', 27), stat('gamesPlayed', 25), stat('streak', 3, 'W3')]),
      entry('37', 'VGK', [stat('wins', 15), stat('losses', 6), stat('otLosses', 4), stat('points', 34), stat('gamesPlayed', 25), stat('streak', 1, 'L1')]),
    ] } }] }] };
    const nba = { children: [{ name: 'Western Conference', children: [{ name: 'Pacific', standings: { entries: [
      entry('9', 'GS', [stat('wins', 10), stat('losses', 9), stat('winPercent', 10 / 19), stat('streak', 2, 'L2')]),
      entry('13', 'LAL', [stat('wins', 14), stat('losses', 5), stat('winPercent', 14 / 19), stat('streak', 2, 'T2')]),
    ] } }] }] };
    const mlb = { children: [{ name: 'National League', children: [{ name: 'National League West', standings: { entries: [
      entry('26', 'SF', [stat('wins', 0), stat('losses', 0), stat('gamesPlayed', 0)]), // before opening day
    ] } }] }] };
    const cfb = { children: [{ name: 'Atlantic Coast Conference', standings: { entries: [
      entry('2390', 'MIA', [{ name: 'overall', summary: '10-1' }, stat('streak', 2, 'W2')]),
      entry('24', 'STAN', [{ name: 'overall', summary: '7-5' }, stat('streak', 4, 'W4')]),
    ] } }] };
    const pick = m => Object.fromEntries([...m].map(([id, v]) => [id, v]));
    const out = { nhl: pick(standingsByTeam('nhl', nhl)), nba: pick(standingsByTeam('nba', nba)), mlb: pick(standingsByTeam('mlb', mlb)), cfb: pick(standingsByTeam('college-football', cfb)) };
    // rendered on a card: future NBA games come without records
    cardStandings.set('nba', { at: Date.now(), value: standingsByTeam('nba', nba) });
    const side = (id, abbr) => ({ id, abbr, name: abbr, short: abbr, logo: '', score: null, winner: false, record: '' });
    const g = st => ({ id: '1', league: 'nba', team: { league: 'nba', color: 'red' }, state: st, date: new Date(Date.now() + 864e5), detail: '', home: side('9', 'GS'), away: side('13', 'LAL'), broadcast: '', venue: '' });
    const el = document.createElement('div');
    el.innerHTML = card(g('pre'));
    out.pre = [...el.querySelectorAll('.trow .nm')].map(n => n.textContent);
    el.innerHTML = card({ ...g('post'), home: { ...side('9', 'GS'), score: '100', record: '11-9' }, away: { ...side('13', 'LAL'), score: '98', record: '14-6' } });
    out.post = [...el.querySelectorAll('.trow .nm')].map(n => n.textContent);
    out.streaks = ['W1', 'L4', 'OT1', 'OTL2', 'W0', ''].map(streakText);
    cardStandings.clear();
    return out;
  });
  expect(r.nhl).toEqual({ '37': { record: '15-6-4', rank: '1st in Pacific', streak: 'Lost last game' }, '18': { record: '12-10-3', rank: '2nd in Pacific', streak: 'Won 3 straight' } });
  expect(r.nba['9']).toEqual({ record: '10-9', rank: '2nd in Pacific', streak: 'Lost 2 straight' });
  expect(r.nba['13'].streak).toBe('Tied 2 straight');
  expect(r.streaks).toEqual(['Won last game', 'Lost 4 straight', 'Lost last game in OT', 'Lost 2 straight in OT', '', '']);
  expect(r.mlb).toEqual({});
  expect(r.cfb['24']).toEqual({ record: '7-5', rank: '2nd in Atlantic Coast', streak: 'Won 4 straight' });
  expect(r.pre).toEqual(['LAL14-51st in Pacific · Tied 2 straight', 'GS10-92nd in Pacific · Lost 2 straight']);
  expect(r.post).toEqual(['LAL14-6', 'GS11-9']); // results keep ESPN's post-game record and no extras
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
