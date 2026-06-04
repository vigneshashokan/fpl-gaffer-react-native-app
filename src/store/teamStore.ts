import { create } from 'zustand';

interface PendingChange {
  id: string;
  type: 'suggestion' | 'transfer' | 'captain';
}

interface TeamState {
  pendingChanges: PendingChange[];
  captainApplied: string;
  appliedSuggestions: Set<string>;
  addChange: (change: PendingChange) => void;
  removeChange: (id: string) => void;
  clearChanges: () => void;
  setCaptain: (name: string) => void;
  toggleSuggestion: (id: string) => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  pendingChanges:     [],
  captainApplied:     'Haaland',
  appliedSuggestions: new Set(),

  addChange: (change) =>
    set((s) => ({ pendingChanges: [...s.pendingChanges, change] })),

  removeChange: (id) =>
    set((s) => ({ pendingChanges: s.pendingChanges.filter((c) => c.id !== id) })),

  clearChanges: () => set({ pendingChanges: [] }),

  setCaptain: (name) => set({ captainApplied: name }),

  toggleSuggestion: (id) => {
    const next = new Set(get().appliedSuggestions);
    if (next.has(id)) next.delete(id); else next.add(id);
    set({ appliedSuggestions: next });
  },
}));
