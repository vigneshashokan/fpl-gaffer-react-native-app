import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface PointPillProps {
  pts?: number | null;
  name: string;
  upcoming?: boolean;
  maxWidth?: number;
  /** FPL bonus 0–3; >= 1 swaps the points disc for a gold star. */
  bonus?: number;
}

export function PointPill({
  pts,
  name,
  upcoming = false,
  maxWidth = 96,
  bonus,
}: PointPillProps) {
  const played = pts != null;
  const hasBonus = !upcoming && played && (bonus ?? 0) >= 1;
  const numBg = hasBonus ? 'transparent' : played ? '#7B09E5' : 'rgba(255,255,255,0.22)';
  return (
    <View style={[styles.container, { maxWidth }]}>
      {!upcoming && (
        <View style={[styles.num, { backgroundColor: numBg }]}>
          {hasBonus && (
            <Svg width={22} height={22} viewBox="0 0 32 30" style={styles.star} testID="bonus-star">
              <Path
                d="M16 2l4.2 8.6 9.5 1.4-6.9 6.7 1.6 9.5L16 23.7 7.5 28.2l1.6-9.5L2.2 12l9.5-1.4z"
                fill="#FFC400"
              />
            </Svg>
          )}
          {/* Rendered after the star so the number paints on top (RN stacks
              later siblings above earlier ones). */}
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
    gap: 3,
    backgroundColor: 'rgb(19,27,46)',
    borderRadius: 999,
    paddingVertical: 1,
    paddingLeft: 1,
    paddingRight: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  num: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Star is slightly larger than the 18×18 disc, so it bleeds a couple px past
  // the edge by design (overflow is visible in RN by default).
  star: {
    position: 'absolute',
    top: -2,
    left: -2,
  },
  numText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 10.5,
    color: '#fff',
  },
  numTextBonus: { color: '#3a2a00' },
  name: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    letterSpacing: -0.12,
    // No flexShrink: the name keeps its full width so the pill grows to fit it
    // (and overflows the fixed avatar slot) instead of truncating to the slot.
  },
});
