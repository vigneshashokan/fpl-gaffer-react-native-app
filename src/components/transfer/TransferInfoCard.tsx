import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface TransferInfoCardProps {
  teamName: string;
  nextGw: number;
  squadValue: number;
  freeTransfers: number;
  inBank: number;
  gradFrom: string;
  gradTo: string;
}

export function TransferInfoCard({
  teamName,
  nextGw,
  squadValue,
  freeTransfers,
  inBank,
  gradFrom,
  gradTo,
}: TransferInfoCardProps) {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[gradFrom, gradTo]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.teamName} numberOfLines={1}>
              {teamName}
            </Text>
            <Text style={styles.label}>Gameweek {nextGw}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.label}>Squad Value</Text>
            <Text style={styles.squadValue}>£{squadValue.toFixed(1)}m</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.label}>Free Transfers</Text>
            <Text style={styles.statValue}>{freeTransfers}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.label}>In the Bank</Text>
            <Text style={styles.statValue}>£{inBank.toFixed(1)}m</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  inner: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  teamName: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 23,
    letterSpacing: -0.46,
    color: '#fff',
  },
  label: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 12,
    textAlign: 'center',
  },
  squadValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    color: '#fff',
    letterSpacing: -0.66,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 10,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statValue: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 22,
    color: '#fff',
    marginTop: 4,
  },
});
