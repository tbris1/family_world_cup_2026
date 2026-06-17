// League table view: load matches + assignments + teams, compute the table
// with the shared scoring module, and render it.

import { computeLeagueTable } from "./scoring.js";

const content = document.getElementById("content");
const updatedEl = document.getElementById("updated");

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// "just now", "2 hours ago", "3 days ago" — a friendly sense of freshness.
function relTime(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secsPer] of units) {
    if (Math.abs(secs) >= secsPer) {
      return rtf.format(-Math.round(secs / secsPer), unit);
    }
  }
  return "just now";
}

function teamChip(t) {
  const crest = t.crest ? `<img src="${t.crest}" alt="" />` : "";
  return `<span class="team-chip" title="${t.name}: ${t.points} pts (${t.wins}W ${t.draws}D ${t.losses}L)">
    ${crest}<span>${t.tla || t.name}</span><span class="tp">${t.points}</span>
  </span>`;
}

function renderTable(rows) {
  const body = rows
    .map((r, i) => {
      const rank = i + 1;
      const chips = r.teams.map(teamChip).join("");
      return `
        <tr class="${rank === 1 ? "top1" : ""}">
          <td class="num rank">${rank}</td>
          <td>
            <div class="member">${r.member}</div>
            <div class="teams-cell">${chips}</div>
          </td>
          <td class="num pts">${r.points}</td>
          <td class="num wdl">${r.wins}/${r.draws}/${r.losses}</td>
          <td class="num wdl">${r.played}</td>
        </tr>`;
    })
    .join("");

  content.innerHTML = `
    <table class="league">
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Member &amp; teams</th>
          <th class="num">Pts</th>
          <th class="num">W/D/L</th>
          <th class="num">Pld</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderNoDraw() {
  content.innerHTML = `
    <div class="empty">
      <h2>🎲 The draw hasn't been run yet</h2>
      <p class="note">Head to the <a href="draw.html">Draw page</a> to assign teams to the family,
      then save the downloaded file as <code>data/assignments.json</code> and reload.</p>
    </div>`;
}

async function main() {
  let matchesData, teamsData;
  try {
    [matchesData, teamsData] = await Promise.all([
      getJSON("data/matches.json"),
      getJSON("data/teams.json"),
    ]);
  } catch (e) {
    content.innerHTML = `<div class="empty"><h2>⚠️ No match data</h2>
      <p class="note">Run <code>npm run refresh</code> to fetch results, then reload.</p></div>`;
    return;
  }

  let assignments;
  try {
    const a = await getJSON("data/assignments.json");
    assignments = a.assignments ?? a;
  } catch {
    renderNoDraw();
    return;
  }

  const teamsById = new Map((teamsData.teams ?? []).map((t) => [t.id, t]));
  const rows = computeLeagueTable(matchesData.matches ?? [], assignments, teamsById);
  renderTable(rows);

  const played = (matchesData.matches ?? []).filter((m) => m.status === "FINISHED" || m.status === "AWARDED").length;
  const when = matchesData.fetchedAt;
  const rel = relTime(when);
  updatedEl.textContent = `${played} matches played · last updated ${rel}${rel ? " (" : ""}${fmtDate(when)}${rel ? ")" : ""}`;
}

main();
