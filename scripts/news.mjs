// Collects Cleveland team news from a fixed list of trusted sources into one JSON file.
// Run by .github/workflows/news.yml every 20 minutes; the app reads the result.
// Only the sources listed here are ever included: no blogs, aggregators or fan sites.
//
// Usage: node scripts/news.mjs out/news.json

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const UA = 'Mozilla/5.0 (compatible; my-sports-news/1.0; +https://github.com/charliehartel/my-sports)';
const DAYS = 14;              // keep two weeks of news
const PER_TEAM = 80;          // newest items kept per team

export const TEAMS = {
  cavs:      { league: 'nba', sport: 'basketball', espnId: '5', words: ['cavaliers', 'cavs'], paths: ['cavs', 'cavaliers'] },
  browns:    { league: 'nfl', sport: 'football',   espnId: '5', words: ['browns'], paths: ['browns'] },
  guardians: { league: 'mlb', sport: 'baseball',   espnId: '5', words: ['guardians', 'guards'], paths: ['guardians', 'cleveland-guardians'] },
  // Bay Area
  warriors:  { league: 'nba', sport: 'basketball', espnId: '9',  words: ['warriors'], paths: ['warriors', 'golden-state-warriors'] },
  niners:    { league: 'nfl', sport: 'football',   espnId: '25', words: ['49ers', 'niners'], paths: ['49ers', 'san-francisco-49ers'] },
  giants:    { league: 'mlb', sport: 'baseball',   espnId: '26', words: ['giants'], paths: ['giants', 'sf-giants', 'san-francisco-giants'] },
  sharks:    { league: 'nhl', sport: 'hockey',     espnId: '18', words: ['sharks'], paths: ['sharks', 'san-jose-sharks'] },
  athletics: { league: 'mlb', sport: 'baseball',   espnId: '11', words: ['athletics', "a's"], paths: ['athletics', 'oakland-athletics', 'as'] },
  raiders:   { league: 'nfl', sport: 'football',   espnId: '13', words: ['raiders'], paths: ['raiders', 'las-vegas-raiders'] },
  // New York
  mets:      { league: 'mlb', sport: 'baseball',   espnId: '21', words: ['mets'], paths: ['mets', 'new-york-mets'] },
  nygiants:  { league: 'nfl', sport: 'football',   espnId: '19', words: ['ny giants', 'new york giants', 'giants'], paths: ['new-york-giants', 'ny-giants'] },
  knicks:    { league: 'nba', sport: 'basketball', espnId: '18', words: ['knicks'], paths: ['knicks', 'new-york-knicks'] },
  yankees:   { league: 'mlb', sport: 'baseball',   espnId: '10', words: ['yankees', 'yanks'], paths: ['yankees', 'new-york-yankees'] },
  jets:      { league: 'nfl', sport: 'football',   espnId: '20', words: ['jets'], paths: ['jets', 'new-york-jets'] },
};

