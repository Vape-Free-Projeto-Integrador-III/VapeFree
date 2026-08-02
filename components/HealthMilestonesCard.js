//
// Card "Sua saúde" da Home. Componente de apresentação puro: recebe os
// registros já carregados e só formata o resultado de calcularMarcosDeSaude
// (utils/saude.js). A lista completa dos marcos abre/fecha no toque.

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RAIO, SOMBRA } from '../utils/theme';
import { MARCOS_DE_SAUDE, calcularMarcosDeSaude, formatarDuracao } from '../utils/saude';

export default function HealthMilestonesCard({ registros, cores }) {
    const [expandido, setExpandido] = useState(false);
    const { pronto, usouHoje, conquistados, atual, proximo, progresso, faltamMinutos } = useMemo(
        () => calcularMarcosDeSaude(registros),
        [registros]
    );

    if (!pronto) return null;

    const idsConquistados = new Set(conquistados.map((marco) => marco.id));

    return (
        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>❤️‍🩹 Sua saúde</Text>

            {atual ? (
                <View style={[styles.current, { backgroundColor: cores.primaryLight }]}>
                    <Text style={styles.currentIcon}>{atual.icone}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.currentTitle, { color: cores.primaryDark }]}>
                            {atual.titulo} sem usar
                        </Text>
                        <Text style={[styles.currentBenefit, { color: cores.textSecondary }]}>
                            {atual.beneficio}
                        </Text>
                    </View>
                </View>
            ) : (
                <Text style={[styles.empty, { color: cores.textSecondary }]}>
                    {usouHoje
                        ? 'Você registrou uso hoje — a contagem recomeça amanhã. Cada dia limpo devolve alguma coisa pro seu corpo.'
                        : 'A contagem começou. Em 20 minutos sem usar seu corpo já muda.'}
                </Text>
            )}

            {proximo ? (
                <View style={styles.next}>
                    <View style={styles.nextHeader}>
                        <Text style={[styles.nextLabel, { color: cores.textSecondary }]}>
                            Próximo: {proximo.icone} {proximo.titulo}
                        </Text>
                        <Text style={[styles.nextCountdown, { color: cores.textMuted }]}>
                            faltam {formatarDuracao(faltamMinutos)}
                        </Text>
                    </View>
                    <View style={[styles.barTrack, { backgroundColor: cores.borderLight }]}>
                        <View
                            style={[
                                styles.barFill,
                                {
                                    backgroundColor: cores.primary,
                                    width: `${Math.round(progresso * 100)}%`,
                                },
                            ]}
                        />
                    </View>
                </View>
            ) : (
                <Text style={[styles.done, { color: cores.primaryDark }]}>
                    Um ano inteiro sem usar. Todos os marcos são seus. 🏆
                </Text>
            )}

            <TouchableOpacity
                style={[styles.toggle, { borderTopColor: cores.borderLight }]}
                onPress={() => setExpandido((valor) => !valor)}
            >
                <Text style={[styles.toggleText, { color: cores.primaryDark }]}>
                    {expandido
                        ? 'Esconder marcos'
                        : `Ver todos os marcos (${conquistados.length}/${MARCOS_DE_SAUDE.length})`}
                </Text>
                <Ionicons
                    name={expandido ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={cores.primary}
                />
            </TouchableOpacity>

            {expandido ? (
                <View>
                    {MARCOS_DE_SAUDE.map((marco) => {
                        const conquistado = idsConquistados.has(marco.id);
                        return (
                            <View key={marco.id} style={styles.row}>
                                <Ionicons
                                    name={conquistado ? 'checkmark-circle' : 'ellipse-outline'}
                                    size={18}
                                    color={conquistado ? cores.primary : cores.textMuted}
                                />
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={[
                                            styles.rowTitle,
                                            { color: conquistado ? cores.text : cores.textMuted },
                                        ]}
                                    >
                                        {marco.icone} {marco.titulo}
                                    </Text>
                                    <Text
                                        style={[styles.rowBenefit, { color: cores.textSecondary }]}
                                    >
                                        {marco.beneficio}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                    <Text style={[styles.footnote, { color: cores.textMuted }]}>
                        Marcos baseados em estudos de cessação de nicotina. O tempo é contado do
                        último dia em que você registrou uso.
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    current: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderRadius: RAIO.md,
        padding: 12,
    },
    currentIcon: { fontSize: 24, fontFamily: 'Poppins_400Regular', lineHeight: 30 },
    currentTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    currentBenefit: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    empty: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
    next: { marginTop: 14 },
    nextHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 6,
    },
    nextLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', flex: 1 },
    nextCountdown: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    barTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: 4 },
    done: { fontSize: 13, fontFamily: 'Poppins_600SemiBold', marginTop: 14 },
    toggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        paddingTop: 12,
        marginTop: 14,
    },
    toggleText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
    rowTitle: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    rowBenefit: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    footnote: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 8, lineHeight: 14 },
});
