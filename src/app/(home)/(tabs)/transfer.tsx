import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { APEX_TEAM, TransferPitchPlayer } from '@/constants/data';
import { TransferInfoCard } from '@/components/transfer/TransferInfoCard';
import { DeadlineBanner } from '@/components/transfer/DeadlineBanner';
import { ChipsRow } from '@/components/transfer/ChipsRow';
import { TransferPitch } from '@/components/transfer/TransferPitch';
import { TransferSuggestionsCard } from '@/components/transfer/TransferSuggestionsCard';

export default function TransferTab() {
  const router = useRouter();
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const tr = APEX_TEAM.transfer;

  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';

  const openPlayer = (p: TransferPitchPlayer) => {
    router.push({
      pathname: '/(home)/player/[name]',
      params: { name: p.name },
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tk.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topGroup}>
        <DeadlineBanner nextGw={tr.nextGw} deadline={tr.deadline} tk={tk} />
        <TransferInfoCard
          teamName={APEX_TEAM.teamName}
          nextGw={tr.nextGw}
          squadValue={tr.squadValue}
          freeTransfers={tr.freeTransfers}
          inBank={tr.inBank}
          gradFrom={heroFrom}
          gradTo={heroTo}
        />
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: tk.faint }]}>Play a Chip</Text>
      </View>
      <ChipsRow chips={tr.chips} tk={tk} />

      <View style={styles.pitchWrap}>
        <TransferPitch
          rows={tr.pitch}
          pitchStyle={pitchStyle}
          onPlayerPress={openPlayer}
        />
        <Text style={[styles.hint, { color: tk.faint }]}>
          Tap on any player to see transfer targets
        </Text>
      </View>

      <View style={styles.suggestionsWrap}>
        <TransferSuggestionsCard suggestions={tr.transferSuggestions} tk={tk} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  topGroup: {
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  section: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pitchWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  hint: {
    textAlign: 'center',
    fontFamily: 'Archivo_500Medium',
    fontStyle: 'italic',
    fontSize: 13.5,
    paddingVertical: 14,
  },
  suggestionsWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
});
