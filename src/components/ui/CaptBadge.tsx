import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function CaptBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>C</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    backgroundColor: '#7B09E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  text: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 11,
    color: '#fff',
    lineHeight: 13,
  },
});
