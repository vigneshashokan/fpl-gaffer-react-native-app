// src/__tests__/api/playerSummary.test.tsx
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  last5FromHistory,
  next5Fixtures,
  useElementSummary,
} from '@/api/playerSummary';
import { makeTestQueryClient } from '../utils/renderWithProviders';

jest.mock('@/api/fpl-client', () => ({ fplGet: jest.fn() }));
import { fplGet } from '@/api/fpl-client';

beforeEach(() => jest.clearAllMocks());

describe('last5FromHistory', () => {
  it('returns the last 5 rounds ascending as {round, points}', () => {
    const history = [
      { round: 1, total_points: 2 },
      { round: 2, total_points: 7 },
      { round: 3, total_points: 0 },
      { round: 4, total_points: 12 },
      { round: 5, total_points: 5 },
      { round: 6, total_points: 9 },
    ];
    expect(last5FromHistory(history)).toEqual([
      { round: 2, points: 7 },
      { round: 3, points: 0 },
      { round: 4, points: 12 },
      { round: 5, points: 5 },
      { round: 6, points: 9 },
    ]);
  });
  it('handles fewer than 5 rounds', () => {
    expect(last5FromHistory([{ round: 1, total_points: 3 }])).toEqual([
      { round: 1, points: 3 },
    ]);
  });
});

describe('next5Fixtures', () => {
  it('maps up to 5 fixtures, resolving opponent by home/away', () => {
    const fixtures = [
      { event: 7, is_home: true, team_h: 13, team_a: 1, difficulty: 2 },
      { event: 8, is_home: false, team_h: 4, team_a: 13, difficulty: 4 },
    ];
    expect(next5Fixtures(fixtures)).toEqual([
      { event: 7, isHome: true, opponentTeamId: 1, difficulty: 2 },
      { event: 8, isHome: false, opponentTeamId: 4, difficulty: 4 },
    ]);
  });
});

describe('useElementSummary', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={makeTestQueryClient()}>{children}</QueryClientProvider>
  );
  it('fetches element-summary for the id', async () => {
    (fplGet as jest.Mock).mockResolvedValueOnce({ history: [], fixtures: [] });
    const { result } = renderHook(() => useElementSummary('401'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fplGet).toHaveBeenCalledWith('/element-summary/401/');
  });
  it('stays idle when id is undefined', () => {
    const { result } = renderHook(() => useElementSummary(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fplGet).not.toHaveBeenCalled();
  });
});
