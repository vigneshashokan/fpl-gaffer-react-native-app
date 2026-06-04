import React from 'react';
import { Text, StyleSheet } from 'react-native';

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export const POS_COLOR: Record<Position, { bg: string; fg: string }> = {
  GKP: { bg: '#2B2240', fg: '#C9B6FF' },
  DEF: { bg: '#06402a', fg: '#52E39A' },
  MID: { bg: '#063a45', fg: '#3FD6E8' },
  FWD: { bg: '#451434', fg: '#FF77B0' },
};

interface PosTagProps {
  pos: Position;
  size?: number;
}

export function PosTag({ pos, size = 12 }: PosTagProps) {
  const c = POS_COLOR[pos] ?? POS_COLOR.MID;
  return (
    <Text
      style={[
        styles.base,
        {
          fontSize: size,
          color: c.fg,
          backgroundColor: c.bg,
          paddingVertical: size * 0.28,
          paddingHorizontal: size * 0.5,
        },
      ]}
    >
      {pos}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: 'Archivo_800ExtraBold',
    letterSpacing: 0.48,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
