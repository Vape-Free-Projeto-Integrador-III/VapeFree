// src/components/XpToast.js
// Popup pequeno no topo da tela. Duas variantes:
//   'xp'   -> ganho de XP (borda verde, "+N XP" à direita)
//   'erro' -> falha ao salvar (borda vermelha, sem XP, dura mais)
// Não bloqueia toque (pointerEvents="none") e some sozinho.
// Quem dispara é o XpToastProvider (context/XpToastContext.js).
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';

export const DURACAO_DO_TOAST = 2200;
export const DURACAO_DO_TOAST_DE_ERRO = 3500;

export default function XpToast({ toast, aoEsconder }) {
    const { cores } = usarTema();
    const insets = useSafeAreaInsets();
    const animacao = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!toast) return undefined;

        animacao.setValue(0);
        let timeoutParaEsconder;
        let cancelado = false;

        Animated.timing(animacao, { toValue: 1, duration: 220, useNativeDriver: true }).start(() => {
            if (cancelado) return;
            timeoutParaEsconder = setTimeout(() => {
                Animated.timing(animacao, { toValue: 0, duration: 220, useNativeDriver: true }).start(
                    ({ finished }) => {
                        if (finished && !cancelado) aoEsconder();
                    }
                );
            }, toast.duracao ?? DURACAO_DO_TOAST);
        });

        return () => {
            cancelado = true;
            clearTimeout(timeoutParaEsconder);
        };
    }, [toast, animacao, aoEsconder]);

    if (!toast) return null;

    const ehErro = toast.variante === 'erro';

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.wrapper,
                { top: insets.top + 8 },
                {
                    opacity: animacao,
                    transform: [
                        { translateY: animacao.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
                    ],
                },
            ]}
        >
            <View
                style={[
                    styles.toast,
                    {
                        backgroundColor: cores.card,
                        borderLeftColor: ehErro ? cores.danger : cores.primary,
                    },
                    SOMBRA.media,
                ]}
            >
                <Text style={styles.icon}>{toast.icone || (ehErro ? '⚠️' : '⭐')}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: cores.text }]} numberOfLines={1}>
                        {toast.titulo}
                    </Text>
                    {!!toast.subtitulo && (
                        <Text
                            style={[styles.subtitle, { color: cores.textSecondary }]}
                            numberOfLines={ehErro ? 2 : 1}
                        >
                            {toast.subtitulo}
                        </Text>
                    )}
                </View>
                {!ehErro && (
                    <Text style={[styles.xp, { color: cores.primaryDark }]}>+{toast.xp} XP</Text>
                )}
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: { position: 'absolute', left: 16, right: 16, zIndex: 999 },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: RAIO.lg,
        borderLeftWidth: 4,
    },
    icon: { fontSize: 22 },
    title: { fontSize: 14, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },
    xp: { fontSize: 15, fontWeight: '800' },
});
