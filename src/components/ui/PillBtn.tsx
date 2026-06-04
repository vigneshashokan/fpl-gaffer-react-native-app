import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

type Variant = 'solid' | 'accent' | 'ghost' | 'outline';

interface PillBtnProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: Variant;
  style?: ViewStyle;
  primaryColor?: string;
  accentInk?: string;
  textColor?: string;
  borderColor?: string;
}

export function PillBtn({
  children,
  onPress,
  variant = 'solid',
  style,
  primaryColor = '#37003C',
  accentInk = '#06351E',
  textColor = '#74627E',
  borderColor = 'rgba(40,0,48,0.16)',
}: PillBtnProps) {
  const containerStyle: ViewStyle = {
    ...styles.base,
    ...(variant === 'solid'   && { backgroundColor: primaryColor }),
    ...(variant === 'accent'  && { backgroundColor: '#00E676' }),
    ...(variant === 'ghost'   && { backgroundColor: 'transparent' }),
    ...(variant === 'outline' && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor }),
    ...(style as object),
  };
  const textStyle: TextStyle = {
    ...styles.label,
    ...(variant === 'solid'   && { color: '#fff' }),
    ...(variant === 'accent'  && { color: accentInk }),
    ...(variant === 'ghost'   && { color: textColor }),
    ...(variant === 'outline' && { color: textColor }),
  };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
    >
      <Text style={textStyle}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  } as ViewStyle,
  label: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 15,
  } as TextStyle,
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
});
