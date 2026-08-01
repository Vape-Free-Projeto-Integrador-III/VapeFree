//
// Tutorial de boas-vindas, exibido na primeira abertura do app logo DEPOIS de
// logar / cadastrar / entrar como convidado (ver navigation/AppNavigator.js).
// Nesse caso ele não usa ScreenHeader nem faz parte de nenhum Stack: é uma
// tela solta, que avisa que terminou pelo callback `aoConcluir`.
//
// A MESMA tela também é uma rota da MainStack ('Onboarding'), pro "ver o
// tutorial de novo" das Configurações. Aí não vem `aoConcluir` e o fim do
// tutorial volta pela navegação.
//
// No fluxo inicial (com `aoConcluir`) e só se ainda não existe aparelho
// cadastrado, o tutorial ganha um passo a mais no fim pedindo os dados do
// dispositivo — é o que faz a economia funcionar desde o dia 1. Quem veio das
// Configurações nunca vê esse passo.
//
// A flag fica em AsyncStorage via concluirOnboarding() (utils/storage.js).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Alert from '../utils/alert';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import { RAIO, SOMBRA } from '../utils/theme';
import { custoPorPuxada, metaDiaria } from '../utils/records';
import { metaDoDia, metaValida, deslocarData } from '../utils/meta';
import {
    concluirOnboarding,
    obterAparelho,
    salvarAparelho,
    obterMeta,
    salvarMeta,
    obterRegistros,
    recalcularEconomia,
    dataDeHoje,
} from '../utils/storage';

const PASSOS = [
    {
        id: 'boas_vindas',
        icone: 'leaf-outline',
        emoji: '🌱',
        titulo: 'Bem-vindo ao VapeFree',
        texto: 'Aqui você acompanha sua saída do vape no seu ritmo. Sem julgamento, sem sermão — só você vendo seu progresso de verdade.',
    },
    {
        id: 'registrar',
        icone: 'add-circle-outline',
        emoji: '📅',
        titulo: 'Registre seu dia',
        texto: 'Todo dia você marca se usou o vape e quantas puxadas deu. Leva 10 segundos. Dia sem usar também conta — e conta muito.',
    },
    {
        id: 'gatilhos',
        icone: 'flash-outline',
        emoji: '⚡',
        titulo: 'Descubra seus gatilhos',
        texto: 'Ansiedade, tédio, estar com amigos... Ao registrar, você marca o que puxou a vontade. Com o tempo o app te mostra seu padrão.',
    },
    {
        id: 'economia',
        icone: 'wallet-outline',
        emoji: '💰',
        titulo: 'Veja quanto você economiza',
        texto: 'Você cadastra o preço do seu aparelho e o app calcula o dinheiro que deixou de gastar. Costuma ser bem mais do que parece.',
    },
    {
        id: 'missoes',
        icone: 'trophy-outline',
        emoji: '🏆',
        titulo: 'Missões e conquistas',
        texto: 'Missões diárias e semanais te dão XP, e as conquistas marcam cada passo grande. Quando a vontade apertar, use o modo crise.',
    },
];

// Passos extras, só no fluxo inicial de quem ainda não cadastrou aparelho/meta.
const PASSO_APARELHO = { id: 'aparelho', ehFormulario: true };
const PASSO_META = { id: 'meta', ehFormulario: true };

// Prazos oferecidos pra meta, iguais aos da GoalScreen.
const PRAZOS = [30, 60, 90];

