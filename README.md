# Cleveland Sports

A personal scores app for the Cavaliers, Browns and Guardians.

- **Home:** live games, today's games, games finished in the last 36 hours, and the next 7 days.
- **Team page (tap any team logo):** the season schedule, with results and upcoming games (tap one to open it), and team stats: headline numbers, a sortable table of every player's stats, and the full team stat lists. Switch seasons, or between regular season and playoffs. A Standings tab shows division, conference/league and full-league tables with playoff cut lines.
- **Game page:** full box scores and team stats for both teams, play-by-play, win probability, and a live Gamecast (field position for football, shot chart for basketball, count, bases and strike zone for baseball).

It's a single static page (`index.html`) that reads ESPN's public scoreboard data in the browser. No server or API key. Hosted with GitHub Pages; add it to your phone's home screen from Safari's Share menu.

Hockey is supported too: the Bay Area view has the Sharks, and team and game pages work for any NHL team (for example `#/t/nhl/18`). Hockey pages have standings with a wild-card view, a W-L-OTL record, period and OT/shootout line scores, and a shot chart during live games.

**Views:** the page has two sets of teams. The default is Cleveland. A Bay Area view (Warriors, 49ers, Sharks) is at [`bayarea/`](https://charliehartel.github.io/cleveland-sports/bayarea/), which opens `?view=bayarea`; add it to your home screen from there and it gets its own name and icon. Each view remembers its own team filter. The news feed covers the Cleveland teams, so the Bay Area view has none.

To change teams, edit the `VIEWS` list near the top of the script in `index.html`: each view has a name, a short home-screen name, an icon and its `teams`. Supported leagues: `nba`, `nfl`, `mlb` and `nhl` (with `sport:'hockey'`).
