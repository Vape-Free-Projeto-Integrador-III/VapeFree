// src/components/AchievementCelebration.js
// Modal de celebração que aparece ao desbloquear uma conquista.
// Emoji grande com pulso, confete animado (Animated puro, sem lib) e vibração.
// Quem dispara é o XpToastProvider (context/XpToastContext.js), uma conquista
// por vez — o botão "Arrasou!" chama aoFechar e o provider mostra a próxima.
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Vibration, Dimensions } from 'react-native';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';

const { width: LARGURA_DA_TELA } = Dimensions.get('window');
const EMOJIS_DE_CONFETE = ['🎉', '✨', '🎊', '⭐', '💚'];
const QUANTIDADE_DE_CONFETE = 14;

function Confete({ animacao }) {
    // Cada partícula tem posição/atraso/emoji fixos por render; a mesma animacao
    // (0 -> 1) controla queda e fade de todas ao mesmo tempo.
    const particulas = useMemo(
        () =>
            Array.from({ length: QUANTIDADE_DE_CONFETE }).map((_, i) => ({
                key: i,
                x: Math.random() * LARGURA_DA_TELA,
                emoji: EMOJIS_DE_CONFETE[i % EMOJIS_DE_CONFETE.length],
                atraso: Math.random() * 0.4,
                giro: (Math.random() - 0.5) * 2,
                tamanho: 18 + Math.random() * 14,
            })),
        []
    );

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {particulas.map((p) => {
                const progresso = animacao.interpolate({
                    inputRange: [p.atraso, 1],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                });
                return (
                    <Animated.Text
                        key={p.key}
                        style={{
                            position: 'absolute',
                            left: p.x,
                            top: -40,
                            fontSize: p.tamanho,
                            opacity: progresso.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                            transform: [
                                { translateY: progresso.interpolate({ inputRange: [0, 1], outputRange: [0, 640] }) },
                                { rotate: progresso.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.giro * 360}deg`] }) },
                            ],
                        }}
                    >
                        {p.emoji}
                    </Animated.Text>
                );
            })}
        </View>
    );
}

export default function AchievementCelebration({ conquista, aoFechar }) {
    const { cores } = usarTema();
    const entrada = useRef(new Animated.Value(0)).current;
    const pulso = useRef(new Animated.Value(1)).current;
    const confete = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!conquista) return undefined;

        Vibration.vibrate([0, 40, 60, 40]);

        entrada.setValue(0);
        confete.setValue(0);
        Animated.spring(entrada, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }).start();
        Animated.timing(confete, { toValue: 1, duration: 1600, useNativeDriver: true }).start();

        const laco = Animated.loop(
            Animated.sequence([
                Animated.timing(pulso, { toValue: 1.12, duration: 600, useNativeDriver: true }),
                Animated.timing(pulso, { toValue: 1, duration: 600, useNativeDriver: true }),
            ])
        );
        laco.start();

        return () => laco.stop();
    }, [conquista, entrada, pulso, confete]);

    if (!conquista) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
            <View style={styles.overlay}>
                <Confete animacao={confete} />
                <Animated.View
                    style={[
                        styles.card,
                        { backgroundColor: cores.card },
                        SOMBRA.media,
                        {
                            opacity: entrada,
                            transform: [
                                { scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                            ],
                        },
                    ]}
                >
                    <Text style={[styles.rotulo, { color: cores.primary }]}>CONQUISTA DESBLOQUEADA</Text>

                    <Animated.View style={[styles.circulo, { backgroundColor: cores.primaryLight }, { transform: [{ scale: pulso }] }]}>
                        <Text style={styles.emoji}>{conquista.icone || '🏆'}</Text>
                    </Animated.View>

                    <Text style={[styles.titulo, { color: cores.text }]}>{conquista.titulo}</Text>
                    {!!conquista.descricao && (
                        <Text style={[styles.descricao, { color: cores.textSecondary }]}>{conquista.descricao}</Text>
                    )}
                    {conquista.xp > 0 && (
                        <View style={[styles.xpBadge, { backgroundColor: cores.primary }]}>
                            <Text style={styles.xpTexto}>+{conquista.xp} XP</Text>
                        </View>
                    )}

                    <TouchableOpacity style={[styles.botao, { backgroundColor: cores.primary }]} onPress={aoFechar} activeOpacity={0.85}>
                        <Text style={styles.botaoTexto}>Arrasou!</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        borderRadius: RAIO.xl,
        padding: 28,
        alignItems: 'center',
    },
    rotulo: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
    circulo: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emoji: { fontSize: 64 },
    titulo: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    descricao: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    xpBadge: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 6, borderRadius: RAIO.full },
    xpTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    botao: {
        marginTop: 24,
        paddingVertical: 14,
        paddingHorizontal: 40,
        borderRadius: RAIO.full,
        alignSelf: 'stretch',
        alignItems: 'center',
    },
    botaoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
