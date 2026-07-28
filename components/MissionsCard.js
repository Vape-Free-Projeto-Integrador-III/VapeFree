// Card da HomeScreen com as missões diárias. A lista já vem calculada pela
// tela (verificarMissoes em utils/missions.js) — aqui é só apresentação.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RAIO, SOMBRA } from '../utils/theme';

export default function MissionsCard({ missoes = [], cores, aoPressionar }) {
    const concluidas = missoes.filter((missao) => missao.concluida).length;
    const total = missoes.length;
    const progresso = total > 0 ? concluidas / total : 0;

    return (
        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: cores.textMuted }]}>🎯 Missões de hoje</Text>
                <Text style={[styles.counter, { color: cores.primaryDark }]}>{concluidas}/{total}</Text>
            </View>

            <View style={[styles.track, { backgroundColor: cores.primaryLight }]}>
                <View
                    style={[
                        styles.fill,
                        { backgroundColor: cores.primary, width: `${Math.round(progresso * 100)}%` },
                    ]}
                />
            </View>

            {missoes.map((missao) => (
                <View key={missao.id} style={styles.row}>
                    <Ionicons
                        name={missao.concluida ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={missao.concluida ? cores.primary : cores.textMuted}
                    />
                    <Text
                        style={[
                            styles.rowText,
                            { color: missao.concluida ? cores.textMuted : cores.text },
                            missao.concluida && styles.rowTextDone,
                        ]}
                        numberOfLines={1}
                    >
                        {missao.titulo}
                    </Text>
                    <Text
                        style={[
                            styles.rowXp,
                            { color: missao.concluida ? cores.primary : cores.textMuted },
                        ]}
                    >
                        +{missao.xp} XP
                    </Text>
                </View>
            ))}

            <TouchableOpacity style={styles.footer} onPress={aoPressionar}>
                <Text style={[styles.footerText, { color: cores.primaryDark }]}>
                    Ver todas as missões
                </Text>
                <Ionicons name="chevron-forward" size={16} color={cores.primary} />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    title: {
        flex: 1,
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    counter: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    track: { height: 8, borderRadius: RAIO.md, overflow: 'hidden', marginBottom: 12 },
    fill: { height: '100%', borderRadius: RAIO.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
    rowText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium' },
    rowTextDone: { textDecorationLine: 'line-through' },
    rowXp: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
    footerText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});
