// src/screens/CrisisScreen.js
//
// Modo crise ("Estou com vontade"). Menu direto: o usuário escolhe o
// método, nada é imposto. Se o histórico de crises já mostrar um método
// que funcionou pra ele (recommendedCrisisMethod), esse vem primeiro e
// marcado — os outros continuam clicáveis.
//
// Toda visita vira uma sessão salva (saveCrisisSession), mesmo se o usuário
// pular o feedback do fim: ter pedido ajuda já é dado.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import CrisisOutcomeModal from '../components/CrisisOutcomeModal';
import { RADIUS, SHADOW, DISTRACTIONS, CRISIS_MESSAGES } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { getRecords, getCrisisSessions, saveCrisisSession, todayString } from '../utils/storage';
import { recommendedCrisisMethod, topTriggerLabel, MIN_RECORDS_FOR_INSIGHTS } from '../utils/insights';

const HOLD_SECONDS = 5 * 60;

const METHODS = [
    {
        id: 'respiracao',
        icon: '🧘',
        title: 'Respiração guiada',
        subtitle: 'Box breathing 4-4-4-4, de 1 a 5 minutos',
    },
    {
        id: 'timer',
        icon: '⏱️',
        title: 'Aguente 5 minutos',
        subtitle: 'O pico da vontade passa em 3 a 5 min',
    },
    {
        id: 'distracao',
        icon: '💧',
        title: 'Distrações rápidas',
        subtitle: 'Coisas simples pra fazer agora',
    },
];

// Mensagem personalizada pelo gatilho mais frequente. Só depois de ter
// registro suficiente pra isso ser um padrão, não um chute.
function triggerMessage(label) {
    return `Seu gatilho mais comum é ${label}. Já reconhecer isso é meio caminho — a vontade tem nome e tem hora pra passar.`;
}

