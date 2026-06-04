import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle, Line } from 'react-native-svg';

export function ApexPitchMarks() {
  const m = { fill: 'none', stroke: '#fff', strokeWidth: 0.5, strokeOpacity: 0.5 } as const;
  return (
    <Svg viewBox="0 0 100 150" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      {/* outline */}
      <Rect x="3" y="3" width="94" height="144" {...m} />
      {/* centre arc — lower half of centre circle, sitting on halfway line */}
      <Path d="M37.5 3 A 12.5 18 0 0 0 62.5 3" {...m} />
      <Circle cx="50" cy="3" r="0.9" fill="#fff" fillOpacity={0.5} stroke="none" />
      {/* penalty area */}
      <Rect x="22" y="110" width="56" height="37" {...m} />
      {/* goal area (6-yard box) */}
      <Rect x="37.5" y="134" width="25" height="13" {...m} />
      {/* penalty spot */}
      <Circle cx="50" cy="124" r="0.9" fill="#fff" fillOpacity={0.5} stroke="none" />
      {/* penalty D arc */}
      <Path d="M40 110 A 13 15 0 0 1 60 110" {...m} />
      {/* goal line */}
      <Line x1="44" y1="147" x2="56" y2="147" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.3} />
    </Svg>
  );
}
