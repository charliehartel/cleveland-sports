const { test, expect } = require('@playwright/test');
const nflSummary = require('./fixtures/nfl-live-summary.json');

const espnAPI = /^https:\/\/(?:site|site\.web|sports\.core)\.api\.espn\.com\//;
const TEAM_A = { id:'5', abbreviation:'CLE', displayName:'Cleveland Cavaliers' };
const TEAM_B = { id:'9', abbreviation:'GS', displayName:'Golden State Warriors' };
const EVENT = '401000001';

function deferred(){
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function nbaSummary(state = 'in'){
  return {
    header: { id:EVENT, season:{ year:2026, type:2 }, competitions:[{
      date:new Date(Date.now() + 2 * 3600e3).toISOString(),
      status:{ displayClock:'5:22', period:2, type:{ state, name:'STATUS_IN_PROGRESS' } },
      competitors:[
        { team:TEAM_A, homeAway:'home', score:'44' },
        { team:TEAM_B, homeAway:'away', score:'40' },
      ],
    }] },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route(espnAPI, route => route.fulfill({ json:{ events:[] } }));
  await page.route('https://a.espncdn.com/**', route => route.abort());
  await page.route(/raw\.githubusercontent\.com\/.*news\.json/, route => route.fulfill({ json:{ items:[], sources:[] } }));
});

for (const [league, first, second] of [['nba', 'Q1', 'Q2'], ['wnba', 'Q1', 'Q2'], ['nhl', '1st', '2nd']]) {
  test(`${league} play-by-play only offers filters for valid period numbers`, async ({ page }) => {
    const summary = nbaSummary();
    summary.plays = [
      { id:'1', period:{ number:1 }, text:'Opening shot' },
      { id:'2', period:{ number:'2' }, text:'Second-quarter shot' },
      { id:'3', period:{ number:'unknown' }, text:'Play with unknown period' },
      { id:'4', period:{ number:-1 }, text:'Play with invalid period' },
    ];
    await page.route(/\/summary\?event=/, route => route.fulfill({ json:summary }));
    await page.goto(`/#/g/${league}/${EVENT}`);
    await page.getByRole('tab', { name:'Play-by-Play' }).click();
    await expect(page.locator('[data-period]')).toHaveText(['All', first, second]);
    await expect(page.getByText('Play with unknown period')).toBeVisible();
    await page.getByRole('button', { name:second, exact:true }).click();
    await expect(page.locator('.panel .plays .txt')).toHaveText(['Second-quarter shot']);
  });
}

test('a game error arriving after navigation cannot redraw or restart polling', async ({ page }) => {
  await page.clock.install();
  const received = deferred(), release = deferred();
  let requests = 0;
  await page.route(/\/summary\?event=/, async route => {
    requests++;
    received.resolve();
    await release.promise;
    await route.fulfill({ status:503 });
  });
  await page.goto(`/#/g/nba/${EVENT}`);
  await received.promise;
  await page.locator('#app .back').click();
  await expect(page.locator('.quick')).toBeVisible();
  const response = page.waitForResponse(/\/summary\?event=/);
  release.resolve();
  await response;
  await page.clock.runFor(21_000);
  await expect(page.locator('.quick')).toBeVisible();
  expect(requests).toBe(1);
});

test('team data from the previous route cannot replace the current team or tab', async ({ page }) => {
  const received = deferred(), release = deferred();
  let requests = 0;
  await page.route(/\/nba\/teams\/(5|9)\/schedule\?/, async route => {
    if (route.request().url().includes('/teams/5/')) {
      requests++;
      received.resolve();
      await release.promise;
      return route.fulfill({ json:{ team:TEAM_A, events:[] } });
    }
    return route.fulfill({ json:{ team:TEAM_B, events:[] } });
  });
  await page.goto('/#/t/nba/5');
  await received.promise;
  await page.evaluate(() => { location.hash = '#/t/nba/9/standings'; });
  await expect(page.locator('.team-hero')).toContainText(TEAM_B.displayName);
  const response = page.waitForResponse(/\/teams\/5\/schedule\?/);
  release.resolve();
  await (await response).finished();
  // A refresh exposes any old team metadata left in the current view state.
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.locator('.team-hero')).toContainText(TEAM_B.displayName);
  await expect(page.getByRole('tab', { name:'Standings' })).toHaveAttribute('aria-selected', 'true');
  expect(requests).toBe(1);
});

