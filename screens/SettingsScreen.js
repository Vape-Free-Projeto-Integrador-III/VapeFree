import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../context/ThemeContext';
import { RADIUS, SHADOW } from '../utils/theme';
import ScreenHeader from '../components/ScreenHeader';
import AnimatedScreenContent from '../components/AnimatedScreenContent';
import { markRoute } from '../utils/tabTransition';

export default function SettingsScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();

    useFocusEffect(useCallback(() => { markRoute('Settings'); }, []));

    return (
        <AnimatedScreenContent type="fade" backgroundColor={colors.background}>
        <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                title="Configurações"
                subtitle="Ajuste o app do seu jeito"
                colors={colors}
                isDark={isDark}
                onBackPress={() => navigation.goBack()}
                showProfile={false}
                showTheme={false}
            />

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.small]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate('Profile')}
                >
                    <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="person-circle-outline" size={20} color={colors.primaryDark} />
                    </View>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Perfil</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={colors.primaryDark} />
                    </View>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>Modo escuro</Text>
                    <Switch value={isDark} onValueChange={toggleTheme} />
                </View>
            </View>
        </ScrollView>
        </AnimatedScreenContent>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    icon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
    },
    divider: { height: StyleSheet.hairlineWidth },
});
