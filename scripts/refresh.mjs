// Fetches World Cup 2026 teams + matches from football-data.org and writes
// them into /data as plain JSON for the static frontend to read.
//
// Run with:  npm run refresh   (reads config/.env via --env-file)
//
// The API token must NEVER be exposed in the static bundle — that's why this
// runs in Node and only the resulting JSON (no token) is committed/served.

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

const BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup
const TOKEN = process.env.API_KEY;

if (!TOKEN) {
  console.error(
    "❌ No API_KEY found. Add it to config/.env as:\n   API_KEY=\"your-token\"\n" +
      "   then run `npm run refresh` (which loads config/.env)."
  );
  process.exit(1);
}

async function api(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (res.status === 429) {
    console.error("❌ Rate limited (429). Free tier allows ~10 req/min — wait a minute and retry.");
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`❌ ${res.status} ${res.statusText} for ${url}\n${body}`);
    process.exit(1);
  }
  return res.json();
}

// Keep only the fields the frontend needs (and avoids re-shipping bulky API noise).
function trimTeam(t) {
  return { id: t.id, name: t.name, shortName: t.shortName, tla: t.tla, crest: t.crest };
}

function trimMatch(m) {
  return {
    id: m.id,
    status: m.status,
    stage: m.stage,
    group: m.group ?? null,
    utcDate: m.utcDate,
    homeTeam: m.homeTeam ? { id: m.homeTeam.id, name: m.homeTeam.name, tla: m.homeTeam.tla, crest: m.homeTeam.crest } : null,
    awayTeam: m.awayTeam ? { id: m.awayTeam.id, name: m.awayTeam.name, tla: m.awayTeam.tla, crest: m.awayTeam.crest } : null,
    score: {
      winner: m.score?.winner ?? null,
      duration: m.score?.duration ?? null,
      fullTime: m.score?.fullTime ?? { home: null, away: null },
      penalties: m.score?.penalties ?? null,
    },
  };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const fetchedAt = new Date().toISOString();

  // 1) Discover the current season for the World Cup. The teams/matches
  //    filters expect the season YEAR (e.g. 2026), not the internal season id.
  console.log("→ Fetching competition info (WC)…");
  const comp = await api(`/competitions/${COMPETITION}`);
  const seasonYear = comp.currentSeason?.startDate?.slice(0, 4) ?? null;
  console.log(`  Competition: ${comp.name} — season ${seasonYear ?? "?"} (id ${comp.currentSeason?.id ?? "?"})`);

  // 2) Teams.
  console.log("→ Fetching teams…");
  let teamsResp = await api(`/competitions/${COMPETITION}/teams?season=${seasonYear ?? ""}`);
  if (!teamsResp.teams?.length) {
    // Fallback: try without season filter.
    teamsResp = await api(`/competitions/${COMPETITION}/teams`);
  }
  const teams = (teamsResp.teams ?? []).map(trimTeam);
  await writeFile(
    join(DATA_DIR, "teams.json"),
    JSON.stringify({ season: seasonYear, fetchedAt, teams }, null, 2)
  );
  console.log(`  Wrote data/teams.json — ${teams.length} teams`);

  // 3) Matches.
  console.log("→ Fetching matches…");
  const matchesResp = await api(`/competitions/${COMPETITION}/matches`);
  const matches = (matchesResp.matches ?? []).map(trimMatch);
  await writeFile(
    join(DATA_DIR, "matches.json"),
    JSON.stringify({ fetchedAt, matches }, null, 2)
  );

  const finished = matches.filter((m) => m.status === "FINISHED" || m.status === "AWARDED");
  const latest = finished
    .map((m) => m.utcDate)
    .sort()
    .at(-1);
  console.log(`  Wrote data/matches.json — ${matches.length} matches, ${finished.length} finished`);
  if (latest) console.log(`  Latest finished match date: ${latest}`);

  console.log("\n✅ Done. Open index.html (via `npm run serve`) to see the table.");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
