# Review follow-up

This change builds on the first review fixes and the current Bay Area team list. It addresses correctness and request volume within the existing ESPN and RSS integrations.

## Rendering and request ownership

- Period filters accept positive, safe integer numbers and decimal strings. The canonical number is escaped before it enters an HTML attribute. The All view still shows plays that arrive without a valid period.
- Each primary page load captures the route and a request generation. A response can render, show an error, or schedule the next refresh only while that generation is current. Team loaders write to a per-request snapshot so an earlier season or tab can finish without changing the newer view.
- A game summary with a competitors array can render and schedule its own poll. The live scoreboard and regional TV check enrich the game in the background. The game instance check prevents those responses from drawing over another route. One situation request can be pending per game.
- The game refresh compares the HTML generated from the active tab and header. That comparison includes corrections to existing plays, individual stats, and line scores. Identical markup preserves open details and focus. The live freshness indicator updates independently.
- Preview player stats use separate states for unavailable and empty results. A refresh retries the failed team and keeps successful responses. Rank, game log, and career fetches share pending work and reuse successful results.
- NHL faceoff samples count toward the 90-sample cap after a successful personnel response. The next eligible poll can retry a failed sample, and the play-list request stops once the cap is reached.

## ESPN request volume

- Home keeps regular-season and playoff schedules in memory for five minutes and requests one scoreboard per league on each poll. A cold Bay Area load uses 14 schedule requests and six scoreboards before any TV checks. A 30-second poll with fresh schedules uses six scoreboards. The refresh button revalidates schedules immediately.
- If a Home source fails, a last successful response can be reused for up to 24 hours in the same page session. The UI identifies the ESPN delay and shows the age of the oldest reused response. Expiry limits how long stale live scores can remain visible.
- The team stats tab renders from its own data while NBA or NHL league ranks load. A league rank calculation fetches at most six team stats responses concurrently and is reused for five minutes. NBA reuses the selected team's stats in that calculation.
- NBA Last 10 reuses daily scoreboards across teams and anchor dates. Today's and yesterday's Eastern scoreboards expire after one minute, and older dates expire after 24 hours. Eastern calendar dates are computed before stepping across days so daylight saving changes preserve the day sequence. The result is recalculated for the selected anchor and current season averages. The loader stops starting new date batches when the requesting team view is superseded.

## News publication

The workflow reads the previous `news-data` snapshot before collection. If a team/source job fails, the collector retains that pair's still-recent articles with their original timestamps and a stale flag. Fresh copies take precedence during deduplication. The existing 14-day age limit and per-team cap still apply. A failed snapshot fetch stops the job so a transient Git error cannot discard the prior feed. A missing branch is valid on the first run.

An RSS URL is fetched and parsed once per collection run, including shared general feeds. Each team still applies its own relevance filter. The UI marks carried-forward articles and names the sources that could not be reached.

## How to verify

- Run `npm test -- tests/review-regressions.spec.js tests/news.spec.js` for period filters, route races, failure and recovery, score and rank request counts, cache expiry, and news retention and deduplication.
- Run `npm test` for the full suite. The existing live ESPN tests exercise the real feed through a relay. The relay now checks the CORS headers against the deployed GitHub Pages origin.
- In the [news workflow](../.github/workflows/news.yml), review the branches for a missing snapshot, a failed read, and a successful read. The [collector tests](../tests/news.spec.js) cover partial outages and recovery with synthetic responses.
