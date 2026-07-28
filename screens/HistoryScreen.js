// src/screens/HistoryScreen.js
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Modal,
    TouchableWithoutFeedback,
    TextInput,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import InsightsCard from '../components/InsightsCard';
import { normalizarIntensidade, converterDataLocal } from '../utils/insights';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '@miblanchard/react-native-slider';
import {
    obterRegistros,
    atualizarRegistro,
    excluirRegistro,
    obterAparelho,
    recalcularEconomia,
    obterEconomia,
    obterSessoesDeCrise,
} from '../utils/storage';
import { puxadasDoRegistro } from '../utils/records';
import { RAIO, SOMBRA, GATILHOS, AJUDAS } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';

const { width } = Dimensions.get('window');
const LARGURA_DO_GRAFICO = width - 64;

const FILTROS = [
    { id: 'day', rotulo: 'Dia', dias: 7 },
    { id: 'week', rotulo: 'Semana', dias: 28 },
    { id: 'month', rotulo: 'Mês', dias: 90 },
];

const METRICAS = [
    { id: 'puffs', rotulo: 'Puxadas' },
    { id: 'intensity', rotulo: 'Vontade' },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatarRotuloDoDia(dataStr) {
    const data = converterDataLocal(dataStr);
    return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function chaveDoInicioDaSemana(dataStr) {
    const data = converterDataLocal(dataStr);
    const diaDaSemana = data.getDay();
    const diff = diaDaSemana === 0 ? -6 : 1 - diaDaSemana;
    data.setDate(data.getDate() + diff);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function chaveDoInicioDoMes(dataStr) {
    const data = converterDataLocal(dataStr);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatarRotuloDaSemana(dataStr) {
    const data = converterDataLocal(dataStr);
    return `Sem ${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function formatarRotuloDaChaveDoMes(chaveDoMes) {
    const [ano, mes] = chaveDoMes.split('-');
    return `${MESES[Number(mes) - 1]} ${ano}`;
}

const MESES_POR_EXTENSO = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function formatarDataCompleta(dataStr) {
    const data = converterDataLocal(dataStr);
    return `${data.getDate()} de ${MESES_POR_EXTENSO[data.getMonth()]} de ${data.getFullYear()}`;
}

function compararChavesDeData(a, b) {
    return a.localeCompare(b);
}

function agruparRegistrosPor(registros, obterChave, metrica) {
    if (metrica === 'intensity') {
        const somas = registros.reduce((grupos, registro) => {
            const chave = obterChave(registro.date);
            if (!grupos[chave]) grupos[chave] = { total: 0, contagem: 0 };
            grupos[chave].total += normalizarIntensidade(registro.intensity);
            grupos[chave].contagem += 1;
            return grupos;
        }, {});
        return Object.fromEntries(
            Object.entries(somas).map(([chave, { total, contagem }]) => [chave, contagem > 0 ? Math.round((total / contagem) * 10) / 10 : 0])
        );
    }
    return registros.reduce((grupos, registro) => {
        const chave = obterChave(registro.date);
        if (!grupos[chave]) grupos[chave] = 0;
        grupos[chave] += puxadasDoRegistro(registro);
        return grupos;
    }, {});
}

export default function HistoryScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarErro } = usarToast();
    const [registros, setRegistros] = useState([]);
    const [sessoesDeCrise, setSessoesDeCrise] = useState([]);
    const [filtro, setFiltro] = useState('day');
    const [metrica, setMetrica] = useState('puffs');
    const [registroEmEdicao, setRegistroEmEdicao] = useState(null);
    const [idParaExcluirConfirmacao, setIdParaExcluirConfirmacao] = useState(null);

    const carregar = async () => {
        const [r, sessoes] = await Promise.all([obterRegistros(), obterSessoesDeCrise()]);
        setRegistros(r);
        setSessoesDeCrise(sessoes);
    };

    useFocusEffect(useCallback(() => { carregar(); }, []));

    const obterDadosAgrupados = () => {
        if (filtro === 'day') {
            const gruposPorDia = agruparRegistrosPor(registros, (dataStr) => dataStr, metrica);
            const datasDoGrafico = Object.keys(gruposPorDia).sort(compararChavesDeData).slice(-10);
            return {
                rotulos: datasDoGrafico.map(formatarRotuloDoDia),
                dados: datasDoGrafico.map((chaveDaData) => gruposPorDia[chaveDaData]),
            };
        }
        if (filtro === 'week') {
            const gruposPorSemana = agruparRegistrosPor(registros, chaveDoInicioDaSemana, metrica);
            const semanasOrdenadas = Object.keys(gruposPorSemana).sort(compararChavesDeData).slice(-6);
            return {
                rotulos: semanasOrdenadas.map(formatarRotuloDaSemana),
                dados: semanasOrdenadas.map((chaveDaSemana) => gruposPorSemana[chaveDaSemana]),
            };
        }
        if (filtro === 'month') {
            const gruposPorMes = agruparRegistrosPor(registros, chaveDoInicioDoMes, metrica);
            const mesesOrdenados = Object.keys(gruposPorMes).sort(compararChavesDeData).slice(-6);
            return { rotulos: mesesOrdenados.map(formatarRotuloDaChaveDoMes), dados: mesesOrdenados.map((m) => gruposPorMes[m]) };
        }
        return { rotulos: [], dados: [] };
    };

    const { rotulos: rotulosDoGrafico, dados: dadosDoGrafico } = obterDadosAgrupados();
    const todosOsRegistros = [...registros].sort((a, b) => {
        const porData = compararChavesDeData(b.date, a.date);
        return porData !== 0 ? porData : b.id - a.id;
    });

    const iconeDaIntensidade = (n) => { if (n <= 3) return '🟢'; if (n <= 6) return '🟡'; return '🔴'; };

    const salvarEdicao = async () => {
        if (!registroEmEdicao) return;
        const resultado = await atualizarRegistro(registroEmEdicao);
        // Não fecha o modal se não gravou — senão o usuário perde a edição.
        if (!resultado.ok) {
            mostrarErro('Não deu pra salvar a edição', 'Verifique sua conexão e tente de novo.');
            return;
        }
        const [todosOsRegs, aparelho, economia] = await Promise.all([obterRegistros(), obterAparelho(), obterEconomia()]);
        await recalcularEconomia(todosOsRegs, aparelho);
        setRegistros(todosOsRegs);
        setRegistroEmEdicao(null);
    };

    const excluir = async () => {
        if (!idParaExcluirConfirmacao) return;
        const resultado = await excluirRegistro(idParaExcluirConfirmacao);
        if (!resultado.ok) {
            mostrarErro('Não deu pra excluir', 'Verifique sua conexão e tente de novo.');
            setIdParaExcluirConfirmacao(null);
            return;
        }
        const [todosOsRegs, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        await recalcularEconomia(todosOsRegs, aparelho);
        setRegistros(todosOsRegs);
        setIdParaExcluirConfirmacao(null);
    };

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: cores.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                titulo="Histórico"
                subtitulo="Sua evolução ao longo do tempo"
                cores={cores}
                mostrarConfiguracoes
                aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
            />

            <View style={styles.filtersRow}>
                {FILTROS.map((f) => (
                    <TouchableOpacity
                        key={f.id}
                        style={[
                            styles.filterBtn,
                            { borderColor: cores.border, backgroundColor: cores.card },
                            filtro === f.id && { borderColor: cores.primary, backgroundColor: cores.primaryLight },
                        ]}
                        onPress={() => setFiltro(f.id)}
                    >
                        <Text style={[styles.filterBtnText, { color: cores.textSecondary }, filtro === f.id && { color: cores.primaryDark }]}>
                            {f.rotulo}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.filtersRow}>
                {METRICAS.map((m) => (
                    <TouchableOpacity
                        key={m.id}
                        style={[
                            styles.filterBtn,
                            { borderColor: cores.border, backgroundColor: cores.card },
                            metrica === m.id && { borderColor: cores.primary, backgroundColor: cores.primaryLight },
                        ]}
                        onPress={() => setMetrica(m.id)}
                    >
                        <Text style={[styles.filterBtnText, { color: cores.textSecondary }, metrica === m.id && { color: cores.primaryDark }]}>
                            {m.rotulo}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                            {metrica === 'puffs' ? 'Puxadas' : 'Intensidade da vontade'}
                        </Text>
                        <Text style={[styles.cardSubtitle, { color: cores.textSecondary }]}>
                            {metrica === 'puffs'
                                ? (filtro === 'day' ? 'Total de puxadas nos últimos 10 dias com registro' : filtro === 'week' ? 'Total de puxadas nas últimas 6 semanas com registro' : 'Total de puxadas nos últimos 6 meses com registro')
                                : (filtro === 'day' ? 'Vontade média nos últimos 10 dias com registro' : filtro === 'week' ? 'Vontade média nas últimas 6 semanas com registro' : 'Vontade média nos últimos 6 meses com registro')}
                        </Text>
                    </View>
                </View>

                {dadosDoGrafico.length > 0 ? (
                    <BarChart
                        data={{ labels: rotulosDoGrafico, datasets: [{ data: dadosDoGrafico }] }}
                        width={LARGURA_DO_GRAFICO}
                        height={180}
                        fromZero
                        showValuesOnTopOfBars
                        segments={Math.max(1, Math.min(4, Math.max(...dadosDoGrafico)))}
                        chartConfig={{
                            backgroundColor: cores.card,
                            backgroundGradientFrom: cores.card,
                            backgroundGradientTo: cores.card,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                            labelColor: () => cores.textSecondary,
                            propsForBackgroundLines: { stroke: cores.borderLight },
                            propsForLabels: { fontFamily: 'Poppins_400Regular' },
                            propsForTopLabels: { fontFamily: 'Poppins_600SemiBold' },
                            barPercentage: 0.65,
                            fillShadowGradient: cores.primary,
                            fillShadowGradientOpacity: 1,
                            formatYLabel: (v) => `${Math.round(Number(v))}`,
                        }}
                        style={styles.chart}
                    />
                ) : (
                    <View style={styles.emptyChartWrap}>
                        <Ionicons name="bar-chart-outline" size={28} color={cores.border} />
                        <Text style={[styles.emptyChart, { color: cores.textMuted }]}>Nada registrado nesse período ainda.</Text>
                    </View>
                )}
                {!registros.length ? (
                    <Text style={[styles.emptySubtitle, { color: cores.textMuted }]}>Que tal registrar agora? 😊</Text>
                ) : null}
            </View>

            <InsightsCard registros={registros} sessoesDeCrise={sessoesDeCrise} cores={cores} />

            {registros.length > 0 ? (
                todosOsRegistros.map((reg) => (
                    <View key={reg.id} style={[styles.histItem, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <View style={styles.histTop}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.histDate, { color: cores.text }]}>{formatarDataCompleta(reg.date)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                {reg.used ? (
                                    <Text style={[styles.histPuffs, { color: cores.text }]}>{reg.puffs} puxadas</Text>
                                ) : (
                                    <Text style={[styles.histNone, { color: cores.primary }]}>Não usou ✓</Text>
                                )}
                                <Text style={[styles.histIntensity, { color: cores.textMuted }]}>
                                    {iconeDaIntensidade(reg.intensity)} Vontade: {reg.intensity}/10
                                </Text>
                            </View>
                            <View style={styles.actionButtons}>
                                <TouchableOpacity style={styles.editBtn} onPress={() => setRegistroEmEdicao({ ...reg })}>
                                    <Ionicons name="pencil" size={18} color={cores.primary} />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => setIdParaExcluirConfirmacao(reg.id)}>
                                    <Ionicons name="trash-outline" size={18} color={cores.danger} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {(reg.triggers?.length > 0 || reg.helps?.length > 0) && (
                            <View style={styles.histTags}>
                                {[...(reg.triggers || []), ...(reg.helps || [])].map((tag, i) => (
                                    <View key={i} style={[styles.histTag, { backgroundColor: cores.primaryLight }]}>
                                        <Text style={[styles.histTagText, { color: cores.primaryDark }]}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                ))
            ) : null}

            <View style={{ height: 24 }} />

            {/* Modal de confirmação de exclusão */}
            <Modal visible={idParaExcluirConfirmacao !== null} transparent animationType="fade" onRequestClose={() => setIdParaExcluirConfirmacao(null)}>
                <TouchableWithoutFeedback onPress={() => setIdParaExcluirConfirmacao(null)}>
                    <View style={styles.confirmOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.confirmModal, { backgroundColor: cores.card }]}>
                                <Text style={[styles.confirmTitle, { color: cores.text }]}>Apagar registro?</Text>
                                <Text style={[styles.confirmText, { color: cores.textSecondary }]}>Isso não pode ser desfeito.</Text>
                                <View style={styles.confirmButtons}>
                                    <TouchableOpacity style={[styles.confirmCancelBtn, { backgroundColor: cores.borderLight }]} onPress={() => setIdParaExcluirConfirmacao(null)}>
                                        <Text style={[styles.confirmCancelText, { color: cores.textSecondary }]}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.confirmDeleteBtn, { backgroundColor: cores.danger }]} onPress={excluir}>
                                        <Text style={styles.confirmDeleteText}>Apagar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Modal de edição */}
            <Modal visible={registroEmEdicao !== null} transparent animationType="slide" onRequestClose={() => setRegistroEmEdicao(null)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: cores.modalBg }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: cores.border }]}>
                            <Text style={[styles.modalTitle, { color: cores.text }]}>Editar registro</Text>
                            <TouchableOpacity onPress={() => setRegistroEmEdicao(null)}>
                                <Ionicons name="close" size={24} color={cores.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {registroEmEdicao && (() => {
                            const corDaIntensidade = registroEmEdicao.intensity <= 3 ? cores.primary : registroEmEdicao.intensity <= 6 ? cores.warning : cores.danger;
                            return (
                            <ScrollView style={styles.modalBody}>
                                <Text style={[styles.fieldLabel, { color: cores.text }]}>Você usou o vape?</Text>
                                <View style={styles.toggleRow}>
                                    {[{ val: true, rotulo: 'Sim' }, { val: false, rotulo: 'Não' }].map(({ val, rotulo }) => (
                                        <TouchableOpacity
                                            key={rotulo}
                                            style={[styles.toggleBtn, { borderColor: cores.border, backgroundColor: cores.card }, registroEmEdicao.used === val && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                                            onPress={() => setRegistroEmEdicao({ ...registroEmEdicao, used: val, puffs: val ? Math.max(1, registroEmEdicao.puffs || 0) : registroEmEdicao.puffs })}
                                        >
                                            <Text style={[styles.toggleBtnText, { color: cores.textSecondary }, registroEmEdicao.used === val && { color: '#fff' }]}>{rotulo}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {registroEmEdicao.used && (
                                    <>
                                        <Text style={[styles.fieldLabel, { color: cores.text }]}>Quantas puxadas?</Text>
                                        <View style={styles.counterRow}>
                                            <TextInput
                                                style={[styles.counterInput, { borderColor: cores.primary, backgroundColor: cores.inputBg, color: cores.text }]}
                                                keyboardType="number-pad"
                                                value={String(registroEmEdicao.puffs)}
                                                onChangeText={(texto) => {
                                                    const numero = parseInt(texto.replace(/[^0-9]/g, ''), 10);
                                                    setRegistroEmEdicao({ ...registroEmEdicao, puffs: Number.isNaN(numero) ? 0 : numero });
                                                }}
                                                onBlur={() => setRegistroEmEdicao((r) => ({ ...r, puffs: Math.max(1, r.puffs) }))}
                                            />
                                        </View>
                                    </>
                                )}

                                <Text style={[styles.fieldLabel, { color: cores.text }]}>Quanta vontade você sentiu?</Text>
                                <View style={styles.sliderWrap}>
                                    <Text style={[styles.intensityVal, { color: corDaIntensidade }]}>{Math.round(registroEmEdicao.intensity)}</Text>
                                    <Slider
                                        style={styles.slider}
                                        minimumValue={0}
                                        maximumValue={10}
                                        step={1}
                                        value={registroEmEdicao.intensity}
                                        onValueChange={(val) => setRegistroEmEdicao({ ...registroEmEdicao, intensity: val[0] })}
                                        minimumTrackTintColor={corDaIntensidade}
                                        maximumTrackTintColor={cores.border}
                                        thumbTintColor={corDaIntensidade}
                                    />
                                    <View style={styles.sliderLabels}>
                                        <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Nenhuma</Text>
                                        <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Moderada</Text>
                                        <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Muito forte</Text>
                                    </View>
                                </View>

                                {registroEmEdicao.used && (
                                    <>
                                        <Text style={[styles.fieldLabel, { color: cores.text }]}>O que te deu vontade?</Text>
                                        <View style={styles.chips}>
                                            {GATILHOS.filter((t) => t.id !== 'outro').map((t) => (
                                                <TouchableOpacity
                                                    key={t.id}
                                                    style={[styles.chip, { borderColor: cores.border, backgroundColor: cores.card }, (registroEmEdicao.triggers || []).includes(t.rotulo) && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                                                    onPress={() => {
                                                        const atual = registroEmEdicao.triggers || [];
                                                        setRegistroEmEdicao({ ...registroEmEdicao, triggers: atual.includes(t.rotulo) ? atual.filter((tr) => tr !== t.rotulo) : [...atual, t.rotulo] });
                                                    }}
                                                >
                                                    <Text style={[styles.chipText, { color: cores.textSecondary }, (registroEmEdicao.triggers || []).includes(t.rotulo) && { color: '#fff' }]}>
                                                        {t.emoji} {t.rotulo}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </>
                                )}

                                {!registroEmEdicao.used && (
                                    <>
                                        <Text style={[styles.fieldLabel, { color: cores.text }]}>O que te ajudou a não usar?</Text>
                                        <View style={styles.chips}>
                                            {AJUDAS.filter((h) => h.id !== 'outro').map((h) => (
                                                <TouchableOpacity
                                                    key={h.id}
                                                    style={[styles.chip, { borderColor: cores.border, backgroundColor: cores.card }, (registroEmEdicao.helps || []).includes(h.rotulo) && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                                                    onPress={() => {
                                                        const atual = registroEmEdicao.helps || [];
                                                        setRegistroEmEdicao({ ...registroEmEdicao, helps: atual.includes(h.rotulo) ? atual.filter((hp) => hp !== h.rotulo) : [...atual, h.rotulo] });
                                                    }}
                                                >
                                                    <Text style={[styles.chipText, { color: cores.textSecondary }, (registroEmEdicao.helps || []).includes(h.rotulo) && { color: '#fff' }]}>
                                                        {h.emoji} {h.rotulo}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </>
                                )}

                                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: cores.primary }]} onPress={salvarEdicao}>
                                    <Text style={styles.saveBtnText}>Salvar</Text>
                                </TouchableOpacity>
                            </ScrollView>
                            );
                        })()}
                    </View>
                </View>
            </Modal>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    filtersRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 },
    filterBtn: { flex: 1, paddingVertical: 10, borderRadius: RAIO.md, borderWidth: 1.5, alignItems: 'center' },
    filterBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
    cardTitle: { fontSize: 12, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
    cardSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    chart: { borderRadius: RAIO.md },
    emptyChartWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
    emptyChart: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', paddingTop: 10 },
    listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 20 },
    listTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    listCount: { fontSize: 12 , fontFamily: 'Poppins_400Regular'},
    emptyWrap: { alignItems: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold', marginTop: 12 },
    emptySubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    histItem: { borderRadius: RAIO.md, padding: 14, marginHorizontal: 16, marginTop: 10 },
    histTop: { flexDirection: 'row', alignItems: 'flex-start' },
    histDate: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    histDev: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    histPuffs: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    histNone: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    histIntensity: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    actionButtons: { flexDirection: 'row', gap: 8, marginLeft: 8 },
    editBtn: { padding: 4 },
    deleteBtn: { padding: 4 },
    histTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    histTag: { borderRadius: RAIO.full, paddingVertical: 3, paddingHorizontal: 10 },
    histTagText: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: RAIO.xl, borderTopRightRadius: RAIO.xl, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
    modalTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    modalBody: { padding: 16 },
    fieldLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginBottom: 10, marginTop: 6 },
    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: RAIO.md, borderWidth: 1.5, alignItems: 'center' },
    toggleBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 18 },
    counterInput: { fontSize: 40, fontFamily: 'Poppins_800ExtraBold', minWidth: 100, textAlign: 'center', borderWidth: 2, borderRadius: RAIO.md, paddingVertical: 6, paddingHorizontal: 16 },
    sliderWrap: { marginBottom: 18 },
    slider: { width: '100%', height: 40 },
    intensityVal: { fontSize: 36, fontFamily: 'Poppins_800ExtraBold', textAlign: 'center', marginBottom: 4 },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabel: { fontSize: 10 , fontFamily: 'Poppins_400Regular'},
    saveBtn: { borderRadius: RAIO.md, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 24 },
    saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: RAIO.full, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    confirmModal: { borderRadius: RAIO.lg, padding: 20, width: '80%', maxWidth: 300 },
    confirmTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold', marginBottom: 8, textAlign: 'center' },
    confirmText: { fontSize: 14, fontFamily: 'Poppins_400Regular', marginBottom: 20, textAlign: 'center' },
    confirmButtons: { flexDirection: 'row', gap: 12 },
    confirmCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RAIO.md },
    confirmCancelText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    confirmDeleteBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RAIO.md },
    confirmDeleteText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
});
