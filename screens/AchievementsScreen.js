// src/screens/AchievementsScreen.js
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getRecords, getEconomy, getAchievements } from '../utils/storage';
import { checkAchievements } from '../utils/achievements';
import { RADIUS, SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';

export default function AchievementsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const [achievements, setAchievements] = useState([]);

  const load = useCallback(async () => {
    const [records, economy] = await Promise.all([getRecords(), getEconomy(), getAchievements()]);
    const results = await checkAchievements(records, economy);
    setAchievements(results);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.headerTitle}>Conquistas</Text>
          <Text style={styles.headerSub}>Seu progresso em conquistas</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn}>
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats Card */}
      <View style={[styles.statsCard, { backgroundColor: colors.card }, SHADOW.medium]}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primaryDark }]}>{unlockedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Desbloqueadas</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primaryDark }]}>{totalCount - unlockedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Bloqueadas</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: colors.primaryDark }]}>{totalCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total</Text>
          </View>
        </View>
      </View>

      {/* Unlocked */}
      {unlockedCount > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>✅ Desbloqueadas</Text>
          {achievements.filter((a) => a.unlocked).map((achievement) => (
            <View key={achievement.id} style={[styles.achievementCardUnlocked, { backgroundColor: colors.card, borderColor: colors.primary }, SHADOW.small]}>
              <View style={[styles.achievementIcon, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.achievementEmoji}>{achievement.icon}</Text>
              </View>
              <View style={styles.achievementInfo}>
                <Text style={[styles.achievementTitle, { color: colors.text }]}>{achievement.title}</Text>
                <Text style={[styles.achievementDesc, { color: colors.textSecondary }]}>{achievement.description}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            </View>
          ))}
        </View>
      )}

      {/* Locked */}
      {totalCount - unlockedCount > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>🔒 Bloqueadas</Text>
          {achievements.filter((a) => !a.unlocked).map((achievement) => (
            <View key={achievement.id} style={[styles.achievementCardLocked, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.achievementIconLocked, { backgroundColor: colors.borderLight }]}>
                <Ionicons name="lock-closed" size={22} color={colors.textMuted} />
              </View>
              <View style={styles.achievementInfo}>
                <Text style={[styles.achievementTitleLocked, { color: colors.textMuted }]}>{achievement.title}</Text>
                <Text style={[styles.achievementDescLocked, { color: colors.textMuted }]}>{achievement.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingBottom: 24 },
  header: {
    padding: 24,
    paddingTop: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: { borderRadius: RADIUS.lg, padding: 16, marginHorizontal: 16, marginTop: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 40 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  achievementCardUnlocked: {
    borderRadius: RADIUS.md, padding: 14, flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, borderWidth: 1.5,
  },
  achievementIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  achievementEmoji: { fontSize: 24 },
  achievementInfo: { flex: 1, marginRight: 8 },
  achievementTitle: { fontSize: 15, fontWeight: '700' },
  achievementDesc: { fontSize: 12, marginTop: 2 },
  achievementCardLocked: {
    borderRadius: RADIUS.md, padding: 14, flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, borderWidth: 1, opacity: 0.75,
  },
  achievementIconLocked: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  achievementTitleLocked: { fontSize: 15, fontWeight: '700' },
  achievementDescLocked: { fontSize: 12, marginTop: 2 },
});
