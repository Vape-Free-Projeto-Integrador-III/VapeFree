import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import {
    obterDispositivos,
    definirDispositivoPadrao,
    obterAparelho,
    obterRegistros,
    obterEconomia,
    arquivarDispositivo,
    excluirDispositivo,
    recalcularEconomia,
    sincronizarGamificacao,
} from '../utils/storage';
import { custoPorPuxada, metaDiaria, resumoDeDispositivos } from '../utils/records';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';

// Lista dos dispositivos cadastrados. Cadastrar e editar ficam no DeviceForm;
// aqui moram as ações sobre a lista: arquivar, reativar e apagar.
export default function DeviceScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarErro } = usarToast();
    const [resumo, setResumo] = useState([]);

    const carregar = useCallback(async () => {
        const [dispositivos, registros, economia] = await Promise.all([
            obterDispositivos(),
            obterRegistros(),
            obterEconomia(),
        ]);
        setResumo(resumoDeDispositivos(dispositivos, registros, economia));
    }, []);

    useFocusEffect(
        useCallback(() => {
            carregar();
        }, [carregar])
    );

    // Arquivar/apagar mudam quem precifica o quê, então a economia é refeita.
    const recalcular = async () => {
        const [registros, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = await recalcularEconomia(registros, aparelho);
        await sincronizarGamificacao({ registros, economia });
        await carregar();
    };

    const alternarArquivo = async (item) => {
        const arquivar = !item.dispositivo.archived;
        const resultado = await arquivarDispositivo(item.dispositivo.id, arquivar);
        if (!resultado.ok) {
            mostrarErro(
                arquivar ? 'Não deu pra arquivar' : 'Não deu pra reativar',
                'Verifique sua conexão e tente de novo.'
            );
            return;
        }
        await recalcular();
    };

    // Apagar de vez só quando nenhum registro aponta pro dispositivo — senão a
    // economia daqueles dias seria reescrita. Com registro, oferece arquivar.
    const apagar = (item) => {
        Alert.alert(
            'Apagar dispositivo',
            `Apagar "${item.dispositivo.name || 'Sem nome'}"? Isso não apaga nenhum registro.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Apagar',
                    style: 'destructive',
                    onPress: async () => {
                        const resultado = await excluirDispositivo(item.dispositivo.id);
                        if (resultado.ok) {
                            await recalcular();
                            return;
                        }
                        if (resultado.motivo === 'em_uso') {
                            Alert.alert(
                                'Esse dispositivo tem registros',
                                'Ele é quem calcula a economia desses dias, então não dá pra apagar. Dá pra arquivar: ele some da hora de registrar e as contas antigas continuam certas.',
                                [
                                    { text: 'Deixa quieto', style: 'cancel' },
                                    {
                                        text: 'Arquivar',
                                        onPress: () => alternarArquivo(item),
                                    },
                                ]
                            );
                            return;
                        }
                        mostrarErro('Não deu pra apagar', 'Verifique sua conexão e tente de novo.');
                    },
                },
            ]
        );
    };

    // O padrão é quem já vem selecionado na hora de registrar — e é ele que
    // define a meta derivada do aparelho.
    const tornarPadrao = async (item) => {
        const resultado = await definirDispositivoPadrao(item.dispositivo.id);
        if (!resultado.ok) {
            mostrarErro('Não deu pra definir o padrão', 'Verifique sua conexão e tente de novo.');
            return;
        }
        await recalcular();
    };

    const ativos = resumo.filter((item) => !item.dispositivo.archived);
    const arquivados = resumo.filter((item) => item.dispositivo.archived);

    const Etiqueta = ({ texto, cor, fundo }) => (
        <View style={[styles.badge, { backgroundColor: fundo }]}>
            <Text style={[styles.badgeText, { color: cor }]}>{texto}</Text>
        </View>
    );

    const Cartao = ({ item }) => {
        const { dispositivo, estado } = item;
        const custo = custoPorPuxada(dispositivo);
        const meta = metaDiaria(dispositivo);
        const corDaBarra = estado.esgotado
            ? cores.danger
            : estado.percentual >= 80
              ? cores.warning
              : cores.primary;

        return (
            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <View style={styles.head}>
                    <Text style={[styles.name, { color: cores.text }]} numberOfLines={1}>
                        {dispositivo.name || 'Sem nome'}
                    </Text>
                    {dispositivo.isDefault && !dispositivo.archived && (
                        <Etiqueta texto="padrão" cor={cores.primary} fundo={cores.primaryLight} />
                    )}
                    {dispositivo.archived && (
                        <Etiqueta texto="arquivado" cor={cores.textMuted} fundo={cores.inputBg} />
                    )}
                </View>

                <Text style={[styles.sub, { color: cores.textSecondary }]}>
                    R$ {Number(dispositivo.price).toFixed(2)} ·{' '}
                    {custo === null ? '—' : `R$ ${custo.toFixed(4)}/puxada`} ·{' '}
                    {meta === null ? '—' : `${Math.round(meta)} puxadas/dia`}
                </Text>

                <View style={[styles.barTrack, { backgroundColor: cores.inputBg }]}>
                    <View
                        style={[
                            styles.barFill,
                            { backgroundColor: corDaBarra, width: `${estado.percentual}%` },
                        ]}
                    />
                </View>
                <Text style={[styles.barLabel, { color: cores.textMuted }]}>
                    {estado.total === null
                        ? `${estado.usadas} puxadas registradas`
                        : estado.esgotado
                          ? `Já passou das ${estado.total} puxadas dele`
                          : `${estado.usadas} de ${estado.total} puxadas · faltam ${estado.restante}`}
                </Text>

                <View style={styles.stats}>
                    <View style={styles.stat}>
                        <Text style={[styles.statLabel, { color: cores.textSecondary }]}>
                            Custou
                        </Text>
                        <Text style={[styles.statVal, { color: cores.danger }]}>
                            R$ {item.gasto.toFixed(2)}
                        </Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statLabel, { color: cores.textSecondary }]}>
                            Economizou
                        </Text>
                        <Text style={[styles.statVal, { color: cores.primary }]}>
                            R$ {item.economizado.toFixed(2)}
                        </Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Dias</Text>
                        <Text style={[styles.statVal, { color: cores.text }]}>{item.dias}</Text>
                    </View>
                </View>

                {!dispositivo.archived && !dispositivo.isDefault && (
                    <TouchableOpacity
                        style={[styles.defaultBtn, { borderColor: cores.primary }]}
                        onPress={() => tornarPadrao(item)}
                    >
                        <Ionicons name="star-outline" size={16} color={cores.primary} />
                        <Text style={[styles.defaultBtnText, { color: cores.primary }]}>
                            Usar como padrão
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={[styles.actions, { borderTopColor: cores.border }]}>
                    <TouchableOpacity
                        style={styles.action}
                        onPress={() => navigation.navigate('DeviceForm', { id: dispositivo.id })}
                    >
                        <Ionicons name="create-outline" size={18} color={cores.primary} />
                        <Text style={[styles.actionText, { color: cores.primary }]}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => alternarArquivo(item)}>
                        <Ionicons
                            name={dispositivo.archived ? 'refresh-outline' : 'archive-outline'}
                            size={18}
                            color={cores.textSecondary}
                        />
                        <Text style={[styles.actionText, { color: cores.textSecondary }]}>
                            {dispositivo.archived ? 'Reativar' : 'Arquivar'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action} onPress={() => apagar(item)}>
                        <Ionicons name="trash-outline" size={18} color={cores.danger} />
                        <Text style={[styles.actionText, { color: cores.danger }]}>Apagar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Seus Dispositivos"
                    subtitulo="Cada registro conta pelo dispositivo que você usou"
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: cores.primary }]}
                    onPress={() => navigation.navigate('DeviceForm')}
                >
                    <Ionicons name="add-circle-outline" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>Adicionar dispositivo</Text>
                </TouchableOpacity>

                {resumo.length === 0 && (
                    <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                        <Text style={[styles.empty, { color: cores.textSecondary }]}>
                            Nenhum dispositivo cadastrado ainda. Cadastra o seu pra gente calcular
                            quanto você economiza a cada puxada que não dá.
                        </Text>
                    </View>
                )}

                {ativos.map((item) => (
                    <Cartao key={item.dispositivo.id} item={item} />
                ))}

                {arquivados.length > 0 && (
                    <>
                        <Text style={[styles.sectionTitle, { color: cores.textSecondary }]}>
                            Arquivados
                        </Text>
                        {arquivados.map((item) => (
                            <Cartao key={item.dispositivo.id} item={item} />
                        ))}
                    </>
                )}

                <View style={[styles.infoBox, { backgroundColor: cores.primaryLight }]}>
                    <Ionicons name="information-circle-outline" size={18} color={cores.primary} />
                    <Text style={[styles.infoText, { color: cores.primaryDark }]}>
                        Arquivar tira o dispositivo da hora de registrar sem mexer nas contas
                        antigas — é o que fazer com o vape que acabou. Apagar só rola em dispositivo
                        que ainda não foi usado em nenhum registro.
                    </Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: { borderRadius: RAIO.lg, padding: 18, marginHorizontal: 16, marginTop: 14 },
    head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { flex: 1, fontSize: 16, fontFamily: 'Poppins_700Bold' },
    sub: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    badge: { borderRadius: RAIO.sm, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    barTrack: { height: 8, borderRadius: RAIO.full, marginTop: 12, overflow: 'hidden' },
    barFill: { height: 8, borderRadius: RAIO.full },
    barLabel: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 6 },
    stats: { flexDirection: 'row', marginTop: 12, gap: 12 },
    stat: { flex: 1 },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    statVal: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginTop: 2 },
    actions: { flexDirection: 'row', borderTopWidth: 1, marginTop: 14, paddingTop: 12, gap: 8 },
    action: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    actionText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    defaultBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 9,
        marginTop: 12,
    },
    defaultBtnText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RAIO.md,
        paddingVertical: 14,
    },
    addBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' },
    sectionTitle: {
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginHorizontal: 16,
        marginTop: 22,
    },
    empty: { fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 18,
        borderRadius: RAIO.md,
        padding: 14,
    },
    infoText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
});
