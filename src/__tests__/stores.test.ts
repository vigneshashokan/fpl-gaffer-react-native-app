import { act } from 'react';
import { useThemeStore } from '../store/themeStore';
import { useTeamStore } from '../store/teamStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ paletteKey: 'classic', dark: false, pitchStyle: 'realistic' });
  });

  it('initialises with classic light realistic', () => {
    const s = useThemeStore.getState();
    expect(s.paletteKey).toBe('classic');
    expect(s.dark).toBe(false);
    expect(s.pitchStyle).toBe('realistic');
  });

  it('toggles dark mode', () => {
    act(() => useThemeStore.getState().setDark(true));
    expect(useThemeStore.getState().dark).toBe(true);
  });

  it('sets pitch style', () => {
    act(() => useThemeStore.getState().setPitchStyle('flat'));
    expect(useThemeStore.getState().pitchStyle).toBe('flat');
  });
});

describe('teamStore', () => {
  beforeEach(() => {
    useTeamStore.setState({ pendingChanges: [], captainApplied: 'Haaland', appliedSuggestions: new Set() });
  });

  it('initialises with no pending changes', () => {
    expect(useTeamStore.getState().pendingChanges).toHaveLength(0);
  });

  it('adds a pending change', () => {
    act(() => useTeamStore.getState().addChange({ id: 'c1', type: 'suggestion' }));
    expect(useTeamStore.getState().pendingChanges).toHaveLength(1);
  });

  it('clears pending changes', () => {
    act(() => useTeamStore.getState().addChange({ id: 'c1', type: 'suggestion' }));
    act(() => useTeamStore.getState().clearChanges());
    expect(useTeamStore.getState().pendingChanges).toHaveLength(0);
  });

  it('tracks applied suggestions', () => {
    act(() => useTeamStore.getState().toggleSuggestion('s1'));
    expect(useTeamStore.getState().appliedSuggestions.has('s1')).toBe(true);
    act(() => useTeamStore.getState().toggleSuggestion('s1'));
    expect(useTeamStore.getState().appliedSuggestions.has('s1')).toBe(false);
  });
});
