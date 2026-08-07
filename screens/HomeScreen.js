import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import {
    obterRegistros,
    obterAparelho,
    obterDispositivos,
    obterHistoricoDeAparelhos,
    obterMeta,
    obterMetaDeDinheiro,
    obterEconomia,
    ultimosNDias,
    obterSessoesDeCrise,
    sincronizarGamificacao,
    calcularEstadoDeStreak,
    dataDeHoje,
    registrarAberturaDoApp,
    forcarLeituraRemota,
} from '../utils/storage';
import { somarPuxadas, excessoDoDia } from '../utils/records';
import {
    serieDeEconomiaAcumulada,
    ganhoDaSerie,
    rotulosEspacados,
    totalEconomizado,
} from '../utils/economia';
import { metaEfetiva, progressoDaMeta, metaValida, comparativoSemanal } from '../utils/meta';
import {
    dispositivoDoRegistro,
    dispositivoPadrao,
    consumoPorDispositivo,
    estadoDoDispositivo,
} from '../utils/aparelhos';
import { progressoDaMetaDeDinheiro } from '../utils/metaDeDinheiro';
import { DIAS_PARA_ESCUDO } from '../utils/achievements';
import { estadoDoDia, resumoDoMes, mesDeData } from '../utils/calendario';
import { RAIO, SOMBRA, DICAS } from '../utils/theme';
import { usarLayoutResponsivo, estiloDoConteudo } from '../utils/responsivo';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import CalendarioMensal from '../components/CalendarioMensal';
import HealthMilestonesCard from '../components/HealthMilestonesCard';
import GradeDeCards from '../components/GradeDeCards';

const DIAS_DA_ECONOMIA = 30;

