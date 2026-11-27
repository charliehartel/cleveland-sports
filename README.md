# My Sports

A personal scores app for your teams, with two regions: Cleveland (Cavaliers, Browns, Guardians) and the Bay Area (Warriors, 49ers, Giants, Sharks, Athletics, Raiders).

Open it at **https://charliehartel.github.io/my-sports/**.

- **Home:** quick links to each team, a news feed, live games, today's games, games finished in the last 36 hours, and the next 7 days.
- **Team page (tap any team logo):** the season schedule, with results and upcoming games (tap one to open it), and team stats: headline numbers, a sortable table of every player's stats, and the full team stat lists. Switch seasons, or between regular season and playoffs. A Standings tab shows division, conference/league and full-league tables with playoff cut lines.
- **Game page:** full box scores and team stats for both teams, play-by-play, win probability, and a live Gamecast (field position for football, shot chart for basketball, count, bases and strike zone for baseball).

It's a single static page (`index.html`) that reads ESPN's public scoreboard data in the browser. No server or API key. Hosted with GitHub Pages; add it to your phone's home screen from Safari's Share menu.

Hockey is supported too: the Bay Area view has the Sharks, and team and game pages work for any NHL team (for example `#/t/nhl/18`). Hockey pages have standings with a wild-card view, a W-L-OTL record, period and OT/shootout line scores, and a shot chart during live games.

**Regions:** pick Cleveland or Bay Area from the picker next to "My Sports" in the header. Cleveland is the default; the Bay Area opens `?view=bayarea` (shortcut: [`bayarea/`](https://charliehartel.github.io/my-sports/bayarea/)). Each region remembers its own team filter and shows news for its own teams.

**News:** a scheduled GitHub Actions job (`.github/workflows/news.yml`, `scripts/news.mjs`) collects team news every 20 minutes from a fixed list of trusted outlets (ESPN, The Athletic, cleveland.com, NBC Sports Bay Area, team sites, local TV and more) into the `news-data` branch, which the app reads.

**Tests:** browser tests (`npm test`, Playwright) run on every push and pull request.

To change teams, edit the `VIEWS` list near the top of the script in `index.html`: each region has a name and its `teams`. For news, add the same team keys to `TEAMS` in `scripts/news.mjs`. Supported leagues: `nba`, `nfl`, `mlb` and `nhl` (with `sport:'hockey'`).