test('a hung ESPN request times out and home renders the available data', async ({ page }) => {
  await page.clock.install();
  const received = deferred(), release = deferred();
  await page.route(/\/nba\/teams\/cle\/schedule\?seasontype=2$/, async route => {
    received.resolve();
    await release.promise;
    await route.abort();
  });
  try {
    await page.goto('/#/');
    await received.promise;
    await expect(page.getByText('Loading your teams…')).toBeVisible();
    await page.clock.runFor(15_100);
    await expect(page.locator('.quick')).toBeVisible({ timeout:3000 });
    await expect(page.locator('.err')).toHaveCount(0);
  } finally {
    release.resolve();
  }
});

test('live summaries render and poll while the secondary scoreboard is stalled', async ({ page }) => {
  await page.clock.install();
  const received = deferred(), release = deferred();
  const id = String(nflSummary.header.id);
  let polls = 0;
  await page.route(/\/football\/nfl\/scoreboard$/, async route => {
    received.resolve();
    await release.promise;
    await route.abort();
  });
  await page.route(/\/summary\?event=/, route => {
    const summary = structuredClone(nflSummary);
    const home = summary.header.competitions[0].competitors.find(c => c.homeAway === 'home');
    home.score = ++polls === 1 ? '21' : '28';
    return route.fulfill({ json:summary });
  });
  try {
    await page.goto(`/#/g/nfl/${id}`);
    await received.promise;
    await expect(page.locator('.hero-grid')).toContainText('21', { timeout:2000 });
    await page.clock.runFor(5100);
    await expect(page.locator('.hero-grid')).toContainText('28', { timeout:2000 });
    expect(polls).toBe(2);
  } finally {
    release.resolve();
  }
});

test('live redraws include corrected player stats and existing plays at the same clock', async ({ page }) => {
  const summary = nbaSummary();
  const group = {
    labels:['PTS'], totals:['12'],
    athletes:[
      { athlete:{ id:'1', shortName:'First Player' }, starter:true, stats:['4'] },
      { athlete:{ id:'2', shortName:'Second Player' }, starter:true, stats:['8'] },
    ],
  };
  summary.boxscore = { players:[{ team:TEAM_A, statistics:[group] }] };
  summary.plays = [{ id:'1', period:{ number:2 }, text:'Original play' }];
  await page.route(/\/summary\?event=/, route => route.fulfill({ json:summary }));
  await page.goto(`/#/g/nba/${EVENT}`);
  await page.getByRole('tab', { name:'Box Score' }).click();
  const row = page.getByRole('row', { name:'First Player 4', exact:true });
  await expect(row).toBeVisible();
  group.athletes[0].stats = ['5'];
  group.athletes[1].stats = ['7'];
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.getByRole('row', { name:'First Player 5', exact:true })).toBeVisible();
  await page.getByRole('tab', { name:'Play-by-Play' }).click();
  await expect(page.getByText('Original play', { exact:true })).toBeVisible();
  summary.plays[0].text = 'Corrected play';
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.getByText('Corrected play', { exact:true })).toBeVisible();
});

