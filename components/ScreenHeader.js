import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usarFaixaDeTopoVisivel } from './OfflineBanner';

export default function ScreenHeader({
    titulo,
    subtitulo,
    cores,
    aoPressionarVoltar,
    aoPressionarConfiguracoes,
    mostrarConfiguracoes = false,
}) {
    const insets = useSafeAreaInsets();

    // O OfflineBanner (quando visível) já fica acima do header e come o inset
    // do topo — somar de novo aqui abriria um vão dobrado.
    const faixaOfflineVisivel = usarFaixaDeTopoVisivel();
    const espacoDoTopo = (faixaOfflineVisivel ? 0 : insets.top) + 12;

    return (
        <View style={[styles.header, { backgroundColor: cores.primary, paddingTop: espacoDoTopo }]}>
            {aoPressionarVoltar ? (
                <TouchableOpacity onPress={aoPressionarVoltar} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
            ) : (
                <View style={styles.leftSpacer} />
            )}

            <View style={styles.textWrap}>
                <Text style={styles.title}>{titulo}</Text>
                <Text style={styles.subtitle}>{subtitulo}</Text>
            </View>

            <View style={styles.actions}>
                {mostrarConfiguracoes ? (
                    <TouchableOpacity onPress={aoPressionarConfiguracoes} style={styles.settingsBtn}>
                        <Ionicons name="settings-outline" size={22} color="#fff" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.profilePlaceholder} />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 16,
        paddingBottom: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    leftSpacer: {
        width: 38,
        height: 38,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textWrap: {
        flex: 1,
    },
    title: {
        fontSize: 26,
        fontFamily: 'Poppins_800ExtraBold',
        color: '#fff',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 12, fontFamily: 'Poppins_400Regular',
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
    actions: {
        alignItems: 'center',
        gap: 8,
    },
    settingsBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    profilePlaceholder: {
        width: 38,
        height: 38,
    },
});
