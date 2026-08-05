import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    Animated,
    AppState,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Alert from '../utils/alert';
import { Slider } from '@miblanchard/react-native-slider';
import { Ionicons } from '@expo/vector-icons';
import {
    salvarRegistro,
    atualizarRegistro,
    obterRegistros,
    obterAparelho,
    obterDispositivos,
    arquivarDispositivo,
    recalcularEconomia,
    sincronizarGamificacao,
    obterEconomia,
    dataDeHoje,
    datasRegistraveis,
    dataEhRegistravel,
    DIAS_PARA_TRAS_NO_REGISTRO,
} from '../utils/storage';
import { aplicarPreferenciasDeNotificacao } from '../utils/notifications';
import { deslocarData, converterDataLocal } from '../utils/datas';
import {
    MAX_NOTA,
    limitarPuxadas,
    normalizarNota,
    tetoDePuxadasDoDispositivo,
} from '../utils/records';
import {
    dispositivosAtivos,
    dispositivoPorId,
    dispositivoPadrao,
    consumoPorDispositivo,
    estadoDoDispositivo,
} from '../utils/aparelhos';
import { RAIO, SOMBRA, GATILHOS, AJUDAS, MENSAGENS_MOTIVACIONAIS } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';

const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarRotuloDaDataSelecionada(dataStr, hoje) {
    if (dataStr === hoje) return 'hoje';
    const [ano, mes, dia] = dataStr.split('-');
    return `no dia ${dia}/${mes}/${ano}`;
}

// Milissegundos até o próximo 00:00:01 local — usado pra reavaliar o "hoje"
// com o app aberto na virada do dia.
function msAteAViradaDoDia() {
    const agora = new Date();
    const proximaMeiaNoite = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        agora.getDate() + 1,
        0,
        0,
        1
    );
    return proximaMeiaNoite.getTime() - agora.getTime();
}

// Rótulo de cada opção do seletor: "Hoje", "Ontem" ou "Sexta, 18/07".
function formatarOpcaoDeData(dataStr, hoje) {
    const [, mes, dia] = dataStr.split('-');
    if (dataStr === hoje) return `Hoje · ${dia}/${mes}`;
    if (dataStr === deslocarData(hoje, -1)) return `Ontem · ${dia}/${mes}`;
    return `${NOMES_DOS_DIAS[converterDataLocal(dataStr).getDay()]} · ${dia}/${mes}`;
}

// O registro guarda rótulos (`triggers`/`helps`), não ids. Pra repovoar os chips
// ao abrir um dia já registrado, volta rótulo -> id; o que não bate com nenhuma
// opção é o texto livre do chip "Outro".
function reconstruirSelecao(opcoes, rotulosSalvos) {
    const ids = [];
    let textoOutro = '';
    for (const rotulo of rotulosSalvos ?? []) {
        const opcao = opcoes.find((o) => o.rotulo === rotulo);
        if (opcao) {
            if (!ids.includes(opcao.id)) ids.push(opcao.id);
        } else if (!textoOutro) {
            textoOutro = rotulo;
            if (!ids.includes('outro')) ids.push('outro');
        }
    }
    return { ids, textoOutro };
}

