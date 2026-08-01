// Popup pequeno no topo da tela. Variantes:
//   'xp'      -> ganho de XP (borda verde, "+N XP" à direita)
//   'erro'    -> falha ao salvar (borda vermelha, sem XP, dura mais)
//   'aviso'   -> validação / recado (borda laranja)
//   'sucesso' -> deu certo (borda verde)
// Só a variante 'xp' mostra o "+N XP"; as outras são texto puro.
// Não bloqueia toque (pointerEvents="none") e some sozinho.
// Quem dispara é o ToastProvider (context/ToastContext.js).
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { ALTURA_DA_FAIXA_OFFLINE, usarFaixaDeTopoVisivel } from './OfflineBanner';

export const DURACAO_DO_TOAST = 2200;
export const DURACAO_DO_TOAST_LONGO = 3500;

export default function Toast({ toast, aoEsconder }) {
    const { cores } = usarTema();
    const insets = useSafeAreaInsets();
    const animacao = useRef(new Animated.Value(0)).current;

    // Quando a faixa do OfflineBanner está na tela, o toast desce a altura
    // dela pra não cobrir o aviso.
    const faixaOfflineVisivel = usarFaixaDeTopoVisivel();

    useEffect(() => {
        if (!toast) return undefined;

        animacao.setValue(0);
        let timeoutParaEsconder;
        let cancelado = false;

        Animated.timing(animacao, { toValue: 1, duration: 220, useNativeDriver: true }).start(
            () => {
                if (cancelado) return;
                timeoutParaEsconder = setTimeout(() => {
                    Animated.timing(animacao, {
                        toValue: 0,
                        duration: 220,
                        useNativeDriver: true,
                    }).start(({ finished }) => {
                        if (finished && !cancelado) aoEsconder();
                    });
                }, toast.duracao ?? DURACAO_DO_TOAST);
            }
        );

        return () => {
            cancelado = true;
            clearTimeout(timeoutParaEsconder);
        };
    }, [toast, animacao, aoEsconder]);

    if (!toast) return null;

    const ehXp = toast.variante === 'xp';
    const corDaBorda =
        {
            erro: cores.danger,
            aviso: cores.warning,
            sucesso: cores.primary,
        }[toast.variante] || cores.primary;

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.wrapper,
                { top: insets.top + 8 + (faixaOfflineVisivel ? ALTURA_DA_FAIXA_OFFLINE : 0) },
                {
                    opacity: animacao,
                    transform: [
                        {
                            translateY: animacao.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-24, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            <View
                style={[
                    styles.toast,
                    {
                        backgroundColor: cores.card,
                        borderLeftColor: corDaBorda,
                    },
                    SOMBRA.media,
                ]}
            >
                <Text style={styles.icon}>{toast.icone || (ehXp ? '⭐' : '⚠️')}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: cores.text }]} numberOfLines={1}>
                        {toast.titulo}
                    </Text>
                    {!!toast.subtitulo && (
                        <Text
                            style={[styles.subtitle, { color: cores.textSecondary }]}
                            numberOfLines={ehXp ? 1 : 2}
                        >
                            {toast.subtitulo}
                        </Text>
                    )}
                </View>
                {ehXp && (
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
    icon: { fontSize: 22, fontFamily: 'Poppins_400Regular' },
    title: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    subtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 1 },
    xp: { fontSize: 15, fontFamily: 'Poppins_800ExtraBold' },
});
