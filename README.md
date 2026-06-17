# 🏆 Family World Cup 2026 Sweepstake

A small static web app that runs a family sweepstake for the 2026 FIFA World Cup.
All 48 teams are drawn randomly across the 18 family members, and a live league
table awards **3 points per win** and **1 per draw** across every stage of the
tournament.

## How it works

- **`scripts/refresh.mjs`** — a Node script that pulls the teams and match
  results from [football-data.org](https://www.football-data.org/) and writes
  them to `data/teams.json` and `data/matches.json`. The API token stays in
  `config/.env` (never shipped to the browser).
- **`draw.html`** — runs the animated random draw and lets you download
  `assignments.json`.
- **`index.html`** — the live league table, computed in the browser from the
  data files by the pure scoring module `js/scoring.js`.

## Setup

1. **API token** — already stored in `config/.env` as:
   ```
   API_KEY="your-football-data-token"
   ```
   (Get a free token at https://www.football-data.org/client/register if needed.
   `config/.env` is gitignored — never commit it.)

2. **Fetch the latest results** (re-run any time to update the table):
   ```bash
   npm run refresh
   ```

3. **Serve the site** (required — `fetch` of local JSON won't work from `file://`):
   ```bash
   npm run serve
   ```
   Then open http://localhost:8000.

## Running the draw (one time)

1. Open **The Draw** page and click **Run the Draw**.
2. Click **Download assignments.json**.
3. Move the downloaded file to `data/assignments.json` and commit it. This locks
   the result so it's the same for everyone.

Every member gets **3 teams** for fairness:

- **Round 1** deals each member one of the **18 tournament favourites** (by
  bookmakers' odds) — exactly one favourite each.
- **Rounds 2–3** deal the remaining 30 teams. Since 18 × 3 = 54 but there are
  only 48 teams, **6 of the non-favourite teams are each shared by two members**
  (both owners earn that team's points).

No one ever gets the same team twice, and favourites are never shared. The
favourites list lives in `FAVOURITE_TLAS` in `js/draw.js`.

## Updating the table during the tournament

Just re-run `npm run refresh` whenever you want fresh results, then reload the
page. The draw stays fixed — only the match data updates.

## Tests

```bash
npm run test:scoring
```

## Notes

- Knockout matches decided in extra time or on penalties are scored correctly:
  the API resolves the winner, so the winning team gets the 3-point win.
- Free-tier API limit is ~10 requests/minute; a refresh makes only 3 requests.