test('preview refresh retries unavailable player stats and keeps successful responses', async ({ page }) => {
  const summary = nbaSummary('pre');
  const athlete = { id:'99', displayName:'Injured Player' };
  summary.injuries = [
    { team:TEAM_A, injuries:[{ athlete, status:'Out' }] },
    { team:TEAM_B, injuries:[{ athlete:{ id:'100', displayName:'Another Player' }, status:'Out' }] },
  ];
  summary.leaders = [{ team:TEAM_B, leaders:[{ name:'pointsPerGame', leaders:[{ athlete:{ id:'55' } }] }] }];
  const rankRequested = deferred(), releaseRank = deferred();
  await page.route(/\/athletes\/55\/statistics$/, async route => {
    rankRequested.resolve();
    await releaseRank.promise;
    await route.fulfill({ json:{} });
  });
  let cavsRequests = 0, warriorsRequests = 0;
  await page.route(/\/summary\?event=/, route => route.fulfill({ json:summary }));
  await page.route(/\/nba\/teams\/(5|9)\/athletes\/statistics\?/, route => {
    if (route.request().url().includes('/teams/9/')) {
      warriorsRequests++;
      return route.fulfill({ json:{ results:[] } });
    }
    if (++cavsRequests === 1) return route.fulfill({ status:503 });
    return route.fulfill({ json:{ results:[{ name:'game', leaders:[{ athlete,
      statistics:[{ stats:[{ name:'avgPoints', value:22, displayValue:'22.0' }] }],
    }] }] } });
  });
  try {
    await page.goto(`/#/g/nba/${EVENT}`);
    await rankRequested.promise;
    const injured = page.locator('.panel li').filter({ hasText:'Injured Player' });
    const other = page.locator('.panel li').filter({ hasText:'Another Player' });
    await expect(injured).toContainText('Season stats unavailable');
    await expect(other).toContainText('No stats this season');
    await page.getByRole('button', { name:'Refresh now' }).click();
    await expect(injured).toContainText('22.0 PTS', { timeout:2000 });
    await expect(other).toContainText('No stats this season');
    expect(cavsRequests).toBe(2);
    expect(warriorsRequests).toBe(1);
  } finally {
    releaseRank.resolve();
  }
});

test('an incomplete successful response reports an error and the game can recover', async ({ page }) => {
  await page.clock.install();
  let polls = 0;
  await page.route(/\/summary\?event=/, route =>
    route.fulfill({ json:++polls === 1 ? { message:'Temporarily unavailable' } : nbaSummary() }));
  await page.goto(`/#/g/nba/${EVENT}`);
  await expect(page.locator('#app .err')).toContainText('Game data unavailable');
  await page.clock.runFor(20_100);
  await expect(page.locator('.score-hero')).toBeVisible();
  expect(polls).toBe(2);
});

test('an earlier season response cannot overwrite the selected season', async ({ page }) => {
  const requested = deferred(), release = deferred();
  const schedule = (year, opponent) => ({
    team:TEAM_A, season:{ year },
    events:[{
      id:String(year), date:`${year}-01-15T19:00:00Z`, competitions:[{
        status:{ type:{ state:'post', completed:true } },
        competitors:[
          { team:TEAM_A, homeAway:'home', score:'100', winner:true },
          { team:{ id:'9', abbreviation:'GS', displayName:opponent }, homeAway:'away', score:'90' },
        ],
      }],
    }],
  });
  await page.route(/\/nba\/teams\/5\/schedule\?/, async route => {
    const query = new URL(route.request().url()).searchParams;
    const year = Number(query.get('season') || '2026');
    if (year === 2025) {
      requested.resolve();
      await release.promise;
    }
    return route.fulfill({ json:schedule(year, `Opponent ${year}`) });
  });
  try {
    await page.goto('/#/t/nba/5');
    await expect(page.getByText('Opponent 2026')).toBeVisible();
    await page.locator('[data-season]').selectOption('2025');
    await requested.promise;
    await page.locator('[data-season]').selectOption('2024');
    await expect(page.getByText('Opponent 2024')).toBeVisible();
    const oldResponse = page.waitForResponse(r => new URL(r.url()).searchParams.get('season') === '2025');
    release.resolve();
    await (await oldResponse).finished();
    await expect(page.locator('[data-season]')).toHaveValue('2024');
    await expect(page.locator('.srow')).toContainText('Opponent 2024');
  } finally {
    release.resolve();
  }
});

