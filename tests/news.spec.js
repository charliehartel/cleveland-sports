const { test: base, expect: plainExpect } = require('@playwright/test');
const { test, expect, ready } = require('./helpers');

// Synthetic news file: several sources and teams, timestamps relative to now.
function newsFile() {
  const now = Date.now();
  const mk = (team, source, sourceName, minsAgo, title, paywall = false) => ({
    team, source, sourceName, paywall, title, url: `https://example.org/${source}/${encodeURIComponent(title)}`,
    published: new Date(now - minsAgo * 60e3).toISOString(), summary: `${title} summary`, author: 'Reporter', image: '' });
  const items = [];
  for (let i = 0; i < 6; i++) items.push(mk('browns', 'espn', 'ESPN', 10 + i, `ESPN Browns story ${i}`));
  items.push(mk('browns', 'cleveland', 'cleveland.com', 30, 'Plain Dealer Browns story'));
  items.push(mk('browns', 'athletic', 'The Athletic', 40, 'Athletic Browns story', true));
  for (let i = 0; i < 5; i++) items.push(mk('cavs', 'espn', 'ESPN', 50 + i, `ESPN Cavs story ${i}`));
  items.push(mk('guardians', 'fox8', 'FOX 8 Cleveland', 70, 'Fox 8 Guardians story'));
  return { updated: new Date(now - 5 * 60e3).toISOString(),
    sources: [{ id: 'espn', name: 'ESPN', team: 'browns', ok: true, count: 6 }, { id: 'wkyc', name: 'WKYC 3', team: 'browns', ok: false, count: 0, error: 'HTTP 404' }],
    items: items.sort((a, b) => b.published.localeCompare(a.published)) };
}
async function serveNews(page, status = 200) {
  await page.route(/raw\.githubusercontent\.com\/.*news\.json/, r => status === 200
    ? r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(newsFile()) })
    : r.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, body: 'Not Found' }));
}

test('home shows a mixed "Latest news" section that can expand', async ({ page }) => {
  await serveNews(page);
  await page.goto('/#/');
  await ready(page, '.newslist');
  await expect(page.locator('#home-news h2')).toContainText('Latest news');
  // first: each team's newest story
  await expect(page.locator('.latest .lrow .nteam')).toHaveText(['Cavaliers', 'Browns', 'Guardians']);
  await expect(page.locator('.latest .ltitle')).toHaveText(['ESPN Cavs story 0', 'ESPN Browns story 0', 'Fox 8 Guardians story']);
  // then the feed of cards, without those three
  await expect(page.locator('.newslist .news')).toHaveCount(8);
  for (const t of await page.locator('.newslist .ntitle').allTextContents()) expect(['ESPN Cavs story 0', 'ESPN Browns story 0', 'Fox 8 Guardians story']).not.toContain(t);
  // no three in a row from the same outlet while others are available
  const srcs = await page.locator('.newslist .nsrc').allTextContents();
  for (let i = 2; i < 6; i++) expect(srcs[i] === srcs[i - 1] && srcs[i] === srcs[i - 2]).toBe(false);
  await expect(page.locator('.npay').first()).toHaveText('Subscriber');
  await expect(page.locator('#home-news .note')).toContainText('Not reachable right now: WKYC 3');
  await page.locator('[data-nmore]').click();
  await expect(page.locator('.newslist .news')).toHaveCount(11);
  // source filter: just that outlet's cards, no team card
  await page.locator('[data-nsrc="athletic"]').click();
  await expect(page.locator('.latest')).toHaveCount(0);
  await expect(page.locator('.newslist .news')).toHaveCount(1);
  await expect(page.locator('.newslist .ntitle')).toHaveText(['Athletic Browns story']);
});

test('team filter chip narrows home news to that team', async ({ page }) => {
  await serveNews(page);
  await page.goto('/#/');
  await ready(page, '.newslist');
  await page.locator('[data-filter="cavs"]').click();
  await expect(page.locator('.latest')).toHaveCount(0);
  await expect(page.locator('.newslist .news')).toHaveCount(5);
  for (const t of await page.locator('.newslist .ntitle').allTextContents()) expect(t).toContain('Cavs');
  await page.locator('[data-filter="all"]').click();
});

