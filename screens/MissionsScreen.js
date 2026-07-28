//
// Lista completa das missões do período atual (diárias e semanais).
// A tela só apresenta: quem calcula é verificarMissoes (utils/missions.js) e
// quem persiste/concede XP é verificarEConcluirMissoes (utils/storage.js).
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import { sincronizarGamificacao, dataDeHoje } from '../utils/storage';
import { montarContextoDeMissoes, verificarMissoes } from '../utils/missions';

function formatarProgresso(missao) {
    if (missao.alvo === 1) {
        return missao.concluida ? 'Concluída' : 'Ainda não';
    }
    if (missao.missionId === 'weekly_economy_10') {
        return `R$ ${missao.atual.toFixed(2)} de R$ ${missao.alvo.toFixed(2)}`;
    }
    return `${missao.atual} de ${missao.alvo}`;
}

export default function MissionsScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarRecompensas } = usarToast();
    const [missoes, setMissoes] = useState([]);

    const carregar = useCallback(async () => {
        const { registros, economia, sessoesDeCrise, missoesConcluidas, recompensas } =
            await sincronizarGamificacao();

        setMissoes(verificarMissoes(montarContextoDeMissoes(registros, economia, sessoesDeCrise, dataDeHoje()), missoesConcluidas));
        mostrarRecompensas(recompensas);
    }, [mostrarRecompensas]);

    useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

    const diarias = missoes.filter((missao) => missao.period === 'daily');
    const semanais = missoes.filter((missao) => missao.period === 'weekly');

    const renderizarMissao = (missao) => (
        <View
            key={missao.id}
            style={[
                styles.card,
                {
                    backgroundColor: cores.card,
                    borderColor: missao.concluida ? cores.primary : cores.border,
                },
                missao.concluida ? SOMBRA.pequena : null,
                !missao.concluida && styles.cardPending,
            ]}
        >
            <View
                style={[
                    styles.iconWrap,
                    { backgroundColor: missao.concluida ? cores.primaryLight : cores.borderLight },
                ]}
            >
                <Text style={styles.icon}>{missao.icone}</Text>
            </View>

            <View style={styles.info}>
                <Text style={[styles.title, { color: missao.concluida ? cores.text : cores.textSecondary }]}>
                    {missao.titulo}
                </Text>
                <Text style={[styles.description, { color: cores.textMuted }]}>{missao.descricao}</Text>

                <View style={[styles.track, { backgroundColor: cores.borderLight }]}>
                    <View
                        style={[
                            styles.fill,
                            {
                                backgroundColor: cores.primary,
                                width: `${Math.round((missao.atual / missao.alvo) * 100)}%`,
                            },
                        ]}
                    />
                </View>

                <View style={styles.footer}>
                    <Text style={[styles.progress, { color: cores.textMuted }]}>{formatarProgresso(missao)}</Text>
                    <Text style={[styles.xp, { color: missao.concluida ? cores.primaryDark : cores.textMuted }]}>
                        +{missao.xp} XP
                    </Text>
                </View>
            </View>

            {missao.concluida ? (
                <Ionicons name="checkmark-circle" size={24} color={cores.primary} />
            ) : null}
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: cores.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                titulo="Missões"
                subtitulo="Metas que renovam sozinhas"
                cores={cores}
                mostrarConfiguracoes
                aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                aoPressionarVoltar={() => navigation.goBack()}
            />

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: cores.text }]}>🎯 Hoje</Text>
                <Text style={[styles.sectionHint, { color: cores.textMuted }]}>
                    Renovam à meia-noite
                </Text>
                {diarias.map(renderizarMissao)}
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: cores.text }]}>📅 Esta semana</Text>
                <Text style={[styles.sectionHint, { color: cores.textMuted }]}>
                    Renovam toda segunda-feira
                </Text>
                {semanais.map(renderizarMissao)}
            </View>

            <View style={{ height: 24 }} />
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    section: { marginTop: 20, paddingHorizontal: 16 },
    sectionTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    sectionHint: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2, marginBottom: 12 },
    card: {
        borderRadius: RAIO.md,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        borderWidth: 1.5,
    },
    cardPending: { opacity: 0.85 },
    iconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    icon: { fontSize: 24 , fontFamily: 'Poppins_400Regular'},
    info: { flex: 1, marginRight: 8 },
    title: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    description: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    track: { height: 6, borderRadius: RAIO.md, overflow: 'hidden', marginTop: 8 },
    fill: { height: '100%', borderRadius: RAIO.md },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    progress: { fontSize: 11 , fontFamily: 'Poppins_400Regular'},
    xp: { fontSize: 11, fontFamily: 'Poppins_700Bold' },
});
