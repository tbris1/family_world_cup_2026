// Fixtures view: load matches + teams + (optional) assignments, group the games
// by day, and render each match with the family members who own the two teams —
// e.g. "Mexico v South Africa" with "Tom v Joel" underneath.

const content = document.getElementById("content");
const updatedEl = document.getElementById("updated");

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const FINAL_STATUSES = new Set(["FINISHED", "AWARDED"]);
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);

// Human labels for the knockout rounds; group-stage matches show their group instead.
const STAGE_LABELS = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-final",
  SEMI_FINALS: "Semi-final",
  THIRD_PLACE: "Third place",
  FINAL: "Final",
};

function stageLabel(m) {
  if (m.stage === "GROUP_STAGE") {
    return m.group ? m.group.replace("GROUP_", "Group ") : "Group stage";
  }
  return STAGE_LABELS[m.stage] ?? "";
}

// A stable per-day key in the viewer's local timezone, so grouping matches the
// date shown in the header (utcDate is UTC and may roll over locally).
function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function fmtDayHeading(d) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// teamId -> ["Tom", "Sue"]. A handful of non-favourite teams are shared by two
// members, so each team can map to more than one owner.
function buildOwners(assignments) {
  const owners = new Map();
  for (const [member, teamIds] of Object.entries(assignments ?? {})) {
    for (const id of teamIds ?? []) {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id).push(member);
    }
  }
  for (const list of owners.values()) list.sort((a, b) => a.localeCompare(b));
  return owners;
}

function ownerNames(owners, teamId) {
  if (teamId == null) return "";
  return (owners.get(teamId) ?? []).join(" & ");
}

function teamSide(team, side, isWinner) {
  const known = team && team.id != null;
  const name = known ? team.name : "To be decided";
  const crest = known && team.crest ? `<img class="crest" src="${esc(team.crest)}" alt="" />` : `<span class="crest crest-tbd">?</span>`;
  const cls = `team-side ${side}${known ? "" : " tbd"}${isWinner ? " winner" : ""}`;
  // Crest sits next to the centre line: away crest on the left, home crest on the right.
  return side === "home"
    ? `<div class="${cls}"><span class="tname">${esc(name)}</span>${crest}</div>`
    : `<div class="${cls}">${crest}<span class="tname">${esc(name)}</span></div>`;
}

function ownerSide(owners, team, side) {
  const names = ownerNames(owners, team?.id);
  const cls = `owner ${side}${names ? "" : " unowned"}`;
  return `<span class="${cls}">${names ? esc(names) : "—"}</span>`;
}

function resultBlock(m) {
  const finished = FINAL_STATUSES.has(m.status);
  const live = LIVE_STATUSES.has(m.status);
  const home = m.score?.fullTime?.home;
  const away = m.score?.fullTime?.away;
  const haveScore = home != null && away != null;

  if ((finished || live) && haveScore) {
    let extra = "";
    if (m.score?.duration === "EXTRA_TIME") extra = "AET";
    else if (m.score?.duration === "PENALTY_SHOOTOUT") {
      const p = m.score.penalties;
      extra = p && p.home != null && p.away != null ? `pens ${p.home}-${p.away}` : "pens";
    }
    return `<div class="result"><span class="score">${home}<span class="dash">–</span>${away}</span>${
      extra ? `<span class="extra">${extra}</span>` : ""
    }</div>`;
  }
  return `<div class="result"><span class="vs">v</span></div>`;
}

function statusBadge(m, kickoff) {
  if (FINAL_STATUSES.has(m.status)) return `<span class="badge ft">FT</span>`;
  if (LIVE_STATUSES.has(m.status)) return `<span class="badge live">● Live</span>`;
  return `<span class="badge time">${fmtTime(kickoff)}</span>`;
}

function matchRow(m, owners) {
  const kickoff = new Date(m.utcDate);
  const winner = FINAL_STATUSES.has(m.status) ? m.score?.winner : null;
  const homeWin = winner === "HOME_TEAM";
  const awayWin = winner === "AWAY_TEAM";
  const stage = stageLabel(m);

  return `
    <div class="fixture">
      <div class="fixture-meta">
        ${statusBadge(m, kickoff)}
        ${stage ? `<span class="stage">${esc(stage)}</span>` : ""}
      </div>
      <div class="fixture-main">
        ${teamSide(m.homeTeam, "home", homeWin)}
        ${resultBlock(m)}
        ${teamSide(m.awayTeam, "away", awayWin)}
      </div>
      <div class="fixture-owners">
        ${ownerSide(owners, m.homeTeam, "home")}
        <span class="owner-vs">v</span>
        ${ownerSide(owners, m.awayTeam, "away")}
      </div>
    </div>`;
}

function render(matches, owners, todayKey) {
  // Group by local day, preserving chronological order.
  const sorted = [...matches]
    .filter((m) => m.utcDate)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

  const days = new Map(); // dayKey -> { date, matches: [] }
  for (const m of sorted) {
    const d = new Date(m.utcDate);
    const key = localDayKey(d);
    if (!days.has(key)) days.set(key, { date: d, matches: [] });
    days.get(key).matches.push(m);
  }

  const sections = [...days.entries()]
    .map(([key, { date, matches }]) => {
      const isToday = key === todayKey;
      const rows = matches.map((m) => matchRow(m, owners)).join("");
      return `
        <section class="day${isToday ? " today" : ""}"${isToday ? ' id="today"' : ""}>
          <h2 class="day-heading">
            ${esc(fmtDayHeading(date))}
            ${isToday ? `<span class="today-tag">Today</span>` : ""}
            <span class="day-count">${matches.length} ${matches.length === 1 ? "match" : "matches"}</span>
          </h2>
          <div class="fixtures">${rows}</div>
        </section>`;
    })
    .join("");

  content.innerHTML = `<div class="schedule">${sections}</div>`;

  // Jump to today's fixtures if they're on the page.
  const todayEl = document.getElementById("today");
  if (todayEl) todayEl.scrollIntoView({ block: "start", behavior: "auto" });
}

async function main() {
  let matchesData;
  try {
    matchesData = await getJSON("data/matches.json");
  } catch {
    content.innerHTML = `<div class="empty"><h2>⚠️ No match data</h2>
      <p class="note">Run <code>npm run refresh</code> to fetch the fixtures, then reload.</p></div>`;
    return;
  }

  let owners = new Map();
  let drawn = false;
  try {
    const a = await getJSON("data/assignments.json");
    owners = buildOwners(a.assignments ?? a);
    drawn = true;
  } catch {
    /* Draw not run yet — still show the fixtures, just without owner names. */
  }

  const matches = matchesData.matches ?? [];
  if (!matches.length) {
    content.innerHTML = `<div class="empty"><h2>No fixtures yet</h2>
      <p class="note">Run <code>npm run refresh</code> to fetch the schedule.</p></div>`;
    return;
  }

  const todayKey = localDayKey(new Date());
  render(matches, owners, todayKey);

  const note = drawn
    ? ""
    : ` · the <a href="draw.html">draw</a> hasn't been run, so no names are shown yet`;
  const when = matchesData.fetchedAt;
  updatedEl.innerHTML = `${matches.length} fixtures${
    when ? ` · last updated ${fmtDateTime(when)}` : ""
  }${note}`;
}

main();
