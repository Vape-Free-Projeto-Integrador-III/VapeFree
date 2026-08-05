import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import {
    obterDispositivos,
    salvarDispositivo,
    obterRegistros,
    obterAparelho,
    recalcularEconomia,
    sincronizarGamificacao,
} from '../utils/storage';
import { custoPorPuxada, metaDiaria } from '../utils/records';
import { RAIO, SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import ScreenHeader from '../components/ScreenHeader';

// Cadastro e edição de um dispositivo. `route.params.id` presente = edição.
//
// Editar é retroativo de propósito (ver salvarDispositivo em utils/storage.js):
// quem corrige o preço está consertando um dado errado, então os dias daquele
// dispositivo são reprecificados aqui pelo recalcularEconomia. Quem trocou de
// vape cadastra um dispositivo NOVO, e aí o passado não muda.
export default function DeviceFormScreen({ navigation, route }) {
    const { cores } = usarTema();
    const { mostrarErro, mostrarRecompensas } = usarToast();
    const idDoDispositivo = route.params?.id ?? null;
    const ehEdicao = idDoDispositivo !== null;

    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('');
    const [totalDePuxadas, setTotalDePuxadas] = useState('');
    const [dias, setDias] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [dispositivo, setDispositivo] = useState(null);

    // Carrega uma vez só: recarregar no foco apagaria o que já foi digitado.
    useEffect(() => {
        let montado = true;
        if (!ehEdicao) return undefined;
        obterDispositivos().then((lista) => {
            if (!montado) return;
            const alvo = lista.find((d) => d.id === Number(idDoDispositivo));
            if (!alvo) return;
            setDispositivo(alvo);
            setNome(alvo.name || '');
            setPreco(alvo.price?.toString() || '');
            setTotalDePuxadas(alvo.totalPuffs?.toString() || '');
            setDias(alvo.days?.toString() || '');
        });
        return () => {
            montado = false;
        };
    }, [ehEdicao, idDoDispositivo]);

    const aoDigitarPreco = (texto) => {
        const limpo = texto.replace(/[^0-9,.]/g, '');
        const partes = limpo.split(/[,.]/);
        const normalizado = partes.length > 1 ? `${partes[0]},${partes.slice(1).join('')}` : limpo;
        setPreco(normalizado);
    };

    const aoDigitarInteiro = (setter) => (texto) => {
        setter(texto.replace(/[^0-9]/g, ''));
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
        const resultado = await salvarDispositivo({
            ...(dispositivo ?? {}),
            ...(ehEdicao ? { id: Number(idDoDispositivo) } : {}),
            name: nome.trim(),
            price: p,
            totalPuffs: tp,
            days: d,
        });
        if (!resultado.ok) {
            setSalvando(false);
            mostrarErro(
                'Não deu pra salvar o dispositivo',
                'Verifique sua conexão e tente de novo.'
            );
            return;
        }

        // Cada dia é precificado pelo dispositivo do registro dele, então o
        // recálculo só mexe nos dias deste dispositivo — os outros ficam iguais.
        const [registros, aparelho] = await Promise.all([obterRegistros(), obterAparelho()]);
        const economia = await recalcularEconomia(registros, aparelho);
        const { recompensas } = await sincronizarGamificacao({ registros, economia });
        setSalvando(false);
        mostrarRecompensas(recompensas);
        navigation.goBack();
    };

    // Dispositivo "em rascunho", só pra prévia — os helpers puros fazem as contas.
    const dispositivoDoFormulario = () => ({
        price: parseFloat(preco.replace(',', '.')),
        totalPuffs: parseInt(totalDePuxadas),
        days: parseInt(dias),
    });

    const textoDoCustoPorPuxada = () => {
        const custo = custoPorPuxada(dispositivoDoFormulario());
        return custo === null ? '—' : `R$ ${custo.toFixed(4)}`;
    };

    const textoDaMetaDiaria = () => {
        const meta = metaDiaria(dispositivoDoFormulario());
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
                    titulo={ehEdicao ? 'Editar dispositivo' : 'Novo dispositivo'}
                    subtitulo={
                        ehEdicao
                            ? 'Corrigir aqui reajusta os dias deste dispositivo'
                            : 'Conta pra gente como ele é'
                    }
                    cores={cores}
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
                                    Meta que ele sugere
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
                </View>

                <View style={[styles.infoBox, { backgroundColor: cores.primaryLight }]}>
                    <Ionicons name="information-circle-outline" size={18} color={cores.primary} />
                    <Text style={[styles.infoText, { color: cores.primaryDark }]}>
                        {ehEdicao
                            ? 'Editar é pra corrigir dado errado: os dias registrados com este dispositivo vão ser recalculados com os valores novos.'
                            : 'Trocou de vape? Cadastra ele como um dispositivo novo — os dias antigos continuam valendo pelo dispositivo que você usou neles.'}
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
