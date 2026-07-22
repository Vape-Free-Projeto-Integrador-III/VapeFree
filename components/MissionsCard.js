// src/components/MissionsCard.js
// Card da HomeScreen com as missões diárias. A lista já vem calculada pela
// tela (checkMissions em utils/missions.js) — aqui é só apresentação.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SHADOW } from '../utils/theme';

export default function MissionsCard({ missions = [], colors, onPress }) {
    const done = missions.filter((mission) => mission.completed).length;
    const total = missions.length;
    const progress = total > 0 ? done / total : 0;

    return (
        <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: colors.textMuted }]}>🎯 Missões de hoje</Text>
                <Text style={[styles.counter, { color: colors.primaryDark }]}>{done}/{total}</Text>
            </View>

            <View style={[styles.track, { backgroundColor: colors.primaryLight }]}>
                <View
                    style={[
                        styles.fill,
                        { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` },
                    ]}
                />
            </View>

            {missions.map((mission) => (
                <View key={mission.id} style={styles.row}>
                    <Ionicons
                        name={mission.completed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={mission.completed ? colors.primary : colors.textMuted}
                    />
                    <Text
                        style={[
                            styles.rowText,
                            { color: mission.completed ? colors.textMuted : colors.text },
                            mission.completed && styles.rowTextDone,
                        ]}
                        numberOfLines={1}
                    >
                        {mission.title}
                    </Text>
                    <Text
                        style={[
                            styles.rowXp,
                            { color: mission.completed ? colors.primary : colors.textMuted },
                        ]}
                    >
                        +{mission.xp} XP
                    </Text>
                </View>
            ))}

            <TouchableOpacity style={styles.footer} onPress={onPress}>
                <Text style={[styles.footerText, { color: colors.primaryDark }]}>
                    Ver todas as missões
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    title: {
        flex: 1,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    counter: { fontSize: 14, fontWeight: '800' },
    track: { height: 8, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 12 },
    fill: { height: '100%', borderRadius: RADIUS.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
    rowText: { flex: 1, fontSize: 13, fontWeight: '500' },
    rowTextDone: { textDecorationLine: 'line-through' },
    rowXp: { fontSize: 11, fontWeight: '700' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
    footerText: { fontSize: 13, fontWeight: '600' },
});
