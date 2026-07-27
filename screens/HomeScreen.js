// src/screens/HomeScreen.js
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import {
    obterRegistros,
    obterAparelho,
    obterEconomia,
    ultimosNDias,
    obterSessoesDeCrise,
    obterMissoes,
    verificarEConcluirMissoes,
    verificarEDesbloquearConquistas,
    atualizarXp,
    calcularEstadoDeStreak,
    dataDeHoje,
    registrarAberturaDoApp,
} from '../utils/storage';
import { somarPuxadas } from '../utils/records';
import { obterNivel } from '../utils/xp';
import { montarContextoDeMissoes, verificarMissoes } from '../utils/missions';
import { DIAS_PARA_ESCUDO } from '../utils/achievements';
import { RAIO, SOMBRA, DICAS } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import MissionsCard from '../components/MissionsCard';

const { width } = Dimensions.get('window');
const LARGURA_DO_GRAFICO = width - 64;

export default function HomeScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarRecompensas } = usarToast();
    const [registros, setRegistros] = useState([]);
    const [aparelho, setAparelho] = useState(null);
    const [economia, setEconomia] = useState({});
    const [missoes, setMissoes] = useState([]);
    const [xp, setXp] = useState(0);
    const [atualizando, setAtualizando] = useState(false);

    const carregar = useCallback(async () => {
        // Home é a porta de entrada do app — marcar aqui o dia de abertura
        // alimenta a conquista de presença diária (app_open_7).
        const diasDeAbertura = await registrarAberturaDoApp();
        const [r, d, e, c] = await Promise.all([
            obterRegistros(),
            obterAparelho(),
            obterEconomia(),
            obterSessoesDeCrise(),
        ]);
        setRegistros(r);
        setAparelho(d);
        setEconomia(e);

        const novasMissoes = await verificarEConcluirMissoes(r, e, c);
        const missoesConcluidas = await obterMissoes();
        setMissoes(verificarMissoes(montarContextoDeMissoes(r, e, c, dataDeHoje()), missoesConcluidas));

        // Concluir missão pode desbloquear conquista (ex: first_mission).
        const novasConquistas = await verificarEDesbloquearConquistas(r, e, missoesConcluidas, {
            sessoesDeCrise: c,
            diasDeAbertura,
        });
        const resumo = await atualizarXp(r, null, missoesConcluidas);
        setXp(resumo.xp);
        mostrarRecompensas({ conquistas: novasConquistas, missoes: novasMissoes, ganho: resumo.ganho });
    }, [mostrarRecompensas]);

    useFocusEffect(
        useCallback(() => {
            carregar();
        }, [carregar])
    );

    const aoAtualizar = async () => {
        setAtualizando(true);
        await carregar();
        setAtualizando(false);
    };

    function abrirConfiguracoes() {
        navigation.navigate('Settings');
    }

    const hoje = dataDeHoje();
    const registrosDeHoje = registros.filter((r) => r.date === hoje);
    const puxadasDeHoje = somarPuxadas(registrosDeHoje);
    const { streak, escudos, progresso, ultimoDiaProtegido, gastouEscudoNoUltimoDia } =
        calcularEstadoDeStreak(registros);
    const ultimos7Dias = ultimosNDias(7);
    const puxadasDaSemana = ultimos7Dias.reduce((soma, d) => {
        return soma + somarPuxadas(registros.filter((r) => r.date === d));
    }, 0);

    const rotulosDoGrafico = ultimos7Dias.map((d) => {
        const [, mes, dia] = d.split('-');
        return `${dia}/${mes}`;
    });
    const dadosDoGrafico = ultimos7Dias.map((d) => somarPuxadas(registros.filter((r) => r.date === d)));

    const economiaDeHoje = economia[hoje] || 0;
    const economiaTotal = Object.values(economia).reduce((a, v) => a + v, 0);

    // Escudo: derivado dos registros, protege um dia com uso registrado.
    const temEscudo = escudos > 0;
    const mensagemDoEscudo = (() => {
        if (temEscudo) {
            return 'Escudo pronto: se você registrar uso, a sequência não zera';
        }
        if (gastouEscudoNoUltimoDia && streak > 0) {
            const [, mes, dia] = ultimoDiaProtegido.split('-');
            return `Escudo usado em ${dia}/${mes} — sua sequência continua! 💪`;
        }
        const faltam = DIAS_PARA_ESCUDO - progresso;
        return `Faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'} sem uso pra ganhar um escudo`;
    })();

    const nivel = obterNivel(xp);
    const dica = DICAS[new Date().getDate() % DICAS.length];

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView
            style={[styles.scroll, { backgroundColor: cores.background }]}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={atualizando} onRefresh={aoAtualizar} tintColor={cores.primary} />}
        >
            <ScreenHeader
                titulo="VapeFree"
                subtitulo="Vamos deixar o vape pra trás"
                cores={cores}
                mostrarConfiguracoes
                aoPressionarConfiguracoes={abrirConfiguracoes}
            />

            <TouchableOpacity
                style={[styles.crisisCard, { backgroundColor: cores.card, borderLeftColor: cores.warning }, SOMBRA.media]}
                onPress={() => navigation.navigate('Crisis')}
            >
                <Ionicons name="hand-left" size={26} color={cores.warning} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.crisisTitle, { color: cores.text }]}>Estou com vontade</Text>
                    <Text style={[styles.crisisSubtitle, { color: cores.textSecondary }]}>
                        Toca aqui — a gente passa por isso junto
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={cores.textMuted} />
            </TouchableOpacity>

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <Text style={[styles.cardTitle, { color: cores.textMuted }]}>Como você foi hoje?</Text>
                <View style={styles.statRow}>
                    <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                        <Text style={[styles.statNum, { color: cores.primaryDark }]}>{puxadasDeHoje}</Text>
                        <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Puxadas{'\n'}hoje</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                        <Text style={[styles.statNum, { color: cores.primaryDark }]}>{streak}</Text>
                         <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Dias{'\n'}registrados{'\n'}sem uso</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                        <Text style={[styles.statNum, { color: cores.primaryDark }]}>{puxadasDaSemana}</Text>
                        <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Esta{'\n'}semana</Text>
                    </View>
                </View>

                <View
                    style={[
                        styles.shieldRow,
                        { backgroundColor: cores.primaryLight, borderColor: temEscudo ? cores.primary : cores.borderLight },
                    ]}
                >
                    <Ionicons
                        name={temEscudo ? 'shield-checkmark' : 'shield-outline'}
                        size={20}
                        color={temEscudo ? cores.primary : cores.textMuted}
                    />
                    <Text style={[styles.shieldText, { color: temEscudo ? cores.primaryDark : cores.textSecondary }]}>
                        {mensagemDoEscudo}
                    </Text>
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <View style={styles.xpHeader}>
                    <Text style={styles.xpIcon}>{nivel.icone}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.xpLevel, { color: cores.text }]}>
                            Nível {nivel.numero} · {nivel.nome}
                        </Text>
                        <Text style={[styles.xpSub, { color: cores.textSecondary }]}>
                            {nivel.nomeDoProximo
                                ? `${nivel.xpParaProximo} XP pra virar ${nivel.nomeDoProximo}`
                                : 'Nível máximo — você é lenda 👑'}
                        </Text>
                    </View>
                    <Text style={[styles.xpTotal, { color: cores.primaryDark }]}>{xp} XP</Text>
                </View>
                <View style={[styles.xpTrack, { backgroundColor: cores.primaryLight }]}>
                    <View
                        style={[
                            styles.xpFill,
                            { backgroundColor: cores.primary, width: `${Math.round(nivel.progresso * 100)}%` },
                        ]}
                    />
                </View>
            </View>

            <MissionsCard
                missoes={missoes.filter((missao) => missao.period === 'daily')}
                cores={cores}
                aoPressionar={() => navigation.navigate('Missions')}
            />

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <Text style={[styles.cardTitle, { color: cores.textMuted }]}>💰 Economia</Text>
                {aparelho ? (
                    <View style={styles.moneyRow}>
                        <View style={[styles.moneyBox, { backgroundColor: cores.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💰</Text>
                            <Text style={[styles.moneyVal, { color: cores.primaryDark }]}>R$ {economiaDeHoje.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: cores.textSecondary }]}>Ficou no seu bolso hoje</Text>
                        </View>
                        <View style={[styles.moneyBox, { backgroundColor: cores.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💵</Text>
                            <Text style={[styles.moneyVal, { color: cores.primaryDark }]}>R$ {economiaTotal.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: cores.textSecondary }]}>Total no bolso</Text>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.devicePrompt, { backgroundColor: cores.primaryLight, borderColor: cores.primary }]}
                        onPress={() => navigation.navigate('Device')}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={cores.primary} />
                        <Text style={[styles.devicePromptText, { color: cores.primaryDark }]}>
                            Cadastra seu dispositivo pra ver quanto você tá economizando 💡
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <Text style={[styles.cardTitle, { color: cores.textMuted }]}>Últimos 7 dias</Text>
                {registros.length > 0 ? (
                    <LineChart
                        data={{
                            labels: rotulosDoGrafico,
                            datasets: [{ data: dadosDoGrafico }],
                        }}
                        width={LARGURA_DO_GRAFICO}
                        height={180}
                        fromZero
                        segments={Math.max(1, Math.min(4, Math.max(...dadosDoGrafico)))}
                        chartConfig={{
                            backgroundColor: cores.card,
                            backgroundGradientFrom: cores.card,
                            backgroundGradientTo: cores.card,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                            labelColor: () => cores.textSecondary,
                            propsForDots: { r: '4', strokeWidth: '2', stroke: cores.primaryDark },
                            propsForBackgroundLines: { stroke: cores.borderLight },
                            propsForLabels: { fontFamily: 'Poppins_400Regular' },
                            formatYLabel: (v) => `${Math.round(Number(v))}`,
                        }}
                        bezier
                        style={styles.chart}
                    />
                ) : (
                    <Text style={[styles.emptyChart, { color: cores.textMuted }]}>Ainda não tem nada por aqui. Bora começar? 📝</Text>
                )}
            </View>

            <View style={[styles.tipCard, { backgroundColor: cores.card, borderLeftColor: cores.primary }, SOMBRA.pequena]}>
                <Ionicons name="bulb-outline" size={24} color={cores.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.tipText, { color: cores.text }]}>{dica}</Text>
            </View>

            <TouchableOpacity
                style={[styles.deviceBtn, { backgroundColor: cores.card, borderColor: cores.primary }, SOMBRA.pequena]}
                onPress={() => navigation.navigate('Device')}
            >
                <Ionicons name="phone-portrait-outline" size={18} color={cores.primary} />
                <Text style={[styles.deviceBtnText, { color: cores.primaryDark }]}>
                    {aparelho ? `Seu dispositivo: ${aparelho.name}` : 'Cadastrar meu dispositivo'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={cores.primary} />
            </TouchableOpacity>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    welcomeText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff', marginTop: 6 },
    card: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 14,
    },
    crisisCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: RAIO.lg,
        borderLeftWidth: 4,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    crisisTitle: { fontSize: 16, fontFamily: 'Poppins_800ExtraBold' },
    crisisSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: {
        flex: 1,
        borderRadius: RAIO.md,
        padding: 12,
        alignItems: 'center',
    },
    shieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        padding: 10,
        borderRadius: RAIO.md,
        borderWidth: 1,
    },
    shieldText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', lineHeight: 16 },
    statNum: { fontSize: 26, fontFamily: 'Poppins_800ExtraBold' },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 2, lineHeight: 14 },
    xpHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    xpIcon: { fontSize: 26 , fontFamily: 'Poppins_400Regular'},
    xpLevel: { fontSize: 15, fontFamily: 'Poppins_800ExtraBold' },
    xpSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    xpTotal: { fontSize: 16, fontFamily: 'Poppins_800ExtraBold' },
    xpTrack: { height: 10, borderRadius: RAIO.md, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: RAIO.md },
    moneyRow: { flexDirection: 'row', gap: 10 },
    moneyBox: {
        flex: 1,
        borderRadius: RAIO.md,
        padding: 14,
    },
    moneyIcon: { fontSize: 22, fontFamily: 'Poppins_400Regular', marginBottom: 4 },
    moneyVal: { fontSize: 20, fontFamily: 'Poppins_800ExtraBold' },
    moneyLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    devicePrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: RAIO.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    devicePromptText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium' },
    chart: { borderRadius: RAIO.md, marginTop: 4 },
    emptyChart: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', padding: 20 },
    tipCard: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tipText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
    deviceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: RAIO.lg,
        padding: 14,
        marginHorizontal: 16,
        marginTop: 14,
        borderWidth: 1.5,
    },
    deviceBtnText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});
