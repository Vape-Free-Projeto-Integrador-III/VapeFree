// src/screens/BreathingScreen.js
//
// Respiração box 4-4-4-4: inspirar 4s -> segurar 4s -> expirar 4s -> segurar 4s.
// Funciona sozinha ou como método do modo crise (route.params.fromCrisis).
//
// O tempo é controlado por UM intervalo de 1s (elapsedRef). A fase atual é
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
import { RADIUS, SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

const PHASE_SECONDS = 4;
const PHASES = [
    { key: 'inspirar', label: 'Inspire', hint: 'Pelo nariz, sem pressa', scale: 1 },
    { key: 'segurar1', label: 'Segure', hint: 'Segura o ar', scale: 1 },
    { key: 'expirar', label: 'Expire', hint: 'Pela boca, soltando devagar', scale: 0.55 },
    { key: 'segurar2', label: 'Segure', hint: 'Pulmão vazio, tudo bem', scale: 0.55 },
];

const DURATIONS = [
    { id: 1, label: '1 min', seconds: 60 },
    { id: 3, label: '3 min', seconds: 180 },
    { id: 5, label: '5 min', seconds: 300 },
];

const CIRCLE_SIZE = 220;

function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function BreathingScreen({ navigation, route }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const fromCrisis = route?.params?.fromCrisis === true;

    const [duration, setDuration] = useState(DURATIONS[1]);
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [finished, setFinished] = useState(false);

    const scale = useRef(new Animated.Value(0.55)).current;
    const intervalRef = useRef(null);
    const animationRef = useRef(null);

    const phaseIndex = Math.floor(elapsed / PHASE_SECONDS) % PHASES.length;
    const phase = PHASES[phaseIndex];
    const phaseRemaining = PHASE_SECONDS - (elapsed % PHASE_SECONDS);
    const remaining = Math.max(0, duration.seconds - elapsed);

    const stopTimers = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (animationRef.current) {
            animationRef.current.stop();
            animationRef.current = null;
        }
    }, []);

    // Sair da tela no meio da sessão não pode deixar timer nem animação vivos.
    useFocusEffect(
        useCallback(() => {
            return () => {
                stopTimers();
                setRunning(false);
            };
        }, [stopTimers])
    );

    useEffect(() => stopTimers, [stopTimers]);

    // Cronômetro único: conta segundos enquanto a sessão roda.
    useEffect(() => {
        if (!running) return undefined;

        intervalRef.current = setInterval(() => {
            setElapsed((prev) => prev + 1);
        }, 1000);

        return () => {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        };
    }, [running]);

    // Animação do círculo: reage à troca de fase.
    useEffect(() => {
        if (!running) return;

        if (animationRef.current) animationRef.current.stop();

        animationRef.current = Animated.timing(scale, {
            toValue: phase.scale,
            duration: PHASE_SECONDS * 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
        });
        animationRef.current.start();
    }, [running, phaseIndex, phase.scale, scale]);

    // Fim da sessão.
    useEffect(() => {
        if (!running || elapsed < duration.seconds) return;

        stopTimers();
        setRunning(false);
        setFinished(true);

        if (fromCrisis) {
            navigation.navigate('Crisis', {
                completedMethod: 'respiracao',
                durationSec: duration.seconds,
                completed: true,
            });
        }
    }, [running, elapsed, duration.seconds, fromCrisis, navigation, stopTimers]);

    function start() {
        setElapsed(0);
        setFinished(false);
        scale.setValue(0.55);
        setRunning(true);
    }

    function stop() {
        stopTimers();
        setRunning(false);

        if (fromCrisis) {
            navigation.navigate('Crisis', {
                completedMethod: 'respiracao',
                durationSec: elapsed,
                completed: false,
            });
            return;
        }
        setElapsed(0);
        scale.setValue(0.55);
    }

    return (
        <ScrollView
            style={[styles.scroll, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.container}
        >
            <ScreenHeader
                title="Respiração"
                subtitle="Box breathing 4-4-4-4"
                colors={colors}
                isDark={isDark}
                toggleTheme={toggleTheme}
                showProfile={false}
                onBackPress={() => navigation.goBack()}
            />

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <View style={styles.circleWrap}>
                    <Animated.View
                        style={[
                            styles.circle,
                            {
                                backgroundColor: colors.primaryLight,
                                borderColor: colors.primary,
                                transform: [{ scale }],
                            },
                        ]}
                    />
                    <View style={styles.circleTextWrap}>
                        <Text style={[styles.phaseLabel, { color: colors.primaryDark }]}>
                            {running ? phase.label : 'Pronto?'}
                        </Text>
                        <Text style={[styles.phaseCount, { color: colors.text }]}>
                            {running ? phaseRemaining : formatClock(duration.seconds)}
                        </Text>
                    </View>
                </View>

                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {running ? phase.hint : 'Inspire 4s, segure 4s, expire 4s, segure 4s.'}
                </Text>

                {running ? (
                    <Text style={[styles.remaining, { color: colors.textMuted }]}>
                        Faltam {formatClock(remaining)}
                    </Text>
                ) : null}
            </View>

            {!running ? (
                <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.small]}>
                    <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Duração</Text>
                    <View style={styles.chips}>
                        {DURATIONS.map((d) => (
                            <TouchableOpacity
                                key={d.id}
                                style={[
                                    styles.chip,
                                    { borderColor: colors.border, backgroundColor: colors.card },
                                    duration.id === d.id && { borderColor: colors.primary, backgroundColor: colors.primary },
                                ]}
                                onPress={() => setDuration(d)}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        { color: colors.textSecondary },
                                        duration.id === d.id && { color: '#fff' },
                                    ]}
                                >
                                    {d.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            ) : null}

            {finished && !fromCrisis ? (
                <View style={[styles.doneCard, { backgroundColor: colors.card, borderLeftColor: colors.primary }, SHADOW.small]}>
                    <Text style={[styles.doneText, { color: colors.text }]}>
                        Sessão concluída. Repara como o corpo tá agora. 💚
                    </Text>
                </View>
            ) : null}

            <TouchableOpacity
                style={[styles.mainBtn, { backgroundColor: running ? colors.card : colors.primary, borderColor: colors.primary }]}
                onPress={running ? stop : start}
            >
                <Text style={[styles.mainBtnText, running && { color: colors.primaryDark }]}>
                    {running ? 'Parar' : finished ? 'Fazer de novo' : 'Começar'}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 32 },
    card: {
        borderRadius: RADIUS.lg,
        padding: 20,
        marginHorizontal: 16,
        marginTop: 14,
    },
    cardTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    circleWrap: {
        height: CIRCLE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circle: {
        position: 'absolute',
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        borderWidth: 3,
    },
    circleTextWrap: { alignItems: 'center' },
    phaseLabel: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    phaseCount: { fontSize: 44, fontWeight: '800', marginTop: 2 },
    hint: { fontSize: 14, textAlign: 'center', marginTop: 18, lineHeight: 20 },
    remaining: { fontSize: 12, textAlign: 'center', marginTop: 8 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: {
        borderWidth: 1.5,
        borderRadius: RADIUS.full,
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    chipText: { fontSize: 13, fontWeight: '600' },
    doneCard: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
    },
    doneText: { fontSize: 14, lineHeight: 20 },
    mainBtn: {
        borderRadius: RADIUS.lg,
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 18,
        alignItems: 'center',
        borderWidth: 1.5,
    },
    mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