function formatClock(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function nowTimeString() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CrisisScreen({ navigation, route }) {
    const { colors, isDark, toggleTheme } = useTheme();

    const [message, setMessage] = useState(null);
    const [recommended, setRecommended] = useState(null);
    const [activeMethod, setActiveMethod] = useState(null);
    const [holdLeft, setHoldLeft] = useState(HOLD_SECONDS);
    const [holdRunning, setHoldRunning] = useState(false);
    const [pending, setPending] = useState(null);

    const startedAt = useRef(Date.now());
    const holdInterval = useRef(null);
    const savingRef = useRef(false);

    const load = useCallback(async () => {
        const [records, sessions] = await Promise.all([getRecords(), getCrisisSessions()]);

        const trigger = records.length >= MIN_RECORDS_FOR_INSIGHTS ? topTriggerLabel(records) : null;
        setMessage(
            trigger
                ? triggerMessage(trigger)
                : CRISIS_MESSAGES[Math.floor(Math.random() * CRISIS_MESSAGES.length)]
        );
        setRecommended(recommendedCrisisMethod(sessions));
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    // Volta da tela de respiração: ela avisa o que aconteceu por params.
    useEffect(() => {
        const params = route?.params;
        if (!params?.completedMethod) return;

        navigation.setParams({ completedMethod: undefined, durationSec: undefined, completed: undefined });
        setPending({
            method: params.completedMethod,
            durationSec: params.durationSec ?? 0,
            completed: params.completed === true,
        });
    }, [route?.params, navigation]);

    // Timer "aguente 5 minutos".
    useEffect(() => {
        if (!holdRunning) return undefined;

        holdInterval.current = setInterval(() => {
            setHoldLeft((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => {
            clearInterval(holdInterval.current);
            holdInterval.current = null;
        };
    }, [holdRunning]);

    useEffect(() => {
        if (holdRunning && holdLeft === 0) {
            setHoldRunning(false);
            finish('timer', HOLD_SECONDS, true);
        }
    }, [holdRunning, holdLeft]);

    useEffect(() => {
        return () => {
            if (holdInterval.current) clearInterval(holdInterval.current);
        };
    }, []);

    function elapsedSeconds() {
        return Math.round((Date.now() - startedAt.current) / 1000);
    }

    // Abre o modal de "como foi?" com o que já se sabe da sessão.
    function finish(method, durationSec, completed) {
        setPending({
            method: method ?? activeMethod,
            durationSec: durationSec ?? elapsedSeconds(),
            completed: completed === true,
        });
    }

    async function persist(outcome, note) {
        if (savingRef.current) return;
        savingRef.current = true;

        await saveCrisisSession({
            id: Date.now(),
            date: todayString(),
            time: nowTimeString(),
            method: pending?.method ?? null,
            durationSec: pending?.durationSec ?? elapsedSeconds(),
            completed: pending?.completed === true,
            outcome: outcome ?? null,
            note: note ?? null,
        });

        setPending(null);
        savingRef.current = false;
        navigation.goBack();
    }

    function selectMethod(id) {
        if (id === 'respiracao') {
            navigation.navigate('Breathing', { fromCrisis: true });
            return;
        }

        setActiveMethod((prev) => (prev === id ? null : id));

        if (id === 'timer') {
            setHoldLeft(HOLD_SECONDS);
            setHoldRunning(true);
        } else {
            setHoldRunning(false);
        }
    }

    // Método recomendado primeiro, resto na ordem original.
    const orderedMethods = recommended
        ? [
              ...METHODS.filter((m) => m.id === recommended.method),
              ...METHODS.filter((m) => m.id !== recommended.method),
          ]
        : METHODS;

    return (
        <>
            <ScrollView
                style={[styles.scroll, { backgroundColor: colors.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    title="Tô com vontade"
                    subtitle="Respira. A gente passa por isso junto."
                    colors={colors}
                    isDark={isDark}
                    toggleTheme={toggleTheme}
                    showProfile={false}
                    onBackPress={() => finish(activeMethod, elapsedSeconds(), false)}
                />

                <View style={[styles.msgCard, { backgroundColor: colors.card, borderLeftColor: colors.warning }, SHADOW.medium]}>
                    <Text style={[styles.msgText, { color: colors.text }]}>{message}</Text>
                </View>

                {orderedMethods.map((m) => {
                    const isRecommended = recommended?.method === m.id;
                    const isActive = activeMethod === m.id;

                    return (
                        <View key={m.id}>
                            <TouchableOpacity
                                style={[
                                    styles.methodCard,
                                    { backgroundColor: colors.card, borderColor: isActive ? colors.primary : 'transparent' },
                                    SHADOW.small,
                                ]}
                                onPress={() => selectMethod(m.id)}
                            >
                                <Text style={styles.methodIcon}>{m.icon}</Text>
                                <View style={styles.methodBody}>
                                    <View style={styles.methodTitleRow}>
                                        <Text style={[styles.methodTitle, { color: colors.text }]}>{m.title}</Text>
                                        {isRecommended ? (
                                            <View style={[styles.badge, { backgroundColor: colors.primaryLight }]}>
                                                <Text style={[styles.badgeText, { color: colors.primaryDark }]}>
                                                    já funcionou
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text style={[styles.methodSubtitle, { color: colors.textSecondary }]}>
                                        {m.subtitle}
                                    </Text>
                                </View>
                                <Ionicons
                                    name={m.id === 'respiracao' ? 'chevron-forward' : isActive ? 'chevron-up' : 'chevron-down'}
                                    size={18}
                                    color={colors.textMuted}
                                />
                            </TouchableOpacity>

                            {isActive && m.id === 'timer' ? (
                                <View style={[styles.panel, { backgroundColor: colors.card }, SHADOW.small]}>
                                    <Text style={[styles.clock, { color: colors.primaryDark }]}>{formatClock(holdLeft)}</Text>
                                    <Text style={[styles.panelText, { color: colors.textSecondary }]}>
                                        Você não precisa fazer nada além de esperar. A vontade vai baixar sozinha.
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.panelBtn, { borderColor: colors.primary }]}
                                        onPress={() => setHoldRunning((prev) => !prev)}
                                    >
                                        <Text style={[styles.panelBtnText, { color: colors.primaryDark }]}>
                                            {holdRunning ? 'Pausar' : 'Continuar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}

                            {isActive && m.id === 'distracao' ? (
                                <View style={[styles.panel, { backgroundColor: colors.card }, SHADOW.small]}>
                                    {DISTRACTIONS.map((d) => (
                                        <View key={d.id} style={styles.distractionRow}>
                                            <Text style={styles.distractionEmoji}>{d.emoji}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.distractionLabel, { color: colors.text }]}>{d.label}</Text>
                                                <Text style={[styles.distractionDetail, { color: colors.textSecondary }]}>
                                                    {d.detail}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : null}

                        </View>
                    );
                })}

                <TouchableOpacity
                    style={[styles.endBtn, { backgroundColor: colors.primary }]}
                    onPress={() => finish(activeMethod, elapsedSeconds(), false)}
                >
                    <Text style={styles.endBtnText}>Já passou, encerrar</Text>
                </TouchableOpacity>
            </ScrollView>

            <CrisisOutcomeModal
                visible={pending !== null}
                colors={colors}
                onSubmit={(outcome, note) => persist(outcome, note)}
                onSkip={() => persist(null, null)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 32 },
    msgCard: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
    },
    msgText: { fontSize: 15, lineHeight: 22 },
    methodCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: RADIUS.lg,
        borderWidth: 1.5,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 12,
    },
    methodIcon: { fontSize: 24 },
    methodBody: { flex: 1 },
    methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    methodTitle: { fontSize: 15, fontWeight: '700' },
    badge: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    methodSubtitle: { fontSize: 12, marginTop: 2 },
    panel: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 8,
    },
    clock: { fontSize: 40, fontWeight: '800', textAlign: 'center' },
    panelText: { fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
    panelBtn: {
        borderWidth: 1.5,
        borderRadius: RADIUS.md,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 14,
    },
    panelBtnText: { fontSize: 14, fontWeight: '700' },
    distractionRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
    distractionEmoji: { fontSize: 20 },
    distractionLabel: { fontSize: 14, fontWeight: '600' },
    distractionDetail: { fontSize: 12, marginTop: 2 },
    endBtn: {
        borderRadius: RADIUS.lg,
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 20,
        alignItems: 'center',
    },
    endBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
