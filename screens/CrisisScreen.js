//
// Modo crise ("Estou com vontade"). Menu direto: o usuário escolhe o
// método, nada é imposto. Se o histórico de crises já mostrar um método
// que funcionou pra ele (metodoDeCriseRecomendado), esse vem primeiro e
// marcado — os outros continuam clicáveis.
//
// Só vira sessão salva (salvarSessaoDeCrise) se o usuário contar o desfecho
// no fim (passou/diminuiu/usei). Se pular o feedback, nada é registrado.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import CrisisOutcomeModal from '../components/CrisisOutcomeModal';
import { RAIO, SOMBRA, DISTRACOES, MENSAGENS_DE_CRISE } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import {
    obterRegistros,
    obterSessoesDeCrise,
    salvarSessaoDeCrise,
    sincronizarGamificacao,
    dataDeHoje,
} from '../utils/storage';
import { usarToast } from '../context/ToastContext';
import {
    metodoDeCriseRecomendado,
    gatilhoMaisFrequente,
    MIN_REGISTROS_PARA_INSIGHTS,
} from '../utils/insights';

const SEGUNDOS_DE_ESPERA = 5 * 60;

const METODOS = [
    {
        id: 'respiracao',
        icon: '🧘',
        title: 'Respiração guiada',
        subtitle: 'Box breathing 4-4-4-4, de 1 a 5 minutos',
    },
    {
        id: 'timer',
        icon: '⏱️',
        title: 'Aguente 5 minutos',
        subtitle: 'O pico da vontade passa em 3 a 5 min',
    },
    {
        id: 'distracao',
        icon: '💧',
        title: 'Distrações rápidas',
        subtitle: 'Coisas simples pra fazer agora',
    },
];

// Mensagem personalizada pelo gatilho mais frequente. Só depois de ter
// registro suficiente pra isso ser um padrão, não um chute.
function mensagemDoGatilho(rotulo) {
    return `Seu gatilho mais comum é ${rotulo}. Já reconhecer isso é meio caminho — a vontade tem nome e tem hora pra passar.`;
}

