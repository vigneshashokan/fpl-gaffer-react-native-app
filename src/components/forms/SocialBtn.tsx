import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Icon } from '@/components/ui/Icon';

interface SocialBtnProps {
  provider: 'google' | 'apple';
  onPress: () => void;
}

export function SocialBtn({ provider, onPress }: SocialBtnProps) {
  const isGoogle = provider === 'google';
  const containerStyle: ViewStyle = {
    ...styles.container,
    backgroundColor: isGoogle ? '#fff' : '#000',
    ...(isGoogle && { borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.10)' }),
  };
  const textStyle: TextStyle = {
    ...styles.label,
    color: isGoogle ? '#1a1a1a' : '#fff',
  };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Icon name={provider} color={isGoogle ? '#1a1a1a' : '#fff'} size={22} />
        <Text style={textStyle}>
          Continue with {isGoogle ? 'Google' : 'Apple'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
});
