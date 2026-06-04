import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ApexPitchMarks } from '@/components/pitch/ApexPitchMarks';
import { AvatarDisc } from '@/components/ui/AvatarDisc';
import { PointPill } from '@/components/ui/PointPill';
import { TransferPitchPlayer } from '@/constants/data';

interface TransferPitchProps {
  rows: TransferPitchPlayer[][];
  pitchStyle?: 'realistic' | 'flat';
  onPlayerPress?: (p: TransferPitchPlayer) => void;
}

export function TransferPitch({
  rows,
  pitchStyle = 'realistic',
  onPlayerPress,
}: TransferPitchProps) {
  const grassColor = pitchStyle === 'flat' ? '#1FA257' : '#1FA65B';
  return (
    <View style={[styles.container, { backgroundColor: grassColor }]}>
      <ApexPitchMarks />
      <View style={styles.rows}>
        {rows.map((row, i) => {
          // GKP row sits inside a half-width band so the keeper is centred
          // between the goal posts.
          const isKeeperRow = row[0]?.pos === 'GKP';
          return (
            <View key={i} style={styles.row}>
              {isKeeperRow ? (
                <View style={styles.keeperBand}>
                  {row.map((p) => (
                    <TransferPlayer key={p.name} p={p} onPress={onPlayerPress} />
                  ))}
                </View>
              ) : (
                row.map((p) => (
                  <TransferPlayer key={p.name} p={p} onPress={onPlayerPress} />
                ))
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface TransferPlayerProps {
  p: TransferPitchPlayer;
  onPress?: (p: TransferPitchPlayer) => void;
}

function TransferPlayer({ p, onPress }: TransferPlayerProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.player,
        pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
      ]}
      onPress={onPress ? () => onPress(p) : undefined}
    >
      <View style={styles.pricePill}>
        <Text style={styles.priceText}>£{p.p.toFixed(1)}m</Text>
      </View>
      <AvatarDisc size={46} player={p} />
      <PointPill name={p.name} upcoming />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 2,
  },
  rows: {
    position: 'relative',
    flexDirection: 'column',
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  keeperBand: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  player: {
    alignItems: 'center',
    gap: 5,
    width: 72,
  },
  pricePill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  priceText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 12,
    color: '#1A2236',
    letterSpacing: -0.24,
  },
});
