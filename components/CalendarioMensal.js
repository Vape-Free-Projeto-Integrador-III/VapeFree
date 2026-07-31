//
// Grade mensal reutilizável. Componente de apresentação puro: não lê dado
// nenhum e não sabe o que cada cor significa — quem decide a aparência de
// cada dia é o `estiloDoDia` de quem usa.
//
// Dois usos hoje:
//   HomeScreen         -> heatmap de dias limpos vs dias com uso (sem toque)
//   HistoryScreen      -> seleção de intervalo no filtro "Período" (com toque)

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RAIO } from '../utils/theme';
import {
    DIAS_DA_SEMANA_CURTOS,
    gradeDoMes,
    formatarMesEAno,
    mesAnterior,
    mesSeguinte,
} from '../utils/calendario';

export default function CalendarioMensal({
    ano,
    mes,
    cores,
    aoMudarMes,
    bloquearAvanco = false,
    maximo = null, // 'YYYY-MM-DD': dias depois disso ficam apagados e sem toque
    estiloDoDia,
    aoTocarDia,
    tooltipDoDia, // web/desktop: (dataStr) => string|null — texto do popup ao passar o mouse em cima do dia
}) {
    const celulas = gradeDoMes(ano, mes);
    // Completa a última linha pra as colunas não esticarem no fim do mês.
    const sobra = celulas.length % 7;
    const grade = sobra === 0 ? celulas : [...celulas, ...new Array(7 - sobra).fill(null)];

    const [larguraGrade, setLarguraGrade] = useState(0);
    const [indiceEmFoco, setIndiceEmFoco] = useState(null);
    const dataEmFoco = indiceEmFoco !== null ? grade[indiceEmFoco] : null;
    const textoDoTooltip = dataEmFoco && tooltipDoDia ? tooltipDoDia(dataEmFoco) : null;

    return (
        // Célula = 1/7 da largura com aspectRatio 1: sem teto, numa janela larga
        // (web/tablet) cada dia vira um quadradão. Daí o maxWidth + centralizar.
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => aoMudarMes(mesAnterior({ ano, mes }))}
                >
                    <Ionicons name="chevron-back" size={20} color={cores.primary} />
                </TouchableOpacity>

                <Text style={[styles.headerTitle, { color: cores.text }]}>
                    {formatarMesEAno({ ano, mes })}
                </Text>

                <TouchableOpacity
                    style={styles.navBtn}
                    disabled={bloquearAvanco}
                    onPress={() => aoMudarMes(mesSeguinte({ ano, mes }))}
                >
                    <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={bloquearAvanco ? cores.borderLight : cores.primary}
                    />
                </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
                {DIAS_DA_SEMANA_CURTOS.map((sigla, indice) => (
                    <Text key={indice} style={[styles.weekLabel, { color: cores.textMuted }]}>
                        {sigla}
                    </Text>
                ))}
            </View>

            <View style={styles.gridWrap}>
                <View style={styles.grid} onLayout={(e) => setLarguraGrade(e.nativeEvent.layout.width)}>
                    {grade.map((dataStr, indice) => {
                        if (!dataStr) return <View key={`vazio-${indice}`} style={styles.cell} />;

                        const foraDoLimite = maximo !== null && dataStr > maximo;
                        const estilo = foraDoLimite ? {} : estiloDoDia(dataStr) || {};
                        const podeTocar = !!aoTocarDia && !foraDoLimite;
                        const podeReceberMouse = podeTocar || (!foraDoLimite && !!tooltipDoDia);
                        const dia = Number(dataStr.slice(-2));

                        return (
                            <Pressable
                                key={dataStr}
                                style={({ pressed }) => [styles.cell, pressed && podeTocar ? { opacity: 0.7 } : null]}
                                disabled={!podeReceberMouse}
                                onPress={podeTocar ? () => aoTocarDia(dataStr) : undefined}
                                onHoverIn={podeReceberMouse ? () => setIndiceEmFoco(indice) : undefined}
                                onHoverOut={podeReceberMouse ? () => setIndiceEmFoco(null) : undefined}
                            >
                                <View
                                    style={[
                                        styles.cellInner,
                                        {
                                            backgroundColor: estilo.fundo || 'transparent',
                                            borderColor: estilo.borda || 'transparent',
                                            borderWidth: estilo.borda ? 1.5 : 0,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.cellText,
                                            { color: foraDoLimite ? cores.borderLight : estilo.corDoTexto || cores.textSecondary },
                                        ]}
                                    >
                                        {dia}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>

                {textoDoTooltip && larguraGrade > 0 ? (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.tooltip,
                            { backgroundColor: cores.text },
                            {
                                left: (indiceEmFoco % 7) * (larguraGrade / 7) + larguraGrade / 14,
                                top: Math.floor(indiceEmFoco / 7) * (larguraGrade / 7),
                                transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
                            },
                        ]}
                    >
                        <Text style={[styles.tooltipText, { color: cores.background }]}>{textoDoTooltip}</Text>
                    </View>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: '100%', maxWidth: 340, alignSelf: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    headerTitle: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    navBtn: { padding: 6 },
    weekRow: { flexDirection: 'row' },
    weekLabel: {
        width: `${100 / 7}%`,
        textAlign: 'center',
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    gridWrap: { position: 'relative' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
    cellInner: { flex: 1, borderRadius: RAIO.sm, alignItems: 'center', justifyContent: 'center' },
    cellText: { fontSize: 12, fontFamily: 'Poppins_500Medium' },
    tooltip: {
        position: 'absolute',
        marginTop: -6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: RAIO.sm,
        zIndex: 10,
    },
    tooltipText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold', whiteSpace: 'nowrap' },
});
