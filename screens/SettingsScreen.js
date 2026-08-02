import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Switch,
    Modal,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';

import Alert from '../utils/alert';
import { usarTema } from '../context/ThemeContext';
import { usarAuth } from '../context/AuthContext';
import { usarToast } from '../context/ToastContext';
import { RAIO, SOMBRA } from '../utils/theme';
import {
    apagarTodosOsDados,
    obterMeta,
    obterMetaDeDinheiro,
    obterPreferenciasDeNotificacao,
    reiniciarOnboarding,
    salvarPreferenciasDeNotificacao,
} from '../utils/storage';
import { metaValida } from '../utils/meta';
import { metaDeDinheiroValida } from '../utils/metaDeDinheiro';
import {
    aplicarPreferenciasDeNotificacao,
    calcularHorarioDoLembreteDeRisco,
    calcularLembreteDeDiaCritico,
} from '../utils/notifications';
import { exportarDados } from '../utils/exportacao';
import ScreenHeader from '../components/ScreenHeader';

// Horários oferecidos pro lembrete diário: de meia em meia hora. É mais simples
// (e mais rápido de usar) que um date picker nativo, que ainda por cima não
// segue o tema do app.
const HORARIOS = Array.from({ length: 48 }, (_, i) => ({
    hora: Math.floor(i / 2),
    minuto: i % 2 === 0 ? 0 : 30,
}));

