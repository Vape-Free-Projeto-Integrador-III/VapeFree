import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
    sincronizarGamificacao,
    obterConquistas,
    dataDeHoje,
} from '../utils/storage';
import { verificarConquistas } from '../utils/achievements';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarLayoutResponsivo, estiloDoConteudo } from '../utils/responsivo';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import GradeDeCards from '../components/GradeDeCards';

export default function AchievementsScreen({ navigation }) {
    const { cores } = usarTema();
    const { colunas } = usarLayoutResponsivo();
    const { mostrarRecompensas } = usarToast();
    const [conquistas, setConquistas] = useState([]);

    // Persiste antes de exibir: sem `sincronizarGamificacao` a tela mostrava a
    // conquista como desbloqueada sem salvar nada — nem XP, nem celebração, até
    // a Home ser focada.
    const carregar = useCallback(async () => {
        const {
            registros,
            economia,
            sessoesDeCrise,
            diasDeAbertura,
            meta,
            aparelho,
            missoesConcluidas,
            recompensas,
        } = await sincronizarGamificacao();

        // Relido depois do sync pra já incluir o que acabou de ser desbloqueado.
        // O contexto vai completo de propósito: sem ele, as conquistas que
        // dependem de crise/aberturas/meta apareceriam bloqueadas aqui.
        const conquistasSalvas = await obterConquistas();
        const resultados = await verificarConquistas(
            registros,
            economia,
            conquistasSalvas,
            missoesConcluidas,
            { sessoesDeCrise, diasDeAbertura, meta, aparelho, hoje: dataDeHoje() }
        );
        setConquistas(resultados);
        mostrarRecompensas(recompensas);
    }, [mostrarRecompensas]);

    useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

    const quantidadeDesbloqueadas = conquistas.filter((c) => c.desbloqueada).length;
    const quantidadeTotal = conquistas.length;

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: cores.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                titulo="Conquistas"
                subtitulo="Veja até onde você já chegou"
                cores={cores}
                mostrarConfiguracoes
                aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
            />

            <View style={estiloDoConteudo}>
                <View style={[styles.statsCard, { backgroundColor: cores.card }, SOMBRA.media]}>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={[styles.statNum, { color: cores.primaryDark }]}>{quantidadeDesbloqueadas}</Text>
                            <Text style={[styles.statLabel, { color: cores.textMuted }]}>Conquistadas</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: cores.border }]} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNum, { color: cores.primaryDark }]}>{quantidadeTotal - quantidadeDesbloqueadas}</Text>
                            <Text style={[styles.statLabel, { color: cores.textMuted }]}>Por vir</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: cores.border }]} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNum, { color: cores.primaryDark }]}>{quantidadeTotal}</Text>
                            <Text style={[styles.statLabel, { color: cores.textMuted }]}>Total</Text>
                        </View>
                    </View>
                </View>

                {quantidadeDesbloqueadas > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: cores.text }]}>✅ Você já conquistou</Text>
                        <GradeDeCards colunas={colunas} espacamento={12}>
                            {conquistas.filter((c) => c.desbloqueada).map((conquista) => (
                                <View key={conquista.id} style={[styles.achievementCardUnlocked, { backgroundColor: cores.card, borderColor: cores.primary }, SOMBRA.pequena]}>
                                    <View style={[styles.achievementIcon, { backgroundColor: cores.primaryLight }]}>
                                        <Text style={styles.achievementEmoji}>{conquista.icone}</Text>
                                    </View>
                                    <View style={styles.achievementInfo}>
                                        <Text style={[styles.achievementTitle, { color: cores.text }]}>{conquista.titulo}</Text>
                                        <Text style={[styles.achievementDesc, { color: cores.textSecondary }]}>{conquista.descricao}</Text>
                                        <Text style={[styles.achievementXp, { color: cores.primaryDark }]}>+{conquista.xp} XP</Text>
                                    </View>
                                    <Ionicons name="checkmark-circle" size={24} color={cores.primary} />
                                </View>
                            ))}
                        </GradeDeCards>
                    </View>
                )}

                {quantidadeTotal - quantidadeDesbloqueadas > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: cores.text }]}>🔒 O que ainda vem por aí</Text>
                        <GradeDeCards colunas={colunas} espacamento={12}>
                            {conquistas.filter((c) => !c.desbloqueada).map((conquista) => (
                                <View key={conquista.id} style={[styles.achievementCardLocked, { backgroundColor: cores.card, borderColor: cores.border }]}>
                                    <View style={[styles.achievementIconLocked, { backgroundColor: cores.borderLight }]}>
                                        <Ionicons name="lock-closed" size={22} color={cores.textMuted} />
                                    </View>
                                    <View style={styles.achievementInfo}>
                                        <Text style={[styles.achievementTitleLocked, { color: cores.textMuted }]}>{conquista.titulo}</Text>
                                        <Text style={[styles.achievementDescLocked, { color: cores.textMuted }]}>{conquista.descricao}</Text>
                                        <Text style={[styles.achievementXp, { color: cores.textMuted }]}>+{conquista.xp} XP</Text>
                                    </View>
                                </View>
                            ))}
                        </GradeDeCards>
                    </View>
                )}

                <View style={{ height: 24 }} />
            </View>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    statsCard: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 16 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 28, fontFamily: 'Poppins_800ExtraBold' },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    statDivider: { width: 1, height: 40 },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginBottom: 12 },
    achievementCardUnlocked: {
        borderRadius: RAIO.md, padding: 14, flexDirection: 'row', alignItems: 'center',
        marginBottom: 10, borderWidth: 1.5,
    },
    achievementIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    achievementEmoji: { fontSize: 24 , fontFamily: 'Poppins_400Regular'},
    achievementInfo: { flex: 1, marginRight: 8 },
    achievementTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    achievementDesc: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    achievementXp: { fontSize: 11, fontFamily: 'Poppins_700Bold', marginTop: 4 },
    achievementCardLocked: {
        borderRadius: RAIO.md, padding: 14, flexDirection: 'row', alignItems: 'center',
        marginBottom: 10, borderWidth: 1, opacity: 0.75,
    },
    achievementIconLocked: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    achievementTitleLocked: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    achievementDescLocked: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
});
