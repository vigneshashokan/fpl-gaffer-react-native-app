import { assertEquals, assertNotEquals } from '@std/assert';
import {
  normalizeFixtures,
  projectForHash,
  type FixtureRaw,
} from '../sources/fixtures.ts';

async function loadFixture(): Promise<FixtureRaw[]> {
  const url = new URL('./_fixtures/fixtures.json', import.meta.url);
  const txt = await Deno.readTextFile(url);
  return JSON.parse(txt) as FixtureRaw[];
}

Deno.test('normalizeFixtures maps all columns, preserving nulls for event/kickoff', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  assertEquals(rows.length, 3);
  assertEquals(rows[0].id, 1);
  assertEquals(rows[0].event, 1);
  assertEquals(rows[0].kickoff_time, '2026-08-15T11:30:00Z');
  assertEquals(rows[0].team_h, 1);
  assertEquals(rows[0].team_a, 12);
  assertEquals(rows[0].team_h_difficulty, 3);
  assertEquals(rows[0].team_a_difficulty, 4);
  assertEquals(rows[0].started, false);
  assertEquals(rows[0].finished, false);
  assertEquals(rows[0].finished_provisional, false);
  assertEquals(rows[2].event, null);
  assertEquals(rows[2].kickoff_time, null);
});

Deno.test('projectForHash is deterministic for the same input', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  assertEquals(projectForHash(rows), projectForHash(rows));
});

Deno.test('projectForHash differs when a fixture is added', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const extra = [...rows, { ...rows[0], id: 999 }];
  assertNotEquals(projectForHash(rows), projectForHash(extra));
});

Deno.test('projectForHash differs when kickoff_time changes (postponement)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const shifted = rows.map((r, i) =>
    i === 0 ? { ...r, kickoff_time: '2026-08-22T11:30:00Z' } : r,
  );
  assertNotEquals(projectForHash(rows), projectForHash(shifted));
});

Deno.test('projectForHash IGNORES score changes (live scoring is #37)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const withScore = rows.map((r, i) =>
    i === 0 ? { ...r, team_h_score: 2, team_a_score: 1 } : r,
  );
  assertEquals(projectForHash(rows), projectForHash(withScore));
});

Deno.test('projectForHash respects fixture order (sorted by id)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const reordered = [...rows].reverse();
  assertEquals(projectForHash(rows), projectForHash(reordered));
});
