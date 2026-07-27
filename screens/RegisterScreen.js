// src/screens/RegisterScreen.js
import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    Animated,
} from 'react-native';
import Alert from '../utils/alert';
import { Slider } from '@miblanchard/react-native-slider';
import { Ionicons } from '@expo/vector-icons';
import {
    salvarRegistro,
    atualizarRegistro,
    obterRegistros,
    obterAparelho,
    recalcularEconomia,
    verificarEDesbloquearConquistas,
    verificarEConcluirMissoes,
    obterSessoesDeCrise,
    obterMissoes,
    atualizarXp,
    obterEconomia,
    dataDeHoje,
    datasRegistraveis,
    dataEhRegistravel,
    DIAS_PARA_TRAS_NO_REGISTRO,
} from '../utils/storage';
import { agendarNotificacoesMotivacionais } from '../utils/notifications';
import { agendarNotificacaoDeStreak } from '../utils/notifications';
import {
    RAIO, SOMBRA,
    GATILHOS, AJUDAS, MENSAGENS_MOTIVACIONAIS,
} from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';

const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarRotuloDaDataSelecionada(dataStr) {
    if (dataStr === dataDeHoje()) return 'hoje';
    const [ano, mes, dia] = dataStr.split('-');
    return `no dia ${dia}/${mes}/${ano}`;
}

// Rótulo de cada opção do seletor: "Hoje", "Ontem" ou "Sexta, 18/07".
function formatarOpcaoDeData(dataStr, hoje) {
    const [, mes, dia] = dataStr.split('-');
    if (dataStr === hoje) return `Hoje · ${dia}/${mes}`;
    const data = new Date(`${dataStr}T12:00:00`);
    const ontem = new Date(`${hoje}T12:00:00`);
    ontem.setDate(ontem.getDate() - 1);
    if (dataStr === ontem.toISOString().slice(0, 10)) return `Ontem · ${dia}/${mes}`;
    return `${NOMES_DOS_DIAS[data.getDay()]} · ${dia}/${mes}`;
}

