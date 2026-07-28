//
// Respiração box 4-4-4-4: inspirar 4s -> segurar 4s -> expirar 4s -> segurar 4s.
// Funciona sozinha ou como método do modo crise (route.params.fromCrisis).
//
// O tempo é controlado por UM intervalo de 1s (decorridoRef). A fase atual é
// derivada do tempo decorrido, não de timers encadeados — assim nunca dá
// pra fase e cronômetro dessincronizarem.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

const SEGUNDOS_DE_FASE = 4;
const FASES = [
    { chave: 'inspirar', rotulo: 'Inspire', dica: 'Pelo nariz, sem pressa', escala: 1 },
    { chave: 'segurar1', rotulo: 'Segure', dica: 'Segura o ar', escala: 1 },
    { chave: 'expirar', rotulo: 'Expire', dica: 'Pela boca, soltando devagar', escala: 0.55 },
    { chave: 'segurar2', rotulo: 'Segure', dica: 'Pulmão vazio, tudo bem', escala: 0.55 },
];

const DURACOES = [
    { id: 1, rotulo: '1 min', segundos: 60 },
    { id: 3, rotulo: '3 min', segundos: 180 },
    { id: 5, rotulo: '5 min', segundos: 300 },
];

const TAMANHO_DO_CIRCULO = 220;