// Each RSS source lists candidate feed addresses per team; the first one that returns items is used.
// `filter: true` marks a general sports feed whose items must mention the team.
// `domains`: an item's link must be on one of these sites (drops syndicated or third-party posts).
export const RSS_SOURCES = [
  {
    id: 'cleveland', name: 'cleveland.com', domains: ['cleveland.com'],
    feeds: {
      browns:    ['https://www.cleveland.com/arc/outboundfeeds/rss/category/browns/?outputType=xml', 'https://www.cleveland.com/browns/index.rss'],
      cavs:      ['https://www.cleveland.com/arc/outboundfeeds/rss/category/cavs/?outputType=xml', 'https://www.cleveland.com/cavs/index.rss'],
      guardians: ['https://www.cleveland.com/arc/outboundfeeds/rss/category/guardians/?outputType=xml', 'https://www.cleveland.com/guardians/index.rss'],
    },
  },
  {
    // Team feeds mix in league-wide pieces (power rankings, picks); those are dropped, the rest kept.
    id: 'athletic', name: 'The Athletic', domains: ['nytimes.com', 'theathletic.com'], paywall: true, scope: 'team-feed',
    feeds: {
      browns:    ['https://www.nytimes.com/athletic/rss/nfl/browns/', 'https://theathletic.com/rss/nfl/browns/'],
      cavs:      ['https://www.nytimes.com/athletic/rss/nba/cavaliers/', 'https://theathletic.com/rss/nba/cavaliers/'],
      guardians: ['https://www.nytimes.com/athletic/rss/mlb/guardians/', 'https://theathletic.com/rss/mlb/guardians/'],
      warriors:  ['https://www.nytimes.com/athletic/rss/nba/warriors/'],
      niners:    ['https://www.nytimes.com/athletic/rss/nfl/49ers/', 'https://www.nytimes.com/athletic/rss/nfl/niners/', 'https://www.nytimes.com/athletic/rss/nfl/san-francisco-49ers/'],
      giants:    ['https://www.nytimes.com/athletic/rss/mlb/giants/', 'https://www.nytimes.com/athletic/rss/mlb/sf-giants/', 'https://www.nytimes.com/athletic/rss/mlb/san-francisco-giants/'],
      sharks:    ['https://www.nytimes.com/athletic/rss/nhl/sharks/'],
      athletics: ['https://www.nytimes.com/athletic/rss/mlb/athletics/'],
      raiders:   ['https://www.nytimes.com/athletic/rss/nfl/raiders/'],
      mets:      ['https://www.nytimes.com/athletic/rss/mlb/mets/'],
      nygiants:  ['https://www.nytimes.com/athletic/rss/nfl/giants/', 'https://www.nytimes.com/athletic/rss/nfl/ny-giants/'],
      knicks:    ['https://www.nytimes.com/athletic/rss/nba/knicks/'],
      yankees:   ['https://www.nytimes.com/athletic/rss/mlb/yankees/'],
      jets:      ['https://www.nytimes.com/athletic/rss/nfl/jets/'],
    },
  },
  {
    // Official team news: everything is about the team, so only promos are dropped.
    id: 'team', name: 'Team site', domains: ['clevelandbrowns.com', '49ers.com', 'raiders.com', 'giants.com', 'newyorkjets.com'], scope: 'official',
    names: { browns: 'ClevelandBrowns.com', niners: '49ers.com', raiders: 'Raiders.com', nygiants: 'Giants.com', jets: 'NewYorkJets.com' },
    // NBA.com (Cavs) refuses these requests (HTTP 403), so there's no Cavs team-site feed.
    feeds: {
      browns:    ['https://www.clevelandbrowns.com/rss/news', 'https://www.clevelandbrowns.com/news/rss'],
      niners:    ['https://www.49ers.com/rss/news'],
      raiders:   ['https://www.raiders.com/rss/news'],
      nygiants:  ['https://www.giants.com/rss/news'],
      jets:      ['https://www.newyorkjets.com/rss/news'],
    },
  },
  {
    // MLB.com team feeds mix in league-wide pieces (prospect rankings, award lists); those are dropped.
    id: 'mlbcom', name: 'MLB.com', domains: ['mlb.com'], scope: 'team-feed',
    feeds: {
      guardians: ['https://www.mlb.com/guardians/feeds/news/rss.xml'],
      giants:    ['https://www.mlb.com/giants/feeds/news/rss.xml'],
      athletics: ['https://www.mlb.com/athletics/feeds/news/rss.xml'],
      mets:      ['https://www.mlb.com/mets/feeds/news/rss.xml'],
      yankees:   ['https://www.mlb.com/yankees/feeds/news/rss.xml'],
    },
  },
  {
    id: 'fox8', name: 'FOX 8 Cleveland', domains: ['fox8.com'],
    feeds: {
      browns:    ['https://fox8.com/sports/cleveland-browns/feed/', { url: 'https://fox8.com/sports/feed/', filter: true }],
      cavs:      ['https://fox8.com/sports/cleveland-cavaliers/feed/', { url: 'https://fox8.com/sports/feed/', filter: true }],
      guardians: ['https://fox8.com/sports/cleveland-guardians/feed/', { url: 'https://fox8.com/sports/feed/', filter: true }],
    },
  },
  {
    id: 'wkyc', name: 'WKYC 3', domains: ['wkyc.com'],
    feeds: {
      browns:    ['https://www.wkyc.com/feeds/syndication/rss/sports/browns', { url: 'https://www.wkyc.com/feeds/syndication/rss/sports', filter: true }],
      cavs:      ['https://www.wkyc.com/feeds/syndication/rss/sports/cavs', { url: 'https://www.wkyc.com/feeds/syndication/rss/sports', filter: true }],
      guardians: ['https://www.wkyc.com/feeds/syndication/rss/sports/guardians', { url: 'https://www.wkyc.com/feeds/syndication/rss/sports', filter: true }],
    },
  },
  {
    id: 'news5', name: 'News 5 Cleveland', domains: ['news5cleveland.com'],
    feeds: {
      browns:    ['https://www.news5cleveland.com/sports/browns.rss', { url: 'https://www.news5cleveland.com/sports.rss', filter: true }],
      cavs:      ['https://www.news5cleveland.com/sports/cavs.rss', { url: 'https://www.news5cleveland.com/sports.rss', filter: true }],
      guardians: ['https://www.news5cleveland.com/sports/guardians.rss', { url: 'https://www.news5cleveland.com/sports.rss', filter: true }],
    },
  },
  // ---- Bay Area outlets ----
  // The Mercury News refuses these requests (HTTP 403) and no SF Chronicle feed could be found, so neither is included.
  {
    id: 'nbcsba', name: 'NBC Sports Bay Area', domains: ['nbcsportsbayarea.com', 'nbcsports.com'],
    feeds: {
      warriors:  ['https://www.nbcsportsbayarea.com/nba/golden-state-warriors/feed/', { url: 'https://www.nbcsportsbayarea.com/feed/', filter: true }],
      niners:    ['https://www.nbcsportsbayarea.com/nfl/san-francisco-49ers/feed/', { url: 'https://www.nbcsportsbayarea.com/feed/', filter: true }],
      giants:    ['https://www.nbcsportsbayarea.com/mlb/san-francisco-giants/feed/', { url: 'https://www.nbcsportsbayarea.com/feed/', filter: true }],
      sharks:    ['https://www.nbcsportsbayarea.com/nhl/san-jose-sharks/feed/', { url: 'https://www.nbcsportsbayarea.com/feed/', filter: true }],
      athletics: ['https://www.nbcsportsbayarea.com/mlb/oakland-athletics/feed/', { url: 'https://www.nbcsportsbayarea.com/feed/', filter: true }],
    },
  },
  {
    id: 'rj', name: 'Las Vegas Review-Journal', domains: ['reviewjournal.com'],
    feeds: { raiders: ['https://www.reviewjournal.com/sports/raiders/feed/'] },
  },
  // ---- New York outlets ----
  // Tried and not usable: NY Daily News (refuses these requests, HTTP 403), SNY (no feeds) and the
  // New York Post (returns no feed items to automated requests).
  // Threads (team accounts) will go here once the Meta app is approved for profile discovery.
];