function formatarHorario(hora, minuto) {
    return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

const MOTIVO_DA_EXPORTACAO = {
    sem_dados: 'Você ainda não tem registro nenhum pra exportar.',
    sem_compartilhamento: 'Esse aparelho não tem como compartilhar arquivos.',
    falhou: 'Não deu pra gerar o arquivo. Tenta de novo daqui a pouco.',
};

// A linha de metas cobre as duas (redução e dinheiro), que são independentes:
// qualquer combinação das duas pode existir.
function descricaoDasMetas(meta, metaDeDinheiro) {
    const partes = [];
    if (metaValida(meta)) partes.push(`Chegar a ${meta.target} puxadas/dia`);
    if (metaDeDinheiroValida(metaDeDinheiro)) {
        partes.push(`juntar R$ ${Number(metaDeDinheiro.amount).toFixed(2)}`);
    }
    return partes.length === 0 ? 'Nenhuma meta definida' : partes.join(' · ');
}

export default function SettingsScreen({ navigation }) {
    const { cores, estaEscuro, alternarTema } = usarTema();
    const { ehConvidado } = usarAuth();
    const { mostrarAviso, mostrarErro } = usarToast();

    const [preferencias, setPreferencias] = useState(null);
    const [horarioDeRisco, setHorarioDeRisco] = useState(null);
    const [lembreteDeDiaCritico, setLembreteDeDiaCritico] = useState(null);
    const [meta, setMeta] = useState(null);
    const [metaDeDinheiro, setMetaDeDinheiro] = useState(null);
    const [seletorDeHorarioVisivel, setSeletorDeHorarioVisivel] = useState(false);
    const [apagando, setApagando] = useState(false);
    const [exportando, setExportando] = useState(false);

    const versao = Constants.expoConfig?.version ?? '—';

    useFocusEffect(
        useCallback(() => {
            let montado = true;
            obterPreferenciasDeNotificacao().then(async (salvas) => {
                if (!montado) return;
                setPreferencias(salvas);
                // O horário de risco sai das sessões de crise, não da
                // preferência: aqui só mostramos que horas o lembrete cairia.
                const risco = await calcularHorarioDoLembreteDeRisco(salvas.hora, salvas.minuto);
                if (montado) setHorarioDeRisco(risco);
                // Mesma coisa pro dia crítico: sai dos registros, não da
                // preferência.
                const diaCritico = await calcularLembreteDeDiaCritico(salvas.hora, salvas.minuto);
                if (montado) setLembreteDeDiaCritico(diaCritico);
            });
            obterMeta().then((salva) => {
                if (montado) setMeta(salva);
            });
            obterMetaDeDinheiro().then((salva) => {
                if (montado) setMetaDeDinheiro(salva);
            });
            return () => {
                montado = false;
            };
        }, [])
    );

    // Salva a preferência e reagenda na mesma hora — senão o horário novo só
    // valeria na próxima vez que o app fosse aberto.
    async function atualizarPreferencias(mudanca) {
        const anteriores = preferencias;
        const otimista = { ...anteriores, ...mudanca };
        setPreferencias(otimista);

        const salvas = await salvarPreferenciasDeNotificacao(mudanca);
        if (!salvas) {
            setPreferencias(anteriores);
            mostrarErro('Erro', 'Não deu pra salvar essa preferência.');
            return;
        }

        // Mudar o horário do lembrete diário pode empurrar o de risco pra perto
        // demais dele (aí ele é pulado), então recalcula junto.
        setHorarioDeRisco(await calcularHorarioDoLembreteDeRisco(salvas.hora, salvas.minuto));
        setLembreteDeDiaCritico(await calcularLembreteDeDiaCritico(salvas.hora, salvas.minuto));

        const resultado = await aplicarPreferenciasDeNotificacao();
        if (salvas.ativas && !resultado.permitido) {
            mostrarAviso(
                'Notificações bloqueadas',
                'Libera as notificações do VapeFree nos ajustes do sistema pra receber os lembretes.'
            );
        }
    }

    function handleEscolherHorario(hora, minuto) {
        setSeletorDeHorarioVisivel(false);
        atualizarPreferencias({ hora, minuto });
    }

    function handleVerTutorial() {
        // Apaga a flag antes de abrir: se o usuário fechar o app no meio do
        // tutorial, ele ainda aparece na próxima abertura.
        reiniciarOnboarding();
        navigation.navigate('Onboarding');
    }

    function handleExportar() {
        Alert.alert('Exportar dados', 'Em que formato você quer levar seu histórico?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'CSV (planilha)', onPress: () => exportar('csv') },
            { text: 'JSON (backup completo)', onPress: () => exportar('json') },
        ]);
    }

    async function exportar(formato) {
        setExportando(true);
        try {
            const resultado = await exportarDados(formato);
            if (!resultado.ok) {
                mostrarErro(
                    'Erro',
                    MOTIVO_DA_EXPORTACAO[resultado.motivo] || MOTIVO_DA_EXPORTACAO.falhou
                );
            }
        } finally {
            setExportando(false);
        }
    }

    function handleApagarDados() {
        Alert.alert(
            'Apagar todos os meus dados',
            ehConvidado
                ? 'Isso zera registros, conquistas, missões, economia e o aparelho cadastrado neste aparelho. Não dá pra desfazer.'
                : 'Isso zera registros, conquistas, missões, economia e o aparelho cadastrado. Sua conta continua existindo, mas o progresso some pra sempre.',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Apagar tudo', style: 'destructive', onPress: apagarDados },
            ]
        );
    }

    async function apagarDados() {
        setApagando(true);
        try {
            const resultado = await apagarTodosOsDados();
            if (!resultado.ok) {
                mostrarErro(
                    'Erro',
                    ehConvidado
                        ? 'Não deu pra apagar seus dados. Tenta de novo.'
                        : 'Apagar os dados da conta precisa de internet. Conecta e tenta de novo.'
                );
                return;
            }
            mostrarAviso('Pronto', 'Seus dados foram apagados. Dá pra começar do zero.', 'sucesso');
        } finally {
            setApagando(false);
        }
    }

    function renderizarLinha({ icone, rotulo, descricao, aoPressionar, direita, destrutivo }) {
        const Container = aoPressionar ? TouchableOpacity : View;
        const corDoTexto = destrutivo ? cores.danger : cores.text;

        return (
            <Container style={styles.row} onPress={aoPressionar} activeOpacity={0.7}>
                <View
                    style={[
                        styles.icon,
                        { backgroundColor: destrutivo ? cores.danger + '22' : cores.primaryLight },
                    ]}
                >
                    <Ionicons
                        name={icone}
                        size={20}
                        color={destrutivo ? cores.danger : cores.primaryDark}
                    />
                </View>
                <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowLabel, { color: corDoTexto }]}>{rotulo}</Text>
                    {!!descricao && (
                        <Text style={[styles.rowDescricao, { color: cores.textMuted }]}>
                            {descricao}
                        </Text>
                    )}
                </View>
                {direita ??
                    (aoPressionar ? (
                        <Ionicons name="chevron-forward" size={18} color={cores.textMuted} />
                    ) : null)}
            </Container>
        );
    }

    const divisor = <View style={[styles.divider, { backgroundColor: cores.border }]} />;
    const horarioAtual = preferencias
        ? formatarHorario(preferencias.hora, preferencias.minuto)
        : '--:--';
    // Sem horário calculado o aviso não tem quando tocar: ou faltam crises pra
    // apontar um período, ou ele cairia colado no lembrete diário.
    const descricaoDoRisco = horarioDeRisco
        ? `Toca às ${formatarHorario(horarioDeRisco.hora, horarioDeRisco.minuto)}, antes da vontade bater ${horarioDeRisco.rotulo}`
        : 'Ainda sem crises suficientes pra saber sua hora difícil';
    // Idem: sem dia calculado, ou faltam registros repetidos no mesmo dia da
    // semana, ou o aviso cairia colado no lembrete de risco.
    const descricaoDoDiaCritico = lembreteDeDiaCritico
        ? `Toca ${lembreteDeDiaCritico.rotulo}, às ${formatarHorario(lembreteDeDiaCritico.hora, lembreteDeDiaCritico.minuto)}`
        : 'Ainda sem registros suficientes pra saber seu dia mais arriscado';

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
            >
                <ScreenHeader
                    titulo="Configurações"
                    subtitulo="Ajuste o app do seu jeito"
                    cores={cores}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    {renderizarLinha({
                        icone: 'person-circle-outline',
                        rotulo: 'Perfil',
                        aoPressionar: () => navigation.navigate('Profile'),
                    })}

                    {!ehConvidado && (
                        <>
                            {divisor}
                            {renderizarLinha({
                                icone: 'key-outline',
                                rotulo: 'Conta',
                                descricao: 'Nome, e-mail, senha e exclusão',
                                aoPressionar: () => navigation.navigate('Account'),
                            })}
                        </>
                    )}

                    {divisor}

                    {renderizarLinha({
                        icone: 'flag-outline',
                        rotulo: 'Minhas metas',
                        descricao: descricaoDasMetas(meta, metaDeDinheiro),
                        aoPressionar: () => navigation.navigate('Goal'),
                    })}

                    {divisor}

                    {renderizarLinha({
                        icone: estaEscuro ? 'sunny-outline' : 'moon-outline',
                        rotulo: 'Modo escuro',
                        direita: <Switch value={estaEscuro} onValueChange={alternarTema} />,
                    })}
                </View>

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    {renderizarLinha({
                        icone: 'notifications-outline',
                        rotulo: 'Lembretes',
                        descricao: 'Mensagem motivadora e aviso de sequência',
                        direita: (
                            <Switch
                                value={!!preferencias?.ativas}
                                onValueChange={(ativas) => atualizarPreferencias({ ativas })}
                                disabled={!preferencias}
                            />
                        ),
                    })}

                    {divisor}

                    {renderizarLinha({
                        icone: 'time-outline',
                        rotulo: 'Horário do lembrete',
                        descricao: preferencias?.ativas
                            ? 'Toque pra mudar'
                            : 'Ligue os lembretes pra escolher',
                        aoPressionar: preferencias?.ativas
                            ? () => setSeletorDeHorarioVisivel(true)
                            : undefined,
                        direita: (
                            <Text style={[styles.valor, { color: cores.primaryDark }]}>
                                {horarioAtual}
                            </Text>
                        ),
                    })}

                    {divisor}

                    {renderizarLinha({
                        icone: 'alert-circle-outline',
                        rotulo: 'Aviso no horário de risco',
                        descricao: descricaoDoRisco,
                        direita: (
                            <Switch
                                value={!!preferencias?.risco}
                                onValueChange={(risco) => atualizarPreferencias({ risco })}
                                disabled={!preferencias || !preferencias.ativas}
                            />
                        ),
                    })}

                    {divisor}

                    {renderizarLinha({
                        icone: 'calendar-outline',
                        rotulo: 'Aviso no dia mais arriscado',
                        descricao: descricaoDoDiaCritico,
                        direita: (
                            <Switch
                                value={!!preferencias?.diaCritico}
                                onValueChange={(diaCritico) =>
                                    atualizarPreferencias({ diaCritico })
                                }
                                disabled={!preferencias || !preferencias.ativas}
                            />
                        ),
                    })}
                </View>

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    {renderizarLinha({
                        icone: 'download-outline',
                        rotulo: 'Exportar meus dados',
                        descricao: 'Leva seu histórico em CSV ou JSON',
                        aoPressionar: exportando ? undefined : handleExportar,
                        direita: exportando ? (
                            <ActivityIndicator color={cores.primary} />
                        ) : undefined,
                    })}

                    {divisor}

                    {renderizarLinha({
                        icone: 'help-buoy-outline',
                        rotulo: 'Ver o tutorial de novo',
                        aoPressionar: handleVerTutorial,
                    })}
                </View>

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    {renderizarLinha({
                        icone: 'trash-outline',
                        rotulo: 'Apagar todos os meus dados',
                        descricao: 'Zera seu progresso. Não dá pra desfazer.',
                        destrutivo: true,
                        aoPressionar: apagando ? undefined : handleApagarDados,
                        direita: apagando ? <ActivityIndicator color={cores.danger} /> : undefined,
                    })}
                </View>

                <Text style={[styles.versao, { color: cores.textMuted }]}>
                    VapeFree versão {versao}
                </Text>
            </ScrollView>

            <Modal
                transparent
                visible={seletorDeHorarioVisivel}
                animationType="fade"
                onRequestClose={() => setSeletorDeHorarioVisivel(false)}
            >
                <Pressable
                    style={styles.backdrop}
                    onPress={() => setSeletorDeHorarioVisivel(false)}
                >
                    <Pressable
                        style={[styles.modalCard, { backgroundColor: cores.modalBg }]}
                        onPress={() => {}}
                    >
                        <Text style={[styles.modalTitulo, { color: cores.text }]}>
                            Horário do lembrete
                        </Text>
                        <ScrollView style={styles.modalLista}>
                            {HORARIOS.map(({ hora, minuto }) => {
                                const selecionado =
                                    preferencias?.hora === hora && preferencias?.minuto === minuto;
                                return (
                                    <TouchableOpacity
                                        key={`${hora}_${minuto}`}
                                        style={[
                                            styles.opcao,
                                            selecionado && { backgroundColor: cores.primaryLight },
                                        ]}
                                        onPress={() => handleEscolherHorario(hora, minuto)}
                                    >
                                        <Text
                                            style={[
                                                styles.opcaoTexto,
                                                {
                                                    color: selecionado
                                                        ? cores.primaryDark
                                                        : cores.text,
                                                },
                                            ]}
                                        >
                                            {formatarHorario(hora, minuto)}
                                        </Text>
                                        {selecionado && (
                                            <Ionicons
                                                name="checkmark"
                                                size={18}
                                                color={cores.primaryDark}
                                            />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RAIO.lg,
        paddingHorizontal: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    icon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowTextWrap: { flex: 1 },
    rowLabel: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    rowDescricao: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    valor: { fontSize: 15, fontFamily: 'Poppins_700Bold' },
    divider: { height: StyleSheet.hairlineWidth },
    versao: {
        textAlign: 'center',
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 20,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(10, 17, 30, 0.48)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        maxHeight: '70%',
        borderRadius: 24,
        padding: 20,
    },
    modalTitulo: { fontSize: 18, fontFamily: 'Poppins_800ExtraBold', marginBottom: 12 },
    modalLista: { flexGrow: 0 },
    opcao: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: RAIO.md,
    },
    opcaoTexto: { fontSize: 15, fontFamily: 'Poppins_600SemiBold' },
});
