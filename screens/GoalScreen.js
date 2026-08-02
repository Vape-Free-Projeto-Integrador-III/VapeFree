//
// As duas metas do app, uma em cada card:
//
//   1. Meta de REDUÇÃO ("quero cair pra X puxadas/dia até tal data"): rampa
//      linear entre o ponto de partida e o alvo (ver utils/meta.js) — quem usa
//      100 por dia não recebe "sua meta é 10" já no primeiro dia. É uma
//      restrição, e vira o limite diário do app inteiro.
//   2. Meta de DINHEIRO ("quero juntar R$ X"): alvo pro que já ficou no bolso
//      (ver utils/metaDeDinheiro.js). É uma recompensa, não tem prazo, e não
//      mexe em limite nenhum — por isso salvá-la não recalcula a economia.
//
// São dados separados de propósito: mexer numa não mexe na outra.
//
// Mesmo formato da DeviceScreen: ScreenHeader + card, escrita por
// salvarMeta()/salvarMetaDeDinheiro() (utils/storage.js) com checagem de `ok`
// antes de dar sucesso.

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Animated,
    Modal,
} from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import {
    obterMeta,
    salvarMeta,
    obterMetaDeDinheiro,
    salvarMetaDeDinheiro,
    obterAparelho,
    obterEconomia,
    obterRegistros,
    recalcularEconomia,
    sincronizarGamificacao,
    dataDeHoje,
} from '../utils/storage';
import { metaDiaria } from '../utils/records';
import {
    metaDoDia,
    metaValida,
    mediaDiariaNasDatas,
    janelaDeDias,
    deslocarData,
    diferencaEmDias,
} from '../utils/meta';
import { progressoDaMetaDeDinheiro } from '../utils/metaDeDinheiro';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import CalendarioMensal from '../components/CalendarioMensal';
import { mesDeData, formatarDataCompleta } from '../utils/calendario';

export const PRAZOS = [30, 60, 90];

// Sugestão de ponto de partida: média real dos últimos 7 dias; sem registros,
// o consumo que o aparelho declara.
export function baselineSugerido(registros, aparelho, hoje) {
    const media = mediaDiariaNasDatas(registros, janelaDeDias(hoje, 7));
    if (media !== null && media > 0) return Math.round(media);
    const doAparelho = metaDiaria(aparelho);
    return doAparelho === null ? null : Math.round(doAparelho);
}

export function formatarData(dataStr) {
    const [ano, mes, dia] = dataStr.split('-');
    return `${dia}/${mes}/${ano}`;
}

