// One-off: try candidate news feed URLs from a GitHub runner and report which ones work.
const candidates = [
  // cleveland.com (Plain Dealer)
  'https://www.cleveland.com/arc/outboundfeeds/rss/category/browns/?outputType=xml',
  'https://www.cleveland.com/arc/outboundfeeds/rss/category/cavs/?outputType=xml',
  'https://www.cleveland.com/arc/outboundfeeds/rss/category/guardians/?outputType=xml',
  'https://www.cleveland.com/arc/outboundfeeds/rss/category/sports/?outputType=xml',
  'https://www.cleveland.com/browns/index.rss',
  'https://www.cleveland.com/cavs/index.rss',
  'https://www.cleveland.com/guardians/index.rss',
  // The Athletic
  'https://www.nytimes.com/athletic/rss/nfl/browns/',
  'https://www.nytimes.com/athletic/rss/nba/cavaliers/',
  'https://www.nytimes.com/athletic/rss/mlb/guardians/',
  'https://www.nytimes.com/athletic/rss/news/',
  'https://theathletic.com/team/browns/?rss=1',
  'https://theathletic.com/rss/nfl/browns/',
  // Team / league official
  'https://www.mlb.com/guardians/feeds/news/rss.xml',
  'https://www.clevelandbrowns.com/rss/news',
  'https://www.nba.com/cavaliers/rss.xml',
  // Cleveland TV
  'https://fox8.com/sports/feed/',
  'https://fox8.com/sports/cleveland-browns/feed/',
  'https://www.wkyc.com/feeds/syndication/rss/sports',
  'https://www.news5cleveland.com/sports.rss',
  'https://www.news5cleveland.com/sports/browns.rss',
  // Akron Beacon Journal
  'https://rssfeeds.beaconjournal.com/beaconjournal/sports',
];
const UA = 'Mozilla/5.0 (compatible; cleveland-sports-news/1.0; +https://github.com/charliehartel/cleveland-sports)';
for (const url of candidates) {
  try {
    const r = await fetch(url, { headers:{ 'user-agent':UA, accept:'application/rss+xml, application/xml, text/xml, */*' }, redirect:'follow', signal:AbortSignal.timeout(20000) });
    const t = await r.text();
    const items = (t.match(/<item[\s>]/g) || t.match(/<entry[\s>]/g) || []).length;
    const titles = [...t.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].slice(1, 4).map(m => m[1].trim().slice(0, 70));
    const dates = [...t.matchAll(/<(?:pubDate|updated|published)>([^<]+)</g)].slice(0, 1).map(m => m[1]);
    console.log(`${r.status} items=${items} final=${r.url === url ? 'same' : r.url}\n   ${url}\n   newest=${dates[0] || '-'} | ${titles.join(' | ')}`);
  } catch (e) { console.log(`ERR ${e.message}\n   ${url}`); }
}