test('Bay Area polls only scoreboards while schedules are fresh and keeps scores through an outage', async ({ page }) => {
  await page.clock.install();
  let schedules = 0, boards = 0, score = '6', offline = false;
  const game = {
    id:EVENT, date:new Date().toISOString(), competitions:[{
      status:{ type:{ state:'in', shortDetail:'Bottom 7th' } },
      competitors:[
        { team:{ id:'26', abbreviation:'SF', displayName:'San Francisco Giants' }, homeAway:'home' },
        { team:{ id:'11', abbreviation:'ATH', displayName:'Athletics' }, homeAway:'away', score:'4' },
      ],
    }],
  };
  await page.route(/site\.api\.espn\.com/, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/schedule')) schedules++;
    if (path.endsWith('/scoreboard')) boards++;
    if (offline) return route.fulfill({ status:503 });
    if (path.endsWith('/mlb/scoreboard')) {
      game.competitions[0].competitors[0].score = score;
      return route.fulfill({ json:{ events:[game] } });
    }
    return route.fulfill({ json:{ events:[] } });
  });
  await page.goto('/?view=bayarea#/');
  await expect(page.locator('.card')).toContainText('6');
  expect([schedules, boards]).toEqual([14, 6]);
  score = '7';
  await page.clock.runFor(30_100);
  await expect(page.locator('.card')).toContainText('7');
  expect([schedules, boards]).toEqual([14, 12]);
  score = '8';
  await page.clock.fastForward(300_100);
  await expect(page.locator('.card')).toContainText('8');
  expect([schedules, boards]).toEqual([28, 18]);
  offline = true;
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.locator('#updated')).toHaveText('ESPN updates delayed');
  await expect(page.locator('.card')).toContainText('8');
  await expect(page.locator('.card .status-stale')).toContainText(/Bottom 7th · score as of \d/); // the card itself says its score is old
  await expect(page.locator('.card .status-live')).toHaveCount(0);
  expect([schedules, boards]).toEqual([42, 24]);
  offline = false;
  score = '9';
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.locator('.card')).toContainText('9');
  await expect(page.locator('#updated')).toContainText('Updated');
  await expect(page.locator('.card .status-live')).toHaveText('Bottom 7th');
  await expect(page.locator('.card .status-stale')).toHaveCount(0);
});

test('NHL samples retry failed faceoffs and stop upstream calls at the cap', async ({ page }) => {
  let plays = 0, personnelCalls = 0;
  await page.route(/\/nhl\/events\/456\/competitions\/456\/plays\?limit=1000$/, route => {
    plays++;
    return route.fulfill({ json:{ items:[{
      id:'faceoff', type:{ text:'Faceoff' },
      personnel:{ $ref:'https://sports.core.api.espn.com/v2/sports/hockey/leagues/nhl/faceoff/personnel' },
    }] } });
  });
  await page.route(/\/faceoff\/personnel$/, route =>
    ++personnelCalls === 1 ? route.fulfill({ status:503 }) : route.fulfill({ json:{playPersonnel:[]} }));
  await page.goto('/#/');
  const samples = await page.evaluate(async () => {
    const seen = Object.fromEntries(Array.from({ length:89 }, (_, i) => [String(i), true]));
    const lines = { seen, samples:Array.from({ length:89 }, () => ({})) };
    view.nx = { lines };
    await nhlLoadLines('456');
    const afterFailure = lines.samples.length;
    await nhlLoadLines('456');
    await nhlLoadLines('456');
    return [afterFailure, lines.samples.length];
  });
  expect(samples).toEqual([89, 90]);
  expect([plays, personnelCalls]).toEqual([2, 2]);
});

