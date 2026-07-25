// src/components/AchievementShareCard.js
// Card estático que vira imagem PNG ao compartilhar uma conquista.
// Ele é renderizado fora da tela (ver AchievementCelebration) só pra o
// react-native-view-shot conseguir capturar — o usuário nunca vê esse card
// dentro do app, só a imagem gerada.
//
// As cores aqui são FIXAS de propósito (não vêm de usarTema): a imagem sai do
// app e vai pro WhatsApp/Instagram, então precisa ter sempre a mesma cara de
// marca, independente de o usuário estar no tema claro ou escuro.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RAIO } from '../utils/theme';

export const LARGURA_DO_CARD = 320;

export default function AchievementShareCard({ conquista, streak = 0 }) {
    if (!conquista) return null;

    return (
        <View style={styles.card}>
            <Text style={styles.rotulo}>CONQUISTA DESBLOQUEADA</Text>

            <View style={styles.circulo}>
                <Text style={styles.emoji}>{conquista.icone || '🏆'}</Text>
            </View>

            <Text style={styles.titulo}>{conquista.titulo}</Text>
            {!!conquista.descricao && <Text style={styles.descricao}>{conquista.descricao}</Text>}

            {streak > 0 && (
                <View style={styles.streakBadge}>
                    <Text style={styles.streakTexto}>
                        🔥 {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
                    </Text>
                </View>
            )}

            <View style={styles.rodape}>
                <Text style={styles.marca}>VapeFree 💚</Text>
                <Text style={styles.assinatura}>largando o vape, um dia de cada vez</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: LARGURA_DO_CARD,
        backgroundColor: '#2E7D32',
        borderRadius: RAIO.xl,
        paddingVertical: 32,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    rotulo: {
        color: '#C8E6C9',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
        marginBottom: 20,
    },
    circulo: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    emoji: { fontSize: 62 },
    titulo: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center' },
    descricao: {
        color: '#DCEDC8',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
    streakBadge: {
        marginTop: 18,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: RAIO.full,
        backgroundColor: '#1B5E20',
    },
    streakTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    rodape: {
        marginTop: 28,
        paddingTop: 18,
        borderTopWidth: 1,
        borderTopColor: '#4CAF50',
        alignSelf: 'stretch',
        alignItems: 'center',
    },
    marca: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    assinatura: { color: '#A5D6A7', fontSize: 12, marginTop: 4 },
});
