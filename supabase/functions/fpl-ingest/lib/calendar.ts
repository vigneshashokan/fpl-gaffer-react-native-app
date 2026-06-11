// Season + transfer-window dates. Bumped via PR at season rollover.
//
// Dates are compared as half-open UTC intervals: `[start, end)`. The end
// constant is the FIRST EXCLUDED instant (start of the day after the last
// in-window day) so millisecond-precision comparisons work correctly.

const PL_SEASON_START = new Date('2026-08-15T00:00:00Z');
const PL_SEASON_END   = new Date('2027-05-26T00:00:00Z'); // first excluded instant

const TRANSFER_WINDOWS: ReadonlyArray<{ start: Date; end: Date }> = [
  { start: new Date('2026-06-15T00:00:00Z'), end: new Date('2026-09-02T00:00:00Z') }, // ends are first-excluded
  { start: new Date('2027-01-01T00:00:00Z'), end: new Date('2027-02-02T00:00:00Z') },
];

export function isPLSeasonActive(d: Date): boolean {
  return d >= PL_SEASON_START && d < PL_SEASON_END;
}

export function isInTransferWindow(d: Date): boolean {
  return TRANSFER_WINDOWS.some((w) => d >= w.start && d < w.end);
}

/**
 * Bootstrap data (teams/players) should be refreshed:
 *   - During any transfer window (roster changes are live), or
 *   - During the season-launch period (August–September) when the season
 *     kicks off and initial squad data needs to be seeded.
 *
 * Mid-season months (Oct–Dec, Mar–May) see very few structural changes to
 * the bootstrap endpoint, so we skip those by default unless force=1.
 */
export function isBootstrapRefreshWindow(d: Date): boolean {
  if (isInTransferWindow(d)) return true;
  if (!isPLSeasonActive(d)) return false;
  const month = d.getUTCMonth(); // 0=Jan … 7=Aug, 8=Sep
  return month === 7 || month === 8; // August or September
}
