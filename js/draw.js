// The Draw: load the 18 members + 48 teams, shuffle, deal them out (12 members
// get 3 teams, 6 get 2), animate the reveal, then let the user download the
// resulting assignments.json to commit into /data.

const grid = document.getElementById("grid");
const drawBtn = document.getElementById("drawBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");
const lockBanner = document.getElementById("lockBanner");

let members = [];
let teams = [];
let lastAssignments = null;

// The 18 "favourites" (by 3-letter code) from the betting odds. Each member is
// dealt exactly one of these in round 1 to keep the draw fair. There are
// exactly 18 favourites for 18 members.
const FAVOURITE_TLAS = new Set([
  "ESP", "FRA", "ENG", "POR", "ARG", "BRA", "GER", "NED", "USA",
  "BEL", "MEX", "JPN", "CRO", "URU", "SWE", "NOR", "MAR", "SEN",
]);

// Fisher–Yates shuffle (returns a new array).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function loadData() {
  const [namesText, teamsResp] = await Promise.all([
    fetch("names.txt").then((r) => r.text()),
    fetch("data/teams.json").then((r) => r.json()),
  ]);
  members = namesText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  teams = teamsResp.teams ?? [];

  if (members.length === 0 || teams.length === 0) {
    statusEl.textContent = "⚠️ Could not load members or teams. Run `npm run refresh` first.";
    drawBtn.disabled = true;
    return;
  }
  statusEl.textContent = `${members.length} family members · ${teams.length} teams ready to draw.`;
  renderEmptyCards();

  // If a committed draw already exists, warn that this is a re-draw.
  try {
    const existing = await fetch("data/assignments.json", { cache: "no-store" });
    if (existing.ok) lockBanner.classList.remove("hidden");
  } catch { /* no existing assignments — first draw */ }
}

function renderEmptyCards(order = members) {
  grid.innerHTML = "";
  for (const m of order) {
    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.member = m;
    card.innerHTML = `<h3>${m}</h3><div class="slots"></div>`;
    grid.appendChild(card);
  }
}

// Deal teams: everyone gets 3 teams.
//   Round 1 — one favourite each (18 favourites for 18 members).
//   Rounds 2–3 — the remaining 30 non-favourite teams. That's 36 slots for 30
//   teams, so 6 non-favourite teams are each shared by two members. We never
//   share a favourite, and no one ever holds the same team twice.
function deal() {
  const shuffledMembers = shuffle(members);
  const favourites = teams.filter((t) => FAVOURITE_TLAS.has(t.tla));
  const others = teams.filter((t) => !FAVOURITE_TLAS.has(t.tla));

  const assignments = {};
  for (const m of shuffledMembers) assignments[m] = [];

  // Round 1: one favourite per member.
  const shuffledFavs = shuffle(favourites);
  shuffledMembers.forEach((m, i) => {
    if (shuffledFavs[i]) assignments[m].push(shuffledFavs[i]);
  });

  // Rounds 2–3: deal the non-favourites + enough duplicates to fill 2 each.
  const slotsLeft = shuffledMembers.length * 2; // 36
  const extraCount = slotsLeft - others.length; // 36 - 30 = 6
  const extras = shuffle(others).slice(0, Math.max(0, extraCount));
  const pool = shuffle([...others, ...extras]);

  let t = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const m of shuffledMembers) {
      if (t >= pool.length) break;
      assignments[m].push(pool[t++]);
    }
  }

  // A member could draw the same non-favourite twice in rounds 2–3. Swap one
  // copy with another member's non-favourite, never touching favourites.
  fixDuplicates(assignments, shuffledMembers);
  return { assignments, order: shuffledMembers };
}

function fixDuplicates(assignments, order) {
  const has = (list, id) => list.some((t) => t.id === id);
  const swappable = (t) => !FAVOURITE_TLAS.has(t.tla); // never move a favourite
  let guard = 0;
  while (guard++ < 1000) {
    let fixedAny = false;
    for (const m of order) {
      const list = assignments[m];
      const dupIdx = list.findIndex((t, i) => list.findIndex((x) => x.id === t.id) !== i);
      if (dupIdx === -1) continue;
      const dupTeam = list[dupIdx]; // always a non-favourite (favs are unique)
      for (const other of order) {
        if (other === m) continue;
        const olist = assignments[other];
        if (has(olist, dupTeam.id)) continue; // would duplicate in `other`
        const k = olist.findIndex((cand) => swappable(cand) && !has(list, cand.id));
        if (k === -1) continue;
        [list[dupIdx], olist[k]] = [olist[k], dupTeam];
        fixedAny = true;
        break;
      }
      if (fixedAny) break;
    }
    if (!fixedAny) break;
  }
}