export default function OnboardingScreen({ aoConcluir, navigation }) {
    const { cores } = usarTema();
    const { mostrarErro } = usarToast();
    const { width } = useWindowDimensions();
    const [indice, setIndice] = useState(0);
    const listaRef = useRef(null);
    const finalizandoRef = useRef(false);

    // null enquanto ainda não sabemos quais formulários entram — evita a lista
    // mudar de tamanho no meio do tutorial.
    const [extras, setExtras] = useState(null);
    const [nome, setNome] = useState('');
    const [preco, setPreco] = useState('');
    const [totalDePuxadas, setTotalDePuxadas] = useState('');
    const [dias, setDias] = useState('');
    const [baseline, setBaseline] = useState('');
    const [alvo, setAlvo] = useState('');
    const [prazo, setPrazo] = useState(60);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        let montado = true;
        // Sem `aoConcluir` veio do "ver o tutorial de novo" das Configurações:
        // aí nunca pedimos nada.
        if (!aoConcluir) {
            setExtras({ aparelho: false, meta: false });
            return undefined;
        }
        Promise.all([obterAparelho(), obterMeta()])
            .then(([aparelho, meta]) => {
                if (montado) setExtras({ aparelho: !aparelho, meta: !metaValida(meta) });
            })
            .catch(() => {
                if (montado) setExtras({ aparelho: false, meta: false });
            });
        return () => {
            montado = false;
        };
    }, [aoConcluir]);

    const passos = [
        ...PASSOS,
        ...(extras?.aparelho ? [PASSO_APARELHO] : []),
        ...(extras?.meta ? [PASSO_META] : []),
    ];
    const passoAtual = passos[indice];
    const ehUltimo = indice === passos.length - 1;
    const noFormularioDeAparelho = passoAtual?.id === 'aparelho';
    const noFormularioDeMeta = passoAtual?.id === 'meta';
    const noFormulario = noFormularioDeAparelho || noFormularioDeMeta;

    async function finalizar() {
        // Evita gravar/avisar duas vezes se o usuário der dois toques rápidos.
        if (finalizandoRef.current) return;
        finalizandoRef.current = true;
        await concluirOnboarding();
        if (aoConcluir) {
            aoConcluir();
            return;
        }
        navigation?.goBack();
    }

    // Avança pro próximo passo, ou conclui se já era o último.
    function seguir() {
        if (ehUltimo) {
            finalizar();
            return;
        }
        const proximo = indice + 1;
        listaRef.current?.scrollToIndex({ index: proximo, animated: true });
        setIndice(proximo);
    }

    async function salvarAparelhoESeguir() {
        if (salvando) return;
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
        // Não tem gamificação pra sincronizar aqui: no fluxo inicial ainda não
        // existe registro nenhum. Só deixamos a economia coerente.
        const registros = await obterRegistros();
        await recalcularEconomia(registros, aparelho);
        setSalvando(false);
        // Sugere o ponto de partida da meta com o consumo que o aparelho declara.
        const sugerido = metaDiaria(aparelho);
        if (sugerido !== null && !baseline) setBaseline(String(Math.round(sugerido)));
        seguir();
    }

    async function salvarMetaESeguir() {
        if (salvando) return;
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

        setSalvando(true);
        const hoje = dataDeHoje();
        const resultado = await salvarMeta({
            baseline: b,
            target: a,
            startDate: hoje,
            endDate: deslocarData(hoje, prazo),
        });
        setSalvando(false);
        if (!resultado.ok) {
            mostrarErro('Não deu pra salvar a meta', 'Verifique sua conexão e tente de novo.');
            return;
        }
        seguir();
    }

    function avancar() {
        if (noFormularioDeAparelho) {
            salvarAparelhoESeguir();
            return;
        }
        if (noFormularioDeMeta) {
            salvarMetaESeguir();
            return;
        }
        seguir();
    }

    // Mantém os pontinhos em sincronia quando o usuário arrasta em vez de
    // usar o botão.
    const aoRolar = useCallback(
        (evento) => {
            const atual = Math.round(evento.nativeEvent.contentOffset.x / width);
            setIndice((anterior) => (atual === anterior ? anterior : atual));
        },
        [width]
    );

    const aoDigitarPreco = (texto) => {
        const limpo = texto.replace(/[^0-9,.]/g, '');
        const partes = limpo.split(/[,.]/);
        setPreco(partes.length > 1 ? `${partes[0]},${partes.slice(1).join('')}` : limpo);
    };

    const aoDigitarInteiro = (setter) => (texto) => {
        setter(texto.replace(/[^0-9]/g, ''));
    };

    // Aparelho "em rascunho", só pra prévia — mesmos helpers puros da DeviceScreen.
    const aparelhoDoFormulario = () => ({
        price: parseFloat(preco.replace(',', '.')),
        totalPuffs: parseInt(totalDePuxadas),
        days: parseInt(dias),
    });

    function renderizarFormulario() {
        const estiloDoInput = [
            styles.input,
            { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text },
        ];
        const custo = custoPorPuxada(aparelhoDoFormulario());
        const meta = metaDiaria(aparelhoDoFormulario());

        return (
            <View style={[styles.formulario, { width }]}>
                <Text style={[styles.titulo, { color: cores.text }]}>Seu dispositivo</Text>
                <Text style={[styles.texto, { color: cores.textSecondary }]}>
                    Com esses dados a economia já começa a contar hoje. Dá pra mudar depois.
                </Text>

                <Text style={[styles.label, { color: cores.text }]}>Nome / Modelo</Text>
                <TextInput
                    style={estiloDoInput}
                    placeholder="Ex: Vape Pod – Mint"
                    placeholderTextColor={cores.textMuted}
                    value={nome}
                    onChangeText={setNome}
                />

                <Text style={[styles.label, { color: cores.text }]}>Preço (R$)</Text>
                <TextInput
                    style={estiloDoInput}
                    placeholder="Ex: 39.90"
                    placeholderTextColor={cores.textMuted}
                    value={preco}
                    onChangeText={aoDigitarPreco}
                    keyboardType="decimal-pad"
                />

                <Text style={[styles.label, { color: cores.text }]}>
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

                <Text style={[styles.label, { color: cores.text }]}>
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

                {custo !== null && meta !== null ? (
                    <View style={[styles.previa, { backgroundColor: cores.primaryLight }]}>
                        <Text style={[styles.previaLinha, { color: cores.primaryDark }]}>
                            R$ {custo.toFixed(4)} por puxada • meta de {Math.round(meta)}{' '}
                            puxadas/dia
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    }

    function renderizarFormularioDeMeta() {
        const estiloDoInput = [
            styles.input,
            { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text },
        ];
        const hoje = dataDeHoje();
        const rascunho = {
            baseline: parseInt(baseline),
            target: parseInt(alvo),
            startDate: hoje,
            endDate: deslocarData(hoje, prazo),
        };
        const metaDeHoje = metaDoDia(rascunho, hoje);

        return (
            <View style={[styles.formulario, { width }]}>
                <Text style={[styles.titulo, { color: cores.text }]}>Sua meta</Text>
                <Text style={[styles.texto, { color: cores.textSecondary }]}>
                    Seu limite de puxadas desce um pouco a cada dia até o alvo — nada de cair tudo
                    de uma vez.
                </Text>

                <Text style={[styles.label, { color: cores.text }]}>
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

                <Text style={[styles.label, { color: cores.text }]}>
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

                <Text style={[styles.label, { color: cores.text }]}>Em quanto tempo</Text>
                <View style={styles.chipRow}>
                    {PRAZOS.map((dias) => {
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

                {metaDeHoje !== null ? (
                    <View style={[styles.previa, { backgroundColor: cores.primaryLight }]}>
                        <Text style={[styles.previaLinha, { color: cores.primaryDark }]}>
                            Seu limite de hoje: {Math.round(metaDeHoje)} puxadas
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    }

    function renderizarPasso({ item }) {
        if (item.id === 'aparelho') return renderizarFormulario();
        if (item.id === 'meta') return renderizarFormularioDeMeta();
        return (
            <View style={[styles.passo, { width }]}>
                <View style={[styles.circulo, { backgroundColor: cores.primaryLight }]}>
                    <Ionicons name={item.icone} size={64} color={cores.primary} />
                </View>
                <Text style={styles.emoji}>{item.emoji}</Text>
                <Text style={[styles.titulo, { color: cores.text }]}>{item.titulo}</Text>
                <Text style={[styles.texto, { color: cores.textSecondary }]}>{item.texto}</Text>
            </View>
        );
    }

    if (extras === null) {
        return (
            <View
                style={[styles.container, styles.carregando, { backgroundColor: cores.background }]}
            >
                <ActivityIndicator size="large" color={cores.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: cores.background }]}>
            <View style={styles.topo}>
                {!ehUltimo ? (
                    <TouchableOpacity
                        onPress={finalizar}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={[styles.pular, { color: cores.textMuted }]}>Pular</Text>
                    </TouchableOpacity>
                ) : null}
            </View>

            <FlatList
                ref={listaRef}
                data={passos}
                keyExtractor={(item) => item.id}
                renderItem={renderizarPasso}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onMomentumScrollEnd={aoRolar}
                getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            />

            <View style={styles.pontos}>
                {passos.map((passo, i) => (
                    <View
                        key={passo.id}
                        style={[
                            styles.ponto,
                            {
                                backgroundColor: i === indice ? cores.primary : cores.border,
                                width: i === indice ? 22 : 8,
                            },
                        ]}
                    />
                ))}
            </View>

            <TouchableOpacity
                style={[
                    styles.botao,
                    { backgroundColor: cores.primary },
                    salvando && styles.botaoDesativado,
                    SOMBRA.media,
                ]}
                onPress={avancar}
                disabled={salvando}
                activeOpacity={0.85}
            >
                <Text style={styles.botaoTexto}>
                    {salvando
                        ? 'Salvando...'
                        : noFormularioDeAparelho
                          ? 'Salvar meu dispositivo'
                          : noFormularioDeMeta
                            ? 'Definir minha meta'
                            : ehUltimo
                              ? 'Bora começar'
                              : 'Próximo'}
                </Text>
            </TouchableOpacity>

            {noFormulario ? (
                <TouchableOpacity onPress={seguir} disabled={salvando} style={styles.depois}>
                    <Text style={[styles.depoisTexto, { color: cores.textMuted }]}>
                        Fazer isso depois
                    </Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingBottom: 32,
    },
    carregando: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    topo: {
        height: 56,
        paddingTop: 24,
        paddingHorizontal: 24,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    pular: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    passo: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    circulo: {
        width: 148,
        height: 148,
        borderRadius: 74,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emoji: {
        fontSize: 34,
        marginTop: 20,
    },
    titulo: {
        fontSize: 24,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginTop: 12,
    },
    texto: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 23,
        marginTop: 12,
    },
    pontos: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 24,
    },
    ponto: {
        height: 8,
        borderRadius: RAIO.full,
    },
    botao: {
        height: 52,
        marginHorizontal: 24,
        borderRadius: RAIO.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    botaoTexto: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: '#fff',
    },
    botaoDesativado: {
        opacity: 0.7,
    },
    depois: {
        alignItems: 'center',
        paddingVertical: 14,
    },
    depoisTexto: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    formulario: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 6,
        marginTop: 10,
    },
    input: {
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        padding: 12,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    chip: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: RAIO.md,
        paddingVertical: 12,
        alignItems: 'center',
    },
    chipText: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
    },
    previa: {
        borderRadius: RAIO.md,
        padding: 12,
        marginTop: 16,
    },
    previaLinha: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
});
