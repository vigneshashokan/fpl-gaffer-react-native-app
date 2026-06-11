export interface FixtureRaw {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export interface FixtureRow {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export function normalizeFixtures(raw: FixtureRaw[]): FixtureRow[] {
  return raw.map((f) => ({
    id: f.id,
    event: f.event,
    kickoff_time: f.kickoff_time,
    team_h: f.team_h,
    team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty,
    team_a_difficulty: f.team_a_difficulty,
    team_h_score: f.team_h_score,
    team_a_score: f.team_a_score,
    started: f.started,
    finished: f.finished,
    finished_provisional: f.finished_provisional,
  }));
}

// Projection excludes scores: those change as matches play but aren't what we
// hash-gate on. We only care about scheduling shape (id, event, kickoff, sides,
// finished status). Sort by id so callers can't accidentally desynchronise the
// hash by passing an array in a different order.
export function projectForHash(rows: FixtureRow[]): string {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const projection = sorted.map((r) => [
    r.id,
    r.event,
    r.kickoff_time,
    r.team_h,
    r.team_a,
    r.finished,
  ]);
  return JSON.stringify(projection);
}
