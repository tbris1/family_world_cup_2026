// Pure scoring logic — no DOM, no fetch. Imported by the browser table view
// AND by the Node test. Keep it side-effect free so it stays easy to reason
// about and test.
//
// Scoring rule (confirmed): 3 points for a win, 1 for a draw, summed across
// every match each of a member's teams plays, at ALL stages. The API resolves
// extra-time / penalty-shootout winners into score.winner = HOME_TEAM /
// AWAY_TEAM, so knockout wins are awarded correctly with no special handling.

export const POINTS = { WIN: 3, DRAW: 1, LOSS: 0 };

// A match counts once its result is final.
const FINAL_STATUSES = new Set(["FINISHED", "AWARDED"]);

/**
 * Build per-team records from the match list.
 * @returns Map<teamId, {wins, draws, losses, points, played}>
 */
export function computeTeamStats(matches) {
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)) stats.set(id, { wins: 0, draws: 0, losses: 0, points: 0, played: 0 });
    return stats.get(id);
  };

  for (const m of matches) {
    if (!FINAL_STATUSES.has(m.status)) continue;
    const homeId = m.homeTeam?.id;
    const awayId = m.awayTeam?.id;
    if (homeId == null || awayId == null) continue; // unscheduled knockout slot

    const home = ensure(homeId);
    const away = ensure(awayId);
    home.played++;
    away.played++;

    const winner = m.score?.winner;
    if (winner === "DRAW") {
      home.draws++; home.points += POINTS.DRAW;
      away.draws++; away.points += POINTS.DRAW;
    } else if (winner === "HOME_TEAM") {
      home.wins++; home.points += POINTS.WIN;
      away.losses++;
    } else if (winner === "AWAY_TEAM") {
      away.wins++; away.points += POINTS.WIN;
      home.losses++;
    }
    // winner null on a final match (rare/abandoned) → counts as played, 0 pts.
  }
  return stats;
}

/**
 * Aggregate team stats into a per-member league table.
 * @param {Array} matches    trimmed match objects from data/matches.json
 * @param {Object} assignments  { "Tom": [teamId, ...], ... }
 * @param {Map|Object} teamsById  lookup teamId -> { name, tla, crest }
 * @returns sorted array of member rows (points desc, then wins desc, then name asc)
 */
export function computeLeagueTable(matches, assignments, teamsById) {
  const teamStats = computeTeamStats(matches);
  const lookup = teamsById instanceof Map ? teamsById : new Map(Object.entries(teamsById ?? {}).map(([k, v]) => [Number(k), v]));

  const rows = Object.entries(assignments ?? {}).map(([member, teamIds]) => {
    const row = { member, points: 0, wins: 0, draws: 0, losses: 0, played: 0, teams: [] };
    for (const id of teamIds) {
      const s = teamStats.get(id) ?? { wins: 0, draws: 0, losses: 0, points: 0, played: 0 };
      row.points += s.points;
      row.wins += s.wins;
      row.draws += s.draws;
      row.losses += s.losses;
      row.played += s.played;
      const info = lookup.get(id) ?? {};
      row.teams.push({
        id,
        name: info.name ?? String(id),
        tla: info.tla ?? "",
        crest: info.crest ?? "",
        points: s.points,
        wins: s.wins,
        draws: s.draws,
        losses: s.losses,
      });
    }
    // Show a member's strongest teams first.
    row.teams.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    return row;
  });

  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.member.localeCompare(b.member));
  return rows;
}
