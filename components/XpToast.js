// src/components/XpToast.js
// Popup pequeno no topo da tela avisando que o usuário ganhou XP.
// Não bloqueia toque (pointerEvents="none") e some sozinho.
// Quem dispara é o XpToastProvider (context/XpToastContext.js).
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';

export const TOAST_DURATION = 2200;

export default function XpToast({ toast, onHide }) {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!toast) return undefined;

        anim.setValue(0);
        let hideTimeout;
        let cancelled = false;

        Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start(() => {
            if (cancelled) return;
            hideTimeout = setTimeout(() => {
                Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(
                    ({ finished }) => {
                        if (finished && !cancelled) onHide();
                    }
                );
            }, TOAST_DURATION);
        });

        return () => {
            cancelled = true;
            clearTimeout(hideTimeout);
        };
    }, [toast, anim, onHide]);

    if (!toast) return null;

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.wrapper,
                { top: insets.top + 8 },
                {
                    opacity: anim,
                    transform: [
                        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
                    ],
                },
            ]}
        >
            <View
                style={[
                    styles.toast,
                    { backgroundColor: colors.card, borderLeftColor: colors.primary },
                    SHADOW.medium,
                ]}
            >
                <Text style={styles.icon}>{toast.icon || '⭐'}</Text>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                        {toast.title}
                    </Text>
                    {!!toast.subtitle && (
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {toast.subtitle}
                        </Text>
                    )}
                </View>
                <Text style={[styles.xp, { color: colors.primaryDark }]}>+{toast.xp} XP</Text>
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
        borderRadius: RADIUS.lg,
        borderLeftWidth: 4,
    },
    icon: { fontSize: 22 },
    title: { fontSize: 14, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },
    xp: { fontSize: 15, fontWeight: '800' },
});
