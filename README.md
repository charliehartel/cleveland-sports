# Cleveland Sports

A personal scores app for the Cavaliers, Browns and Guardians.

- **Home:** live games, today's games, games finished in the last 36 hours, and the next 7 days.
- **Team page (tap any team logo):** the season schedule, with results and upcoming games (tap one to open it), and team stats: headline numbers, a sortable table of every player's stats, and the full team stat lists. Switch seasons, or between regular season and playoffs. A Standings tab shows division, conference/league and full-league tables with playoff cut lines.
- **Game page:** full box scores and team stats for both teams, play-by-play, win probability, and a live Gamecast (field position for football, shot chart for basketball, count, bases and strike zone for baseball).

It's a single static page (`index.html`) that reads ESPN's public scoreboard data in the browser. No server or API key. Hosted with GitHub Pages; add it to your phone's home screen from Safari's Share menu.

Hockey is supported too: the Bay Area view has the Sharks, and team and game pages work for any NHL team (for example `#/t/nhl/18`). Hockey pages have standings with a wild-card view, a W-L-OTL record, period and OT/shootout line scores, and a shot chart during live games.

**Views:** the page has two sets of teams, chosen from the title in the header. The default is Cleveland. The Bay Area view (Warriors, 49ers, Giants, Sharks, Athletics, Raiders) opens `?view=bayarea`; it also has a shortcut at [`bayarea/`](https://charliehartel.github.io/cleveland-sports/bayarea/) to add to your home screen with its own name and icon. Each view remembers its own team filter and shows news for its own teams.

To change teams, edit the `VIEWS` list near the top of the script in `index.html`: each view has a name, a short home-screen name, an icon and its `teams`. For news, add the same team keys to `TEAMS` in `scripts/news.mjs`. Supported leagues: `nba`, `nfl`, `mlb` and `nhl` (with `sport:'hockey'`).