/* ---------- RSS / Atom parsing (no dependencies) ---------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
export function decode(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const stripTags = s => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function attr(block, name, a) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}
export function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map(b => {
    const link = decode(tag(b, 'link')).trim() || attr(b, 'link', 'href');
    const desc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content');
    const img = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url')
      || (/image\//i.test(attr(b, 'enclosure', 'type')) ? attr(b, 'enclosure', 'url') : '')
      || (decode(desc).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    return {
      title: stripTags(tag(b, 'title')),
      url: link,
      published: decode(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')).trim(),
      summary: stripTags(desc).slice(0, 280),
      author: stripTags(tag(b, 'dc:creator') || tag(tag(b, 'author'), 'name') || tag(b, 'author')),
      image: img,
    };
  }).filter(i => i.title && i.url);
}

/* ---------- helpers ---------- */
async function get(url, type = 'text') {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: type === 'json' ? 'application/json' : 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return type === 'json' ? r.json() : r.text();
}
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const onDomain = (u, domains) => domains.some(d => host(u) === d || host(u).endsWith('.' + d));
export const mentions = (text, words) => words.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
// Filler that isn't news: betting and picks, fantasy, podcasts, promotions.
const JUNK = /\b(best bets?|betting (odds|lines|picks|preview|trends)|odds and picks|player props|straight-up picks|picks against the spread|spread picks|game picks|expert picks|staff picks|fantasy|podcast|sweepstakes|giveaway|sign up|text alerts|win tickets|presented by|promo code|ticket deals?)\b/i;
// League-wide formats that show up in team feeds.
const LEAGUEWIDE = /\b(power rankings?|mock draft|picks|hall of fame ballot|all (30|32) teams|every (team|club)|each (mlb |nfl |nba |nhl )?(club|team)|ranking|ranked|top \d+|these \d+|mlb's best|all-awardless|tiers?|thankful for)\b/i;
// A story counts for a team if the team is named in the headline or summary, or it's in that team's section of the site.
export function relevant(i, teamKey, scope = 'general') {
  const t = TEAMS[teamKey];
  if (JUNK.test(i.title) || /podcast/i.test(i.url)) return false;
  if (scope === 'official') return true;
  if (scope === 'mention') return mentions(`${i.title} ${i.summary}`, t.words);
  // team feeds: a story naming the team stays; otherwise drop league-wide formats
  if (scope === 'team-feed') return mentions(i.title, t.words) || !LEAGUEWIDE.test(i.title);
  let path = '';
  try { path = new URL(i.url).pathname.toLowerCase(); } catch {}
  return mentions(`${i.title} ${i.summary}`, t.words) || t.paths.some(p => path.split('/').includes(p));
}
const normUrl = u => { try { const x = new URL(u); x.search = ''; x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return u; } };
const normTitle = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const httpsOnly = u => (typeof u === 'string' && /^https?:\/\//.test(u)) ? u.replace(/^http:/, 'https:') : '';

/* ---------- ESPN ---------- */
// ESPN's team news mixes in league-wide pieces tagged with every team; keep stories about this team.
export function espnKeep(a, team) {
  const teams = (a.categories || []).filter(c => c.type === 'team');
  const tagged = teams.some(c => String(c.teamId ?? c.team?.id) === team.espnId);
  if (!tagged) return false;
  if (a.type === 'Media') return false; // video clips
  const url = a.links?.web?.href || '';
  if (/\/(betting|fantasy|espn-bet)\//.test(url) || JUNK.test(a.headline || '')) return false;
  return teams.length <= 2 || mentions(`${a.headline} ${a.description || ''}`, team.words);
}
async function espn(teamKey) {
  const t = TEAMS[teamKey];
  const d = await get(`https://site.api.espn.com/apis/site/v2/sports/${t.sport}/${t.league}/news?team=${t.espnId}&limit=50`, 'json');
  return (d.articles || []).filter(a => espnKeep(a, t)).map(a => ({
    title: a.headline, url: httpsOnly(a.links?.web?.href), published: a.published, summary: (a.description || '').slice(0, 280),
    author: a.byline || '', image: httpsOnly(a.images?.[0]?.url),
  }));
}

/* ---------- RSS ---------- */
async function rss(source, teamKey) {
  const t = TEAMS[teamKey];
  const errors = [];
  for (const f of source.feeds[teamKey] || []) {
    const { url, filter } = typeof f === 'string' ? { url: f, filter: false } : f;
    try {
      const items = parseFeed(await get(url))
        .filter(i => onDomain(i.url, source.domains))
        .filter(i => relevant(i, teamKey, filter ? 'general' : source.scope) && (!filter || mentions(`${i.title} ${i.summary}`, t.words)));
      if (items.length) return { url, items };
      errors.push(`${url}: no matching items`);
    } catch (e) { errors.push(`${url}: ${e.message}`); }
  }
  throw new Error(errors.join(' | ') || 'no feeds configured');
}

/* ---------- main ---------- */
export async function collect() {
  const now = Date.now();
  const sources = [], items = [];
  const jobs = [];
  for (const teamKey of Object.keys(TEAMS)) {
    jobs.push(espn(teamKey).then(list => ({ id: 'espn', name: 'ESPN', teamKey, url: 'site.api.espn.com', list }))
      .catch(e => ({ id: 'espn', name: 'ESPN', teamKey, error: e.message })));
    for (const s of RSS_SOURCES) {
      if (!s.feeds[teamKey]?.length) continue; // source doesn't cover this team
      jobs.push(rss(s, teamKey).then(r => ({ id: s.id, name: s.names?.[teamKey] || s.name, teamKey, url: r.url, list: r.items, paywall: !!s.paywall }))
        .catch(e => ({ id: s.id, name: s.names?.[teamKey] || s.name, teamKey, error: e.message })));
    }
  }
  for (const r of await Promise.all(jobs)) {
    sources.push({ id: r.id, name: r.name, team: r.teamKey, ok: !r.error, count: r.list?.length || 0, feed: r.url || null, error: r.error || null });
    for (const i of r.list || []) {
      const ts = Date.parse(i.published);
      if (!isFinite(ts) || now - ts > DAYS * 864e5 || ts - now > 864e5) continue;
      items.push({ team: r.teamKey, source: r.id, sourceName: r.name, paywall: !!r.paywall,
        title: i.title, url: httpsOnly(i.url), published: new Date(ts).toISOString(), summary: i.summary, author: i.author, image: httpsOnly(i.image) });
    }
  }
  // de-duplicate: same link, or the same headline from another outlet (syndicated copies)
  const seenUrl = new Set(), seenTitle = new Set(), out = [];
  for (const i of items.sort((a, b) => b.published.localeCompare(a.published))) {
    const u = `${i.team}|${normUrl(i.url)}`, t = `${i.team}|${normTitle(i.title)}`;
    if (!i.url || seenUrl.has(u) || seenTitle.has(t)) continue;
    seenUrl.add(u); seenTitle.add(t); out.push(i);
  }
  const capped = Object.keys(TEAMS).flatMap(k => out.filter(i => i.team === k).slice(0, PER_TEAM));
  return { updated: new Date().toISOString(), sources, items: capped.sort((a, b) => b.published.localeCompare(a.published)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outFile = process.argv[2] || 'out/news.json';
  const data = await collect();
  for (const s of data.sources) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.team.padEnd(9)} ${s.name.padEnd(20)} ${String(s.count).padStart(3)} ${s.ok ? s.feed : s.error}`);
  console.log(`${data.items.length} items`);
  if (!data.items.length) { console.error('No news collected; leaving the previous file in place.'); process.exit(1); }
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(data));
}
