import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Modal,
    TouchableWithoutFeedback,
    TextInput,
} from 'react-native';
import ScreenHeader from '../components/ScreenHeader';
import InsightsCard from '../components/InsightsCard';
import CalendarioMensal from '../components/CalendarioMensal';
import GradeDeCards from '../components/GradeDeCards';
import { normalizarIntensidade, emojiDoRotulo } from '../utils/insights';
import { converterDataLocal, chaveDeData, inicioDaSemana } from '../utils/datas';
import {
    MESES_CURTOS,
    formatarDataCompleta,
    formatarDiaMes,
    diasNoIntervalo,
    estaNoIntervalo,
    mesDeData,
} from '../utils/calendario';
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
    sincronizarGamificacao,
    dataDeHoje,
} from '../utils/storage';
import {
    puxadasDoRegistro,
    notaCasaComBusca,
    MAX_PUXADAS_DIA,
    MAX_NOTA,
    limitarPuxadas,
} from '../utils/records';
import { RAIO, SOMBRA, GATILHOS, AJUDAS } from '../utils/theme';
import { usarLayoutResponsivo, estiloDoConteudo } from '../utils/responsivo';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';

const FILTROS = [
    { id: 'day', rotulo: 'Dia' },
    { id: 'week', rotulo: 'Semana' },
    { id: 'month', rotulo: 'Mês' },
    { id: 'range', rotulo: 'Período' },
];

const METRICAS = [
    { id: 'puffs', rotulo: 'Puxadas' },
    { id: 'intensity', rotulo: 'Vontade' },
];

// Acima disso o gráfico vira ilegível com uma barra por dia — o intervalo
// escolhido passa a ser agrupado por semana e depois por mês.
const DIAS_ATE_AGRUPAR_POR_SEMANA = 31;
const DIAS_ATE_AGRUPAR_POR_MES = 180;

// A lista mora dentro do ScrollView da tela (junto do gráfico e do
// InsightsCard) e a grade masonry precisa medir cada card, então não dá pra
// trocar por FlatList sem virtualização aninhada. Com ~1 ano de uso seriam
// ~365 cards montados de uma vez; renderiza-se de PAGINA_DO_HISTORICO em
// PAGINA_DO_HISTORICO, com botão de carregar mais.
const PAGINA_DO_HISTORICO = 30;

// Agrupamento por semana usa a mesma segunda-feira das missões semanais.
const chaveDoInicioDaSemana = inicioDaSemana;

function chaveDoInicioDoMes(dataStr) {
    const data = converterDataLocal(dataStr);
    return chaveDeData(data.getFullYear(), data.getMonth(), 1);
}