export default function GoalScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarErro, mostrarRecompensas } = usarToast();
    const [baseline, setBaseline] = useState('');
    const [alvo, setAlvo] = useState('');
    const [prazo, setPrazo] = useState(60);
    // Início da rampa: null enquanto a meta é nova (aí vale hoje). Editar uma
    // meta existente mantém o startDate salvo — recriá-lo zeraria o progresso
    // da rampa e mudaria a data final sem o usuário pedir.
    const [inicio, setInicio] = useState(null);
    const [temMetaSalva, setTemMetaSalva] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [sucessoVisivel, setSucessoVisivel] = useState(false);
    // Seletor de data final no calendário: alternativa aos chips de prazo. O
    // prazo continua sendo a fonte única (em dias) — a data escolhida vira
    // diferença em dias contando do início da rampa.
    const [modalDeDataAberto, setModalDeDataAberto] = useState(false);
    const [mesDoSeletor, setMesDoSeletor] = useState(() => mesDeData(dataDeHoje()));
    const animacaoDeFade = useState(new Animated.Value(0))[0];

    // Meta de dinheiro: estado próprio e independente do da meta de redução —
    // as duas se salvam e se removem separadamente.
    const [valorDaMeta, setValorDaMeta] = useState('');
    const [rotuloDaMeta, setRotuloDaMeta] = useState('');
    const [temMetaDeDinheiroSalva, setTemMetaDeDinheiroSalva] = useState(false);
    const [salvandoDinheiro, setSalvandoDinheiro] = useState(false);
    const [sucessoDeDinheiroVisivel, setSucessoDeDinheiroVisivel] = useState(false);
    // A prévia da meta de dinheiro precisa do que já está no bolso.
    const [economia, setEconomia] = useState({});
    const animacaoDeFadeDoDinheiro = useState(new Animated.Value(0))[0];

    useEffect(() => {
        let montado = true;
        Promise.all([obterMetaDeDinheiro(), obterEconomia()]).then(
            ([metaDeDinheiro, economiaSalva]) => {
                if (!montado) return;
                setEconomia(economiaSalva || {});
                if (metaDeDinheiro && Number(metaDeDinheiro.amount) > 0) {
                    setTemMetaDeDinheiroSalva(true);
                    setValorDaMeta(String(Math.round(Number(metaDeDinheiro.amount))));
                    setRotuloDaMeta(metaDeDinheiro.label || '');
                }
            }
        );
        return () => {
            montado = false;
        };
    }, []);

    useEffect(() => {
        let montado = true;
        Promise.all([obterMeta(), obterRegistros(), obterAparelho()]).then(
            ([meta, registros, aparelho]) => {
                if (!montado) return;
                if (metaValida(meta)) {
                    setTemMetaSalva(true);
                    setBaseline(String(meta.baseline));
                    setAlvo(String(meta.target));
                    // Rampa já vencida vira rampa nova: manter o startDate
                    // antigo deixaria o limite colado no alvo desde o dia 1.
                    const vencida = diferencaEmDias(dataDeHoje(), meta.endDate) <= 0;
                    if (!vencida) setInicio(meta.startDate);
                    setPrazo(diferencaEmDias(meta.startDate, meta.endDate));
                    return;
                }
                const sugerido = baselineSugerido(registros, aparelho, dataDeHoje());
                if (sugerido !== null) setBaseline(String(sugerido));
            }
        );
        return () => {
            montado = false;
        };
    }, []);

    const aoDigitarInteiro = (setter) => (texto) => {
        setter(texto.replace(/[^0-9]/g, ''));
    };

    const mostrarSucesso = () => {
        setSucessoVisivel(true);
        Animated.sequence([
            Animated.timing(animacaoDeFade, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(animacaoDeFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setSucessoVisivel(false));
    };

    const mostrarSucessoDoDinheiro = () => {
        setSucessoDeDinheiroVisivel(true);
        Animated.sequence([
            Animated.timing(animacaoDeFadeDoDinheiro, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.delay(2000),
            Animated.timing(animacaoDeFadeDoDinheiro, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start(() => setSucessoDeDinheiroVisivel(false));
    };

    const salvarDinheiro = async () => {
        const alvo = parseInt(valorDaMeta);
        if (isNaN(alvo) || alvo <= 0) {
            Alert.alert('Opa', 'Quanto você quer juntar? Coloca um valor maior que zero.');
            return;
        }

        setSalvandoDinheiro(true);
        const resultado = await salvarMetaDeDinheiro({
            amount: alvo,
            label: rotuloDaMeta.trim(),
            createdAt: new Date().toISOString(),
        });
        setSalvandoDinheiro(false);
        if (!resultado.ok) {
            mostrarErro(
                'Não deu pra salvar a meta de dinheiro',
                'Verifique sua conexão e tente de novo.'
            );
            return;
        }
        // Sem recalcularEconomia nem sincronizarGamificacao: a meta de dinheiro
        // não é limite de puxadas, não muda nenhum número já calculado.
        setTemMetaDeDinheiroSalva(true);
        mostrarSucessoDoDinheiro();
    };

    const removerDinheiro = () => {
        Alert.alert(
            'Remover meta de dinheiro',
            'Sua economia continua contando — você só deixa de ter um alvo.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Remover',
                    style: 'destructive',
                    onPress: async () => {
                        setSalvandoDinheiro(true);
                        const resultado = await salvarMetaDeDinheiro(null);
                        setSalvandoDinheiro(false);
                        if (!resultado.ok) {
                            mostrarErro(
                                'Não deu pra remover a meta de dinheiro',
                                'Verifique sua conexão e tente de novo.'
                            );
                            return;
                        }
                        setTemMetaDeDinheiroSalva(false);
                        setValorDaMeta('');
                        setRotuloDaMeta('');
                    },
                },
            ]
        );
    };

    // Meta "em rascunho", só pra prévia.
    const metaDoFormulario = () => {
        const partida = inicio || dataDeHoje();
        return {
            baseline: parseInt(baseline),
            target: parseInt(alvo),
            startDate: partida,
            endDate: deslocarData(partida, prazo),
        };
    };

    // Data final mínima: amanhã. Antes disso a rampa nasceria vencida — é a
    // mesma regra que `salvar` checa com diferencaEmDias(hoje, endDate) > 0.
    const dataFinalMinima = deslocarData(dataDeHoje(), 1);

    const abrirSeletorDeData = () => {
        // Meta antiga com prazo curto pode ter fim no passado — aí abre já no
        // mês da primeira data escolhível, não num mês todo apagado.
        const fim = metaDoFormulario().endDate;
        setMesDoSeletor(mesDeData(fim < dataFinalMinima ? dataFinalMinima : fim));
        setModalDeDataAberto(true);
    };

    const escolherDataFinal = (dataStr) => {
        const partida = inicio || dataDeHoje();
        setPrazo(diferencaEmDias(partida, dataStr));
        setModalDeDataAberto(false);
    };

    const salvar = async () => {
        const b = parseInt(baseline);
        const a = parseInt(alvo);
        if (isNaN(b) || b <= 0) {
            Alert.alert('Opa', 'Quantas puxadas por dia você dá hoje?');
            return;
        }
        if (isNaN(a) || a < 0) {
            Alert.alert('Opa', 'Coloca um alvo válido (pode ser 0).');
            return;
        }
        if (a >= b) {
            Alert.alert('Opa', 'O alvo precisa ser menor do que o seu consumo de hoje.');
            return;
        }

        const meta = metaDoFormulario();
        // Editar uma meta em andamento com prazo curto pode jogar o fim antes
        // de hoje — aí a rampa nasceria vencida.
        if (diferencaEmDias(dataDeHoje(), meta.endDate) <= 0) {
            Alert.alert(
                'Opa',
                'Esse prazo termina antes de hoje, contando da data em que sua meta começou. Escolha um prazo maior.'
            );
            return;
        }

        setSalvando(true);
        const resultado = await salvarMeta(meta);
        if (!resultado.ok) {
            setSalvando(false);
            mostrarErro('Não deu pra salvar a meta', 'Verifique sua conexão e tente de novo.');
            return;
        }
        // A meta passa a valer como limite do dia, então a economia inteira é
        // recalculada. Definir meta também pode concluir missão de meta na
        // hora, se o dia de hoje já estiver registrado abaixo dela.
        const [registros, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = await recalcularEconomia(registros, aparelho, meta);
        const { recompensas } = await sincronizarGamificacao({
            registros,
            economia,
            meta,
            aparelho,
        });
        setSalvando(false);
        setTemMetaSalva(true);
        setInicio(meta.startDate);
        mostrarSucesso();
        mostrarRecompensas(recompensas);
    };

    const remover = () => {
        Alert.alert('Remover minha meta', 'Seu limite diário volta a ser o consumo do aparelho.', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Remover',
                style: 'destructive',
                onPress: async () => {
                    setSalvando(true);
                    const resultado = await salvarMeta(null);
                    if (!resultado.ok) {
                        setSalvando(false);
                        mostrarErro(
                            'Não deu pra remover a meta',
                            'Verifique sua conexão e tente de novo.'
                        );
                        return;
                    }
                    // Sem meta o limite volta a ser o do aparelho, então a
                    // economia (e o que depende dela) precisa acompanhar.
                    const [registros, aparelho] = await Promise.all([
                        obterRegistros(),
                        obterAparelho(),
                    ]);
                    const economia = await recalcularEconomia(registros, aparelho, null);
                    const { recompensas } = await sincronizarGamificacao({
                        registros,
                        economia,
                        meta: null,
                        aparelho,
                    });
                    setSalvando(false);
                    mostrarRecompensas(recompensas);
                    setTemMetaSalva(false);
                    setAlvo('');
                    setInicio(null);
                    navigation.goBack();
                },
            },
        ]);
    };

    const rascunho = metaDoFormulario();
    const metaDeHoje = metaDoDia(rascunho, dataDeHoje());
    // Meta salva com prazo fora da lista padrão ainda precisa de chip próprio,
    // senão editar o alvo trocaria o prazo em silêncio.
    const prazosVisiveis = PRAZOS.includes(prazo)
        ? PRAZOS
        : [...PRAZOS, prazo].sort((x, y) => x - y);
    const estiloDoInput = [
        styles.input,
        { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text },
    ];
    const previaDoDinheiro = progressoDaMetaDeDinheiro(
        { amount: parseInt(valorDaMeta), label: rotuloDaMeta },
        economia,
        dataDeHoje()
    );

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <ScreenHeader
                    titulo="Suas Metas"
                    subtitulo="Até onde você quer chegar e o que quer conquistar"
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                    <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                        🎯 Meta de redução
                    </Text>

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Quantas puxadas por dia hoje
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 100"
                        placeholderTextColor={cores.textMuted}
                        value={baseline}
                        onChangeText={aoDigitarInteiro(setBaseline)}
                        keyboardType="number-pad"
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Quer chegar a quantas por dia
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 10"
                        placeholderTextColor={cores.textMuted}
                        value={alvo}
                        onChangeText={aoDigitarInteiro(setAlvo)}
                        keyboardType="number-pad"
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>Em quanto tempo</Text>
                    <View style={styles.chipRow}>
                        {prazosVisiveis.map((dias) => {
                            const ativo = dias === prazo;
                            return (
                                <TouchableOpacity
                                    key={dias}
                                    style={[
                                        styles.chip,
                                        {
                                            backgroundColor: ativo ? cores.primary : cores.inputBg,
                                            borderColor: ativo ? cores.primary : cores.border,
                                        },
                                    ]}
                                    onPress={() => setPrazo(dias)}
                                >
                                    <Text
                                        style={[
                                            styles.chipText,
                                            { color: ativo ? '#fff' : cores.textSecondary },
                                        ]}
                                    >
                                        {dias} dias
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.dateBtn,
                            { borderColor: cores.border, backgroundColor: cores.inputBg },
                        ]}
                        onPress={abrirSeletorDeData}
                    >
                        <Ionicons name="calendar-outline" size={18} color={cores.primary} />
                        <Text style={[styles.dateBtnLabel, { color: cores.textSecondary }]}>
                            Terminar em
                        </Text>
                        <Text style={[styles.dateBtnValue, { color: cores.text }]}>
                            {formatarData(rascunho.endDate)}
                        </Text>
                    </TouchableOpacity>

                    {metaDeHoje !== null && (
                        <View style={[styles.previewBox, { backgroundColor: cores.primaryLight }]}>
                            <Text style={[styles.previewTitle, { color: cores.primaryDark }]}>
                                Prévia
                            </Text>
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    Seu limite de hoje
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    {Math.round(metaDeHoje)} puxadas
                                </Text>
                            </View>
                            {inicio !== null && (
                                <View style={styles.previewRow}>
                                    <Text
                                        style={[
                                            styles.previewLabel,
                                            { color: cores.textSecondary },
                                        ]}
                                    >
                                        Começou em
                                    </Text>
                                    <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                        {formatarData(inicio)}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    Chega no alvo em
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    {formatarData(rascunho.endDate)}
                                </Text>
                            </View>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.saveBtn,
                            { backgroundColor: cores.primary },
                            salvando && styles.saveBtnDisabled,
                        ]}
                        onPress={salvar}
                        disabled={salvando}
                    >
                        <Ionicons
                            name={salvando ? 'hourglass-outline' : 'flag-outline'}
                            size={20}
                            color="#fff"
                        />
                        <Text style={styles.saveBtnText}>
                            {salvando ? 'Salvando...' : 'Salvar minha meta'}
                        </Text>
                    </TouchableOpacity>

                    {temMetaSalva && (
                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={remover}
                            disabled={salvando}
                        >
                            <Text style={[styles.removeBtnText, { color: cores.danger }]}>
                                Remover minha meta
                            </Text>
                        </TouchableOpacity>
                    )}

                    {sucessoVisivel && (
                        <Animated.View
                            style={[
                                styles.successBox,
                                {
                                    backgroundColor: cores.primaryLight,
                                    borderColor: cores.primary,
                                    opacity: animacaoDeFade,
                                },
                            ]}
                        >
                            <Ionicons name="checkmark-circle" size={22} color={cores.primary} />
                            <Text style={[styles.successText, { color: cores.primaryDark }]}>
                                {inicio === null || inicio === dataDeHoje()
                                    ? 'Meta salva! Ela já vale a partir de hoje. ✅'
                                    : `Meta salva! Sua rampa continua contando desde ${formatarData(inicio)}. ✅`}
                            </Text>
                        </Animated.View>
                    )}
                </View>

                {/* Meta de dinheiro — irmã da de cima, salva e removida à parte */}
                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                    <Text style={[styles.cardTitle, { color: cores.textMuted }]}>
                        💰 Meta de dinheiro
                    </Text>

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Quanto você quer juntar
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 400"
                        placeholderTextColor={cores.textMuted}
                        value={valorDaMeta}
                        onChangeText={aoDigitarInteiro(setValorDaMeta)}
                        keyboardType="number-pad"
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Pra quê (opcional)
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: um fone novo"
                        placeholderTextColor={cores.textMuted}
                        value={rotuloDaMeta}
                        onChangeText={setRotuloDaMeta}
                        maxLength={40}
                    />

                    {previaDoDinheiro !== null && (
                        <View style={[styles.previewBox, { backgroundColor: cores.primaryLight }]}>
                            <Text style={[styles.previewTitle, { color: cores.primaryDark }]}>
                                Prévia
                            </Text>
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    Já no bolso
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    R$ {previaDoDinheiro.acumulado.toFixed(2)}
                                </Text>
                            </View>
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    {previaDoDinheiro.concluida ? 'Situação' : 'Falta'}
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    {previaDoDinheiro.concluida
                                        ? 'Já alcançada! 🎉'
                                        : `R$ ${previaDoDinheiro.faltando.toFixed(2)}`}
                                </Text>
                            </View>
                            {!previaDoDinheiro.concluida && (
                                <View style={styles.previewRow}>
                                    <Text
                                        style={[
                                            styles.previewLabel,
                                            { color: cores.textSecondary },
                                        ]}
                                    >
                                        No seu ritmo
                                    </Text>
                                    <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                        {previaDoDinheiro.diasEstimados === null
                                            ? 'sem estimativa ainda'
                                            : `~${previaDoDinheiro.diasEstimados} ${
                                                  previaDoDinheiro.diasEstimados === 1
                                                      ? 'dia'
                                                      : 'dias'
                                              }`}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    <TouchableOpacity
                        style={[
                            styles.saveBtn,
                            { backgroundColor: cores.primary },
                            salvandoDinheiro && styles.saveBtnDisabled,
                        ]}
                        onPress={salvarDinheiro}
                        disabled={salvandoDinheiro}
                    >
                        <Ionicons
                            name={salvandoDinheiro ? 'hourglass-outline' : 'wallet-outline'}
                            size={20}
                            color="#fff"
                        />
                        <Text style={styles.saveBtnText}>
                            {salvandoDinheiro ? 'Salvando...' : 'Salvar meta de dinheiro'}
                        </Text>
                    </TouchableOpacity>

                    {temMetaDeDinheiroSalva && (
                        <TouchableOpacity
                            style={styles.removeBtn}
                            onPress={removerDinheiro}
                            disabled={salvandoDinheiro}
                        >
                            <Text style={[styles.removeBtnText, { color: cores.danger }]}>
                                Remover minha meta de dinheiro
                            </Text>
                        </TouchableOpacity>
                    )}

                    {sucessoDeDinheiroVisivel && (
                        <Animated.View
                            style={[
                                styles.successBox,
                                {
                                    backgroundColor: cores.primaryLight,
                                    borderColor: cores.primary,
                                    opacity: animacaoDeFadeDoDinheiro,
                                },
                            ]}
                        >
                            <Ionicons name="checkmark-circle" size={22} color={cores.primary} />
                            <Text style={[styles.successText, { color: cores.primaryDark }]}>
                                Meta de dinheiro salva! Acompanhe na tela inicial. ✅
                            </Text>
                        </Animated.View>
                    )}
                </View>

                <View style={[styles.infoBox, { backgroundColor: cores.primaryLight }]}>
                    <Ionicons name="information-circle-outline" size={18} color={cores.primary} />
                    <Text style={[styles.infoText, { color: cores.primaryDark }]}>
                        Seu limite de puxadas desce um pouco a cada dia até o alvo, em vez de cair
                        de uma vez — é o que torna a redução possível. Enquanto essa meta existir, é
                        ela que vale no lugar do consumo do aparelho. A meta de dinheiro é
                        independente: não tem prazo e não muda seu limite, só dá um destino pro que
                        você já economizou.
                    </Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Data final no calendário — alternativa aos chips de 30/60/90 dias */}
            <Modal
                visible={modalDeDataAberto}
                transparent
                animationType="slide"
                onRequestClose={() => setModalDeDataAberto(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: cores.modalBg }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: cores.border }]}>
                            <Text style={[styles.modalTitle, { color: cores.text }]}>
                                Data final da meta
                            </Text>
                            <TouchableOpacity onPress={() => setModalDeDataAberto(false)}>
                                <Ionicons name="close" size={24} color={cores.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            <CalendarioMensal
                                ano={mesDoSeletor.ano}
                                mes={mesDoSeletor.mes}
                                cores={cores}
                                aoMudarMes={setMesDoSeletor}
                                bloquearVolta={
                                    mesDoSeletor.ano === mesDeData(dataFinalMinima).ano &&
                                    mesDoSeletor.mes === mesDeData(dataFinalMinima).mes
                                }
                                minimo={dataFinalMinima}
                                estiloDoDia={(dataStr) =>
                                    dataStr === rascunho.endDate
                                        ? { fundo: cores.primary, corDoTexto: '#fff' }
                                        : {}
                                }
                                aoTocarDia={escolherDataFinal}
                            />

                            <Text style={[styles.modalHint, { color: cores.textSecondary }]}>
                                Chega no alvo em {formatarDataCompleta(rascunho.endDate)} — {prazo}{' '}
                                {prazo === 1 ? 'dia' : 'dias'} de rampa.
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: { borderRadius: RAIO.lg, padding: 18, marginHorizontal: 16, marginTop: 16 },
    cardTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 14,
    },
    fieldLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginBottom: 8, marginTop: 4 },
    input: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 14,
    },
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    chip: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 12,
        alignItems: 'center',
    },
    chipText: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    dateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 16,
    },
    dateBtnLabel: { fontSize: 14, fontFamily: 'Poppins_400Regular', flex: 1 },
    dateBtnValue: { fontSize: 14, fontFamily: 'Poppins_700Bold' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: {
        borderTopLeftRadius: RAIO.lg,
        borderTopRightRadius: RAIO.lg,
        paddingBottom: 24,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 18,
        borderBottomWidth: 1,
    },
    modalTitle: { fontSize: 17, fontFamily: 'Poppins_700Bold' },
    modalBody: { padding: 18 },
    modalHint: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        marginTop: 14,
        lineHeight: 18,
    },
    previewBox: { borderRadius: RAIO.md, padding: 14, marginBottom: 16 },
    previewTitle: {
        fontSize: 12,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
    },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    previewLabel: { fontSize: 13, fontFamily: 'Poppins_400Regular' },
    previewVal: { fontSize: 13, fontFamily: 'Poppins_700Bold' },
    saveBtn: {
        borderRadius: RAIO.md,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
    removeBtn: { alignItems: 'center', paddingVertical: 14 },
    removeBtnText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    successBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 14,
        marginTop: 12,
    },
    successText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold', flex: 1 },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: RAIO.md,
        padding: 14,
    },
    infoText: { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 18 },
});
