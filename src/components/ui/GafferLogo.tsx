import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';

// PNG natural dimensions:
//   logo-wordmark.png  → 683 × 136 (≈ 5.02 : 1)
//   logo-mark.png      → 574 × 401 (≈ 1.43 : 1)
// The "-light" wordmark PNG in the design bundle is broken (whistle outline
// only — no text), so we always use the dark wordmark and tintColor it white
// when rendering on a dark surface.
const WORDMARK_ASPECT = 683 / 136;
const MARK_ASPECT = 574 / 401;

interface GafferLogoProps {
  size?: number;
  light?: boolean;
  variant?: 'wordmark' | 'mark';
  style?: StyleProp<ImageStyle>;
}

export function GafferLogo({
  size = 30,
  light = false,
  variant = 'wordmark',
  style,
}: GafferLogoProps) {
  const isMark = variant === 'mark';
  const src = isMark
    ? require('../../../assets/logos/logo-mark.png')
    : require('../../../assets/logos/logo-wordmark.png');
  const aspect = isMark ? MARK_ASPECT : WORDMARK_ASPECT;
  return (
    <Image
      source={src}
      style={[
        { height: size, width: size * aspect },
        light && { tintColor: '#FFFFFF' },
        style,
      ]}
      resizeMode="contain"
    />
  );
}