test('Cleveland team pages have a News tab; other teams do not', async ({ page }) => {
  await serveNews(page);
  await page.goto('/#/t/nfl/5/news');
  await ready(page, '.newslist');
  await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings', 'News']);
  const titles = await page.locator('.newslist .ntitle').allTextContents();
  expect(titles.length).toBe(8);
  for (const t of titles) expect(t).toMatch(/Browns/);
  await page.goto('/#/t/nba/18');
  await ready(page, '.team-hero');
  await expect(page.locator('.tab')).toHaveText(['Schedule', 'Team Stats', 'Standings']);
});

test('before the first collection run, the news section says so', async ({ page }) => {
  await serveNews(page, 404);
  await page.goto('/#/');
  await expect(page.locator('#home-news')).toContainText('News will appear here after the first collection run.');
});

// --- collector logic (runs in Node, no browser) ---
base('collector parses RSS and Atom feeds', async () => {
  const { parseFeed } = await import('../scripts/news.mjs');
  const rss = `<rss><channel><title>Feed</title>
    <item><title><![CDATA[Browns &amp; Bengals: 5 takeaways]]></title><link>https://www.cleveland.com/browns/2026/11/x.html</link>
      <pubDate>Thu, 26 Nov 2026 18:00:00 GMT</pubDate><description><![CDATA[<p>Big <b>win</b></p><img src="https://img.example/a.jpg">]]></description>
      <dc:creator>Mary Kay Cabot</dc:creator></item>
    <item><title>Second</title><link>https://www.cleveland.com/b</link><pubDate>Wed, 25 Nov 2026 10:00:00 GMT</pubDate>
      <media:content url="https://img.example/b.jpg" medium="image"/></item></channel></rss>`;
  const items = parseFeed(rss);
  plainExpect(items).toHaveLength(2);
  plainExpect(items[0]).toMatchObject({ title: 'Browns & Bengals: 5 takeaways', url: 'https://www.cleveland.com/browns/2026/11/x.html', summary: 'Big win', author: 'Mary Kay Cabot', image: 'https://img.example/a.jpg' });
  plainExpect(items[1].image).toBe('https://img.example/b.jpg');
  const atom = `<feed><title>A</title><entry><title>Atom story</title><link href="https://theathletic.com/1/"/><updated>2026-11-26T12:00:00Z</updated><summary>Sum</summary><author><name>Zac Jackson</name></author></entry></feed>`;
  plainExpect(parseFeed(atom)[0]).toMatchObject({ title: 'Atom story', url: 'https://theathletic.com/1/', author: 'Zac Jackson', summary: 'Sum' });
});

base('collector keeps ESPN stories about the team and drops league-wide, betting and video items', async () => {
  const { espnKeep, TEAMS } = await import('../scripts/news.mjs');
  const t = TEAMS.browns;
  const team = id => ({ type: 'team', teamId: id });
  const all32 = Array.from({ length: 32 }, (_, i) => team(i + 1));
  plainExpect(espnKeep({ type: 'Story', headline: "What Todd Monken's six keys reveal", categories: [team(5)], links: { web: { href: 'https://www.espn.com/nfl/story/1' } } }, t)).toBe(true);
  plainExpect(espnKeep({ type: 'Story', headline: 'NFL Power Rankings for Week 12', categories: all32, links: { web: { href: 'https://www.espn.com/nfl/story/2' } } }, t)).toBe(false);
  plainExpect(espnKeep({ type: 'HeadlineNews', headline: 'NFL flexes Raiders-Browns into SNF', categories: [team(5), team(13), team(17), team(24)], links: { web: { href: 'https://www.espn.com/nfl/story/3' } } }, t)).toBe(true);
  plainExpect(espnKeep({ type: 'Story', headline: 'Betting buzz: Browns season', categories: [team(5)], links: { web: { href: 'https://www.espn.com/espn/betting/story/4' } } }, t)).toBe(false);
  plainExpect(espnKeep({ type: 'Media', headline: 'Special cleats', categories: [team(5)], links: { web: { href: 'https://www.espn.com/video/5' } } }, t)).toBe(false);
  plainExpect(espnKeep({ type: 'Story', headline: 'Bengals notes', categories: [team(4)], links: { web: { href: 'https://www.espn.com/nfl/story/6' } } }, t)).toBe(false);
});
