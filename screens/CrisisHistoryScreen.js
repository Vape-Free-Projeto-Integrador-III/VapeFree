//
// Lista as sessões do modo crise. Só leitura: o dado já era salvo por
// salvarSessaoDeCrise (utils/storage.js) e alimentava insights, conquistas e
// missões, mas o usuário nunca conseguia ver crise por crise.

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import GradeDeCards from '../components/GradeDeCards';
import { obterSessoesDeCrise } from '../utils/storage';
import { METODOS_DE_CRISE, desfechoDeCrise, resumoDeCrises } from '../utils/insights';
import { formatarDiaMes } from '../utils/calendario';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarLayoutResponsivo, estiloDoConteudo } from '../utils/responsivo';
import { usarTema } from '../context/ThemeContext';

function formatarDuracao(segundos) {
    const total = Number(segundos);
    if (!Number.isFinite(total) || total <= 0) return null;
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    if (minutos === 0) return `${resto}s`;
    if (resto === 0) return `${minutos}min`;
    return `${minutos}min ${resto}s`;
}

export default function CrisisHistoryScreen({ navigation }) {
    const { cores } = usarTema();
    const { colunas } = usarLayoutResponsivo();
    const [sessoes, setSessoes] = useState([]);

    const carregar = async () => {
        setSessoes(await obterSessoesDeCrise());
    };

    useFocusEffect(useCallback(() => { carregar(); }, []));

    const resumo = resumoDeCrises(sessoes);
    const emOrdem = [...sessoes].sort((a, b) => {
        const porData = String(b.date).localeCompare(String(a.date));
        return porData !== 0 ? porData : b.id - a.id;
    });

    // Cor do desfecho: verde pra vitória, amarelo pra vitória parcial,
    // vermelho pro uso — e cinza quando a pessoa saiu sem responder.
    const corDoDesfecho = (outcome) => {
        if (outcome === 'passou') return cores.primary;
        if (outcome === 'diminuiu') return cores.warning;
        if (outcome === 'usei') return cores.danger;
        return cores.textMuted;
    };

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Suas crises"
                    subtitulo="Cada vez que você enfrentou a vontade"
                    cores={cores}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={estiloDoConteudo}>
                    {sessoes.length > 0 ? (
                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <View style={styles.statRow}>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>{resumo.total}</Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Crises{'\n'}enfrentadas</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>{resumo.superadas}</Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Superadas{'\n'}sem usar</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>
                                        {resumo.taxa === null ? '—' : `${resumo.taxa}%`}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Taxa de{'\n'}sucesso</Text>
                                </View>
                            </View>
                        </View>
                    ) : null}

                    <GradeDeCards colunas={colunas}>
                        {emOrdem.map((sessao) => {
                            const desfecho = desfechoDeCrise(sessao.outcome);
                            const metodo = METODOS_DE_CRISE[sessao.method] || null;
                            const duracao = formatarDuracao(sessao.durationSec);
                            const cor = corDoDesfecho(sessao.outcome);

                            return (
                                <View key={sessao.id} style={[styles.item, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                                    <View style={styles.itemTop}>
                                        <Text style={[styles.itemDate, { color: cores.text }]}>
                                            {formatarDiaMes(sessao.date)}
                                            {sessao.time ? ` · ${sessao.time}` : ''}
                                        </Text>
                                        <View style={[styles.badge, { backgroundColor: cor + '22', borderColor: cor }]}>
                                            <Text style={[styles.badgeText, { color: cor }]}>
                                                {desfecho ? `${desfecho.emoji} ${desfecho.rotulo}` : 'Não respondeu'}
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={[styles.itemMethod, { color: cores.textSecondary }]}>
                                        {metodo ? `${metodo.emoji} ${metodo.rotulo}` : '🤍 Sem método'}
                                        {duracao ? ` · ${duracao}` : ''}
                                        {sessao.completed ? ' · concluiu ✓' : ''}
                                    </Text>

                                    {sessao.note ? (
                                        <Text style={[styles.itemNote, { color: cores.textMuted }]}>“{sessao.note}”</Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </GradeDeCards>

                    {sessoes.length === 0 ? (
                        <View style={[styles.card, styles.emptyCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                            <Ionicons name="hand-left-outline" size={32} color={cores.border} />
                            <Text style={[styles.emptyText, { color: cores.textMuted }]}>
                                Você ainda não usou o modo crise. Da próxima vez que a vontade bater, abre ele — a gente
                                passa por isso junto.
                            </Text>
                            <TouchableOpacity
                                style={[styles.emptyBtn, { backgroundColor: cores.primary }]}
                                onPress={() => navigation.navigate('Crisis')}
                            >
                                <Text style={styles.emptyBtnText}>Estou com vontade</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <View style={{ height: 24 }} />
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: { flex: 1, borderRadius: RAIO.md, padding: 12, alignItems: 'center' },
    statNum: { fontSize: 24, fontFamily: 'Poppins_800ExtraBold' },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 2, lineHeight: 14 },
    item: { borderRadius: RAIO.md, padding: 14, marginHorizontal: 16, marginTop: 10 },
    itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    itemDate: { flex: 1, fontSize: 13, fontFamily: 'Poppins_700Bold' },
    badge: { borderRadius: RAIO.full, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 10 },
    badgeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    itemMethod: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginTop: 6 },
    itemNote: { fontSize: 12, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', marginTop: 6 },
    emptyCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
    emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 19 },
    emptyBtn: { borderRadius: RAIO.md, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
    emptyBtnText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },
});