function formatarRotuloDaSemana(dataStr) {
    const data = converterDataLocal(dataStr);
    return `Sem ${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function formatarRotuloDaChaveDoMes(chaveDoMes) {
    const [ano, mes] = chaveDoMes.split('-');
    return `${MESES_CURTOS[Number(mes) - 1]} ${ano}`;
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
            Object.entries(somas).map(([chave, { total, contagem }]) => [
                chave,
                contagem > 0 ? Math.round((total / contagem) * 10) / 10 : 0,
            ])
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
    const { colunas } = usarLayoutResponsivo();
    const { mostrarErro, mostrarRecompensas } = usarToast();
    // Largura do gráfico medida do card: com 2 colunas não dá pra derivar da janela.
    const [larguraDoCardDoGrafico, setLarguraDoCardDoGrafico] = useState(0);
    const [registros, setRegistros] = useState([]);
    const [sessoesDeCrise, setSessoesDeCrise] = useState([]);
    const [filtro, setFiltro] = useState('day');
    const [metrica, setMetrica] = useState('puffs');
    const [registroEmEdicao, setRegistroEmEdicao] = useState(null);
    const [idParaExcluirConfirmacao, setIdParaExcluirConfirmacao] = useState(null);
    // Período aplicado ({ inicio, fim }) vs o que está sendo escolhido no
    // calendário — separados pra fechar o modal sem aplicar não perder o filtro.
    const [periodo, setPeriodo] = useState(null);
    const [rascunhoDePeriodo, setRascunhoDePeriodo] = useState({ inicio: null, fim: null });
    const [modalDePeriodoAberto, setModalDePeriodoAberto] = useState(false);
    const [mesDoSeletor, setMesDoSeletor] = useState(() => mesDeData(dataDeHoje()));
    const [rotulosSelecionados, setRotulosSelecionados] = useState([]);
    const [busca, setBusca] = useState('');
    const [limiteDoHistorico, setLimiteDoHistorico] = useState(PAGINA_DO_HISTORICO);

    const carregar = useCallback(async () => {
        // As leituras já engolem erro e devolvem valor neutro; o try aqui é a
        // rede de segurança pra qualquer falha inesperada não derrubar a tela.
        try {
            const [r, sessoes] = await Promise.all([obterRegistros(), obterSessoesDeCrise()]);
            setRegistros(r);
            setSessoesDeCrise(sessoes);
        } catch {
            // Silencioso: leitura de tela, mantém o que já está renderizado.
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            carregar();
        }, [carregar])
    );

    // Gráfico e lista trabalham sempre em cima do recorte filtrado. O
    // InsightsCard não — ver comentário na renderização.
    const periodoAtivo = useMemo(
        () => (filtro === 'range' && periodo && periodo.inicio && periodo.fim ? periodo : null),
        [filtro, periodo]
    );
    const registrosFiltrados = useMemo(
        () =>
            registros.filter((registro) => {
                if (
                    periodoAtivo &&
                    !estaNoIntervalo(registro.date, periodoAtivo.inicio, periodoAtivo.fim)
                )
                    return false;
                if (rotulosSelecionados.length > 0) {
                    const rotulosDoRegistro = [
                        ...(registro.triggers || []),
                        ...(registro.helps || []),
                    ];
                    // Vários rótulos selecionados = OU: basta o registro bater com um.
                    if (!rotulosSelecionados.some((rotulo) => rotulosDoRegistro.includes(rotulo)))
                        return false;
                }
                // Busca entra junto dos outros filtros (e não só na lista) pra
                // gráfico, contador e lista falarem sempre do mesmo recorte.
                if (!notaCasaComBusca(registro.note, busca)) return false;
                return true;
            }),
        [registros, periodoAtivo, rotulosSelecionados, busca]
    );

    const { rotulos: rotulosDoGrafico, dados: dadosDoGrafico } = useMemo(() => {
        if (filtro === 'day') {
            const gruposPorDia = agruparRegistrosPor(
                registrosFiltrados,
                (dataStr) => dataStr,
                metrica
            );
            const datasDoGrafico = Object.keys(gruposPorDia).sort(compararChavesDeData).slice(-10);
            return {
                rotulos: datasDoGrafico.map(formatarDiaMes),
                dados: datasDoGrafico.map((chaveDaData) => gruposPorDia[chaveDaData]),
            };
        }
        if (filtro === 'week') {
            const gruposPorSemana = agruparRegistrosPor(
                registrosFiltrados,
                chaveDoInicioDaSemana,
                metrica
            );
            const semanasOrdenadas = Object.keys(gruposPorSemana)
                .sort(compararChavesDeData)
                .slice(-6);
            return {
                rotulos: semanasOrdenadas.map(formatarRotuloDaSemana),
                dados: semanasOrdenadas.map((chaveDaSemana) => gruposPorSemana[chaveDaSemana]),
            };
        }
        if (filtro === 'month') {
            const gruposPorMes = agruparRegistrosPor(
                registrosFiltrados,
                chaveDoInicioDoMes,
                metrica
            );
            const mesesOrdenados = Object.keys(gruposPorMes).sort(compararChavesDeData).slice(-6);
            return {
                rotulos: mesesOrdenados.map(formatarRotuloDaChaveDoMes),
                dados: mesesOrdenados.map((m) => gruposPorMes[m]),
            };
        }
        if (filtro === 'range') {
            if (!periodoAtivo) return { rotulos: [], dados: [] };
            // Sem slice: o intervalo escolhido aparece inteiro, só muda a
            // granularidade pra não virar uma barra por dia em 6 meses.
            const dias = diasNoIntervalo(periodoAtivo.inicio, periodoAtivo.fim);
            const [obterChave, formatarRotulo] =
                dias <= DIAS_ATE_AGRUPAR_POR_SEMANA
                    ? [(dataStr) => dataStr, formatarDiaMes]
                    : dias <= DIAS_ATE_AGRUPAR_POR_MES
                      ? [chaveDoInicioDaSemana, formatarRotuloDaSemana]
                      : [chaveDoInicioDoMes, formatarRotuloDaChaveDoMes];

            const grupos = agruparRegistrosPor(registrosFiltrados, obterChave, metrica);
            const chaves = Object.keys(grupos).sort(compararChavesDeData);
            return {
                rotulos: chaves.map(formatarRotulo),
                dados: chaves.map((chave) => grupos[chave]),
            };
        }
        return { rotulos: [], dados: [] };
    }, [filtro, metrica, registrosFiltrados, periodoAtivo]);

    // Menos de ~38px por barra o rótulo de data vira borrão sobreposto.
    const larguraDisponivel = Math.max(240, larguraDoCardDoGrafico - 32);
    const larguraDoGrafico = Math.max(larguraDisponivel, rotulosDoGrafico.length * 38);
    const todosOsRegistros = useMemo(
        () =>
            [...registrosFiltrados].sort((a, b) => {
                const porData = compararChavesDeData(b.date, a.date);
                return porData !== 0 ? porData : b.id - a.id;
            }),
        [registrosFiltrados]
    );

    // Trocar filtro/rótulo/período começa a lista de novo do topo.
    useEffect(() => {
        setLimiteDoHistorico(PAGINA_DO_HISTORICO);
    }, [periodoAtivo, rotulosSelecionados, busca]);

    const registrosVisiveis = useMemo(
        () => todosOsRegistros.slice(0, limiteDoHistorico),
        [todosOsRegistros, limiteDoHistorico]
    );
    const registrosRestantes = todosOsRegistros.length - registrosVisiveis.length;

    // Os chips vêm dos rótulos que o usuário realmente usou, não do array
    // GATILHOS — assim o texto livre de "Outro" (salvo como rótulo cru) também
    // vira filtro. Mais frequentes primeiro.
    const rotulosDisponiveis = useMemo(() => {
        const contagemDeRotulos = registros.reduce((mapa, registro) => {
            [...(registro.triggers || []), ...(registro.helps || [])].forEach((rotulo) => {
                mapa[rotulo] = (mapa[rotulo] || 0) + 1;
            });
            return mapa;
        }, {});
        return Object.entries(contagemDeRotulos)
            .sort((a, b) => b[1] - a[1])
            .map(([rotulo]) => rotulo);
    }, [registros]);

    const temAlgumaNota = useMemo(() => registros.some((registro) => !!registro.note), [registros]);

    const buscaAtiva = busca.trim() !== '';
    const temFiltroAtivo = !!periodoAtivo || rotulosSelecionados.length > 0 || buscaAtiva;

    const descricaoDoRecorte = (() => {
        const prefixo = metrica === 'puffs' ? 'Total de puxadas' : 'Vontade média';
        if (filtro === 'range') {
            if (!periodoAtivo) return 'Escolha um período pra ver o gráfico.';
            return `${prefixo} de ${formatarDiaMes(periodoAtivo.inicio)} a ${formatarDiaMes(periodoAtivo.fim)}`;
        }
        if (filtro === 'day') return `${prefixo} nos últimos 10 dias com registro`;
        if (filtro === 'week') return `${prefixo} nas últimas 6 semanas com registro`;
        return `${prefixo} nos últimos 6 meses com registro`;
    })();

    const abrirSeletorDePeriodo = () => {
        setRascunhoDePeriodo(periodo || { inicio: null, fim: null });
        setMesDoSeletor(mesDeData(periodo?.inicio || dataDeHoje()));
        setModalDePeriodoAberto(true);
    };

    const tocarDiaNoSeletor = (dataStr) => {
        setRascunhoDePeriodo((atual) => {
            // Sem início ainda, ou intervalo já fechado: recomeça a seleção.
            if (!atual.inicio || atual.fim) return { inicio: dataStr, fim: null };
            return dataStr < atual.inicio
                ? { inicio: dataStr, fim: atual.inicio }
                : { inicio: atual.inicio, fim: dataStr };
        });
    };

    const aplicarPeriodo = () => {
        setPeriodo(rascunhoDePeriodo);
        setFiltro('range');
        setModalDePeriodoAberto(false);
    };

    const limparFiltros = () => {
        setPeriodo(null);
        setRotulosSelecionados([]);
        setBusca('');
        setFiltro('day');
    };

    const alternarRotulo = (rotulo) => {
        setRotulosSelecionados((atual) =>
            atual.includes(rotulo) ? atual.filter((r) => r !== rotulo) : [...atual, rotulo]
        );
    };

    const estiloDoDiaNoSeletor = (dataStr) => {
        const { inicio, fim } = rascunhoDePeriodo;
        if (dataStr === inicio || dataStr === fim)
            return { fundo: cores.primary, corDoTexto: '#fff' };
        if (estaNoIntervalo(dataStr, inicio, fim))
            return { fundo: cores.primaryLight, corDoTexto: cores.primaryDark };
        return { corDoTexto: cores.text };
    };

    const iconeDaIntensidade = (n) => {
        if (n <= 3) return '🟢';
        if (n <= 6) return '🟡';
        return '🔴';
    };

    // Editar/excluir registro muda puxadas e economia, então pode concluir
    // missão e desbloquear conquista na hora — mesmo fluxo do Register/Crisis.
    const recalcularEConceder = async () => {
        const [todosOsRegs, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = aparelho
            ? await recalcularEconomia(todosOsRegs, aparelho)
            : await obterEconomia();
        const sessoes = await obterSessoesDeCrise();
        setRegistros(todosOsRegs);
        setSessoesDeCrise(sessoes);

        const { recompensas } = await sincronizarGamificacao({
            registros: todosOsRegs,
            economia,
            sessoesDeCrise: sessoes,
        });
        mostrarRecompensas(recompensas);
    };

    const salvarEdicao = async () => {
        if (!registroEmEdicao) return;
        const resultado = await atualizarRegistro(registroEmEdicao);
        // Não fecha o modal se não gravou — senão o usuário perde a edição.
        if (!resultado.ok) {
            mostrarErro('Não deu pra salvar a edição', 'Verifique sua conexão e tente de novo.');
            return;
        }
        setRegistroEmEdicao(null);
        await recalcularEConceder();
    };

    const excluir = async () => {
        if (!idParaExcluirConfirmacao) return;
        const resultado = await excluirRegistro(idParaExcluirConfirmacao);
        if (!resultado.ok) {
            mostrarErro('Não deu pra excluir', 'Verifique sua conexão e tente de novo.');
            setIdParaExcluirConfirmacao(null);
            return;
        }
        setIdParaExcluirConfirmacao(null);
        await recalcularEConceder();
    };

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Histórico"
                    subtitulo="Sua evolução ao longo do tempo"
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                />

                <View style={estiloDoConteudo}>
                    <View style={styles.filtersRow}>
                        {FILTROS.map((f) => (
                            <TouchableOpacity
                                key={f.id}
                                style={[
                                    styles.filterBtn,
                                    { borderColor: cores.border, backgroundColor: cores.card },
                                    filtro === f.id && {
                                        borderColor: cores.primary,
                                        backgroundColor: cores.primaryLight,
                                    },
                                ]}
                                onPress={() =>
                                    f.id === 'range' ? abrirSeletorDePeriodo() : setFiltro(f.id)
                                }
                            >
                                <Text
                                    style={[
                                        styles.filterBtnText,
                                        { color: cores.textSecondary },
                                        filtro === f.id && { color: cores.primaryDark },
                                    ]}
                                >
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
                                    metrica === m.id && {
                                        borderColor: cores.primary,
                                        backgroundColor: cores.primaryLight,
                                    },
                                ]}
                                onPress={() => setMetrica(m.id)}
                            >
                                <Text
                                    style={[
                                        styles.filterBtnText,
                                        { color: cores.textSecondary },
                                        metrica === m.id && { color: cores.primaryDark },
                                    ]}
                                >
                                    {m.rotulo}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Campo de busca só aparece pra quem tem anotação — sem nota
                    nenhuma ele seria um filtro que só sabe esvaziar a tela. */}
                    {temAlgumaNota ? (
                        <View
                            style={[
                                styles.searchRow,
                                { borderColor: cores.border, backgroundColor: cores.inputBg },
                            ]}
                        >
                            <Ionicons name="search" size={16} color={cores.textMuted} />
                            <TextInput
                                style={[styles.searchInput, { color: cores.text }]}
                                placeholder="Buscar nas anotações"
                                placeholderTextColor={cores.textMuted}
                                value={busca}
                                onChangeText={setBusca}
                                autoCorrect={false}
                                returnKeyType="search"
                            />
                            {busca !== '' ? (
                                <TouchableOpacity onPress={() => setBusca('')}>
                                    <Ionicons
                                        name="close-circle"
                                        size={18}
                                        color={cores.textMuted}
                                    />
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ) : null}

                    {rotulosDisponiveis.length > 0 ? (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.tagFilterScroll}
                            contentContainerStyle={styles.tagFilterRow}
                        >
                            {rotulosDisponiveis.map((rotulo) => {
                                const selecionado = rotulosSelecionados.includes(rotulo);
                                return (
                                    <TouchableOpacity
                                        key={rotulo}
                                        style={[
                                            styles.chip,
                                            {
                                                borderColor: cores.border,
                                                backgroundColor: cores.card,
                                            },
                                            selecionado && {
                                                borderColor: cores.primary,
                                                backgroundColor: cores.primary,
                                            },
                                        ]}
                                        onPress={() => alternarRotulo(rotulo)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                { color: cores.textSecondary },
                                                selecionado && { color: '#fff' },
                                            ]}
                                        >
                                            {emojiDoRotulo(rotulo)} {rotulo}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    ) : null}

                    {temFiltroAtivo ? (
                        <View
                            style={[
                                styles.activeFilterRow,
                                { backgroundColor: cores.primaryLight },
                            ]}
                        >
                            <Ionicons name="funnel-outline" size={16} color={cores.primaryDark} />
                            <Text style={[styles.activeFilterText, { color: cores.primaryDark }]}>
                                {registrosFiltrados.length}{' '}
                                {registrosFiltrados.length === 1 ? 'registro' : 'registros'}
                                {periodoAtivo
                                    ? ` · ${formatarDiaMes(periodoAtivo.inicio)} → ${formatarDiaMes(periodoAtivo.fim)}`
                                    : ''}
                                {rotulosSelecionados.length > 0
                                    ? ` · ${rotulosSelecionados.join(', ')}`
                                    : ''}
                                {buscaAtiva ? ` · “${busca.trim()}”` : ''}
                            </Text>
                            <TouchableOpacity onPress={limparFiltros}>
                                <Text
                                    style={[styles.clearFilterText, { color: cores.primaryDark }]}
                                >
                                    Limpar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    <GradeDeCards colunas={colunas}>
                        <View
                            style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}
                            onLayout={(e) => setLarguraDoCardDoGrafico(e.nativeEvent.layout.width)}
                        >
                            <View style={styles.cardHeader}>
                                <View>
                                    <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                                        {metrica === 'puffs' ? 'Puxadas' : 'Intensidade da vontade'}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.cardSubtitle,
                                            { color: cores.textSecondary },
                                        ]}
                                    >
                                        {descricaoDoRecorte}
                                    </Text>
                                </View>
                            </View>

                            {dadosDoGrafico.length === 0 ? (
                                <View style={styles.emptyChartWrap}>
                                    <Ionicons
                                        name="bar-chart-outline"
                                        size={28}
                                        color={cores.border}
                                    />
                                    <Text style={[styles.emptyChart, { color: cores.textMuted }]}>
                                        {temFiltroAtivo
                                            ? 'Nenhum registro com esses filtros.'
                                            : 'Nada registrado nesse período ainda.'}
                                    </Text>
                                </View>
                            ) : larguraDoCardDoGrafico > 0 ? (
                                // Intervalo longo agrupado por dia gera mais barras do que cabe
                                // na tela — aí o gráfico cresce e rola na horizontal.
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={
                                        larguraDoGrafico > larguraDisponivel
                                    }
                                    scrollEnabled={larguraDoGrafico > larguraDisponivel}
                                >
                                    <BarChart
                                        data={{
                                            labels: rotulosDoGrafico,
                                            datasets: [{ data: dadosDoGrafico }],
                                        }}
                                        width={larguraDoGrafico}
                                        height={180}
                                        fromZero
                                        showValuesOnTopOfBars
                                        segments={Math.max(
                                            1,
                                            Math.min(4, Math.max(...dadosDoGrafico))
                                        )}
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
                                            propsForTopLabels: {
                                                fontFamily: 'Poppins_600SemiBold',
                                            },
                                            barPercentage: 0.65,
                                            fillShadowGradient: cores.primary,
                                            fillShadowGradientOpacity: 1,
                                            formatYLabel: (v) => `${Math.round(Number(v))}`,
                                        }}
                                        style={styles.chart}
                                    />
                                </ScrollView>
                            ) : null}
                            {!registros.length ? (
                                <Text style={[styles.emptySubtitle, { color: cores.textMuted }]}>
                                    Que tal registrar agora? 😊
                                </Text>
                            ) : null}
                        </View>

                        {/* Insights sempre sobre a base inteira: derivar padrão de um
                        recorte já filtrado por gatilho seria circular. */}
                        <InsightsCard
                            registros={registros}
                            sessoesDeCrise={sessoesDeCrise}
                            cores={cores}
                            aoVerCrises={() => navigation.navigate('CrisisHistory')}
                        />

                        {registros.length > 0 && todosOsRegistros.length === 0 ? (
                            <View
                                style={[
                                    styles.card,
                                    { backgroundColor: cores.card },
                                    SOMBRA.pequena,
                                ]}
                            >
                                <Text style={[styles.emptyChart, { color: cores.textMuted }]}>
                                    Nenhum registro com esses filtros.
                                </Text>
                            </View>
                        ) : null}

                        {registrosVisiveis.length > 0
                            ? registrosVisiveis.map((reg) => (
                                  <View
                                      key={reg.id}
                                      style={[
                                          styles.histItem,
                                          { backgroundColor: cores.card },
                                          SOMBRA.pequena,
                                      ]}
                                  >
                                      <View style={styles.histTop}>
                                          <View style={{ flex: 1 }}>
                                              <Text
                                                  style={[styles.histDate, { color: cores.text }]}
                                              >
                                                  {formatarDataCompleta(reg.date)}
                                              </Text>
                                          </View>
                                          <View style={{ alignItems: 'flex-end' }}>
                                              {reg.used ? (
                                                  <Text
                                                      style={[
                                                          styles.histPuffs,
                                                          { color: cores.text },
                                                      ]}
                                                  >
                                                      {reg.puffs} puxadas
                                                  </Text>
                                              ) : (
                                                  <Text
                                                      style={[
                                                          styles.histNone,
                                                          { color: cores.primary },
                                                      ]}
                                                  >
                                                      Não usou ✓
                                                  </Text>
                                              )}
                                              <Text
                                                  style={[
                                                      styles.histIntensity,
                                                      { color: cores.textMuted },
                                                  ]}
                                              >
                                                  {iconeDaIntensidade(
                                                      normalizarIntensidade(reg.intensity)
                                                  )}{' '}
                                                  Vontade: {normalizarIntensidade(reg.intensity)}
                                                  /10
                                              </Text>
                                          </View>
                                          <View style={styles.actionButtons}>
                                              <TouchableOpacity
                                                  style={styles.editBtn}
                                                  onPress={() => setRegistroEmEdicao({ ...reg })}
                                              >
                                                  <Ionicons
                                                      name="pencil"
                                                      size={18}
                                                      color={cores.primary}
                                                  />
                                              </TouchableOpacity>
                                              <TouchableOpacity
                                                  style={styles.deleteBtn}
                                                  onPress={() =>
                                                      setIdParaExcluirConfirmacao(reg.id)
                                                  }
                                              >
                                                  <Ionicons
                                                      name="trash-outline"
                                                      size={18}
                                                      color={cores.danger}
                                                  />
                                              </TouchableOpacity>
                                          </View>
                                      </View>
                                      {(reg.triggers?.length > 0 || reg.helps?.length > 0) && (
                                          <View style={styles.histTags}>
                                              {[...(reg.triggers || []), ...(reg.helps || [])].map(
                                                  (tag, i) => (
                                                      <View
                                                          key={i}
                                                          style={[
                                                              styles.histTag,
                                                              {
                                                                  backgroundColor:
                                                                      cores.primaryLight,
                                                              },
                                                          ]}
                                                      >
                                                          <Text
                                                              style={[
                                                                  styles.histTagText,
                                                                  { color: cores.primaryDark },
                                                              ]}
                                                          >
                                                              {tag}
                                                          </Text>
                                                      </View>
                                                  )
                                              )}
                                          </View>
                                      )}
                                      {reg.note ? (
                                          <Text
                                              style={[
                                                  styles.histNote,
                                                  { color: cores.textSecondary },
                                              ]}
                                          >
                                              “{reg.note}”
                                          </Text>
                                      ) : null}
                                  </View>
                              ))
                            : null}
                    </GradeDeCards>

                    {registrosRestantes > 0 ? (
                        <TouchableOpacity
                            style={[
                                styles.carregarMaisBtn,
                                { backgroundColor: cores.card, borderColor: cores.border },
                            ]}
                            onPress={() =>
                                setLimiteDoHistorico((atual) => atual + PAGINA_DO_HISTORICO)
                            }
                        >
                            <Text style={[styles.carregarMaisTexto, { color: cores.primary }]}>
                                Carregar mais ({Math.min(registrosRestantes, PAGINA_DO_HISTORICO)}{' '}
                                de {registrosRestantes})
                            </Text>
                        </TouchableOpacity>
                    ) : null}

                    <View style={{ height: 24 }} />
                </View>

                {/* Modal de seleção de período */}
                <Modal
                    visible={modalDePeriodoAberto}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setModalDePeriodoAberto(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: cores.modalBg }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: cores.border }]}>
                                <Text style={[styles.modalTitle, { color: cores.text }]}>
                                    Escolher período
                                </Text>
                                <TouchableOpacity onPress={() => setModalDePeriodoAberto(false)}>
                                    <Ionicons name="close" size={24} color={cores.textMuted} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.modalBody}>
                                <CalendarioMensal
                                    ano={mesDoSeletor.ano}
                                    mes={mesDoSeletor.mes}
                                    cores={cores}
                                    aoMudarMes={setMesDoSeletor}
                                    bloquearAvanco={
                                        mesDoSeletor.ano === mesDeData(dataDeHoje()).ano &&
                                        mesDoSeletor.mes === mesDeData(dataDeHoje()).mes
                                    }
                                    maximo={dataDeHoje()}
                                    estiloDoDia={estiloDoDiaNoSeletor}
                                    aoTocarDia={tocarDiaNoSeletor}
                                />

                                <Text style={[styles.periodSummary, { color: cores.text }]}>
                                    {!rascunhoDePeriodo.inicio
                                        ? 'Toque na data inicial'
                                        : !rascunhoDePeriodo.fim
                                          ? `${formatarDiaMes(rascunhoDePeriodo.inicio)} → toque na data final`
                                          : `${formatarDiaMes(rascunhoDePeriodo.inicio)} → ${formatarDiaMes(rascunhoDePeriodo.fim)}`}
                                </Text>

                                <View style={styles.periodButtons}>
                                    <TouchableOpacity
                                        style={[
                                            styles.periodClearBtn,
                                            { backgroundColor: cores.borderLight },
                                        ]}
                                        onPress={() =>
                                            setRascunhoDePeriodo({ inicio: null, fim: null })
                                        }
                                    >
                                        <Text
                                            style={[
                                                styles.periodClearText,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Limpar
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.periodApplyBtn,
                                            {
                                                backgroundColor: rascunhoDePeriodo.fim
                                                    ? cores.primary
                                                    : cores.border,
                                            },
                                        ]}
                                        disabled={!rascunhoDePeriodo.fim}
                                        onPress={aplicarPeriodo}
                                    >
                                        <Text style={styles.periodApplyText}>Aplicar</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Modal de confirmação de exclusão */}
                <Modal
                    visible={idParaExcluirConfirmacao !== null}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setIdParaExcluirConfirmacao(null)}
                >
                    <TouchableWithoutFeedback onPress={() => setIdParaExcluirConfirmacao(null)}>
                        <View style={styles.confirmOverlay}>
                            <TouchableWithoutFeedback>
                                <View
                                    style={[styles.confirmModal, { backgroundColor: cores.card }]}
                                >
                                    <Text style={[styles.confirmTitle, { color: cores.text }]}>
                                        Apagar registro?
                                    </Text>
                                    <Text
                                        style={[styles.confirmText, { color: cores.textSecondary }]}
                                    >
                                        Isso não pode ser desfeito.
                                    </Text>
                                    <View style={styles.confirmButtons}>
                                        <TouchableOpacity
                                            style={[
                                                styles.confirmCancelBtn,
                                                { backgroundColor: cores.borderLight },
                                            ]}
                                            onPress={() => setIdParaExcluirConfirmacao(null)}
                                        >
                                            <Text
                                                style={[
                                                    styles.confirmCancelText,
                                                    { color: cores.textSecondary },
                                                ]}
                                            >
                                                Cancelar
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.confirmDeleteBtn,
                                                { backgroundColor: cores.danger },
                                            ]}
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

                {/* Modal de edição */}
                <Modal
                    visible={registroEmEdicao !== null}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setRegistroEmEdicao(null)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { backgroundColor: cores.modalBg }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: cores.border }]}>
                                <Text style={[styles.modalTitle, { color: cores.text }]}>
                                    Editar registro
                                </Text>
                                <TouchableOpacity onPress={() => setRegistroEmEdicao(null)}>
                                    <Ionicons name="close" size={24} color={cores.textMuted} />
                                </TouchableOpacity>
                            </View>

                            {registroEmEdicao &&
                                (() => {
                                    const corDaIntensidade =
                                        registroEmEdicao.intensity <= 3
                                            ? cores.primary
                                            : registroEmEdicao.intensity <= 6
                                              ? cores.warning
                                              : cores.danger;
                                    return (
                                        <ScrollView style={styles.modalBody}>
                                            <Text
                                                style={[styles.fieldLabel, { color: cores.text }]}
                                            >
                                                Você usou o vape?
                                            </Text>
                                            <View style={styles.toggleRow}>
                                                {[
                                                    { val: true, rotulo: 'Sim' },
                                                    { val: false, rotulo: 'Não' },
                                                ].map(({ val, rotulo }) => (
                                                    <TouchableOpacity
                                                        key={rotulo}
                                                        style={[
                                                            styles.toggleBtn,
                                                            {
                                                                borderColor: cores.border,
                                                                backgroundColor: cores.card,
                                                            },
                                                            registroEmEdicao.used === val && {
                                                                borderColor: cores.primary,
                                                                backgroundColor: cores.primary,
                                                            },
                                                        ]}
                                                        onPress={() =>
                                                            setRegistroEmEdicao({
                                                                ...registroEmEdicao,
                                                                used: val,
                                                                puffs: val
                                                                    ? Math.max(
                                                                          1,
                                                                          registroEmEdicao.puffs ||
                                                                              0
                                                                      )
                                                                    : registroEmEdicao.puffs,
                                                            })
                                                        }
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.toggleBtnText,
                                                                { color: cores.textSecondary },
                                                                registroEmEdicao.used === val && {
                                                                    color: '#fff',
                                                                },
                                                            ]}
                                                        >
                                                            {rotulo}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>

                                            {registroEmEdicao.used && (
                                                <>
                                                    <Text
                                                        style={[
                                                            styles.fieldLabel,
                                                            { color: cores.text },
                                                        ]}
                                                    >
                                                        Quantas puxadas?
                                                    </Text>
                                                    <View style={styles.counterRow}>
                                                        <TextInput
                                                            style={[
                                                                styles.counterInput,
                                                                {
                                                                    borderColor: cores.primary,
                                                                    backgroundColor: cores.inputBg,
                                                                    color: cores.text,
                                                                },
                                                            ]}
                                                            keyboardType="number-pad"
                                                            value={String(registroEmEdicao.puffs)}
                                                            onChangeText={(texto) =>
                                                                setRegistroEmEdicao({
                                                                    ...registroEmEdicao,
                                                                    puffs: limitarPuxadas(
                                                                        texto.replace(/[^0-9]/g, '')
                                                                    ),
                                                                })
                                                            }
                                                            onBlur={() =>
                                                                setRegistroEmEdicao((r) => ({
                                                                    ...r,
                                                                    puffs: Math.max(1, r.puffs),
                                                                }))
                                                            }
                                                        />
                                                    </View>
                                                    {registroEmEdicao.puffs >= MAX_PUXADAS_DIA && (
                                                        <Text
                                                            style={[
                                                                styles.limitHint,
                                                                { color: cores.warning },
                                                            ]}
                                                        >
                                                            Máximo de {MAX_PUXADAS_DIA} puxadas por
                                                            dia.
                                                        </Text>
                                                    )}
                                                </>
                                            )}

                                            <Text
                                                style={[styles.fieldLabel, { color: cores.text }]}
                                            >
                                                Quanta vontade você sentiu?
                                            </Text>
                                            <View style={styles.sliderWrap}>
                                                <Text
                                                    style={[
                                                        styles.intensityVal,
                                                        { color: corDaIntensidade },
                                                    ]}
                                                >
                                                    {Math.round(registroEmEdicao.intensity)}
                                                </Text>
                                                <Slider
                                                    style={styles.slider}
                                                    minimumValue={0}
                                                    maximumValue={10}
                                                    step={1}
                                                    value={registroEmEdicao.intensity}
                                                    onValueChange={(val) =>
                                                        setRegistroEmEdicao({
                                                            ...registroEmEdicao,
                                                            intensity: val[0],
                                                        })
                                                    }
                                                    minimumTrackTintColor={corDaIntensidade}
                                                    maximumTrackTintColor={cores.border}
                                                    thumbTintColor={corDaIntensidade}
                                                />
                                                <View style={styles.sliderLabels}>
                                                    <Text
                                                        style={[
                                                            styles.sliderLabel,
                                                            { color: cores.textMuted },
                                                        ]}
                                                    >
                                                        Nenhuma
                                                    </Text>
                                                    <Text
                                                        style={[
                                                            styles.sliderLabel,
                                                            { color: cores.textMuted },
                                                        ]}
                                                    >
                                                        Moderada
                                                    </Text>
                                                    <Text
                                                        style={[
                                                            styles.sliderLabel,
                                                            { color: cores.textMuted },
                                                        ]}
                                                    >
                                                        Muito forte
                                                    </Text>
                                                </View>
                                            </View>

                                            {registroEmEdicao.used && (
                                                <>
                                                    <Text
                                                        style={[
                                                            styles.fieldLabel,
                                                            { color: cores.text },
                                                        ]}
                                                    >
                                                        O que te deu vontade?
                                                    </Text>
                                                    <View style={styles.chips}>
                                                        {GATILHOS.filter(
                                                            (t) => t.id !== 'outro'
                                                        ).map((t) => (
                                                            <TouchableOpacity
                                                                key={t.id}
                                                                style={[
                                                                    styles.chip,
                                                                    {
                                                                        borderColor: cores.border,
                                                                        backgroundColor: cores.card,
                                                                    },
                                                                    (
                                                                        registroEmEdicao.triggers ||
                                                                        []
                                                                    ).includes(t.rotulo) && {
                                                                        borderColor: cores.primary,
                                                                        backgroundColor:
                                                                            cores.primary,
                                                                    },
                                                                ]}
                                                                onPress={() => {
                                                                    const atual =
                                                                        registroEmEdicao.triggers ||
                                                                        [];
                                                                    setRegistroEmEdicao({
                                                                        ...registroEmEdicao,
                                                                        triggers: atual.includes(
                                                                            t.rotulo
                                                                        )
                                                                            ? atual.filter(
                                                                                  (tr) =>
                                                                                      tr !==
                                                                                      t.rotulo
                                                                              )
                                                                            : [...atual, t.rotulo],
                                                                    });
                                                                }}
                                                            >
                                                                <Text
                                                                    style={[
                                                                        styles.chipText,
                                                                        {
                                                                            color: cores.textSecondary,
                                                                        },
                                                                        (
                                                                            registroEmEdicao.triggers ||
                                                                            []
                                                                        ).includes(t.rotulo) && {
                                                                            color: '#fff',
                                                                        },
                                                                    ]}
                                                                >
                                                                    {t.emoji} {t.rotulo}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </View>
                                                </>
                                            )}

                                            {!registroEmEdicao.used && (
                                                <>
                                                    <Text
                                                        style={[
                                                            styles.fieldLabel,
                                                            { color: cores.text },
                                                        ]}
                                                    >
                                                        O que te ajudou a não usar?
                                                    </Text>
                                                    <View style={styles.chips}>
                                                        {AJUDAS.filter((h) => h.id !== 'outro').map(
                                                            (h) => (
                                                                <TouchableOpacity
                                                                    key={h.id}
                                                                    style={[
                                                                        styles.chip,
                                                                        {
                                                                            borderColor:
                                                                                cores.border,
                                                                            backgroundColor:
                                                                                cores.card,
                                                                        },
                                                                        (
                                                                            registroEmEdicao.helps ||
                                                                            []
                                                                        ).includes(h.rotulo) && {
                                                                            borderColor:
                                                                                cores.primary,
                                                                            backgroundColor:
                                                                                cores.primary,
                                                                        },
                                                                    ]}
                                                                    onPress={() => {
                                                                        const atual =
                                                                            registroEmEdicao.helps ||
                                                                            [];
                                                                        setRegistroEmEdicao({
                                                                            ...registroEmEdicao,
                                                                            helps: atual.includes(
                                                                                h.rotulo
                                                                            )
                                                                                ? atual.filter(
                                                                                      (hp) =>
                                                                                          hp !==
                                                                                          h.rotulo
                                                                                  )
                                                                                : [
                                                                                      ...atual,
                                                                                      h.rotulo,
                                                                                  ],
                                                                        });
                                                                    }}
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.chipText,
                                                                            {
                                                                                color: cores.textSecondary,
                                                                            },
                                                                            (
                                                                                registroEmEdicao.helps ||
                                                                                []
                                                                            ).includes(
                                                                                h.rotulo
                                                                            ) && {
                                                                                color: '#fff',
                                                                            },
                                                                        ]}
                                                                    >
                                                                        {h.emoji} {h.rotulo}
                                                                    </Text>
                                                                </TouchableOpacity>
                                                            )
                                                        )}
                                                    </View>
                                                </>
                                            )}

                                            <Text
                                                style={[styles.fieldLabel, { color: cores.text }]}
                                            >
                                                Anotação
                                            </Text>
                                            <TextInput
                                                style={[
                                                    styles.noteInput,
                                                    {
                                                        borderColor: cores.border,
                                                        backgroundColor: cores.inputBg,
                                                        color: cores.text,
                                                    },
                                                ]}
                                                placeholder="Como foi esse dia? (opcional)"
                                                placeholderTextColor={cores.textMuted}
                                                value={registroEmEdicao.note ?? ''}
                                                onChangeText={(texto) =>
                                                    setRegistroEmEdicao({
                                                        ...registroEmEdicao,
                                                        note: texto.slice(0, MAX_NOTA),
                                                    })
                                                }
                                                multiline
                                                maxLength={MAX_NOTA}
                                            />
                                            <Text
                                                style={[
                                                    styles.noteCount,
                                                    { color: cores.textMuted },
                                                ]}
                                            >
                                                {(registroEmEdicao.note ?? '').length}/{MAX_NOTA}
                                            </Text>

                                            <TouchableOpacity
                                                style={[
                                                    styles.saveBtn,
                                                    { backgroundColor: cores.primary },
                                                ]}
                                                onPress={salvarEdicao}
                                            >
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
    filterBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: RAIO.md,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    filterBtnText: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 8,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    tagFilterScroll: { marginTop: 12 },
    tagFilterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    activeFilterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 12,
        padding: 10,
        borderRadius: RAIO.md,
    },
    activeFilterText: { flex: 1, fontSize: 12, fontFamily: 'Poppins_500Medium' },
    clearFilterText: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textDecorationLine: 'underline',
    },
    periodSummary: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
        marginTop: 14,
    },
    periodButtons: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 },
    periodClearBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: RAIO.md },
    periodClearText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    periodApplyBtn: { flex: 2, paddingVertical: 13, alignItems: 'center', borderRadius: RAIO.md },
    periodApplyText: { fontSize: 14, fontFamily: 'Poppins_700Bold', color: '#fff' },
    card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 12,
    },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    cardSubtitle: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    chart: { borderRadius: RAIO.md },
    emptyChartWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
    emptyChart: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        paddingTop: 10,
    },
    emptySubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 4 },
    histItem: { borderRadius: RAIO.md, padding: 14, marginHorizontal: 16, marginTop: 10 },
    carregarMaisBtn: {
        borderRadius: RAIO.md,
        borderWidth: 1,
        paddingVertical: 12,
        marginHorizontal: 16,
        marginTop: 12,
        alignItems: 'center',
    },
    carregarMaisTexto: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
    histTop: { flexDirection: 'row', alignItems: 'flex-start' },
    histDate: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    histPuffs: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    histNone: { fontSize: 14, fontFamily: 'Poppins_800ExtraBold' },
    histIntensity: { fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    actionButtons: { flexDirection: 'row', gap: 8, marginLeft: 8 },
    editBtn: { padding: 4 },
    deleteBtn: { padding: 4 },
    histTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    histTag: { borderRadius: RAIO.full, paddingVertical: 3, paddingHorizontal: 10 },
    histTagText: { fontSize: 11, fontFamily: 'Poppins_500Medium' },
    histNote: { fontSize: 12, fontFamily: 'Poppins_400Regular', fontStyle: 'italic', marginTop: 8 },
    noteInput: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        minHeight: 80,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlignVertical: 'top',
    },
    noteCount: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        alignSelf: 'flex-end',
        marginTop: 4,
        marginBottom: 10,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: RAIO.xl, borderTopRightRadius: RAIO.xl, maxHeight: '80%' },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    modalBody: { padding: 16 },
    fieldLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginBottom: 10, marginTop: 6 },
    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    toggleBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: RAIO.md,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    toggleBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 18,
    },
    limitHint: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        marginTop: -10,
        marginBottom: 14,
    },
    counterInput: {
        fontSize: 40,
        fontFamily: 'Poppins_800ExtraBold',
        minWidth: 100,
        textAlign: 'center',
        borderWidth: 2,
        borderRadius: RAIO.md,
        paddingVertical: 6,
        paddingHorizontal: 16,
    },
    sliderWrap: { marginBottom: 18 },
    slider: { width: '100%', height: 40 },
    intensityVal: {
        fontSize: 36,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        marginBottom: 4,
    },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabel: { fontSize: 10, fontFamily: 'Poppins_400Regular' },
    saveBtn: {
        borderRadius: RAIO.md,
        paddingVertical: 15,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 24,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: RAIO.full, borderWidth: 1.5 },
    chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    confirmModal: { borderRadius: RAIO.lg, padding: 20, width: '80%', maxWidth: 300 },
    confirmTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    confirmText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 20,
        textAlign: 'center',
    },
    confirmButtons: { flexDirection: 'row', gap: 12 },
    confirmCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RAIO.md },
    confirmCancelText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    confirmDeleteBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RAIO.md },
    confirmDeleteText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', color: '#fff' },
});