function formatarRelogio(totalSegundos) {
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

function horaAtualString() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CrisisScreen({ navigation, route }) {
    const { cores } = usarTema();
    const { mostrarRecompensas, mostrarErro } = usarToast();

    const [mensagem, setMensagem] = useState(null);
    const [recomendado, setRecomendado] = useState(null);
    const [metodoAtivo, setMetodoAtivo] = useState(null);
    const [tempoRestante, setTempoRestante] = useState(SEGUNDOS_DE_ESPERA);
    const [esperaRodando, setEsperaRodando] = useState(false);
    const [pendente, setPendente] = useState(null);

    const iniciadoEm = useRef(Date.now());
    const intervaloDeEspera = useRef(null);
    // Espera dos 5 min: o tempo vem do relógio, não da contagem de ticks — o
    // setInterval é congelado em background e voltava com o relógio parado.
    // esperaAcumuladaRef = segundos já corridos antes da última pausa;
    // esperaRetomadaEmRef = instante em que voltou a correr (null = pausado).
    const esperaAcumuladaRef = useRef(0);
    const esperaRetomadaEmRef = useRef(null);
    const salvandoRef = useRef(false);
    // Saída já decidida pelo usuário (pulou ou salvou o desfecho): o
    // beforeRemove deixa passar em vez de reabrir o modal.
    const saindoRef = useRef(false);

    const carregar = useCallback(async () => {
        const [registros, sessoes] = await Promise.all([obterRegistros(), obterSessoesDeCrise()]);

        const gatilho =
            registros.length >= MIN_REGISTROS_PARA_INSIGHTS
                ? gatilhoMaisFrequente(registros)
                : null;
        setMensagem(
            gatilho
                ? mensagemDoGatilho(gatilho)
                : MENSAGENS_DE_CRISE[Math.floor(Math.random() * MENSAGENS_DE_CRISE.length)]
        );
        setRecomendado(metodoDeCriseRecomendado(sessoes));
    }, []);

    useFocusEffect(
        useCallback(() => {
            // Cada volta pra cá recomeça a contagem da sessão: sem isso o tempo
            // gasto na tela de respiração (que navega de volta pra cá) entrava
            // de novo no durationSec da próxima sessão.
            iniciadoEm.current = Date.now();
            carregar();
        }, [carregar])
    );

    // Volta da tela de respiração: ela avisa o que aconteceu por params.
    useEffect(() => {
        const params = route?.params;
        if (!params?.completedMethod) return;

        navigation.setParams({
            completedMethod: undefined,
            durationSec: undefined,
            completed: undefined,
        });
        setPendente({
            method: params.completedMethod,
            durationSec: params.durationSec ?? 0,
            completed: params.completed === true,
        });
    }, [route?.params, navigation]);

    // Timer "aguente 5 minutos". O interval é só tick de render: o valor
    // mostrado sai sempre de esperaDecorrida(), então voltar do background
    // (onde o timer é estrangulado) já mostra o tempo real.
    useEffect(() => {
        if (!esperaRodando) return undefined;

        const tick = () =>
            setTempoRestante(Math.max(0, SEGUNDOS_DE_ESPERA - Math.floor(esperaDecorrida())));

        tick();
        intervaloDeEspera.current = setInterval(tick, 1000);
        const inscricao = AppState.addEventListener('change', (estado) => {
            if (estado === 'active') tick();
        });

        return () => {
            clearInterval(intervaloDeEspera.current);
            intervaloDeEspera.current = null;
            inscricao.remove();
        };
    }, [esperaRodando]);

    useEffect(() => {
        if (esperaRodando && tempoRestante === 0) {
            setEsperaRodando(false);
            esperaRetomadaEmRef.current = null;
            encerrar('timer', SEGUNDOS_DE_ESPERA, true);
        }
    }, [esperaRodando, tempoRestante]);

    useEffect(() => {
        return () => {
            if (intervaloDeEspera.current) clearInterval(intervaloDeEspera.current);
        };
    }, []);

    // Voltar por gesto/botão do sistema tem que perguntar o desfecho igual ao
    // voltar do ScreenHeader — senão a sessão some sem registro nenhum.
    useEffect(() => {
        return navigation.addListener('beforeRemove', (e) => {
            if (saindoRef.current) return;
            // Modal de desfecho já aberto: o usuário já foi perguntado. Voltar
            // de novo sai sem registrar (igual "Agora não") — segurar aqui
            // travava o gesto de voltar sem dar nenhum feedback.
            if (pendente !== null) return;
            e.preventDefault();
            encerrar(metodoAtivo, segundosDecorridos(), false);
        });
    }, [navigation, metodoAtivo, pendente]);

    function segundosDecorridos() {
        return Math.round((Date.now() - iniciadoEm.current) / 1000);
    }

    // Segundos de espera já corridos, contando o trecho em curso.
    function esperaDecorrida() {
        const emCurso = esperaRetomadaEmRef.current
            ? (Date.now() - esperaRetomadaEmRef.current) / 1000
            : 0;
        return esperaAcumuladaRef.current + emCurso;
    }

    function alternarEspera() {
        if (esperaRodando) {
            esperaAcumuladaRef.current = esperaDecorrida();
            esperaRetomadaEmRef.current = null;
        } else {
            esperaRetomadaEmRef.current = Date.now();
        }
        setEsperaRodando(!esperaRodando);
    }

    // Abre o modal de "como foi?" com o que já se sabe da sessão.
    function encerrar(metodo, durationSec, completed) {
        setPendente({
            method: metodo ?? metodoAtivo,
            durationSec: durationSec ?? segundosDecorridos(),
            completed: completed === true,
        });
    }

    // "Agora não": usuário pediu ajuda mas não quis contar o desfecho — não
    // vira sessão registrada, só fecha a tela (sem XP, sem contar pras stats).
    function pular() {
        setPendente(null);
        saindoRef.current = true;
        navigation.goBack();
    }

    async function persistir(desfecho, nota) {
        if (salvandoRef.current) return;
        salvandoRef.current = true;

        const resultado = await salvarSessaoDeCrise({
            id: Date.now(),
            date: dataDeHoje(),
            time: horaAtualString(),
            method: pendente?.method ?? null,
            durationSec: pendente?.durationSec ?? segundosDecorridos(),
            completed: pendente?.completed === true,
            outcome: desfecho ?? null,
            note: nota ?? null,
        });

        // Sessão não gravou: nada de XP nem de fechar a tela como se tivesse dado
        // certo — o modal continua aberto pro usuário tentar de novo.
        if (!resultado.ok) {
            mostrarErro('Não deu pra salvar a sessão', 'Verifique sua conexão e tente de novo.');
            salvandoRef.current = false;
            return;
        }

        // Vencer a vontade é missão diária — concede o XP antes de sair.
        const { recompensas } = await sincronizarGamificacao();
        mostrarRecompensas(recompensas);

        setPendente(null);
        salvandoRef.current = false;
        saindoRef.current = true;
        navigation.goBack();
    }

    function selecionarMetodo(id) {
        if (id === 'respiracao') {
            navigation.navigate('Breathing', { fromCrisis: true });
            return;
        }

        setMetodoAtivo((prev) => (prev === id ? null : id));

        if (id === 'timer') {
            esperaAcumuladaRef.current = 0;
            esperaRetomadaEmRef.current = Date.now();
            setTempoRestante(SEGUNDOS_DE_ESPERA);
            setEsperaRodando(true);
        } else {
            esperaRetomadaEmRef.current = null;
            setEsperaRodando(false);
        }
    }

    // Método recomendado primeiro, resto na ordem original.
    const metodosOrdenados = recomendado
        ? [
              ...METODOS.filter((m) => m.id === recomendado.metodo),
              ...METODOS.filter((m) => m.id !== recomendado.metodo),
          ]
        : METODOS;

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Tô com vontade"
                    subtitulo="Respira. A gente passa por isso junto."
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                    aoPressionarVoltar={() => encerrar(metodoAtivo, segundosDecorridos(), false)}
                />

                <View
                    style={[
                        styles.msgCard,
                        { backgroundColor: cores.card, borderLeftColor: cores.warning },
                        SOMBRA.media,
                    ]}
                >
                    <Text style={[styles.msgText, { color: cores.text }]}>{mensagem}</Text>
                </View>

                {metodosOrdenados.map((m) => {
                    const ehRecomendado = recomendado?.metodo === m.id;
                    const ehAtivo = metodoAtivo === m.id;

                    return (
                        <View key={m.id}>
                            <TouchableOpacity
                                style={[
                                    styles.methodCard,
                                    {
                                        backgroundColor: cores.card,
                                        borderColor: ehAtivo ? cores.primary : 'transparent',
                                    },
                                    SOMBRA.pequena,
                                ]}
                                onPress={() => selecionarMetodo(m.id)}
                            >
                                <Text style={styles.methodIcon}>{m.icon}</Text>
                                <View style={styles.methodBody}>
                                    <View style={styles.methodTitleRow}>
                                        <Text style={[styles.methodTitle, { color: cores.text }]}>
                                            {m.title}
                                        </Text>
                                        {ehRecomendado ? (
                                            <View
                                                style={[
                                                    styles.badge,
                                                    { backgroundColor: cores.primaryLight },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.badgeText,
                                                        { color: cores.primaryDark },
                                                    ]}
                                                >
                                                    já funcionou
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                    <Text
                                        style={[
                                            styles.methodSubtitle,
                                            { color: cores.textSecondary },
                                        ]}
                                    >
                                        {m.subtitle}
                                    </Text>
                                </View>
                                <Ionicons
                                    name={
                                        m.id === 'respiracao'
                                            ? 'chevron-forward'
                                            : ehAtivo
                                              ? 'chevron-up'
                                              : 'chevron-down'
                                    }
                                    size={18}
                                    color={cores.textMuted}
                                />
                            </TouchableOpacity>

                            {ehAtivo && m.id === 'timer' ? (
                                <View
                                    style={[
                                        styles.panel,
                                        { backgroundColor: cores.card },
                                        SOMBRA.pequena,
                                    ]}
                                >
                                    <Text style={[styles.clock, { color: cores.primaryDark }]}>
                                        {formatarRelogio(tempoRestante)}
                                    </Text>
                                    <Text
                                        style={[styles.panelText, { color: cores.textSecondary }]}
                                    >
                                        Você não precisa fazer nada além de esperar. A vontade vai
                                        baixar sozinha.
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.panelBtn, { borderColor: cores.primary }]}
                                        onPress={alternarEspera}
                                    >
                                        <Text
                                            style={[
                                                styles.panelBtnText,
                                                { color: cores.primaryDark },
                                            ]}
                                        >
                                            {esperaRodando ? 'Pausar' : 'Continuar'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ) : null}

                            {ehAtivo && m.id === 'distracao' ? (
                                <View
                                    style={[
                                        styles.panel,
                                        { backgroundColor: cores.card },
                                        SOMBRA.pequena,
                                    ]}
                                >
                                    {DISTRACOES.map((d) => (
                                        <View key={d.id} style={styles.distractionRow}>
                                            <Text style={styles.distractionEmoji}>{d.emoji}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text
                                                    style={[
                                                        styles.distractionLabel,
                                                        { color: cores.text },
                                                    ]}
                                                >
                                                    {d.rotulo}
                                                </Text>
                                                <Text
                                                    style={[
                                                        styles.distractionDetail,
                                                        { color: cores.textSecondary },
                                                    ]}
                                                >
                                                    {d.detalhe}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            ) : null}
                        </View>
                    );
                })}

                <TouchableOpacity
                    style={[styles.endBtn, { backgroundColor: cores.primary }]}
                    onPress={() => encerrar(metodoAtivo, segundosDecorridos(), false)}
                >
                    <Text style={styles.endBtnText}>Já passou, encerrar</Text>
                </TouchableOpacity>
            </ScrollView>

            <CrisisOutcomeModal
                visivel={pendente !== null}
                cores={cores}
                aoEnviar={(desfecho, nota) => persistir(desfecho, nota)}
                aoPular={pular}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 32 },
    msgCard: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
    },
    msgText: { fontSize: 15, fontFamily: 'Poppins_400Regular', lineHeight: 22 },
    methodCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: RAIO.lg,
        borderWidth: 1.5,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 12,
    },
    methodIcon: { fontSize: 24, fontFamily: 'Poppins_400Regular' },
    methodBody: { flex: 1 },
    methodTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    methodTitle: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    badge: { borderRadius: RAIO.full, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: {
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    methodSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    panel: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 8,
    },
    clock: { fontSize: 40, fontFamily: 'Poppins_800ExtraBold', textAlign: 'center' },
    panelText: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 19,
        marginTop: 8,
        textAlign: 'center',
    },
    panelBtn: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 14,
    },
    panelBtnText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    distractionRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
    distractionEmoji: { fontSize: 20, fontFamily: 'Poppins_400Regular' },
    distractionLabel: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    distractionDetail: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    endBtn: {
        borderRadius: RAIO.lg,
        paddingVertical: 16,
        marginHorizontal: 16,
        marginTop: 20,
        alignItems: 'center',
    },
    endBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
});
