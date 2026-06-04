import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '@/components/ui/Icon';
import { Suggestion } from '@/constants/data';
import { ApexTokens } from '@/constants/apexTokens';

interface SuggestionsCardProps {
  suggestions: Suggestion[];
  tk: ApexTokens;
}

export function SuggestionsCard({ suggestions, tk }: SuggestionsCardProps) {
  return (
    <View style={[styles.container, { backgroundColor: tk.card, borderColor: tk.cardBorder, opacity: 0.72 }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 3a6 6 0 00-3.5 10.9c.5.4.8 1 .9 1.6l.2 1h4.8l.2-1c.1-.6.4-1.2.9-1.6A6 6 0 0012 3z"
              fill={tk.faint}
            />
            <Path
              d="M9.5 19.5h5M10 21.5h4"
              stroke={tk.faint}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
          <Text style={[styles.title, { color: tk.text }]}>Team Suggestions</Text>
        </View>
        <View
          style={[
            styles.lockedBadge,
            { backgroundColor: tk.headStrip, borderColor: tk.cardBorder },
          ]}
        >
          <Text style={[styles.lockedText, { color: tk.faint }]}>Locked</Text>
        </View>
      </View>

      <Text style={[styles.note, { color: tk.faint }]}>
        Gameweek is live — suggestions are locked.
      </Text>

      {suggestions.map((s, i) => {
        const done = s.wasApplied;
        return (
          <View
            key={s.id}
            style={[
              styles.row,
              {
                backgroundColor: done ? tk.greenSoft : 'transparent',
                borderColor: done ? tk.green : 'transparent',
                marginTop: i === 0 ? 12 : 8,
                opacity: done ? 1 : 0.6,
              },
            ]}
          >
            <View style={[styles.iconBox, { backgroundColor: tk.headStrip }]}>
              <Icon name="swap" color={tk.faint} size={18} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.suggestRow}>
                <Text style={[styles.text, { color: tk.text }]}>{s.text}</Text>
                <View style={[styles.gain, { backgroundColor: tk.greenSoft }]}>
                  <Text style={[styles.gainText, { color: tk.green }]}>{s.gain}</Text>
                </View>
              </View>
              <Text style={[styles.detail, { color: tk.faint }]}>{s.detail}</Text>
            </View>
            {done ? (
              <View style={styles.statusRow}>
                <Icon name="check" color={tk.green} size={16} />
                <Text style={[styles.statusText, { color: tk.green }]}>Applied</Text>
              </View>
            ) : (
              <Text style={[styles.statusText, { color: tk.faint }]}>Not applied</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  title: {
    fontFamily: 'Archivo_800ExtraBold',
    fontSize: 17,
    letterSpacing: -0.17,
  },
  lockedBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  lockedText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
    letterSpacing: 0.33,
    textTransform: 'uppercase',
  },
  note: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 12,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  text: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 14,
    letterSpacing: -0.14,
  },
  gain: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
  },
  gainText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 11,
  },
  detail: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12,
  },
});