test('team stats render while NHL rank requests are capped and then cached', async ({ page }) => {
  await page.clock.install();
  const release = deferred(), fullBatch = deferred();
  const team = { id:'1', abbreviation:'TEST', displayName:'Test Hockey Team' };
  const entries = Array.from({ length:24 }, (_, i) => ({ team:{ id:String(i+1) } }));
  const season = { year:2027 };
  let rankRequests = 0;
  await page.route(/site\.api\.espn\.com.*\/nhl\/teams\/1\/schedule/, r =>
    r.fulfill({ json:{ team, season, events:[] } }));
  await page.route(/site\.api\.espn\.com.*\/nhl\/teams\/1\/statistics/, r =>
    r.fulfill({ json:{ requestedSeason:season } }));
  await page.route(/site\.api\.espn\.com.*\/nhl\/teams\/1\/athletes\/statistics/, r =>
    r.fulfill({ json:{ requestedSeason:season, results:[{ name:'team', leaders:[{
      athlete:{ id:'99', displayName:'Test Skater' }, statistics:[{ stats:[{ name:'goals', value:4, displayValue:'4' }] }],
    }] }] } }));
  await page.route(/site\.api\.espn\.com.*\/nhl\/standings\?season=2027$/, r =>
    r.fulfill({ json:{ children:[{ standings:{ entries } }] } }));
  await page.route(/sports\.core\.api\.espn\.com.*\/nhl\/seasons\/2027\/types\/2\/teams\/\d+\/statistics$/, async r => {
    if (++rankRequests === 6) fullBatch.resolve();
    await release.promise;
    await r.fulfill({ json:{ splits:{ categories:[
      { name:'general', stats:[{ name:'games', value:2 }] },
      { name:'offensive', stats:[{ name:'goals', value:5 }] },
    ] } } });
  });
  try {
    await page.goto('/#/t/nhl/1/stats');
    await fullBatch.promise;
    await expect(page.getByText('Test Skater')).toBeVisible({ timeout:2000 });
    expect(rankRequests).toBe(6);
    release.resolve();
    await expect(page.locator('.rk').first()).toBeVisible();
    expect(rankRequests).toBe(24);
    await page.getByRole('button', { name:'Refresh now' }).click();
    await expect(page.locator('.rk').first()).toBeVisible();
    expect(rankRequests).toBe(24);
    await page.clock.fastForward(300_100);
    await page.getByRole('button', { name:'Refresh now' }).click();
    await expect.poll(() => rankRequests).toBe(48);
    await expect(page.locator('.rk').first()).toBeVisible();
  } finally {
    release.resolve();
  }
});

test('NBA daily scoreboards are reused across adjacent Eastern dates', async ({ page }) => {
  await page.clock.install({ time:new Date('2026-11-01T04:30:00Z') });
  const days = [];
  await page.route(/\/nba\/scoreboard\?dates=/, r => {
    days.push(new URL(r.request().url()).searchParams.get('dates'));
    return r.fulfill({ json:{ events:[] } });
  });
  await page.goto('/#/');
  await page.evaluate(() => nbaLast10(2027, new Date(), {}, () => true));
  expect(days.sort()).toEqual(['20261026','20261027','20261028','20261029','20261030','20261031','20261101']);
  await page.evaluate(() => nbaLast10(2027, new Date('2026-11-02T05:30:00Z'), {}, () => true));
  expect(days).toHaveLength(8);
  expect(days[7]).toBe('20261102');
});

test('a corrected final from a refreshed schedule wins over an older cached scoreboard', async ({ page }) => {
  let scheduleScore = '100', scoreboardDown = false;
  const result = score => ({
    id:EVENT,
    date:new Date().toISOString(),
    competitions:[{
      status:{ type:{ state:'post', completed:true, shortDetail:'Final' } },
      competitors:[
        { team:TEAM_A, homeAway:'home', score, winner:true },
        { team:TEAM_B, homeAway:'away', score:'97' },
      ],
    }],
  });
  await page.route(/\/nba\/teams\/cle\/schedule\?seasontype=2$/, route =>
    route.fulfill({ json:{ events:[result(scheduleScore)] } }));
  await page.route(/\/nba\/scoreboard$/, route => scoreboardDown
    ? route.fulfill({ status:503 })
    : route.fulfill({ json:{ events:[result('100')] } }));
  await page.goto('/#/');
  const scores = page.locator('.card .sc');
  await expect(scores).toHaveText(['97', '100']);

  scheduleScore = '101';
  scoreboardDown = true;
  await page.getByRole('button', { name:'Refresh now' }).click();
  await expect(page.locator('#updated')).toHaveText('ESPN updates delayed');
  await expect(scores).toHaveText(['97', '101']);
});