function formatarRelogio(totalSegundos) {
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

export default function BreathingScreen({ navigation, route }) {
    const { cores } = usarTema();
    const veioDaCrise = route?.params?.fromCrisis === true;

    const [duracao, setDuracao] = useState(DURACOES[1]);
    const [rodando, setRodando] = useState(false);
    const [decorrido, setDecorrido] = useState(0);
    const [finalizado, setFinalizado] = useState(false);

    const escala = useRef(new Animated.Value(0.55)).current;
    const intervaloRef = useRef(null);
    const animacaoRef = useRef(null);

    const indiceDaFase = Math.floor(decorrido / SEGUNDOS_DE_FASE) % FASES.length;
    const fase = FASES[indiceDaFase];
    const restanteDaFase = SEGUNDOS_DE_FASE - (decorrido % SEGUNDOS_DE_FASE);
    const restante = Math.max(0, duracao.segundos - decorrido);

    const pararTimers = useCallback(() => {
        if (intervaloRef.current) {
            clearInterval(intervaloRef.current);
            intervaloRef.current = null;
        }
        if (animacaoRef.current) {
            animacaoRef.current.stop();
            animacaoRef.current = null;
        }
    }, []);

    // Sair da tela no meio da sessão não pode deixar timer nem animação vivos.
    useFocusEffect(
        useCallback(() => {
            return () => {
                pararTimers();
                setRodando(false);
            };
        }, [pararTimers])
    );

    useEffect(() => pararTimers, [pararTimers]);

    // Cronômetro único: conta segundos enquanto a sessão roda.
    useEffect(() => {
        if (!rodando) return undefined;

        intervaloRef.current = setInterval(() => {
            setDecorrido((prev) => prev + 1);
        }, 1000);

        return () => {
            clearInterval(intervaloRef.current);
            intervaloRef.current = null;
        };
    }, [rodando]);

    // Animação do círculo: reage à troca de fase.
    useEffect(() => {
        if (!rodando) return;

        if (animacaoRef.current) animacaoRef.current.stop();

        animacaoRef.current = Animated.timing(escala, {
            toValue: fase.escala,
            duration: SEGUNDOS_DE_FASE * 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
        });
        animacaoRef.current.start();
    }, [rodando, indiceDaFase, fase.escala, escala]);

    // Fim da sessão.
    useEffect(() => {
        if (!rodando || decorrido < duracao.segundos) return;

        pararTimers();
        setRodando(false);
        setFinalizado(true);

        if (veioDaCrise) {
            navigation.navigate('Crisis', {
                completedMethod: 'respiracao',
                durationSec: duracao.segundos,
                completed: true,
            });
        }
    }, [rodando, decorrido, duracao.segundos, veioDaCrise, navigation, pararTimers]);

    function iniciar() {
        setDecorrido(0);
        setFinalizado(false);
        escala.setValue(0.55);
        setRodando(true);
    }

    function parar() {
        pararTimers();
        setRodando(false);

        if (veioDaCrise) {
            navigation.navigate('Crisis', {
                completedMethod: 'respiracao',
                durationSec: decorrido,
                completed: false,
            });
            return;
        }
        setDecorrido(0);
        escala.setValue(0.55);
    }

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView
            style={[styles.scroll, { backgroundColor: cores.background }]}
            contentContainerStyle={styles.container}
        >
            <ScreenHeader
                titulo="Respiração"
                subtitulo="Box breathing 4-4-4-4"
                cores={cores}
                mostrarConfiguracoes
                aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                aoPressionarVoltar={() => navigation.goBack()}
            />

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <View style={styles.circleWrap}>
                    <Animated.View
                        style={[
                            styles.circle,
                            {
                                backgroundColor: cores.primaryLight,
                                borderColor: cores.primary,
                                transform: [{ scale: escala }],
                            },
                        ]}
                    />
                    <View style={styles.circleTextWrap}>
                        <Text style={[styles.phaseLabel, { color: cores.primaryDark }]}>
                            {rodando ? fase.rotulo : 'Pronto?'}
                        </Text>
                        <Text style={[styles.phaseCount, { color: cores.text }]}>
                            {rodando ? restanteDaFase : formatarRelogio(duracao.segundos)}
                        </Text>
                    </View>
                </View>

                <Text style={[styles.hint, { color: cores.textSecondary }]}>
                    {rodando ? fase.dica : 'Inspire 4s, segure 4s, expire 4s, segure 4s.'}
                </Text>

                {rodando ? (
                    <Text style={[styles.remaining, { color: cores.textMuted }]}>
                        Faltam {formatarRelogio(restante)}
                    </Text>
                ) : null}
            </View>

            {!rodando ? (
                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    <Text style={[styles.cardTitle, { color: cores.textMuted }]}>Duração</Text>
                    <View style={styles.chips}>
                        {DURACOES.map((d) => (
                            <TouchableOpacity
                                key={d.id}
                                style={[
                                    styles.chip,
                                    { borderColor: cores.border, backgroundColor: cores.card },
                                    duracao.id === d.id && { borderColor: cores.primary, backgroundColor: cores.primary },
                                ]}
                                onPress={() => setDuracao(d)}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        { color: cores.textSecondary },
                                        duracao.id === d.id && { color: '#fff' },
                                    ]}
                                >
                                    {d.rotulo}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            ) : null}

            {finalizado && !veioDaCrise ? (
                <View style={[styles.doneCard, { backgroundColor: cores.card, borderLeftColor: cores.primary }, SOMBRA.pequena]}>
                    <Text style={[styles.doneText, { color: cores.text }]}>
                        Sessão concluída. Repara como o corpo tá agora. 💚
                    </Text>
                </View>
            ) : null}

            <TouchableOpacity
                style={[styles.mainBtn, { backgroundColor: rodando ? cores.card : cores.primary, borderColor: cores.primary }]}
                onPress={rodando ? parar : iniciar}
            >
                <Text style={[styles.mainBtnText, rodando && { color: cores.primaryDark }]}>
                    {rodando ? 'Parar' : finalizado ? 'Fazer de novo' : 'Começar'}
                </Text>
            </TouchableOpacity>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 32 },
    card: {
        borderRadius: RAIO.lg,
        padding: 20,
        marginHorizontal: 16,
        marginTop: 14,
    },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    circleWrap: {
        height: TAMANHO_DO_CIRCULO,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circle: {
        position: 'absolute',
        width: TAMANHO_DO_CIRCULO,
        height: TAMANHO_DO_CIRCULO,
        borderRadius: TAMANHO_DO_CIRCULO / 2,
        borderWidth: 3,
    },
    circleTextWrap: { alignItems: 'center' },
    phaseLabel: { fontSize: 18, fontFamily: 'Poppins_800ExtraBold', letterSpacing: 0.5 },
    phaseCount: { fontSize: 44, fontFamily: 'Poppins_800ExtraBold', marginTop: 2 },
    hint: { fontSize: 14, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 18, lineHeight: 20 },
    remaining: { fontSize: 12, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 8 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
        borderWidth: 1.5,
        borderRadius: RAIO.full,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    chipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    doneCard: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
    },
    doneText: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
    mainBtn: {
        borderRadius: RAIO.lg,
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 18,
        alignItems: 'center',
        borderWidth: 1.5,
    },
    mainBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
});