export default function RegisterScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarRecompensas, mostrarErro } = usarToast();
    const [usou, setUsou] = useState(null);
    const [puxadas, setPuxadas] = useState(0);
    const [gatilhos, setGatilhos] = useState([]);
    const [gatilhoOutro, setGatilhoOutro] = useState('');
    const [ajudas, setAjudas] = useState([]);
    const [ajudaOutro, setAjudaOutro] = useState('');
    const [intensidade, setIntensidade] = useState(5);
    const [nota, setNota] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [mensagemDeSucesso, setMensagemDeSucesso] = useState('');
    const [dataSelecionada, setDataSelecionada] = useState(dataDeHoje());
    const [mostrarSeletorDeData, setMostrarSeletorDeData] = useState(false);
    const [registroExistente, setRegistroExistente] = useState(null);
    const [dispositivos, setDispositivos] = useState([]);
    const [dispositivoId, setDispositivoId] = useState(null);
    // O usuário trocou o dispositivo à mão neste formulário? Enquanto não
    // trocou, a seleção acompanha o padrão da lista de dispositivos.
    const escolhaManualRef = useRef(false);
    // O dia atual vira state porque o app pode ficar aberto passando da
    // meia-noite: sem reavaliar, "Hoje" continuaria apontando pro dia anterior
    // e o salvamento morreria em "Data fora do prazo".
    const [hoje, setHoje] = useState(dataDeHoje());
    const hojeRef = useRef(hoje);

    const sincronizarDiaAtual = useCallback(() => {
        const atual = dataDeHoje();
        if (atual === hojeRef.current) return;
        const anterior = hojeRef.current;
        hojeRef.current = atual;
        setHoje(atual);
        // Quem estava no "Hoje" antigo acompanha a virada; quem estava num dia
        // que saiu da janela de registro também é puxado pro dia novo.
        setDataSelecionada((selecionada) =>
            selecionada === anterior || !dataEhRegistravel(selecionada) ? atual : selecionada
        );
    }, []);

    // Reavalia ao focar a tela, ao voltar do background e na própria virada do
    // dia (o timer cobre o caso do app ficar parado nesta tela).
    useFocusEffect(
        useCallback(() => {
            let temporizador;
            const agendarViradaDoDia = () => {
                temporizador = setTimeout(() => {
                    sincronizarDiaAtual();
                    agendarViradaDoDia();
                }, msAteAViradaDoDia());
            };

            sincronizarDiaAtual();
            agendarViradaDoDia();
            const inscricao = AppState.addEventListener('change', (estado) => {
                if (estado === 'active') sincronizarDiaAtual();
            });

            return () => {
                clearTimeout(temporizador);
                inscricao.remove();
            };
        }, [sincronizarDiaAtual])
    );

    // A lista recarrega a cada foco porque o usuário pode ter acabado de
    // cadastrar um dispositivo no DeviceForm e voltado pra cá.
    useFocusEffect(
        useCallback(() => {
            let montado = true;
            obterDispositivos().then((lista) => {
                if (!montado) return;
                setDispositivos(lista);
                const ativos = dispositivosAtivos(lista);
                const padrao = dispositivoPadrao(lista)?.id ?? null;
                // Vem marcado o dispositivo PADRÃO (o que o usuário definiu na
                // lista). Escolha manual dele neste formulário ganha do padrão —
                // menos quando o escolhido saiu de circulação. Sem escolha
                // manual, voltar pra cá depois de trocar o padrão já mostra o
                // padrão novo.
                setDispositivoId((atual) =>
                    escolhaManualRef.current && ativos.some((d) => d.id === atual) ? atual : padrao
                );
            });
            return () => {
                montado = false;
            };
        }, [])
    );

    // Só dá pra registrar hoje e os DIAS_PARA_TRAS_NO_REGISTRO dias anteriores
    // (mais recente primeiro na lista). Recalculado a cada render — `hoje`
    // mudar de valor é o que garante que a lista acompanhe a virada.
    const datasDisponiveis = datasRegistraveis().slice().reverse();

    React.useEffect(() => {
        let montado = true;
        const verificarRegistroExistente = async () => {
            const todosOsRegistros = await obterRegistros();
            if (!montado) return;
            const existente = todosOsRegistros.find((r) => r.date === dataSelecionada);
            setRegistroExistente(existente || null);
            // Salvar sobrescreve o registro do dia inteiro, então o formulário
            // volta preenchido com o que já estava salvo — senão "Sobrescrever"
            // gravaria campos vazios por cima, em silêncio.
            if (existente) {
                const gatilhosSalvos = reconstruirSelecao(GATILHOS, existente.triggers);
                const ajudasSalvas = reconstruirSelecao(AJUDAS, existente.helps);
                setUsou(existente.used ?? null);
                setPuxadas(existente.puffs ?? 0);
                setGatilhos(gatilhosSalvos.ids);
                setGatilhoOutro(gatilhosSalvos.textoOutro);
                setAjudas(ajudasSalvas.ids);
                setAjudaOutro(ajudasSalvas.textoOutro);
                setIntensidade(existente.intensity ?? 5);
                setNota(existente.note ?? '');
                // Registro antigo (sem dispositivo escolhido) mantém o padrão
                // já selecionado — trocar pra null tiraria a opção marcada.
                if (existente.deviceId) {
                    setDispositivoId(Number(existente.deviceId));
                    escolhaManualRef.current = true;
                }
            } else {
                setUsou(null);
                setPuxadas(0);
                setGatilhos([]);
                setGatilhoOutro('');
                setAjudas([]);
                setAjudaOutro('');
                setIntensidade(5);
                setNota('');
                // Dia em branco volta a seguir o padrão da lista.
                escolhaManualRef.current = false;
                const lista = await obterDispositivos();
                if (!montado) return;
                setDispositivoId(dispositivoPadrao(lista)?.id ?? null);
            }
        };
        verificarRegistroExistente();
        return () => {
            montado = false;
        };
    }, [dataSelecionada]);

    const animacaoDeFade = useRef(new Animated.Value(0)).current;
    // `salvando` (state) é só pro botão; a trava contra duplo toque precisa ser
    // ref, senão o segundo toque lê o state antigo antes do re-render.
    const salvandoRef = useRef(false);
    // A animação de sucesso só termina ~2,6s depois de salvar: se a tela sair
    // antes disso, o callback ainda rodaria e faria setState fora da árvore.
    const estaMontadoRef = useRef(true);

    React.useEffect(() => {
        estaMontadoRef.current = true;
        return () => {
            estaMontadoRef.current = false;
            animacaoDeFade.stopAnimation();
        };
    }, [animacaoDeFade]);

    const mostrarSucesso = (msg) => {
        setMensagemDeSucesso(msg);
        Animated.sequence([
            Animated.timing(animacaoDeFade, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(animacaoDeFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
            if (!estaMontadoRef.current) return;
            resetarFormulario();
        });
    };

    const resetarFormulario = () => {
        setUsou(null);
        setPuxadas(0);
        setGatilhos([]);
        setGatilhoOutro('');
        setAjudas([]);
        setAjudaOutro('');
        setIntensidade(5);
        setNota('');
        setMensagemDeSucesso('');
        // Formulário zerado volta a seguir o padrão da lista.
        escolhaManualRef.current = false;
    };

    const alternarGatilho = (id) => {
        setGatilhos((anterior) =>
            anterior.includes(id) ? anterior.filter((t) => t !== id) : [...anterior, id]
        );
    };

    const alternarAjuda = (id) => {
        setAjudas((anterior) =>
            anterior.includes(id) ? anterior.filter((h) => h !== id) : [...anterior, id]
        );
    };

    const dispositivoSelecionado = dispositivoPorId(dispositivos, dispositivoId);
    const tetoDoDia = tetoDePuxadasDoDispositivo(dispositivoSelecionado);

    // Depois de salvar: o dispositivo já passou do que ele rende? Isso não
    // bloqueia nada (o registro já está gravado) — só pergunta o que fazer,
    // porque ou o vape acabou, ou o total declarado nele está errado.
    const avisarSeEsgotou = async (idUsado) => {
        if (!idUsado) return;
        const [registros, lista] = await Promise.all([obterRegistros(), obterDispositivos()]);
        const dispositivo = dispositivoPorId(lista, idUsado);
        if (!dispositivo || dispositivo.archived) return;
        const estado = estadoDoDispositivo(
            dispositivo,
            consumoPorDispositivo(registros)[dispositivo.id] ?? 0
        );
        if (!estado.esgotado) return;

        Alert.alert(
            'Esse dispositivo já rendeu tudo',
            `Você já registrou ${estado.usadas} puxadas no "${dispositivo.name || 'seu vape'}", e ele foi cadastrado com ${estado.total}. Ele acabou?`,
            [
                {
                    text: 'Acabou, vou cadastrar outro',
                    onPress: async () => {
                        await arquivarDispositivo(dispositivo.id, true);
                        const lista = await obterDispositivos();
                        setDispositivos(lista);
                        navigation.navigate('DeviceForm');
                    },
                },
                {
                    text: 'Ele rende mais que isso',
                    onPress: () => navigation.navigate('DeviceForm', { id: dispositivo.id }),
                },
                { text: 'Deixa assim', style: 'cancel' },
            ]
        );
    };

    // Depois de gravar o registro: recalcula economia, concede conquistas e
    // missões, reagenda notificações e mostra os toasts de XP ganho.
    const concederRecompensas = async (usouVape) => {
        const [novosRegistros, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = aparelho
            ? await recalcularEconomia(novosRegistros, aparelho)
            : await obterEconomia();

        const { recompensas } = await sincronizarGamificacao({
            registros: novosRegistros,
            economia,
        });

        // Reagenda com o conteúdo novo (dica sorteada, streak atual), sempre
        // respeitando o liga/desliga e o horário das Configurações.
        await aplicarPreferenciasDeNotificacao().catch((err) =>
            console.log('Erro ao reagendar as notificações:', err)
        );

        mostrarRecompensas({
            ...recompensas,
            icone: usouVape ? '📝' : '🚭',
            titulo: usouVape ? 'Registro feito, sem culpa' : 'Dia sem cigarro eletrônico!',
        });
    };

    const salvar = async () => {
        if (usou === null) {
            Alert.alert(
                'Opa',
                `Você usou o vape ${formatarRotuloDaDataSelecionada(dataSelecionada, hoje)}? Escolhe uma opção.`
            );
            return;
        }

        // O dia pode ter virado com a tela aberta. Se a virada mexeu no que
        // está selecionado, para aqui: o usuário confirma o dia novo antes de
        // gravar, em vez de salvar num dia que não é mais o que ele viu.
        if (dataDeHoje() !== hojeRef.current) {
            const selecionadaEraHoje = dataSelecionada === hojeRef.current;
            sincronizarDiaAtual();
            if (selecionadaEraHoje || !dataEhRegistravel(dataSelecionada)) {
                Alert.alert(
                    'O dia virou',
                    'Passou da meia-noite enquanto você preenchia. Confere a data e salva de novo.'
                );
                return;
            }
        }

        if (!dataEhRegistravel(dataSelecionada)) {
            Alert.alert(
                'Data fora do prazo',
                `Só dá pra registrar hoje ou até ${DIAS_PARA_TRAS_NO_REGISTRO} dias atrás.`
            );
            setDataSelecionada(hojeRef.current);
            return;
        }

        // A trava evita que dois toques rápidos passem os dois pela checagem de
        // registro existente e criem dois registros pro mesmo dia. Ela só é
        // solta no finally do salvarDeFato (ou aqui, se a gente parar antes) —
        // largar antes de chamar salvarDeFato reabriria a janela da corrida.
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);

        // Já existe registro nessa data: confirma antes de sobrescrever.
        let existente;
        try {
            const todosOsRegistros = await obterRegistros();
            existente = todosOsRegistros.find((r) => r.date === dataSelecionada);
        } catch {
            salvandoRef.current = false;
            setSalvando(false);
            Alert.alert('Erro', 'Não deu pra salvar o registro. Tenta de novo.');
            return;
        }

        if (existente) {
            // Confirmação depende do usuário: solta a trava e deixa o botão do
            // Alert repegar ela em salvarComTrava.
            salvandoRef.current = false;
            setSalvando(false);
            setRegistroExistente(existente);
            Alert.alert(
                'Dia já registrado',
                `Você já registrou ${formatarRotuloDaDataSelecionada(dataSelecionada, hoje)}. Salvar de novo vai sobrescrever o registro anterior.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Sobrescrever',
                        style: 'destructive',
                        onPress: () => salvarComTrava(existente),
                    },
                ]
            );
            return;
        }

        await salvarDeFato(null);
    };

    // Entrada pro caminho que não vem do salvar() — pega a trava antes.
    const salvarComTrava = async (existente) => {
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);
        await salvarDeFato(existente);
    };

    // Pressupõe salvandoRef.current === true; é ele quem solta a trava no finally.
    const salvarDeFato = async (existente) => {
        try {
            const agora = new Date();
            // Usou = pelo menos 1 puxada. O onBlur do campo não roda se o
            // usuário digitar e tocar direto em Salvar, então normaliza aqui.
            // O teto é o do dispositivo escolhido: nenhum dia pode passar do
            // que o vape inteiro rende.
            const puxadasFinais = usou ? Math.max(1, limitarPuxadas(puxadas, tetoDoDia)) : 0;
            const idDoDispositivo = usou ? (dispositivoId ?? null) : null;
            if (usou && puxadasFinais !== puxadas) setPuxadas(puxadasFinais);
            const rotulosDeGatilhos = GATILHOS.filter((t) => gatilhos.includes(t.id)).map(
                (t) => t.rotulo
            );
            if (gatilhos.includes('outro') && gatilhoOutro.trim()) {
                rotulosDeGatilhos.push(gatilhoOutro.trim());
            }
            const rotulosDeAjudas = AJUDAS.filter((h) => ajudas.includes(h.id)).map(
                (h) => h.rotulo
            );
            if (ajudas.includes('outro') && ajudaOutro.trim()) {
                rotulosDeAjudas.push(ajudaOutro.trim());
            }

            if (existente) {
                const registroAtualizado = {
                    ...existente,
                    used: usou,
                    puffs: puxadasFinais,
                    deviceId: idDoDispositivo,
                    triggers: rotulosDeGatilhos,
                    helps: rotulosDeAjudas,
                    intensity: intensidade,
                    note: normalizarNota(nota),
                    time: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                };
                const resultado = await atualizarRegistro(registroAtualizado);
                if (!resultado.ok) {
                    mostrarErro('Não deu pra salvar', 'Verifique sua conexão e tente de novo.');
                    return;
                }
                await concederRecompensas(usou);
                setRegistroExistente(registroAtualizado);
            } else {
                const registro = {
                    id: Date.now(),
                    date: dataSelecionada,
                    time: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    used: usou,
                    puffs: puxadasFinais,
                    deviceId: idDoDispositivo,
                    triggers: rotulosDeGatilhos,
                    helps: rotulosDeAjudas,
                    intensity: intensidade,
                    note: normalizarNota(nota),
                };
                const resultado = await salvarRegistro(registro);
                if (!resultado.ok) {
                    mostrarErro(
                        'Não deu pra salvar',
                        resultado.motivo === 'data_invalida'
                            ? `Só dá pra registrar hoje ou até ${DIAS_PARA_TRAS_NO_REGISTRO} dias atrás.`
                            : 'Verifique sua conexão e tente de novo.'
                    );
                    return;
                }
                await concederRecompensas(usou);
                setRegistroExistente(registro);
            }

            const msg =
                MENSAGENS_MOTIVACIONAIS[Math.floor(Math.random() * MENSAGENS_MOTIVACIONAIS.length)];
            mostrarSucesso(msg);
            // Depois do sucesso, nunca antes: o aviso pergunta o que fazer com
            // o vape que acabou, mas o registro do dia já está salvo.
            await avisarSeEsgotou(idDoDispositivo);
        } catch {
            Alert.alert('Erro', 'Não deu pra salvar o registro. Tenta de novo.');
        } finally {
            salvandoRef.current = false;
            setSalvando(false);
        }
    };

    const selecionarData = (dataStr) => {
        setDataSelecionada(dataStr);
        setMostrarSeletorDeData(false);
    };

    const corDaIntensidade =
        intensidade <= 3 ? cores.primary : intensidade <= 6 ? cores.warning : cores.danger;
    const rotuloDaDataSelecionada = formatarRotuloDaDataSelecionada(dataSelecionada, hoje);

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <ScreenHeader
                    titulo="Como foi seu dia?"
                    subtitulo={`Como foi ${rotuloDaDataSelecionada}?`}
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                />

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                    {/* Seletor de data */}
                    <Text style={[styles.fieldLabel, { color: cores.text }]}>Data</Text>
                    <TouchableOpacity
                        style={[
                            styles.dateSelector,
                            { borderColor: cores.border, backgroundColor: cores.card },
                        ]}
                        onPress={() => setMostrarSeletorDeData(true)}
                    >
                        <Ionicons name="calendar-outline" size={18} color={cores.primary} />
                        <Text style={[styles.dateSelectorText, { color: cores.text }]}>
                            {dataSelecionada}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color={cores.textMuted} />
                    </TouchableOpacity>

                    <Modal
                        visible={mostrarSeletorDeData}
                        transparent
                        animationType="slide"
                        onRequestClose={() => setMostrarSeletorDeData(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View
                                style={[
                                    styles.datePickerContainer,
                                    { backgroundColor: cores.modalBg },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.datePickerHeader,
                                        { borderBottomColor: cores.border },
                                    ]}
                                >
                                    <TouchableOpacity
                                        onPress={() => setMostrarSeletorDeData(false)}
                                    >
                                        <Text
                                            style={[
                                                styles.datePickerCancel,
                                                { color: cores.textMuted },
                                            ]}
                                        >
                                            Cancelar
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={[styles.datePickerTitle, { color: cores.text }]}>
                                        Escolher data
                                    </Text>
                                    <View style={styles.datePickerSpacer} />
                                </View>
                                <Text style={[styles.pickerLabel, { color: cores.textMuted }]}>
                                    Dá pra registrar hoje ou até {DIAS_PARA_TRAS_NO_REGISTRO} dias
                                    atrás
                                </Text>
                                <ScrollView
                                    style={styles.pickerScroll}
                                    showsVerticalScrollIndicator={false}
                                >
                                    {datasDisponiveis.map((data) => (
                                        <TouchableOpacity
                                            key={data}
                                            style={[
                                                styles.pickerItem,
                                                data === dataSelecionada && {
                                                    backgroundColor: cores.primaryLight,
                                                },
                                            ]}
                                            onPress={() => selecionarData(data)}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerItemText,
                                                    { color: cores.text },
                                                    data === dataSelecionada && {
                                                        color: cores.primaryDark,
                                                        fontFamily: 'Poppins_600SemiBold',
                                                    },
                                                ]}
                                            >
                                                {formatarOpcaoDeData(data, hoje)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>

                    {/* Aviso de registro existente */}
                    {registroExistente && (
                        <View
                            style={[
                                styles.warningBox,
                                { backgroundColor: cores.card, borderColor: cores.warning },
                            ]}
                        >
                            <Ionicons name="alert-circle-outline" size={20} color={cores.warning} />
                            <Text style={[styles.warningText, { color: cores.textSecondary }]}>
                                Esse dia já tem registro (
                                {registroExistente.used ? 'usou o vape' : 'não usou'}). Salvar vai
                                sobrescrever.
                            </Text>
                        </View>
                    )}

                    {/* Usou hoje? */}
                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Você usou o vape {rotuloDaDataSelecionada}?
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
                                    { borderColor: cores.border, backgroundColor: cores.card },
                                    usou === val && {
                                        borderColor: cores.primary,
                                        backgroundColor: cores.primary,
                                    },
                                ]}
                                onPress={() => {
                                    setUsou(val);
                                    // Usou = pelo menos 1 puxada.
                                    if (val) setPuxadas((p) => Math.max(1, p));
                                }}
                            >
                                <Text
                                    style={[
                                        styles.toggleBtnText,
                                        { color: cores.textSecondary },
                                        usou === val && { color: '#fff' },
                                    ]}
                                >
                                    {rotulo}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Se usou = true */}
                    {usou === true && (
                        <>
                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
                                Qual dispositivo você usou?
                            </Text>
                            {dispositivosAtivos(dispositivos).length === 0 ? (
                                <TouchableOpacity
                                    style={[
                                        styles.deviceEmpty,
                                        { borderColor: cores.border, backgroundColor: cores.card },
                                    ]}
                                    onPress={() => navigation.navigate('DeviceForm')}
                                >
                                    <Ionicons
                                        name="add-circle-outline"
                                        size={18}
                                        color={cores.primary}
                                    />
                                    <Text
                                        style={[styles.deviceEmptyText, { color: cores.primary }]}
                                    >
                                        Cadastrar um dispositivo
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.chips}>
                                    {dispositivosAtivos(dispositivos).map((d) => (
                                        <TouchableOpacity
                                            key={d.id}
                                            style={[
                                                styles.chip,
                                                {
                                                    borderColor: cores.border,
                                                    backgroundColor: cores.card,
                                                },
                                                dispositivoId === d.id && {
                                                    borderColor: cores.primary,
                                                    backgroundColor: cores.primary,
                                                },
                                            ]}
                                            onPress={() => {
                                                escolhaManualRef.current = true;
                                                setDispositivoId(d.id);
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.chipText,
                                                    { color: cores.textSecondary },
                                                    dispositivoId === d.id && { color: '#fff' },
                                                ]}
                                            >
                                                {d.name || 'Sem nome'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
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
                                    value={String(puxadas)}
                                    onChangeText={(texto) =>
                                        setPuxadas(
                                            limitarPuxadas(texto.replace(/[^0-9]/g, ''), tetoDoDia)
                                        )
                                    }
                                    onBlur={() => setPuxadas((p) => Math.max(1, p))}
                                />
                            </View>
                            {puxadas >= tetoDoDia && (
                                <Text style={[styles.limitHint, { color: cores.warning }]}>
                                    {dispositivoSelecionado
                                        ? `Esse dispositivo rende ${tetoDoDia} puxadas no total.`
                                        : `Máximo de ${tetoDoDia} puxadas por dia.`}
                                </Text>
                            )}

                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
                                O que te deu vontade?
                            </Text>
                            <View style={styles.chips}>
                                {GATILHOS.map((t) => (
                                    <TouchableOpacity
                                        key={t.id}
                                        style={[
                                            styles.chip,
                                            {
                                                borderColor: cores.border,
                                                backgroundColor: cores.card,
                                            },
                                            gatilhos.includes(t.id) && {
                                                borderColor: cores.primary,
                                                backgroundColor: cores.primary,
                                            },
                                        ]}
                                        onPress={() => alternarGatilho(t.id)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                { color: cores.textSecondary },
                                                gatilhos.includes(t.id) && { color: '#fff' },
                                            ]}
                                        >
                                            {t.emoji} {t.rotulo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {gatilhos.includes('outro') && (
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            borderColor: cores.border,
                                            backgroundColor: cores.inputBg,
                                            color: cores.text,
                                        },
                                    ]}
                                    placeholder="Conta o que rolou..."
                                    placeholderTextColor={cores.textMuted}
                                    value={gatilhoOutro}
                                    onChangeText={setGatilhoOutro}
                                />
                            )}
                        </>
                    )}

                    {/* Se usou = false */}
                    {usou === false && (
                        <>
                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
                                O que te ajudou a não usar?
                            </Text>
                            <View style={styles.chips}>
                                {AJUDAS.map((h) => (
                                    <TouchableOpacity
                                        key={h.id}
                                        style={[
                                            styles.chip,
                                            {
                                                borderColor: cores.border,
                                                backgroundColor: cores.card,
                                            },
                                            ajudas.includes(h.id) && {
                                                borderColor: cores.primary,
                                                backgroundColor: cores.primary,
                                            },
                                        ]}
                                        onPress={() => alternarAjuda(h.id)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                { color: cores.textSecondary },
                                                ajudas.includes(h.id) && { color: '#fff' },
                                            ]}
                                        >
                                            {h.emoji} {h.rotulo}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {ajudas.includes('outro') && (
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            borderColor: cores.border,
                                            backgroundColor: cores.inputBg,
                                            color: cores.text,
                                        },
                                    ]}
                                    placeholder="O que te ajudou?"
                                    placeholderTextColor={cores.textMuted}
                                    value={ajudaOutro}
                                    onChangeText={setAjudaOutro}
                                />
                            )}
                        </>
                    )}

                    {/* Slider de intensidade */}
                    {usou !== null && (
                        <>
                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
                                Quanta vontade você sentiu?
                            </Text>
                            <View style={styles.sliderWrap}>
                                <Text style={[styles.intensityVal, { color: corDaIntensidade }]}>
                                    {Math.round(intensidade)}
                                </Text>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0}
                                    maximumValue={10}
                                    step={1}
                                    value={intensidade}
                                    onValueChange={(val) => setIntensidade(val[0])}
                                    minimumTrackTintColor={corDaIntensidade}
                                    maximumTrackTintColor={cores.border}
                                    thumbTintColor={corDaIntensidade}
                                />
                                <View style={styles.sliderLabels}>
                                    <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>
                                        Nenhuma
                                    </Text>
                                    <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>
                                        Moderada
                                    </Text>
                                    <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>
                                        Muito forte
                                    </Text>
                                </View>
                            </View>

                            <Text style={[styles.fieldLabel, { color: cores.text }]}>
                                Quer anotar alguma coisa?
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
                                placeholder="Como foi o dia, o que passou pela cabeça... (opcional)"
                                placeholderTextColor={cores.textMuted}
                                value={nota}
                                onChangeText={(texto) => setNota(texto.slice(0, MAX_NOTA))}
                                multiline
                                maxLength={MAX_NOTA}
                            />
                            <Text style={[styles.noteCount, { color: cores.textMuted }]}>
                                {nota.length}/{MAX_NOTA}
                            </Text>
                        </>
                    )}

                    {/* Botão salvar */}
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
                            name={salvando ? 'hourglass-outline' : 'checkmark-circle-outline'}
                            size={20}
                            color="#fff"
                        />
                        <Text style={styles.saveBtnText}>
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </Text>
                    </TouchableOpacity>

                    {/* Mensagem de sucesso */}
                    {mensagemDeSucesso !== '' && (
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
                                {mensagemDeSucesso}
                            </Text>
                        </Animated.View>
                    )}
                </View>

                <View style={{ height: 24 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        borderRadius: RAIO.lg,
        padding: 18,
        marginHorizontal: 16,
        marginTop: 16,
    },
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
    limitHint: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        marginTop: -10,
        marginBottom: 14,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: RAIO.full,
        borderWidth: 1.5,
    },
    chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
    deviceEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 12,
        marginBottom: 12,
    },
    deviceEmptyText: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    input: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 14,
    },
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Poppins_700Bold' },
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
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        marginBottom: 16,
    },
    warningText: { fontSize: 13, fontFamily: 'Poppins_500Medium', flex: 1 },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: RAIO.md,
        borderWidth: 1.5,
        marginBottom: 18,
    },
    dateSelectorText: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    datePickerContainer: {
        borderTopLeftRadius: RAIO.xl,
        borderTopRightRadius: RAIO.xl,
        paddingBottom: 30,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    datePickerTitle: { fontSize: 18, fontFamily: 'Poppins_700Bold' },
    datePickerCancel: { fontSize: 16, fontFamily: 'Poppins_400Regular' },
    datePickerSpacer: { width: 60 },
    pickerLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: 12,
        marginBottom: 8,
        paddingHorizontal: 16,
    },
    pickerScroll: { maxHeight: 300, paddingHorizontal: 16 },
    pickerItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: RAIO.sm },
    pickerItemText: { fontSize: 16, fontFamily: 'Poppins_400Regular' },
});
