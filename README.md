# Cleveland Sports

A personal scores app for the Cavaliers, Browns and Guardians.

- **Home:** live games, today's games, games finished in the last 36 hours, and the next 7 days.
- **Team page (tap any team logo):** the season schedule, with results and upcoming games (tap one to open it), and team stats: headline numbers, a sortable table of every player's stats, and the full team stat lists. Switch seasons, or between regular season and playoffs.
- **Game page:** full box scores and team stats for both teams, play-by-play, win probability, and a live Gamecast (field position for football, shot chart for basketball, count, bases and strike zone for baseball).

It's a single static page (`index.html`) that reads ESPN's public scoreboard data in the browser. No server or API key. Hosted with GitHub Pages; add it to your phone's home screen from Safari's Share menu.

To change teams, edit the `TEAMS` list near the top of the script in `index.html`.
