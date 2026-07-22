// src/screens/MissionsScreen.js
//
// Lista completa das missões do período atual (diárias e semanais).
// A tela só apresenta: quem calcula é checkMissions (utils/missions.js) e
// quem persiste/concede XP é checkAndCompleteMissions (utils/storage.js).
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { RADIUS, SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useXpToast } from '../context/XpToastContext';
import {
    getRecords,
    getEconomy,
    getCrisisSessions,
    getMissions,
    checkAndCompleteMissions,
    checkAndUnlockAchievements,
    refreshXp,
    todayString,
} from '../utils/storage';
import { buildMissionContext, checkMissions } from '../utils/missions';

function formatProgress(mission) {
    if (mission.target === 1) {
        return mission.completed ? 'Concluída' : 'Ainda não';
    }
    if (mission.missionId === 'weekly_economy_10') {
        return `R$ ${mission.current.toFixed(2)} de R$ ${mission.target.toFixed(2)}`;
    }
    return `${mission.current} de ${mission.target}`;
}

export default function MissionsScreen({ navigation }) {
    const { colors } = useTheme();
    const { showRewards } = useXpToast();
    const [missions, setMissions] = useState([]);

    const load = useCallback(async () => {
        const [records, economy, crisisSessions] = await Promise.all([
            getRecords(),
            getEconomy(),
            getCrisisSessions(),
        ]);

        const newMissions = await checkAndCompleteMissions(records, economy, crisisSessions);
        const completed = await getMissions();
        const newAchievements = await checkAndUnlockAchievements(records, economy, completed);
        const summary = await refreshXp(records, null, completed);

        setMissions(checkMissions(buildMissionContext(records, economy, crisisSessions, todayString()), completed));
        showRewards({ achievements: newAchievements, missions: newMissions, gained: summary.gained });
    }, [showRewards]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const daily = missions.filter((mission) => mission.period === 'daily');
    const weekly = missions.filter((mission) => mission.period === 'weekly');

    const renderMission = (mission) => (
        <View
            key={mission.id}
            style={[
                styles.card,
                {
                    backgroundColor: colors.card,
                    borderColor: mission.completed ? colors.primary : colors.border,
                },
                mission.completed ? SHADOW.small : null,
                !mission.completed && styles.cardPending,
            ]}
        >
            <View
                style={[
                    styles.iconWrap,
                    { backgroundColor: mission.completed ? colors.primaryLight : colors.borderLight },
                ]}
            >
                <Text style={styles.icon}>{mission.icon}</Text>
            </View>

            <View style={styles.info}>
                <Text style={[styles.title, { color: mission.completed ? colors.text : colors.textSecondary }]}>
                    {mission.title}
                </Text>
                <Text style={[styles.description, { color: colors.textMuted }]}>{mission.description}</Text>

                <View style={[styles.track, { backgroundColor: colors.borderLight }]}>
                    <View
                        style={[
                            styles.fill,
                            {
                                backgroundColor: colors.primary,
                                width: `${Math.round((mission.current / mission.target) * 100)}%`,
                            },
                        ]}
                    />
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.progress, { color: colors.textMuted }]}>{formatProgress(mission)}</Text>
                    <Text style={[styles.xp, { color: mission.completed ? colors.primaryDark : colors.textMuted }]}>
                        +{mission.xp} XP
                    </Text>
                </View>
            </View>

            {mission.completed ? (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            ) : null}
        </View>
    );

    return (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                title="Missões"
                subtitle="Metas que renovam sozinhas"
                colors={colors}
                showSettings
                onSettingsPress={() => navigation.navigate('Settings')}
                onBackPress={() => navigation.goBack()}
            />

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>🎯 Hoje</Text>
                <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                    Renovam à meia-noite
                </Text>
                {daily.map(renderMission)}
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>📅 Esta semana</Text>
                <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
                    Renovam toda segunda-feira
                </Text>
                {weekly.map(renderMission)}
            </View>

            <View style={{ height: 24 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 14, fontWeight: '700' },
    sectionHint: { fontSize: 11, marginTop: 2, marginBottom: 12 },
    card: {
        borderRadius: RADIUS.md,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        borderWidth: 1.5,
    },
    cardPending: { opacity: 0.85 },
    iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    icon: { fontSize: 24 },
    info: { flex: 1, marginRight: 8 },
    title: { fontSize: 15, fontWeight: '700' },
    description: { fontSize: 12, marginTop: 2 },
    track: { height: 6, borderRadius: RADIUS.md, overflow: 'hidden', marginTop: 8 },
    fill: { height: '100%', borderRadius: RADIUS.md },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    progress: { fontSize: 11 },
    xp: { fontSize: 11, fontWeight: '700' },
});
