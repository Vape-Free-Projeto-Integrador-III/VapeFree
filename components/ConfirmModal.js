// src/components/ConfirmModal.js
// Modal de confirmação genérico, no mesmo visual do GuestDataChoiceModal, mas
// temado (usarTema) e dirigido por um array de botões no formato do
// Alert.alert do React Native: [{ text, onPress, style }].
//   style 'cancel'      -> botão neutro (vai pro topo da pilha)
//   style 'destructive' -> botão vermelho
//   sem style           -> botão principal (verde, fica embaixo)
// Quem monta é o ToastProvider (context/ToastContext.js), a partir de
// Alert.alert com 2+ botões (ver utils/alert.js).
import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usarTema } from '../context/ThemeContext';

// Cancelar em cima, ação principal embaixo — mesma ordem do GuestDataChoiceModal.
function ordenarBotoes(botoes) {
    const cancelar = botoes.filter((b) => b.style === 'cancel');
    const resto = botoes.filter((b) => b.style !== 'cancel');
    return [...cancelar, ...resto];
}

export default function ConfirmModal({ visivel, titulo, mensagem, botoes = [], aoPressionar }) {
    const { cores, estaEscuro } = usarTema();

    const emOrdem = ordenarBotoes(botoes);
    const botaoCancelar = botoes.find((b) => b.style === 'cancel') || null;
    const temDestrutivo = botoes.some((b) => b.style === 'destructive');

    function fecharPorFora() {
        aoPressionar(botaoCancelar);
    }

    function estiloDoBotao(botao) {
        if (botao.style === 'cancel') {
            return {
                fundo: { backgroundColor: estaEscuro ? cores.borderLight : '#F2F4F7' },
                texto: { color: cores.text },
            };
        }
        if (botao.style === 'destructive') {
            return {
                fundo: { backgroundColor: estaEscuro ? '#3A1E1E' : '#FFF1F2' },
                texto: { color: cores.danger },
            };
        }
        return {
            fundo: { backgroundColor: cores.primary },
            texto: { color: '#FFFFFF' },
        };
    }

    return (
        <Modal transparent visible={visivel} animationType="fade" onRequestClose={fecharPorFora}>
            <Pressable style={styles.backdrop} onPress={fecharPorFora}>
                {/* Pressable interno só pra o toque no card não fechar o modal. */}
                <Pressable style={[styles.card, { backgroundColor: cores.modalBg }]} onPress={() => {}}>
                    <View
                        style={[
                            styles.iconWrap,
                            { backgroundColor: temDestrutivo ? cores.danger + '22' : cores.primaryLight },
                        ]}
                    >
                        <Ionicons
                            name={temDestrutivo ? 'alert-circle-outline' : 'help-circle-outline'}
                            size={22}
                            color={temDestrutivo ? cores.danger : cores.primary}
                        />
                    </View>

                    <Text style={[styles.title, { color: cores.text }]}>{titulo}</Text>
                    {!!mensagem && (
                        <Text style={[styles.message, { color: cores.textSecondary }]}>{mensagem}</Text>
                    )}

                    <View style={styles.actions}>
                        {emOrdem.map((botao, indice) => {
                            const estilo = estiloDoBotao(botao);
                            return (
                                <TouchableOpacity
                                    key={`${botao.text}_${indice}`}
                                    style={[styles.button, estilo.fundo]}
                                    onPress={() => aoPressionar(botao)}
                                >
                                    <Text style={[styles.buttonText, estilo.texto]}>{botao.text}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(10, 17, 30, 0.48)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 24,
        padding: 20,
    },
    iconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    title: {
        fontSize: 18,
        fontFamily: 'Poppins_800ExtraBold',
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 21,
        marginBottom: 18,
    },
    actions: { gap: 10 },
    button: {
        minHeight: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    buttonText: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
});
