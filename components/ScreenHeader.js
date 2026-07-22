import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ScreenHeader({
    titulo,
    subtitulo,
    cores,
    estaEscuro,
    alternarTema,
    aoPressionarPerfil,
    aoPressionarVoltar,
    aoPressionarConfiguracoes,
    mostrarPerfil = true,
    mostrarTema = true,
    mostrarConfiguracoes = false,
}) {
    return (
        <View style={[styles.header, { backgroundColor: cores.primary }]}>
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
                    <>
                        {mostrarPerfil ? (
                            <TouchableOpacity onPress={aoPressionarPerfil} style={styles.profileBtn}>
                                <Ionicons name="person-circle-outline" size={28} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.profilePlaceholder} />
                        )}

                        {mostrarTema ? (
                            <TouchableOpacity onPress={alternarTema} style={styles.themeBtn}>
                                <Ionicons name={estaEscuro ? 'sunny' : 'moon'} size={22} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.themePlaceholder} />
                        )}
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 16,
        paddingTop: 30,
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
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
    actions: {
        alignItems: 'center',
        gap: 8,
    },
    profileBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    themeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
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
    themePlaceholder: {
        width: 38,
        height: 38,
    },
});
