import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { apexTokens } from '@/constants/apexTokens';
import { APEX_TEAM } from '@/constants/data';
import { ApexPitch } from '@/components/pitch/ApexPitch';
import { HeroCard } from '@/components/team/HeroCard';
import { ApexDugout } from '@/components/team/ApexDugout';
import { CaptainPickCard } from '@/components/team/CaptainPickCard';
import { SuggestionsCard } from '@/components/team/SuggestionsCard';
import { GwNavBar } from '@/components/team/GwNavBar';

export default function TeamTab() {
  const { paletteKey, dark, pitchStyle } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const tk = apexTokens(dark, paletteKey);
  const at = APEX_TEAM;

  // Pick the gradient endpoints from the palette via the theme primary.
  const heroFrom = t.primary;
  const heroTo = dark ? '#0C1018' : '#5B0F63';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <GwNavBar gw={at.gw} state="live" disablePrev={at.gw <= 1} tk={tk} />

      <HeroCard
        teamName={at.teamName}
        totalPoints={at.totalPoints}
        gwPts={at.gwPts}
        avgPoints={at.avgPoints}
        highestPoints={at.highestPoints}
        gradFrom={heroFrom}
        gradTo={heroTo}
      />

      <View style={styles.section}>
        <ApexPitch rows={at.pitch} pitchStyle={pitchStyle} upcoming={false} />
      </View>

      <View style={styles.section}>
        <ApexDugout
          players={at.bench}
          card={tk.card}
          cardBorder={tk.cardBorder}
          faint={tk.faint}
        />
      </View>

      <View style={styles.section}>
        <CaptainPickCard
          picks={at.captainPicks}
          captainApplied={at.captainApplied}
          tk={tk}
        />
      </View>

      <View style={styles.section}>
        <SuggestionsCard suggestions={at.suggestions} tk={tk} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginTop: 16,
  },
});