export default function RegisterScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarRecompensas, mostrarErro } = usarToast();
    const [tipoDeAparelho, setTipoDeAparelho] = useState('desc');
    const [usou, setUsou] = useState(null);
    const [puxadas, setPuxadas] = useState(0);
    const [gatilhos, setGatilhos] = useState([]);
    const [gatilhoOutro, setGatilhoOutro] = useState('');
    const [ajudas, setAjudas] = useState([]);
    const [ajudaOutro, setAjudaOutro] = useState('');
    const [intensidade, setIntensidade] = useState(5);
    const [salvando, setSalvando] = useState(false);
    const [mensagemDeSucesso, setMensagemDeSucesso] = useState('');
    const [dataSelecionada, setDataSelecionada] = useState(dataDeHoje());
    const [mostrarSeletorDeData, setMostrarSeletorDeData] = useState(false);
    const [registroExistente, setRegistroExistente] = useState(null);

    // Só dá pra registrar hoje e os DIAS_PARA_TRAS_NO_REGISTRO dias anteriores
    // (mais recente primeiro na lista).
    const datasDisponiveis = datasRegistraveis().slice().reverse();

    React.useEffect(() => {
        const verificarRegistroExistente = async () => {
            const todosOsRegistros = await obterRegistros();
            const existente = todosOsRegistros.find((r) => r.date === dataSelecionada);
            setRegistroExistente(existente || null);
        };
        verificarRegistroExistente();
    }, [dataSelecionada]);

    const animacaoDeFade = useRef(new Animated.Value(0)).current;
    // `salvando` (state) é só pro botão; a trava contra duplo toque precisa ser
    // ref, senão o segundo toque lê o state antigo antes do re-render.
    const salvandoRef = useRef(false);

    const mostrarSucesso = (msg) => {
        setMensagemDeSucesso(msg);
        Animated.sequence([
            Animated.timing(animacaoDeFade, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(animacaoDeFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => resetarFormulario());
    };

    const resetarFormulario = () => {
        setUsou(null);
        setPuxadas(0);
        setGatilhos([]);
        setGatilhoOutro('');
        setAjudas([]);
        setAjudaOutro('');
        setIntensidade(5);
        setMensagemDeSucesso('');
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

    // Depois de gravar o registro: recalcula economia, concede conquistas e
    // missões, reagenda notificações e mostra os toasts de XP ganho.
    const concederRecompensas = async (usouVape) => {
        const [novosRegistros, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = aparelho ? await recalcularEconomia(novosRegistros, aparelho) : await obterEconomia();
        const sessoesDeCrise = await obterSessoesDeCrise();

        const novasMissoes = await verificarEConcluirMissoes(novosRegistros, economia, sessoesDeCrise);
        const missoesConcluidas = await obterMissoes();
        const novasConquistas = await verificarEDesbloquearConquistas(novosRegistros, economia, missoesConcluidas);
        const resumo = await atualizarXp(novosRegistros, null, missoesConcluidas);

        await agendarNotificacoesMotivacionais().catch((err) =>
            console.log('Erro ao reagendar notificações motivadoras:', err)
        );
        await agendarNotificacaoDeStreak().catch((err) =>
            console.log('Erro ao reagendar notificação de streak:', err)
        );

        mostrarRecompensas({
            conquistas: novasConquistas,
            missoes: novasMissoes,
            ganho: resumo.ganho,
            icone: usouVape ? '📝' : '🚭',
            titulo: usouVape ? 'Registro feito, sem culpa' : 'Dia sem cigarro eletrônico!',
        });
    };

    const salvar = async () => {
        if (usou === null) {
            Alert.alert('Opa', `Você usou o vape ${formatarRotuloDaDataSelecionada(dataSelecionada)}? Escolhe uma opção.`);
            return;
        }

        if (!dataEhRegistravel(dataSelecionada)) {
            Alert.alert(
                'Data fora do prazo',
                `Só dá pra registrar hoje ou até ${DIAS_PARA_TRAS_NO_REGISTRO} dias atrás.`
            );
            setDataSelecionada(dataDeHoje());
            return;
        }

        // A trava evita que dois toques rápidos passem os dois pela checagem de
        // registro existente e criem dois registros pro mesmo dia.
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);

        // Já existe registro nessa data: confirma antes de sobrescrever.
        let existente;
        try {
            const todosOsRegistros = await obterRegistros();
            existente = todosOsRegistros.find((r) => r.date === dataSelecionada);
        } finally {
            salvandoRef.current = false;
            setSalvando(false);
        }

        if (existente) {
            setRegistroExistente(existente);
            Alert.alert(
                'Dia já registrado',
                `Você já registrou ${formatarRotuloDaDataSelecionada(dataSelecionada)}. Salvar de novo vai sobrescrever o registro anterior.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Sobrescrever', style: 'destructive', onPress: () => salvarDeFato(existente) },
                ]
            );
            return;
        }

        salvarDeFato(null);
    };

    const salvarDeFato = async (existente) => {
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);
        try {
            const agora = new Date();
            const rotulosDeGatilhos = GATILHOS.filter((t) => gatilhos.includes(t.id)).map((t) => t.rotulo);
            if (gatilhos.includes('outro') && gatilhoOutro.trim()) {
                rotulosDeGatilhos.push(gatilhoOutro.trim());
            }
            const rotulosDeAjudas = AJUDAS.filter((h) => ajudas.includes(h.id)).map((h) => h.rotulo);
            if (ajudas.includes('outro') && ajudaOutro.trim()) {
                rotulosDeAjudas.push(ajudaOutro.trim());
            }

            if (existente) {
                const registroAtualizado = {
                    ...existente,
                    devType: tipoDeAparelho,
                    used: usou,
                    puffs: usou ? puxadas : 0,
                    triggers: rotulosDeGatilhos,
                    helps: rotulosDeAjudas,
                    intensity: intensidade,
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
                    devType: tipoDeAparelho,
                    used: usou,
                    puffs: usou ? puxadas : 0,
                    triggers: rotulosDeGatilhos,
                    helps: rotulosDeAjudas,
                    intensity: intensidade,
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

            const msg = MENSAGENS_MOTIVACIONAIS[Math.floor(Math.random() * MENSAGENS_MOTIVACIONAIS.length)];
            mostrarSucesso(msg);
        } catch (erro) {
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

    const corDaIntensidade = intensidade <= 3 ? cores.primary : intensidade <= 6 ? cores.warning : cores.danger;
    const rotuloDaDataSelecionada = formatarRotuloDaDataSelecionada(dataSelecionada);

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
                    style={[styles.dateSelector, { borderColor: cores.border, backgroundColor: cores.card }]}
                    onPress={() => setMostrarSeletorDeData(true)}
                >
                    <Ionicons name="calendar-outline" size={18} color={cores.primary} />
                    <Text style={[styles.dateSelectorText, { color: cores.text }]}>{dataSelecionada}</Text>
                    <Ionicons name="chevron-down" size={16} color={cores.textMuted} />
                </TouchableOpacity>

                <Modal
                    visible={mostrarSeletorDeData}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setMostrarSeletorDeData(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.datePickerContainer, { backgroundColor: cores.modalBg }]}>
                            <View style={[styles.datePickerHeader, { borderBottomColor: cores.border }]}>
                                <TouchableOpacity onPress={() => setMostrarSeletorDeData(false)}>
                                    <Text style={[styles.datePickerCancel, { color: cores.textMuted }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <Text style={[styles.datePickerTitle, { color: cores.text }]}>Escolher data</Text>
                                <View style={styles.datePickerSpacer} />
                            </View>
                            <Text style={[styles.pickerLabel, { color: cores.textMuted }]}>
                                Dá pra registrar hoje ou até {DIAS_PARA_TRAS_NO_REGISTRO} dias atrás
                            </Text>
                            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                {datasDisponiveis.map((data) => (
                                    <TouchableOpacity
                                        key={data}
                                        style={[styles.pickerItem, data === dataSelecionada && { backgroundColor: cores.primaryLight }]}
                                        onPress={() => selecionarData(data)}
                                    >
                                        <Text style={[styles.pickerItemText, { color: cores.text }, data === dataSelecionada && { color: cores.primaryDark, fontFamily: 'Poppins_600SemiBold' }]}>
                                            {formatarOpcaoDeData(data, dataDeHoje())}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                {/* Aviso de registro existente */}
                {registroExistente && (
                    <View style={[styles.warningBox, { backgroundColor: cores.card, borderColor: cores.warning }]}>
                        <Ionicons name="alert-circle-outline" size={20} color={cores.warning} />
                        <Text style={[styles.warningText, { color: cores.textSecondary }]}>
                            Esse dia já tem registro ({registroExistente.used ? 'usou o vape' : 'não usou'}). Salvar vai sobrescrever.
                        </Text>
                    </View>
                )}

                {/* Tipo de dispositivo */}
                <Text style={[styles.fieldLabel, { color: cores.text }]}>Qual dispositivo você usa</Text>
                <View style={styles.toggleRow}>
                    {['desc', 'rec'].map((val) => (
                        <TouchableOpacity
                            key={val}
                            style={[styles.toggleBtn, { borderColor: cores.border, backgroundColor: cores.card }, tipoDeAparelho === val && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                            onPress={() => setTipoDeAparelho(val)}
                        >
                            <Text style={[styles.toggleBtnText, { color: cores.textSecondary }, tipoDeAparelho === val && { color: '#fff' }]}>
                                {val === 'desc' ? 'Descartável' : 'Recarregável'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Usou hoje? */}
                <Text style={[styles.fieldLabel, { color: cores.text }]}>Você usou o vape {rotuloDaDataSelecionada}?</Text>
                <View style={styles.toggleRow}>
                    {[{ val: true, rotulo: 'Sim' }, { val: false, rotulo: 'Não' }].map(({ val, rotulo }) => (
                        <TouchableOpacity
                            key={rotulo}
                            style={[styles.toggleBtn, { borderColor: cores.border, backgroundColor: cores.card }, usou === val && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                            onPress={() => {
                                setUsou(val);
                                // Usou = pelo menos 1 puxada.
                                if (val) setPuxadas((p) => Math.max(1, p));
                            }}
                        >
                            <Text style={[styles.toggleBtnText, { color: cores.textSecondary }, usou === val && { color: '#fff' }]}>{rotulo}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Se usou = true */}
                {usou === true && (
                    <>
                        <Text style={[styles.fieldLabel, { color: cores.text }]}>Quantas puxadas?</Text>
                        <View style={styles.counterRow}>
                            <TextInput
                                style={[styles.counterInput, { borderColor: cores.primary, backgroundColor: cores.inputBg, color: cores.text }]}
                                keyboardType="number-pad"
                                value={String(puxadas)}
                                onChangeText={(texto) => {
                                    const numero = parseInt(texto.replace(/[^0-9]/g, ''), 10);
                                    setPuxadas(Number.isNaN(numero) ? 0 : numero);
                                }}
                                onBlur={() => setPuxadas((p) => Math.max(1, p))}
                            />
                        </View>

                        <Text style={[styles.fieldLabel, { color: cores.text }]}>O que te deu vontade?</Text>
                        <View style={styles.chips}>
                            {GATILHOS.map((t) => (
                                <TouchableOpacity
                                    key={t.id}
                                    style={[styles.chip, { borderColor: cores.border, backgroundColor: cores.card }, gatilhos.includes(t.id) && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                                    onPress={() => alternarGatilho(t.id)}
                                >
                                    <Text style={[styles.chipText, { color: cores.textSecondary }, gatilhos.includes(t.id) && { color: '#fff' }]}>
                                        {t.emoji} {t.rotulo}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {gatilhos.includes('outro') && (
                            <TextInput
                                style={[styles.input, { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text }]}
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
                        <Text style={[styles.fieldLabel, { color: cores.text }]}>O que te ajudou a não usar?</Text>
                        <View style={styles.chips}>
                            {AJUDAS.map((h) => (
                                <TouchableOpacity
                                    key={h.id}
                                    style={[styles.chip, { borderColor: cores.border, backgroundColor: cores.card }, ajudas.includes(h.id) && { borderColor: cores.primary, backgroundColor: cores.primary }]}
                                    onPress={() => alternarAjuda(h.id)}
                                >
                                    <Text style={[styles.chipText, { color: cores.textSecondary }, ajudas.includes(h.id) && { color: '#fff' }]}>
                                        {h.emoji} {h.rotulo}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {ajudas.includes('outro') && (
                            <TextInput
                                style={[styles.input, { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text }]}
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
                        <Text style={[styles.fieldLabel, { color: cores.text }]}>Quanta vontade você sentiu?</Text>
                        <View style={styles.sliderWrap}>
                            <Text style={[styles.intensityVal, { color: corDaIntensidade }]}>{Math.round(intensidade)}</Text>
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
                                <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Nenhuma</Text>
                                <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Moderada</Text>
                                <Text style={[styles.sliderLabel, { color: cores.textMuted }]}>Muito forte</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Botão salvar */}
                <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: cores.primary }, salvando && styles.saveBtnDisabled]}
                    onPress={salvar}
                    disabled={salvando}
                >
                    <Ionicons name={salvando ? 'hourglass-outline' : 'checkmark-circle-outline'} size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>{salvando ? 'Salvando...' : 'Salvar'}</Text>
                </TouchableOpacity>

                {/* Mensagem de sucesso */}
                {mensagemDeSucesso !== '' && (
                    <Animated.View style={[styles.successBox, { backgroundColor: cores.primaryLight, borderColor: cores.primary, opacity: animacaoDeFade }]}>
                        <Ionicons name="checkmark-circle" size={22} color={cores.primary} />
                        <Text style={[styles.successText, { color: cores.primaryDark }]}>{mensagemDeSucesso}</Text>
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: RAIO.full,
        borderWidth: 1.5,
    },
    chipText: { fontSize: 13, fontFamily: 'Poppins_500Medium' },
    input: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        fontSize: 14, fontFamily: 'Poppins_400Regular',
        marginBottom: 14,
    },
    sliderWrap: { marginBottom: 18 },
    slider: { width: '100%', height: 40 },
    intensityVal: { fontSize: 36, fontFamily: 'Poppins_800ExtraBold', textAlign: 'center', marginBottom: 4 },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabel: { fontSize: 10 , fontFamily: 'Poppins_400Regular'},
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
    datePickerCancel: { fontSize: 16 , fontFamily: 'Poppins_400Regular'},
    datePickerSpacer: { width: 60 },
    pickerLabel: { fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginTop: 12, marginBottom: 8, paddingHorizontal: 16 },
    pickerScroll: { maxHeight: 300, paddingHorizontal: 16 },
    pickerItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: RAIO.sm },
    pickerItemText: { fontSize: 16 , fontFamily: 'Poppins_400Regular'},
});
