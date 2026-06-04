import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';

interface PitchMarksProps {
  opacity?: number;
}

export function PitchMarks({ opacity = 0.5 }: PitchMarksProps) {
  const s = { fill: 'none', stroke: '#fff', strokeWidth: 0.5, strokeOpacity: opacity } as const;
  return (
    <Svg viewBox="0 0 100 150" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Rect x="2" y="2" width="96" height="146" {...s} />
      <Line x1="2" y1="75" x2="98" y2="75" {...s} />
      <Circle cx="50" cy="75" r="13" {...s} />
      <Circle cx="50" cy="75" r="0.8" fill="#fff" fillOpacity={opacity} stroke="none" />
      {/* top penalty area + goal area */}
      <Rect x="26" y="2" width="48" height="22" {...s} />
      <Rect x="39" y="2" width="22" height="9" {...s} />
      {/* bottom penalty area + goal area */}
      <Rect x="26" y="126" width="48" height="22" {...s} />
      <Rect x="39" y="139" width="22" height="9" {...s} />
    </Svg>
  );
}
