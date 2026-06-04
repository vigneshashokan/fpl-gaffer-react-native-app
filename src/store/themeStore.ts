import { create } from 'zustand';
import { PaletteKey } from '@/constants/theme';

interface ThemeState {
  paletteKey: PaletteKey;
  dark: boolean;
  pitchStyle: 'realistic' | 'flat';
  setPaletteKey: (key: PaletteKey) => void;
  setDark: (dark: boolean) => void;
  setPitchStyle: (style: 'realistic' | 'flat') => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  paletteKey:    'classic',
  dark:          false,
  pitchStyle:    'realistic',
  setPaletteKey: (key)   => set({ paletteKey: key }),
  setDark:       (dark)  => set({ dark }),
  setPitchStyle: (style) => set({ pitchStyle: style }),
}));
