import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Animated,
} from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import {
    obterAparelho,
    salvarAparelho,
    obterRegistros,
    obterHistoricoDeAparelhos,
    obterEconomia,
    recalcularEconomia,
    sincronizarGamificacao,
} from '../utils/storage';
import { custoPorPuxada, metaDiaria, resumoDeAparelhos } from '../utils/records';
import { deslocarData } from '../utils/datas';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';

export default function DeviceScreen({ navigation }) {
    const { cores } = usarTema();
    const { mostrarErro, mostrarRecompensas } = usarToast();
    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('');
    const [totalDePuxadas, setTotalDePuxadas] = useState('');
    const [dias, setDias] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [sucessoVisivel, setSucessoVisivel] = useState(false);
    const [resumo, setResumo] = useState([]);
    const animacaoDeFade = useState(new Animated.Value(0))[0];

    // Carrega o formulário uma vez só: recarregar no foco apagaria o que o
    // usuário já digitou e não salvou.
    useEffect(() => {
        obterAparelho().then((a) => {
            if (a) {
                setNome(a.name || '');
                setPreco(a.price?.toString() || '');
                setTotalDePuxadas(a.totalPuffs?.toString() || '');
                setDias(a.days?.toString() || '');
            }
        });
    }, []);

    const carregarResumo = useCallback(async () => {
        const [historico, registros, economia] = await Promise.all([
            obterHistoricoDeAparelhos(),
            obterRegistros(),
            obterEconomia(),
        ]);
        setResumo(resumoDeAparelhos(historico, registros, economia));
    }, []);

    useFocusEffect(
        useCallback(() => {
            carregarResumo();
        }, [carregarResumo])
    );

    const aoDigitarPreco = (texto) => {
        const limpo = texto.replace(/[^0-9,.]/g, '');
        const partes = limpo.split(/[,.]/);
        const normalizado = partes.length > 1 ? `${partes[0]},${partes.slice(1).join('')}` : limpo;
        setPreco(normalizado);
    };

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

    const salvar = async () => {
        if (!nome.trim()) {
            Alert.alert('Opa', 'Coloca o nome do seu dispositivo.');
            return;
        }
        const p = parseFloat(preco.replace(',', '.'));
        const tp = parseInt(totalDePuxadas);
        const d = parseInt(dias);
        if (isNaN(p) || p <= 0) {
            Alert.alert('Opa', 'Coloca um preço válido.');
            return;
        }
        if (isNaN(tp) || tp <= 0) {
            Alert.alert('Opa', 'Quantas puxadas ele tem no total?');
            return;
        }
        if (isNaN(d) || d <= 0) {
            Alert.alert('Opa', 'Quantos dias ele costuma durar?');
            return;
        }
        setSalvando(true);
        const aparelho = { name: nome.trim(), price: p, totalPuffs: tp, days: d };
        const resultado = await salvarAparelho(aparelho);
        if (!resultado.ok) {
            setSalvando(false);
            mostrarErro('Não deu pra salvar o aparelho', 'Verifique sua conexão e tente de novo.');
            return;
        }
        // A economia é recalculada, mas o aparelho novo só vale de hoje em
        // diante: os dias já registrados continuam precificados pelo aparelho
        // que valia neles (ver utils/aparelhos.js). Ainda assim conquistas e
        // missões são resincronizadas, porque o dia de hoje muda de preço.
        const todosRegistros = await obterRegistros();
        const economia = await recalcularEconomia(todosRegistros, aparelho);
        const { recompensas } = await sincronizarGamificacao({
            registros: todosRegistros,
            economia,
        });
        setSalvando(false);
        await carregarResumo();
        mostrarSucesso();
        mostrarRecompensas(recompensas);
    };

    // 'YYYY-MM-DD' → 'DD/MM/AAAA'. O fim do período vem exclusivo (é o dia em
    // que o aparelho seguinte entrou), então mostra-se o dia anterior a ele.
    const formatarDia = (data) => {
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    };

    const textoDoPeriodo = ({ de, ate }) => {
        const inicio = de === null ? 'desde sempre' : `de ${formatarDia(de)}`;
        const fim = ate === null ? 'até hoje' : `até ${formatarDia(deslocarData(ate, -1))}`;
        return `${inicio} ${fim}`;
    };

    // Aparelho "em rascunho", só pra prévia — os helpers puros fazem as contas.
    const aparelhoDoFormulario = () => ({
        price: parseFloat(preco.replace(',', '.')),
        totalPuffs: parseInt(totalDePuxadas),
        days: parseInt(dias),
    });

    const textoDoCustoPorPuxada = () => {
        const custo = custoPorPuxada(aparelhoDoFormulario());
        return custo === null ? '—' : `R$ ${custo.toFixed(4)}`;
    };

    const textoDaMetaDiaria = () => {
        const meta = metaDiaria(aparelhoDoFormulario());
        return meta === null ? '—' : `${Math.round(meta)} puxadas/dia`;
    };

    const estiloDoInput = [
        styles.input,
        { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text },
    ];

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <ScreenHeader
                    titulo="Seu Dispositivo"
                    subtitulo="Conta pra gente como ele é"
                    cores={cores}
                    mostrarConfiguracoes
                    aoPressionarConfiguracoes={() => navigation.navigate('Settings')}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                    <Text style={[styles.fieldLabel, { color: cores.text }]}>Nome / Modelo</Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: Vape Pod – Mint"
                        placeholderTextColor={cores.textMuted}
                        value={nome}
                        onChangeText={setNome}
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>Preço (R$)</Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 39.90"
                        placeholderTextColor={cores.textMuted}
                        value={preco}
                        onChangeText={aoDigitarPreco}
                        keyboardType="decimal-pad"
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Quantas puxadas ele dá no total
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 600"
                        placeholderTextColor={cores.textMuted}
                        value={totalDePuxadas}
                        onChangeText={aoDigitarInteiro(setTotalDePuxadas)}
                        keyboardType="number-pad"
                    />

                    <Text style={[styles.fieldLabel, { color: cores.text }]}>
                        Quantos dias ele costuma durar
                    </Text>
                    <TextInput
                        style={estiloDoInput}
                        placeholder="Ex: 14"
                        placeholderTextColor={cores.textMuted}
                        value={dias}
                        onChangeText={aoDigitarInteiro(setDias)}
                        keyboardType="number-pad"
                    />

                    {(preco || totalDePuxadas || dias) && (
                        <View style={[styles.previewBox, { backgroundColor: cores.primaryLight }]}>
                            <Text style={[styles.previewTitle, { color: cores.primaryDark }]}>
                                Prévia
                            </Text>
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    Custo por puxada
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    {textoDoCustoPorPuxada()}
                                </Text>
                            </View>
                            <View style={styles.previewRow}>
                                <Text style={[styles.previewLabel, { color: cores.textSecondary }]}>
                                    Sua meta por dia
                                </Text>
                                <Text style={[styles.previewVal, { color: cores.primaryDark }]}>
                                    {textoDaMetaDiaria()}
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
                            name={salvando ? 'hourglass-outline' : 'save-outline'}
                            size={20}
                            color="#fff"
                        />
                        <Text style={styles.saveBtnText}>
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </Text>
                    </TouchableOpacity>

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
                                Salvo! Já atualizamos suas contas. ✅
                            </Text>
                        </Animated.View>
                    )}
                </View>

                {resumo.length > 0 && (
                    <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
                        <Text style={[styles.cardTitle, { color: cores.text }]}>
                            Seus aparelhos
                        </Text>
                        <Text style={[styles.cardSubtitle, { color: cores.textSecondary }]}>
                            Cada um pelo preço que ele tinha na época
                        </Text>

                        {[...resumo].reverse().map((item, indice) => (
                            <View
                                key={`${item.aparelho.name}-${item.de ?? 'inicio'}`}
                                style={[
                                    styles.deviceRow,
                                    { borderTopColor: cores.border },
                                    indice === 0 && styles.deviceRowFirst,
                                ]}
                            >
                                <View style={styles.deviceHead}>
                                    <Text
                                        style={[styles.deviceName, { color: cores.text }]}
                                        numberOfLines={1}
                                    >
                                        {item.aparelho.name || 'Sem nome'}
                                    </Text>
                                    {item.ate === null && (
                                        <View
                                            style={[
                                                styles.badge,
                                                { backgroundColor: cores.primaryLight },
                                            ]}
                                        >
                                            <Text
                                                style={[styles.badgeText, { color: cores.primary }]}
                                            >
                                                atual
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <Text style={[styles.devicePeriod, { color: cores.textMuted }]}>
                                    {textoDoPeriodo(item)}
                                </Text>
                                <View style={styles.deviceStats}>
                                    <View style={styles.deviceStat}>
                                        <Text
                                            style={[
                                                styles.deviceStatLabel,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Custou
                                        </Text>
                                        <Text
                                            style={[styles.deviceStatVal, { color: cores.danger }]}
                                        >
                                            R$ {item.gasto.toFixed(2)}
                                        </Text>
                                    </View>
                                    <View style={styles.deviceStat}>
                                        <Text
                                            style={[
                                                styles.deviceStatLabel,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Economizou
                                        </Text>
                                        <Text
                                            style={[styles.deviceStatVal, { color: cores.primary }]}
                                        >
                                            R$ {item.economizado.toFixed(2)}
                                        </Text>
                                    </View>
                                    <View style={styles.deviceStat}>
                                        <Text
                                            style={[
                                                styles.deviceStatLabel,
                                                { color: cores.textSecondary },
                                            ]}
                                        >
                                            Puxadas
                                        </Text>
                                        <Text style={[styles.deviceStatVal, { color: cores.text }]}>
                                            {item.puxadas} em {item.dias}d
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={[styles.infoBox, { backgroundColor: cores.primaryLight }]}>
                    <Ionicons name="information-circle-outline" size={18} color={cores.primary} />
                    <Text style={[styles.infoText, { color: cores.primaryDark }]}>
                        Com esses dados a gente calcula quanto você economiza cada vez que resiste
                        ao vape. Trocou de aparelho? O preço novo vale de hoje em diante — os dias
                        já registrados continuam valendo pelo aparelho anterior.
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
    card: { borderRadius: RAIO.lg, padding: 18, marginHorizontal: 16, marginTop: 16 },
    fieldLabel: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginBottom: 8, marginTop: 4 },
    input: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 14,
    },
    cardTitle: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    cardSubtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    deviceRow: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
    deviceRowFirst: { marginTop: 14 },
    deviceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    deviceName: { flex: 1, fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
    badge: { borderRadius: RAIO.sm, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    devicePeriod: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 2 },
    deviceStats: { flexDirection: 'row', marginTop: 10, gap: 12 },
    deviceStat: { flex: 1 },
    deviceStatLabel: { fontSize: 11, fontFamily: 'Poppins_400Regular' },
    deviceStatVal: { fontSize: 14, fontFamily: 'Poppins_700Bold', marginTop: 2 },
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