export default function HomeScreen({ navigation }) {
    const { cores } = usarTema();
    const { colunas } = usarLayoutResponsivo();
    // Largura do gráfico medida do card: com 2 colunas não dá pra derivar da janela.
    const [larguraDoCardDoGrafico, setLarguraDoCardDoGrafico] = useState(0);
    const { mostrarRecompensas } = usarToast();
    const [registros, setRegistros] = useState([]);
    const [aparelho, setAparelho] = useState(null);
    const [dispositivos, setDispositivos] = useState([]);
    const [historicoDeAparelhos, setHistoricoDeAparelhos] = useState([]);
    const [meta, setMeta] = useState(null);
    const [metaDeDinheiro, setMetaDeDinheiro] = useState(null);
    const [economia, setEconomia] = useState({});
    const [atualizando, setAtualizando] = useState(false);
    const [mesDoCalendario, setMesDoCalendario] = useState(() => mesDeData(dataDeHoje()));

    const carregar = useCallback(async () => {
        // As leituras já engolem erro e devolvem valor neutro; o try aqui é a
        // rede de segurança pra qualquer falha inesperada não derrubar a tela
        // (nem travar o pull-to-refresh).
        try {
            // Home é a porta de entrada do app — marcar aqui o dia de abertura
            // alimenta a conquista de presença diária (app_open_7).
            const diasDeAbertura = await registrarAberturaDoApp();
            const [r, d, e, c, m, md, disp, hist] = await Promise.all([
                obterRegistros(),
                obterAparelho(),
                obterEconomia(),
                obterSessoesDeCrise(),
                obterMeta(),
                obterMetaDeDinheiro(),
                obterDispositivos(),
                obterHistoricoDeAparelhos(),
            ]);
            setRegistros(r);
            setAparelho(d);
            setDispositivos(disp);
            setHistoricoDeAparelhos(hist);
            setEconomia(e);
            setMeta(m);
            setMetaDeDinheiro(md);

            const { recompensas } = await sincronizarGamificacao({
                registros: r,
                economia: e,
                sessoesDeCrise: c,
                diasDeAbertura,
                meta: m,
                aparelho: d,
            });
            mostrarRecompensas(recompensas);
        } catch {
            // Silencioso: leitura de tela, mantém o que já está renderizado.
        }
    }, [mostrarRecompensas]);

    useFocusEffect(
        useCallback(() => {
            carregar();
        }, [carregar])
    );

    const aoAtualizar = async () => {
        setAtualizando(true);
        // O gesto é um pedido explícito de dado novo: ignora a validade do
        // espelho e vai no servidor.
        forcarLeituraRemota();
        try {
            await carregar();
        } finally {
            setAtualizando(false);
        }
    };

    function abrirConfiguracoes() {
        navigation.navigate('Settings');
    }

    const hoje = dataDeHoje();
    const registrosDeHoje = useMemo(
        () => registros.filter((r) => r.date === hoje),
        [registros, hoje]
    );
    const puxadasDeHoje = useMemo(() => somarPuxadas(registrosDeHoje), [registrosDeHoje]);
    const { streak, escudos, progresso, ultimoDiaProtegido, gastouEscudoNoUltimoDia } = useMemo(
        () => calcularEstadoDeStreak(registros),
        [registros]
    );

    // Semana: uma varredura só alimenta o total e as duas séries do gráfico.
    const { puxadasDaSemana, rotulosDoGrafico, dadosDoGrafico } = useMemo(() => {
        const dias = ultimosNDias(7);
        const dados = dias.map((d) => somarPuxadas(registros.filter((r) => r.date === d)));
        return {
            puxadasDaSemana: dados.reduce((soma, v) => soma + v, 0),
            rotulosDoGrafico: dias.map((d) => {
                const [, mes, dia] = d.split('-');
                return `${dia}/${mes}`;
            }),
            dadosDoGrafico: dados,
        };
    }, [registros]);

    // Comparativo semanal: média diária de puxadas dos últimos 7 dias contra os
    // 7 anteriores. Média ignora dia sem registro, por isso a tela também avisa
    // com quantos dias cada lado foi calculado.
    const comparativo = useMemo(() => comparativoSemanal(registros, hoje), [registros, hoje]);
    const corDaTendencia =
        comparativo.direcao === 'queda'
            ? cores.primary
            : comparativo.direcao === 'alta'
              ? cores.danger
              : cores.textSecondary;
    const iconeDaTendencia =
        comparativo.direcao === 'queda'
            ? 'trending-down'
            : comparativo.direcao === 'alta'
              ? 'trending-up'
              : 'remove';
    const textoDaTendencia = (() => {
        if (comparativo.direcao === 'estavel') return 'Praticamente igual à semana passada';
        const variacao = Math.abs(comparativo.diferenca).toFixed(1).replace('.', ',');
        const percentual =
            comparativo.percentual === null
                ? ''
                : ` (${Math.abs(Math.round(comparativo.percentual))}%)`;
        const verbo = comparativo.direcao === 'queda' ? 'a menos' : 'a mais';
        return `${variacao} puxadas por dia ${verbo}${percentual} que na semana passada`;
    })();

    // Economia acumulada: linha sempre crescente do total no bolso nos últimos
    // 30 dias. Começa do que já havia antes da janela pro último ponto bater
    // com o "Total no bolso" logo acima.
    const { economiaDeHoje, economiaTotal, ultimos30Dias, dadosDaEconomia, ganhoDoPeriodo } =
        useMemo(() => {
            const dias = ultimosNDias(DIAS_DA_ECONOMIA);
            const serie = serieDeEconomiaAcumulada(economia, dias);
            return {
                economiaDeHoje: economia[hoje] || 0,
                economiaTotal: totalEconomizado(economia),
                ultimos30Dias: dias,
                dadosDaEconomia: serie.map((ponto) => ponto.acumulado),
                ganhoDoPeriodo: ganhoDaSerie(serie),
            };
        }, [economia, hoje]);
    const mostrarGraficoDeEconomia = !!aparelho && economiaTotal > 0;

    // Meta de dinheiro: alvo pro que já está no bolso. Sem prazo — a data de
    // chegada é estimada pelo ritmo dos últimos dias.
    const progressoDoDinheiro = useMemo(
        () => progressoDaMetaDeDinheiro(metaDeDinheiro, economia, hoje),
        [metaDeDinheiro, economia, hoje]
    );

    // Escudo: derivado dos registros, protege um dia com uso registrado. Quem
    // ainda não registrou nada não vê a linha — é mecânica avançada demais pro
    // primeiro minuto de uso.
    const temEscudo = escudos > 0;
    const mostrarEscudo = registros.length > 0;
    const mensagemDoEscudo = (() => {
        if (temEscudo) {
            return 'Escudo pronto: se você registrar uso, a sequência não zera';
        }
        if (gastouEscudoNoUltimoDia && streak > 0) {
            const [, mes, dia] = ultimoDiaProtegido.split('-');
            return `Escudo usado em ${dia}/${mes} — sua sequência continua! 💪`;
        }
        const faltam = DIAS_PARA_ESCUDO - progresso;
        return `Faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'} sem uso pra ganhar um escudo`;
    })();

    // O dispositivo que vale num dia é o que o registro daquele dia aponta —
    // dia sem registro (ou registro antigo, sem `deviceId`) cai no aparelho da
    // data e, por último, no atual. Mesma regra da economia.
    const aparelhoDoDia = useCallback(
        (data) =>
            dispositivoDoRegistro(
                registros.find((registro) => registro.date === data) ?? { date: data },
                dispositivos,
                historicoDeAparelhos,
                aparelho
            ),
        [registros, dispositivos, historicoDeAparelhos, aparelho]
    );
    const aparelhoDeHoje = useMemo(() => aparelhoDoDia(hoje), [aparelhoDoDia, hoje]);

    // Meta do dia: a declarada pelo usuário ganha da derivada do aparelho.
    const metaDeHoje = useMemo(
        () => metaEfetiva(meta, aparelhoDeHoje, hoje),
        [meta, aparelhoDeHoje, hoje]
    );
    const progressoDoObjetivo = useMemo(
        () => progressoDaMeta(meta, registros, hoje),
        [meta, registros, hoje]
    );
    const temMeta = metaValida(meta);
    const [anoFinal, mesFinal, diaFinal] = temMeta ? meta.endDate.split('-') : [];
    // Rampa vencida: o card 🎯 troca de rosto — encerra a meta e convida pra
    // próxima, em vez de ficar mostrando "0 dias restantes" pra sempre.
    const metaConcluida = !!progressoDoObjetivo?.concluida;

    // Excesso: quanto o dia passou da meta, e o custo disso. A economia trunca
    // esse valor em zero, então o alerta é o único lugar que mostra o que foi
    // gasto a mais. Sem aparelho não dá pra precificar (custoAMais = null).
    const excesso = useMemo(
        () => excessoDoDia(registrosDeHoje, aparelhoDeHoje, metaDeHoje),
        [registrosDeHoje, aparelhoDeHoje, metaDeHoje]
    );
    const mostrarExcesso = !!excesso && excesso.puxadasAMais > 0;
    const mensagemDoExcesso = mostrarExcesso
        ? `${excesso.puxadasAMais} ${excesso.puxadasAMais === 1 ? 'puxada' : 'puxadas'} acima do seu limite de hoje${
              excesso.custoAMais === null ? '' : ` — R$ ${excesso.custoAMais.toFixed(2)} a mais`
          }`
        : '';

    // Heatmap do mês: um dia é "limpo" quando tem registro e nenhum uso — a
    // mesma regra do streak (calcularEstadoDeStreak), só que visível dia a dia.
    const registrosPorData = useMemo(
        () =>
            registros.reduce((mapa, registro) => {
                (mapa[registro.date] = mapa[registro.date] || []).push(registro);
                return mapa;
            }, {}),
        [registros]
    );
    const mesAtual = mesDeData(hoje);
    const estaNoMesAtual =
        mesDoCalendario.ano === mesAtual.ano && mesDoCalendario.mes === mesAtual.mes;
    const resumoDoCalendario = useMemo(
        () => resumoDoMes(registros, mesDoCalendario.ano, mesDoCalendario.mes),
        [registros, mesDoCalendario]
    );

    const estiloDoDiaNoCalendario = useCallback(
        (dataStr) => {
            const estado = estadoDoDia(
                registrosPorData[dataStr] || [],
                metaEfetiva(meta, aparelhoDoDia(dataStr), dataStr)
            );
            if (estado === 'limpo') return { fundo: cores.primary, corDoTexto: '#fff' };
            if (estado === 'usou_dentro')
                return { fundo: cores.primaryLight, corDoTexto: cores.primaryDark };
            if (estado === 'usou_acima')
                return {
                    fundo: cores.danger + '33',
                    corDoTexto: cores.danger,
                    borda: cores.danger,
                };
            if (estado === 'usou') return { fundo: cores.warning + '33', corDoTexto: cores.text };
            return { fundo: cores.borderLight, corDoTexto: cores.textMuted };
        },
        [registrosPorData, meta, aparelhoDoDia, cores]
    );

    const tooltipDoDiaNoCalendario = useCallback(
        (dataStr) => {
            const puxadas = somarPuxadas(registrosPorData[dataStr] || []);
            return `${puxadas} ${puxadas === 1 ? 'puxada' : 'puxadas'}`;
        },
        [registrosPorData]
    );

    // Quanto o dispositivo PADRÃO já rendeu — o atalho pros dispositivos mostra
    // isso, que é o aviso antecipado de "vai acabar" antes do alerta do registro.
    // Sem padrão (nenhum ativo), o atalho não mostra consumo de ninguém: falar
    // de um vape que não é o de uso só confundiria.
    const padrao = useMemo(() => dispositivoPadrao(dispositivos), [dispositivos]);
    const consumoDoPadrao = useMemo(() => {
        if (!padrao) return null;
        const estado = estadoDoDispositivo(
            padrao,
            consumoPorDispositivo(registros)[padrao.id] ?? 0
        );
        return estado.total === null ? null : estado;
    }, [padrao, registros]);

    const dica = DICAS[new Date().getDate() % DICAS.length];

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
                refreshControl={
                    <RefreshControl
                        refreshing={atualizando}
                        onRefresh={aoAtualizar}
                        tintColor={cores.primary}
                    />
                }
            >
                <ScreenHeader
                    titulo="VapeFree"
                    subtitulo="Vamos deixar o vape pra trás"
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={abrirConfiguracoes}
                />

                <View style={estiloDoConteudo}>
                    <TouchableOpacity
                        style={[
                            styles.crisisCard,
                            { backgroundColor: cores.card, borderLeftColor: cores.warning },
                            SOMBRA.media,
                        ]}
                        onPress={() => navigation.navigate('Crisis')}
                    >
                        <Ionicons name="hand-left" size={26} color={cores.warning} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.crisisTitle, { color: cores.text }]}>
                                Estou com vontade
                            </Text>
                            <Text style={[styles.crisisSubtitle, { color: cores.textSecondary }]}>
                                Toca aqui — a gente passa por isso junto
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={cores.textMuted} />
                    </TouchableOpacity>

                    <GradeDeCards colunas={colunas}>
                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                Como você foi hoje?
                            </Text>
                            <View style={styles.statRow}>
                                <View
                                    style={[
                                        styles.statBox,
                                        { backgroundColor: cores.primaryLight },
                                    ]}
                                >
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>
                                        {puxadasDeHoje}
                                    </Text>
                                    <Text
                                        style={[styles.statLabel, { color: cores.textSecondary }]}
                                    >
                                        Puxadas{'\n'}hoje
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.statBox,
                                        { backgroundColor: cores.primaryLight },
                                    ]}
                                >
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>
                                        {streak}
                                    </Text>
                                    <Text
                                        style={[styles.statLabel, { color: cores.textSecondary }]}
                                    >
                                        Dias{'\n'}registrados{'\n'}sem uso
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.statBox,
                                        { backgroundColor: cores.primaryLight },
                                    ]}
                                >
                                    <Text style={[styles.statNum, { color: cores.primaryDark }]}>
                                        {puxadasDaSemana}
                                    </Text>
                                    <Text
                                        style={[styles.statLabel, { color: cores.textSecondary }]}
                                    >
                                        Esta{'\n'}semana
                                    </Text>
                                </View>
                            </View>

                            {mostrarEscudo ? (
                                <View
                                    style={[
                                        styles.shieldRow,
                                        {
                                            backgroundColor: cores.primaryLight,
                                            borderColor: temEscudo
                                                ? cores.primary
                                                : cores.borderLight,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={temEscudo ? 'shield-checkmark' : 'shield-outline'}
                                        size={20}
                                        color={temEscudo ? cores.primary : cores.textMuted}
                                    />
                                    <Text
                                        style={[
                                            styles.shieldText,
                                            {
                                                color: temEscudo
                                                    ? cores.primaryDark
                                                    : cores.textSecondary,
                                            },
                                        ]}
                                    >
                                        {mensagemDoEscudo}
                                    </Text>
                                </View>
                            ) : null}

                            {mostrarExcesso ? (
                                <View
                                    style={[
                                        styles.excessRow,
                                        {
                                            backgroundColor: cores.danger + '22',
                                            borderColor: cores.danger,
                                        },
                                    ]}
                                >
                                    <Ionicons name="alert-circle" size={20} color={cores.danger} />
                                    <Text style={[styles.excessText, { color: cores.danger }]}>
                                        {mensagemDoExcesso}
                                    </Text>
                                </View>
                            ) : null}
                        </View>

                        <HealthMilestonesCard registros={registros} cores={cores} />

                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                📅 Seu mês
                            </Text>

                            <CalendarioMensal
                                ano={mesDoCalendario.ano}
                                mes={mesDoCalendario.mes}
                                cores={cores}
                                aoMudarMes={setMesDoCalendario}
                                bloquearAvanco={estaNoMesAtual}
                                maximo={hoje}
                                estiloDoDia={estiloDoDiaNoCalendario}
                                tooltipDoDia={tooltipDoDiaNoCalendario}
                            />

                            <Text style={[styles.calendarSummary, { color: cores.text }]}>
                                {resumoDoCalendario.diasLimpos}{' '}
                                {resumoDoCalendario.diasLimpos === 1 ? 'dia limpo' : 'dias limpos'}{' '}
                                · {resumoDoCalendario.diasComUso} com uso ·{' '}
                                {resumoDoCalendario.diasSemRegistro} sem registro
                            </Text>

                            <View style={styles.calendarLegend}>
                                <View style={styles.legendItem}>
                                    <View
                                        style={[
                                            styles.legendDot,
                                            { backgroundColor: cores.primary },
                                        ]}
                                    />
                                    <Text
                                        style={[styles.legendText, { color: cores.textSecondary }]}
                                    >
                                        Limpo
                                    </Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View
                                        style={[
                                            styles.legendDot,
                                            {
                                                backgroundColor:
                                                    metaDeHoje === null
                                                        ? cores.warning + '33'
                                                        : cores.primaryLight,
                                            },
                                        ]}
                                    />
                                    <Text
                                        style={[styles.legendText, { color: cores.textSecondary }]}
                                    >
                                        {metaDeHoje === null ? 'Com uso' : 'Dentro do limite'}
                                    </Text>
                                </View>
                                {metaDeHoje === null ? null : (
                                    <View style={styles.legendItem}>
                                        <View
                                            style={[
                                                styles.legendDot,
                                                {
                                                    backgroundColor: cores.danger + '33',
                                                    borderColor: cores.danger,
                                                    borderWidth: 1.5,
                                                },
                                            ]}
                                        />
                                        <Text
                                            style={[
                                                styles.legendText,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Acima
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.legendItem}>
                                    <View
                                        style={[
                                            styles.legendDot,
                                            { backgroundColor: cores.borderLight },
                                        ]}
                                    />
                                    <Text
                                        style={[styles.legendText, { color: cores.textSecondary }]}
                                    >
                                        Sem registro
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                {metaConcluida
                                    ? '🎯 Sua meta chegou ao fim'
                                    : '🎯 Seu limite de hoje'}
                            </Text>
                            {metaConcluida ? (
                                <>
                                    <View style={styles.goalTopRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.goalBig, { color: cores.text }]}>
                                                {progressoDoObjetivo.alcancada
                                                    ? `Você chegou a ${meta.target}/dia 🏆`
                                                    : 'Prazo encerrado'}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.goalSub,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                {progressoDoObjetivo.alcancada
                                                    ? `Sua meta terminou em ${diaFinal}/${mesFinal}/${anoFinal} e você fechou dentro do alvo. Esse limite continua valendo.`
                                                    : `Sua meta terminou em ${diaFinal}/${mesFinal}/${anoFinal}. O alvo de ${meta.target}/dia segue valendo como seu limite — dá pra retomar de onde parou.`}
                                            </Text>
                                        </View>
                                        {progressoDoObjetivo.alcancada && (
                                            <View
                                                style={[
                                                    styles.goalBadge,
                                                    { backgroundColor: cores.primaryLight },
                                                ]}
                                            >
                                                <Ionicons
                                                    name="trophy"
                                                    size={16}
                                                    color={cores.primary}
                                                />
                                            </View>
                                        )}
                                    </View>

                                    <TouchableOpacity
                                        style={[
                                            styles.devicePrompt,
                                            {
                                                backgroundColor: cores.primaryLight,
                                                borderColor: cores.primary,
                                                marginTop: 12,
                                            },
                                        ]}
                                        onPress={() => navigation.navigate('Goal')}
                                    >
                                        <Ionicons
                                            name="flag-outline"
                                            size={20}
                                            color={cores.primary}
                                        />
                                        <Text
                                            style={[
                                                styles.devicePromptText,
                                                { color: cores.primaryDark },
                                            ]}
                                        >
                                            Definir a próxima meta
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : progressoDoObjetivo ? (
                                <>
                                    <View style={styles.goalTopRow}>
                                        <View>
                                            <Text style={[styles.goalBig, { color: cores.text }]}>
                                                {Math.round(progressoDoObjetivo.metaDeHoje)} puxadas
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.goalSub,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                é o seu limite de hoje — você está em{' '}
                                                {progressoDoObjetivo.usadasHoje}
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.goalBadge,
                                                {
                                                    backgroundColor:
                                                        progressoDoObjetivo.dentroDaMeta
                                                            ? cores.primaryLight
                                                            : cores.danger + '22',
                                                },
                                            ]}
                                        >
                                            <Ionicons
                                                name={
                                                    progressoDoObjetivo.dentroDaMeta
                                                        ? 'checkmark-circle'
                                                        : 'alert-circle'
                                                }
                                                size={16}
                                                color={
                                                    progressoDoObjetivo.dentroDaMeta
                                                        ? cores.primary
                                                        : cores.danger
                                                }
                                            />
                                            <Text
                                                style={[
                                                    styles.goalBadgeText,
                                                    {
                                                        color: progressoDoObjetivo.dentroDaMeta
                                                            ? cores.primaryDark
                                                            : cores.danger,
                                                    },
                                                ]}
                                            >
                                                {progressoDoObjetivo.dentroDaMeta
                                                    ? 'dentro'
                                                    : 'acima'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.xpTrack,
                                            { backgroundColor: cores.borderLight, marginTop: 12 },
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.xpFill,
                                                {
                                                    backgroundColor: cores.primary,
                                                    width: `${progressoDoObjetivo.percentualDoTempo}%`,
                                                },
                                            ]}
                                        />
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => navigation.navigate('Goal')}
                                        activeOpacity={0.7}
                                    >
                                        <Text
                                            style={[
                                                styles.goalFoot,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Objetivo: {meta.target}/dia até {diaFinal}/{mesFinal}/
                                            {anoFinal} · {progressoDoObjetivo.diasRestantes} dias
                                            restantes
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity
                                    style={[
                                        styles.devicePrompt,
                                        {
                                            backgroundColor: cores.primaryLight,
                                            borderColor: cores.primary,
                                        },
                                    ]}
                                    onPress={() => navigation.navigate('Goal')}
                                >
                                    <Ionicons
                                        name="add-circle-outline"
                                        size={20}
                                        color={cores.primary}
                                    />
                                    <Text
                                        style={[
                                            styles.devicePromptText,
                                            { color: cores.primaryDark },
                                        ]}
                                    >
                                        Define seu limite diário pra acompanhar a queda dia a dia 🎯
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                💰 Economia
                            </Text>
                            {aparelho ? (
                                <View style={styles.moneyRow}>
                                    <View
                                        style={[
                                            styles.moneyBox,
                                            { backgroundColor: cores.primaryLight },
                                        ]}
                                    >
                                        <Text style={styles.moneyIcon}>💰</Text>
                                        <Text
                                            style={[styles.moneyVal, { color: cores.primaryDark }]}
                                        >
                                            R$ {economiaDeHoje.toFixed(2)}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.moneyLabel,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Ficou no seu bolso hoje
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.moneyBox,
                                            { backgroundColor: cores.primaryLight },
                                        ]}
                                    >
                                        <Text style={styles.moneyIcon}>💵</Text>
                                        <Text
                                            style={[styles.moneyVal, { color: cores.primaryDark }]}
                                        >
                                            R$ {economiaTotal.toFixed(2)}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.moneyLabel,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Total no bolso
                                        </Text>
                                    </View>
                                </View>
                            ) : null}

                            {/* Meta de dinheiro: barra alimentada pelo mesmo
                                total no bolso mostrado logo acima. */}
                            {aparelho && progressoDoDinheiro !== null && (
                                <TouchableOpacity
                                    style={[styles.goalBlock, { borderTopColor: cores.border }]}
                                    onPress={() => navigation.navigate('Goal')}
                                >
                                    <Text style={[styles.goalLabel, { color: cores.text }]}>
                                        {progressoDoDinheiro.label
                                            ? `🎯 ${progressoDoDinheiro.label}`
                                            : '🎯 Sua meta de dinheiro'}
                                    </Text>
                                    <View
                                        style={[styles.xpTrack, { backgroundColor: cores.inputBg }]}
                                    >
                                        <View
                                            style={[
                                                styles.xpFill,
                                                {
                                                    width: `${progressoDoDinheiro.percentual}%`,
                                                    backgroundColor: cores.primary,
                                                },
                                            ]}
                                        />
                                    </View>
                                    <Text style={[styles.goalHint, { color: cores.textSecondary }]}>
                                        R$ {progressoDoDinheiro.acumulado.toFixed(2)} de R${' '}
                                        {progressoDoDinheiro.alvo.toFixed(2)}
                                    </Text>
                                    {progressoDoDinheiro.concluida ? (
                                        <Text
                                            style={[styles.goalHint, { color: cores.primaryDark }]}
                                        >
                                            🎉 Meta alcançada! Toque pra definir a próxima.
                                        </Text>
                                    ) : (
                                        progressoDoDinheiro.dataEstimada !== null && (
                                            <Text
                                                style={[
                                                    styles.goalHint,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                No seu ritmo, ~{progressoDoDinheiro.diasEstimados}{' '}
                                                {progressoDoDinheiro.diasEstimados === 1
                                                    ? 'dia'
                                                    : 'dias'}{' '}
                                                ·{' '}
                                                {progressoDoDinheiro.dataEstimada
                                                    .split('-')
                                                    .slice(1)
                                                    .reverse()
                                                    .join('/')}
                                            </Text>
                                        )
                                    )}
                                </TouchableOpacity>
                            )}

                            {/* Sem meta, mas já com dinheiro no bolso: o número
                                sozinho não tem destino — o convite dá um. */}
                            {aparelho && progressoDoDinheiro === null && economiaTotal > 0 && (
                                <TouchableOpacity
                                    style={[
                                        styles.devicePrompt,
                                        {
                                            backgroundColor: cores.primaryLight,
                                            borderColor: cores.primary,
                                            marginTop: 14,
                                        },
                                    ]}
                                    onPress={() => navigation.navigate('Goal')}
                                >
                                    <Ionicons
                                        name="wallet-outline"
                                        size={20}
                                        color={cores.primary}
                                    />
                                    <Text
                                        style={[
                                            styles.devicePromptText,
                                            { color: cores.primaryDark },
                                        ]}
                                    >
                                        Define uma meta de dinheiro e veja esse total virar algo que
                                        você quer 🎯
                                    </Text>
                                </TouchableOpacity>
                            )}

                            {!aparelho && (
                                <TouchableOpacity
                                    style={[
                                        styles.devicePrompt,
                                        {
                                            backgroundColor: cores.primaryLight,
                                            borderColor: cores.primary,
                                        },
                                    ]}
                                    onPress={() => navigation.navigate('Device')}
                                >
                                    <Ionicons
                                        name="add-circle-outline"
                                        size={20}
                                        color={cores.primary}
                                    />
                                    <Text
                                        style={[
                                            styles.devicePromptText,
                                            { color: cores.primaryDark },
                                        ]}
                                    >
                                        Cadastra seu dispositivo pra ver quanto você tá economizando
                                        💡
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {mostrarGraficoDeEconomia ? (
                            <View
                                style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}
                            >
                                <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                    📈 Economia acumulada
                                </Text>
                                <Text
                                    style={[styles.savingsSubtitle, { color: cores.textSecondary }]}
                                >
                                    R$ {ganhoDoPeriodo.toFixed(2)} nos últimos {DIAS_DA_ECONOMIA}{' '}
                                    dias
                                </Text>
                                {larguraDoCardDoGrafico > 0 ? (
                                    <LineChart
                                        data={{
                                            labels: rotulosEspacados(ultimos30Dias),
                                            datasets: [{ data: dadosDaEconomia }],
                                        }}
                                        width={Math.max(240, larguraDoCardDoGrafico - 32)}
                                        height={180}
                                        fromZero
                                        withDots={false}
                                        segments={4}
                                        chartConfig={{
                                            backgroundColor: cores.card,
                                            backgroundGradientFrom: cores.card,
                                            backgroundGradientTo: cores.card,
                                            decimalPlaces: 0,
                                            color: (opacity = 1) =>
                                                `rgba(73, 144, 226, ${opacity})`,
                                            labelColor: () => cores.textSecondary,
                                            propsForBackgroundLines: { stroke: cores.borderLight },
                                            propsForLabels: { fontFamily: 'Poppins_400Regular' },
                                            fillShadowGradient: cores.primary,
                                            fillShadowGradientOpacity: 0.25,
                                            formatYLabel: (v) => `R$ ${Math.round(Number(v))}`,
                                        }}
                                        bezier
                                        style={styles.chart}
                                    />
                                ) : null}
                            </View>
                        ) : null}

                        <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                📊 Esta semana x semana passada
                            </Text>
                            {comparativo.direcao === null ? (
                                <Text style={[styles.emptyChart, { color: cores.textMuted }]}>
                                    Registra pelo menos um dia em cada semana pra comparar 📝
                                </Text>
                            ) : (
                                <>
                                    <View style={styles.weekRow}>
                                        <View
                                            style={[
                                                styles.weekBox,
                                                { backgroundColor: cores.primaryLight },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.weekVal,
                                                    { color: cores.primaryDark },
                                                ]}
                                            >
                                                {comparativo.mediaAtual
                                                    .toFixed(1)
                                                    .replace('.', ',')}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.weekLabel,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                puxadas/dia esta semana
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.weekDays,
                                                    { color: cores.textMuted },
                                                ]}
                                            >
                                                {comparativo.diasAtuais} de 7 dias registrados
                                            </Text>
                                        </View>
                                        <View
                                            style={[
                                                styles.weekBox,
                                                { backgroundColor: cores.borderLight },
                                            ]}
                                        >
                                            <Text style={[styles.weekVal, { color: cores.text }]}>
                                                {comparativo.mediaAnterior
                                                    .toFixed(1)
                                                    .replace('.', ',')}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.weekLabel,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                puxadas/dia na semana passada
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.weekDays,
                                                    { color: cores.textMuted },
                                                ]}
                                            >
                                                {comparativo.diasAnteriores} de 7 dias registrados
                                            </Text>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.trendRow,
                                            {
                                                backgroundColor: corDaTendencia + '22',
                                                borderColor: corDaTendencia,
                                            },
                                        ]}
                                    >
                                        <Ionicons
                                            name={iconeDaTendencia}
                                            size={20}
                                            color={corDaTendencia}
                                        />
                                        <Text style={[styles.trendText, { color: corDaTendencia }]}>
                                            {textoDaTendencia}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </View>

                        <View
                            style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}
                            onLayout={(e) => setLarguraDoCardDoGrafico(e.nativeEvent.layout.width)}
                        >
                            <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                Uso nos últimos 7 dias
                            </Text>
                            {registros.length === 0 ? (
                                <Text style={[styles.emptyChart, { color: cores.textMuted }]}>
                                    Ainda não tem nada por aqui. Bora começar? 📝
                                </Text>
                            ) : larguraDoCardDoGrafico > 0 ? (
                                <LineChart
                                    data={{
                                        labels: rotulosDoGrafico,
                                        datasets: [{ data: dadosDoGrafico }],
                                    }}
                                    width={Math.max(240, larguraDoCardDoGrafico - 32)}
                                    height={180}
                                    fromZero
                                    segments={Math.max(1, Math.min(4, Math.max(...dadosDoGrafico)))}
                                    chartConfig={{
                                        backgroundColor: cores.card,
                                        backgroundGradientFrom: cores.card,
                                        backgroundGradientTo: cores.card,
                                        decimalPlaces: 0,
                                        color: (opacity = 1) => `rgba(73, 144, 226, ${opacity})`,
                                        labelColor: () => cores.textSecondary,
                                        propsForDots: {
                                            r: '4',
                                            strokeWidth: '2',
                                            stroke: cores.primaryDark,
                                        },
                                        propsForBackgroundLines: { stroke: cores.borderLight },
                                        propsForLabels: { fontFamily: 'Poppins_400Regular' },
                                        formatYLabel: (v) => `${Math.round(Number(v))}`,
                                    }}
                                    bezier
                                    style={styles.chart}
                                />
                            ) : null}
                        </View>

                        <View
                            style={[
                                styles.tipCard,
                                { backgroundColor: cores.card, borderLeftColor: cores.primary },
                                SOMBRA.pequena,
                            ]}
                        >
                            <Ionicons
                                name="bulb-outline"
                                size={24}
                                color={cores.primary}
                                style={{ marginRight: 10 }}
                            />
                            <Text style={[styles.tipText, { color: cores.text }]}>{dica}</Text>
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.deviceBtn,
                                { backgroundColor: cores.card, borderColor: cores.primary },
                                SOMBRA.pequena,
                            ]}
                            onPress={() => navigation.navigate('Device')}
                        >
                            <Ionicons
                                name="phone-portrait-outline"
                                size={18}
                                color={cores.primary}
                            />
                            <Text style={[styles.deviceBtnText, { color: cores.primaryDark }]}>
                                {aparelho
                                    ? `Meus dispositivos${consumoDoPadrao === null ? '' : ` · ${padrao.name} em ${consumoDoPadrao.percentual}%`}`
                                    : 'Cadastrar meu dispositivo'}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={cores.primary} />
                        </TouchableOpacity>
                    </GradeDeCards>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 14,
    },
    crisisCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: RAIO.lg,
        borderLeftWidth: 4,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    crisisTitle: { fontSize: 16, fontFamily: 'Poppins_800ExtraBold' },
    crisisSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: {
        flex: 1,
        borderRadius: RAIO.md,
        padding: 12,
        alignItems: 'center',
    },
    shieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        padding: 10,
        borderRadius: RAIO.md,
        borderWidth: 1,
    },
    shieldText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', lineHeight: 16 },
    excessRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        padding: 10,
        borderRadius: RAIO.md,
        borderWidth: 1,
    },
    excessText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', lineHeight: 16 },
    calendarSummary: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: 12,
        textAlign: 'center',
    },
    calendarLegend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginTop: 8,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 12, height: 12, borderRadius: RAIO.sm },
    legendText: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    statNum: { fontSize: 26, fontFamily: 'Poppins_800ExtraBold' },
    statLabel: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        marginTop: 2,
        lineHeight: 14,
    },
    goalTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    goalBig: { fontSize: 22, fontFamily: 'Poppins_800ExtraBold' },
    goalSub: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    goalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RAIO.full,
    },
    goalBadgeText: { fontSize: 12, fontFamily: 'Poppins_700Bold' },
    goalFoot: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 8 },
    xpTrack: { height: 10, borderRadius: RAIO.md, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: RAIO.md },
    goalBlock: { borderTopWidth: 1, marginTop: 14, paddingTop: 14, gap: 8 },
    goalLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    goalHint: { fontSize: 12, fontFamily: 'Poppins_400Regular' },
    moneyRow: { flexDirection: 'row', gap: 10 },
    moneyBox: {
        flex: 1,
        borderRadius: RAIO.md,
        padding: 14,
    },
    moneyIcon: { fontSize: 22, fontFamily: 'Poppins_400Regular', marginBottom: 4 },
    moneyVal: { fontSize: 20, fontFamily: 'Poppins_800ExtraBold' },
    moneyLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    devicePrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: RAIO.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    devicePromptText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_500Medium' },
    weekRow: { flexDirection: 'row', gap: 10 },
    weekBox: { flex: 1, borderRadius: RAIO.md, padding: 14 },
    weekVal: { fontSize: 22, fontFamily: 'Poppins_800ExtraBold' },
    weekLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2, lineHeight: 15 },
    weekDays: { fontSize: 10, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    trendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
        padding: 10,
        borderRadius: RAIO.md,
        borderWidth: 1,
    },
    trendText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_600SemiBold', lineHeight: 16 },
    savingsSubtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: -8,
        marginBottom: 6,
    },
    chart: { borderRadius: RAIO.md, marginTop: 4 },
    emptyChart: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        padding: 20,
    },
    tipCard: {
        borderRadius: RAIO.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tipText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', lineHeight: 20 },
    deviceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: RAIO.lg,
        padding: 14,
        marginHorizontal: 16,
        marginTop: 14,
        borderWidth: 1.5,
    },
    deviceBtnText: { flex: 1, fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
});