// Click-driven reveal state. The draw is one team at a time, controlled by the
// user: every non-favourite team first, then the favourites as a finale. The
// assignment logic in deal() is untouched — we just choose the reveal order.
let drawState = "idle"; // idle | drawing-others | drawing-favs | done
let revealQueue = [];   // [{ team, members: [name, ...] }, ...] non-favs then favs
let revealIndex = 0;
let favStartIndex = 0;  // index in revealQueue where favourites begin
let cardByMember = new Map();

// Group the dealt teams into reveal items keyed by team, so a non-favourite
// shared by two members is drawn once (and lands on both cards together).
// Non-favourites come first (shuffled), favourites last (shuffled finale).
function buildRevealQueue(assignments, order) {
  const byTeam = new Map();
  for (const m of order) {
    for (const team of assignments[m]) {
      if (!byTeam.has(team.id)) byTeam.set(team.id, { team, members: [] });
      byTeam.get(team.id).members.push(m);
    }
  }
  const items = [...byTeam.values()];
  const nonFavs = shuffle(items.filter((it) => !FAVOURITE_TLAS.has(it.team.tla)));
  const favs = shuffle(items.filter((it) => FAVOURITE_TLAS.has(it.team.tla)));
  return { queue: [...nonFavs, ...favs], favStartIndex: nonFavs.length };
}

function startDraw() {
  const { assignments, order } = deal();
  renderEmptyCards(order);
  cardByMember = new Map([...grid.children].map((c) => [c.dataset.member, c]));

  const built = buildRevealQueue(assignments, order);
  revealQueue = built.queue;
  favStartIndex = built.favStartIndex;
  revealIndex = 0;
  drawState = "drawing-others";

  // Store keyed by team id (stable) for the committed file. Download stays
  // disabled until every team has been revealed.
  lastAssignments = {};
  for (const m of order) lastAssignments[m] = assignments[m].map((t) => t.id);

  downloadBtn.disabled = true;
  drawBtn.textContent = "👇 Draw a team";
  statusEl.textContent = `The draw begins! Click to reveal each of the ${favStartIndex} underdog teams — favourites come last.`;
}

function revealItem(item, isFav) {
  for (const m of item.members) {
    const card = cardByMember.get(m);
    if (!card) continue;
    const slotsEl = card.querySelector(".slots");
    const el = document.createElement("div");
    el.className = isFav ? "slot favourite" : "slot";
    el.innerHTML = `${item.team.crest ? `<img src="${item.team.crest}" alt="" />` : "⚽"} <span>${item.team.name}</span>`;
    slotsEl.appendChild(el);
    card.classList.add("just-drawn");
    setTimeout(() => card.classList.remove("just-drawn"), 700);
  }
}

function revealNext() {
  if (revealIndex >= revealQueue.length) return;

  const isFav = revealIndex >= favStartIndex;
  revealItem(revealQueue[revealIndex++], isFav);

  if (revealIndex < favStartIndex) {
    statusEl.textContent = `Drawn ${revealIndex} of ${favStartIndex} underdog teams…`;
  } else if (revealIndex === favStartIndex) {
    // Last underdog just landed — set the stage for the favourites finale.
    drawState = "drawing-favs";
    drawBtn.textContent = "⭐ Reveal a favourite";
    statusEl.textContent = "✅ Every underdog is in! Now for the favourites…";
  } else if (revealIndex < revealQueue.length) {
    statusEl.textContent = `⭐ Favourite ${revealIndex - favStartIndex} of ${revealQueue.length - favStartIndex} drawn…`;
  } else {
    finishDraw();
  }
}

function finishDraw() {
  drawState = "idle"; // allow a fresh re-run from the same button
  statusEl.textContent = "🎉 Draw complete! Download the file and save it as data/assignments.json, then commit it.";
  downloadBtn.disabled = false;
  drawBtn.textContent = "🎲 Re-run the Draw";
  celebrate();
}

// One button drives everything: start a draw when idle, otherwise reveal the
// next team. This keeps the timing entirely in the user's hands.
function onDrawClick() {
  if (drawState === "idle") startDraw();
  else revealNext();
}

function downloadAssignments() {
  if (!lastAssignments) return;
  const payload = {
    lockedAt: new Date().toISOString(),
    assignments: lastAssignments,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "assignments.json";
  a.click();
  URL.revokeObjectURL(url);
}

function celebrate() {
  if (typeof confetti !== "function") return;
  const end = Date.now() + 800;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

drawBtn.addEventListener("click", onDrawClick);
downloadBtn.addEventListener("click", downloadAssignments);
loadData();
