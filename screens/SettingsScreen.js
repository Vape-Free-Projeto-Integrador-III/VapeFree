import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usarTema } from '../context/ThemeContext';
import { RAIO, SOMBRA } from '../utils/theme';
import ScreenHeader from '../components/ScreenHeader';

export default function SettingsScreen({ navigation }) {
    const { cores, estaEscuro, alternarTema } = usarTema();

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: cores.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                titulo="Configurações"
                subtitulo="Ajuste o app do seu jeito"
                cores={cores}
                aoPressionarVoltar={() => navigation.goBack()}
                mostrarPerfil={false}
            />

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                <TouchableOpacity
                    style={styles.row}
                    onPress={() => navigation.navigate('Profile')}
                >
                    <View style={[styles.icon, { backgroundColor: cores.primaryLight }]}>
                        <Ionicons name="person-circle-outline" size={20} color={cores.primaryDark} />
                    </View>
                    <Text style={[styles.rowLabel, { color: cores.text }]}>Perfil</Text>
                    <Ionicons name="chevron-forward" size={18} color={cores.textMuted} />
                </TouchableOpacity>

                <View style={[styles.divider, { backgroundColor: cores.border }]} />

                <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: cores.primaryLight }]}>
                        <Ionicons name={estaEscuro ? 'sunny-outline' : 'moon-outline'} size={20} color={cores.primaryDark} />
                    </View>
                    <Text style={[styles.rowLabel, { color: cores.text }]}>Modo escuro</Text>
                    <Switch value={estaEscuro} onValueChange={alternarTema} />
                </View>
            </View>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RAIO.lg,
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
        fontFamily: 'Poppins_600SemiBold',
    },
    divider: { height: StyleSheet.hairlineWidth },
});
