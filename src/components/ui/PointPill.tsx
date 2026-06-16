import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface PointPillProps {
  pts?: number | null;
  name: string;
  upcoming?: boolean;
  maxWidth?: number;
  capt?: boolean;
  vice?: boolean;
  bonus?: number;
}

export function PointPill({
  pts,
  name,
  upcoming = false,
  maxWidth = 96,
  capt,
  vice,
  bonus,
}: PointPillProps) {
  const played = pts != null;
  const hasBonus = !upcoming && played && (bonus ?? 0) >= 1;
  const numBg = hasBonus ? 'transparent' : played ? '#7B09E5' : 'rgba(255,255,255,0.22)';
  return (
    <View style={[styles.container, { maxWidth }]}>
      {!upcoming && capt && (
        <View style={[styles.chip, styles.chipC]}>
          <Text style={styles.chipCText}>C</Text>
        </View>
      )}
      {!upcoming && vice && (
        <View style={[styles.chip, styles.chipV]}>
          <Text style={styles.chipVText}>V</Text>
        </View>
      )}
      {!upcoming && (
        <View style={[styles.num, { backgroundColor: numBg }]}>
          {hasBonus && (
            <Svg width={28} height={28} viewBox="0 0 32 30" style={styles.star} testID="bonus-star">
              <Path
                d="M16 2l4.2 8.6 9.5 1.4-6.9 6.7 1.6 9.5L16 23.7 7.5 28.2l1.6-9.5L2.2 12l9.5-1.4z"
                fill="#FFC400"
              />
            </Svg>
          )}
          <Text style={[styles.numText, hasBonus && styles.numTextBonus]}>
            {played ? String(pts) : '–'}
          </Text>
        </View>
      )}
      <Text
        style={[styles.name, { color: played || upcoming ? '#fff' : '#C4CAD6' }]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgb(19,27,46)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipC: { backgroundColor: '#7B09E5' },
  chipV: { backgroundColor: '#C4B5FD' },
  chipCText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 10, color: '#fff' },
  chipVText: { fontFamily: 'Archivo_800ExtraBold', fontSize: 10, color: '#3D1A78' },
  num: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  star: {
    position: 'absolute',
    top: -5,
    left: -5,
    zIndex: 0,
  },
  numText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 10.5,
    color: '#fff',
    zIndex: 1,
  },
  numTextBonus: { color: '#3a2a00' },
  name: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    letterSpacing: -0.12,
  },
});
