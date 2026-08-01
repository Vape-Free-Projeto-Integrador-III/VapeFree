//
// Lista as sessões do modo crise, e deixa corrigir ou apagar o que foi
// registrado: o desfecho é respondido na hora da vontade, então errar o clique
// (ou querer completar a nota depois) é comum. Data, método e duração não são
// editáveis — são medidos pelo app, não digitados.

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import GradeDeCards from '../components/GradeDeCards';
import CrisisOutcomeModal from '../components/CrisisOutcomeModal';
import {
    obterSessoesDeCrise,
    atualizarSessaoDeCrise,
    excluirSessaoDeCrise,
    sincronizarGamificacao,
} from '../utils/storage';
import { METODOS_DE_CRISE, desfechoDeCrise, resumoDeCrises } from '../utils/insights';
import { formatarDiaMes } from '../utils/calendario';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarLayoutResponsivo, estiloDoConteudo } from '../utils/responsivo';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';

function formatarDuracao(segundos) {
    const total = Number(segundos);
    if (!Number.isFinite(total) || total <= 0) return null;
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    if (minutos === 0) return `${resto}s`;
    if (resto === 0) return `${minutos}min`;
    return `${minutos}min ${resto}s`;
}

export default function CrisisHistoryScreen({ navigation }) {
    const { cores } = usarTema();
    const { colunas } = usarLayoutResponsivo();
    const { mostrarErro, mostrarRecompensas } = usarToast();
    const [sessoes, setSessoes] = useState([]);
    const [sessaoEmEdicao, setSessaoEmEdicao] = useState(null);
    const [idParaExcluirConfirmacao, setIdParaExcluirConfirmacao] = useState(null);

    const carregar = async () => {
        setSessoes(await obterSessoesDeCrise());
    };

    useFocusEffect(useCallback(() => { carregar(); }, []));

    // Mudar/apagar desfecho mexe em missão e conquista de crise (superar a
    // vontade), então relê e reavalia a gamificação — mesmo fluxo do History.
    const recarregarEConceder = async () => {
        const atualizadas = await obterSessoesDeCrise();
        setSessoes(atualizadas);
        const { recompensas } = await sincronizarGamificacao({ sessoesDeCrise: atualizadas });
        mostrarRecompensas(recompensas);
    };

    const salvarEdicao = async (desfecho, nota) => {
        if (!sessaoEmEdicao) return;
        const resultado = await atualizarSessaoDeCrise({
            ...sessaoEmEdicao,
            outcome: desfecho ?? null,
            note: nota ?? null,
        });
        // Não fecha o modal se não gravou — senão o usuário perde a edição.
        if (!resultado.ok) {
            mostrarErro('Não deu pra salvar a edição', 'Verifique sua conexão e tente de novo.');
            return;
        }
        setSessaoEmEdicao(null);
        await recarregarEConceder();
    };

    const excluir = async () => {
        if (idParaExcluirConfirmacao === null) return;
        const resultado = await excluirSessaoDeCrise(idParaExcluirConfirmacao);
        if (!resultado.ok) {
            mostrarErro('Não deu pra apagar', 'Verifique sua conexão e tente de novo.');
            setIdParaExcluirConfirmacao(null);
            return;
        }
        setIdParaExcluirConfirmacao(null);
        await recarregarEConceder();
    };

    const resumo = resumoDeCrises(sessoes);
    const emOrdem = [...sessoes].sort((a, b) => {
        const porData = String(b.date).localeCompare(String(a.date));
        return porData !== 0 ? porData : b.id - a.id;
    });

    // Cor do desfecho: verde pra vitória, amarelo pra vitória parcial,
    // vermelho pro uso — e cinza quando a pessoa saiu sem responder.
    const corDoDesfecho = (outcome) => {
        if (outcome === 'passou') return cores.primary;
        if (outcome === 'diminuiu') return cores.warning;
        if (outcome === 'usei') return cores.danger;
        return cores.textMuted;
    };

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Suas crises"
                    subtitulo="Cada vez que você enfrentou a vontade"
                    cores={cores}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={estiloDoConteudo}>
                    {sessoes.length > 0 ? (
                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <View style={styles.statRow}>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>{resumo.total}</Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Crises{'\n'}enfrentadas</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>{resumo.superadas}</Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Superadas{'\n'}sem usar</Text>
                                </View>
                                <View style={[styles.statBox, { backgroundColor: cores.primaryLight }]}>
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>
                                        {resumo.taxa === null ? '—' : `${resumo.taxa}%`}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: cores.textSecondary }]}>Taxa de{'\n'}sucesso</Text>
                                </View>
                            </View>
                        </View>
                    ) : null}

                    <GradeDeCards colunas={colunas}>
                        {emOrdem.map((sessao) => {
                            const desfecho = desfechoDeCrise(sessao.outcome);
                            const metodo = METODOS_DE_CRISE[sessao.method] || null;
                            const duracao = formatarDuracao(sessao.durationSec);
                            const cor = corDoDesfecho(sessao.outcome);

                            return (
                                <View key={sessao.id} style={[styles.item, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                                    <View style={styles.itemTop}>
                                        <Text style={[styles.itemDate, { color: cores.text }]}>
                                            {formatarDiaMes(sessao.date)}
                                            {sessao.time ? ` · ${sessao.time}` : ''}
                                        </Text>
                                        <View style={[styles.badge, { backgroundColor: cor + '22', borderColor: cor }]}>
                                            <Text style={[styles.badgeText, { color: cor }]}>
                                                {desfecho ? `${desfecho.emoji} ${desfecho.rotulo}` : 'Não respondeu'}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.acaoBtn}
                                            accessibilityLabel="Editar crise"
                                            onPress={() => setSessaoEmEdicao({ ...sessao })}
                                        >
                                            <Ionicons name="pencil" size={16} color={cores.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.acaoBtn}
                                            accessibilityLabel="Apagar crise"
                                            onPress={() => setIdParaExcluirConfirmacao(sessao.id)}
                                        >
                                            <Ionicons name="trash-outline" size={16} color={cores.danger} />
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={[styles.itemMethod, { color: cores.textSecondary }]}>
                                        {metodo ? `${metodo.emoji} ${metodo.rotulo}` : '🤍 Sem método'}
                                        {duracao ? ` · ${duracao}` : ''}
                                        {sessao.completed ? ' · concluiu ✓' : ''}
                                    </Text>

                                    {sessao.note ? (
                                        <Text style={[styles.itemNote, { color: cores.textMuted }]}>“{sessao.note}”</Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </GradeDeCards>

                    {sessoes.length === 0 ? (
                        <View style={[styles.card, styles.emptyCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                            <Ionicons name="hand-left-outline" size={32} color={cores.border} />
                            <Text style={[styles.emptyText, { color: cores.textMuted }]}>
                                Você ainda não usou o modo crise. Da próxima vez que a vontade bater, abre ele — a gente
                                passa por isso junto.
                            </Text>
                            <TouchableOpacity
                                style={[styles.emptyBtn, { backgroundColor: cores.primary }]}
                                onPress={() => navigation.navigate('Crisis')}
                            >
                                <Text style={styles.emptyBtnText}>Estou com vontade</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <View style={{ height: 24 }} />
                </View>
            </ScrollView>

            <CrisisOutcomeModal
                visivel={sessaoEmEdicao !== null}
                cores={cores}
                valorInicial={sessaoEmEdicao}
                titulo="Editar crise"
                subtitulo="Corrigir o desfecho ou completar a nota depois vale — o que conta é o registro ficar fiel."
                rotuloDeSalvar="Salvar alterações"
                rotuloDePular="Cancelar"
                aoEnviar={salvarEdicao}
                aoPular={() => setSessaoEmEdicao(null)}
            />

            <Modal
                visible={idParaExcluirConfirmacao !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setIdParaExcluirConfirmacao(null)}
            >
                <TouchableWithoutFeedback onPress={() => setIdParaExcluirConfirmacao(null)}>
                    <View style={styles.confirmOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.confirmModal, { backgroundColor: cores.card }]}>
                                <Text style={[styles.confirmTitle, { color: cores.text }]}>Apagar essa crise?</Text>
                                <Text style={[styles.confirmText, { color: cores.textSecondary }]}>
                                    Ela sai das suas estatísticas. Isso não pode ser desfeito.
                                </Text>
                                <View style={styles.confirmButtons}>
                                    <TouchableOpacity
                                        style={[styles.confirmCancelBtn, { backgroundColor: cores.borderLight }]}
                                        onPress={() => setIdParaExcluirConfirmacao(null)}
                                    >
                                        <Text style={[styles.confirmCancelText, { color: cores.textSecondary }]}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.confirmDeleteBtn, { backgroundColor: cores.danger }]}
                                        onPress={excluir}
                                    >
                                        <Text style={styles.confirmDeleteText}>Apagar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: { flex: 1, borderRadius: RAIO.md, padding: 12, alignItems: 'center' },
    statNum: { fontSize: 24, fontFamily: 'Poppins_800ExtraBold' },
    statLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'center', marginTop: 2, lineHeight: 14 },
    item: { borderRadius: RAIO.md, padding: 14, marginHorizontal: 16, marginTop: 10 },
    itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    itemDate: { flex: 1, fontSize: 13, fontFamily: 'Poppins_700Bold' },
    acaoBtn: { padding: 4 },
    badge: { borderRadius: RAIO.full, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 10 },
    badgeText: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
    itemMethod: { fontSize: 12, fontFamily: 'Poppins_500Medium', marginTop: 6 },
    itemNote: { fontSize: 12, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', marginTop: 6 },
    emptyCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
    emptyText: { fontSize: 13, fontFamily: 'Poppins_400Regular', textAlign: 'center', lineHeight: 19 },
    emptyBtn: { borderRadius: RAIO.md, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 },
    emptyBtnText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },
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
