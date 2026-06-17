// Minimal no-framework test for the scoring module. Run: npm run test:scoring
import assert from "node:assert/strict";
import { computeTeamStats, computeLeagueTable } from "./scoring.js";

// Fixture: team 1 beats team 2 (regular), team 3 draws team 4,
// team 5 beats team 6 on penalties (winner already resolved by API),
// plus a not-yet-played match that must be ignored.
const matches = [
  { status: "FINISHED", homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: { winner: "HOME_TEAM", duration: "REGULAR" } },
  { status: "FINISHED", homeTeam: { id: 3 }, awayTeam: { id: 4 }, score: { winner: "DRAW", duration: "REGULAR" } },
  { status: "FINISHED", homeTeam: { id: 5 }, awayTeam: { id: 6 }, score: { winner: "AWAY_TEAM", duration: "PENALTY_SHOOTOUT" } },
  { status: "SCHEDULED", homeTeam: { id: 1 }, awayTeam: { id: 3 }, score: { winner: null } },
];

const stats = computeTeamStats(matches);
assert.equal(stats.get(1).points, 3, "home regular win = 3");
assert.equal(stats.get(2).points, 0, "loser = 0");
assert.equal(stats.get(3).points, 1, "draw = 1");
assert.equal(stats.get(4).points, 1, "draw = 1");
assert.equal(stats.get(6).points, 3, "penalty-shootout away winner = 3");
assert.equal(stats.get(5).points, 0, "penalty-shootout loser = 0");
assert.equal(stats.get(1).played, 1, "scheduled match not counted");

const assignments = { Alice: [1, 3], Bob: [2, 4, 6] };
const teamsById = { 1: { name: "A", tla: "AAA" }, 3: { name: "C" }, 6: { name: "F" } };
const table = computeLeagueTable(matches, assignments, teamsById);

// Alice owns 1(W=3) + 3(D=1) = 4 pts, 1 win. Bob owns 2(L=0) + 4(D=1) + 6(W=3) = 4 pts, 1 win.
// Tie on points(4) and wins(1) → name ascending puts Alice first.
assert.equal(table[0].points, 4);
assert.equal(table[1].points, 4);
assert.equal(table[0].wins, 1);
assert.equal(table[1].wins, 1);
assert.deepEqual(table.map((r) => r.member), ["Alice", "Bob"], "equal points+wins → name asc");

console.log("✅ scoring tests passed");
