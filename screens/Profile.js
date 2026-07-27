import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
} from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { usarAuth } from '../context/AuthContext';
import { usarTema } from '../context/ThemeContext';
import { RAIO, SOMBRA } from '../utils/theme';
import { obterRegistros, obterEconomia, calcularStreak } from '../utils/storage';
import ScreenHeader from '../components/ScreenHeader';

function obterIniciais(nome, email) {
    const origem = (nome || email || '').trim();
    if (!origem) return 'U';

    const partes = origem.split(/\s+/).filter(Boolean);
    if (partes.length === 1) {
        return partes[0].slice(0, 2).toUpperCase();
    }

    return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export default function Profile({ navigation }) {
    const { cores } = usarTema();
    const { usuario, ehConvidado, sair } = usarAuth();
    const [ocupado, setOcupado] = React.useState(false);
    const [registros, setRegistros] = useState([]);
    const [economia, setEconomia] = useState({});

    const nomeExibido = ehConvidado ? 'Convidado' : usuario?.displayName?.trim() || 'Usuário';
    const email = usuario?.email?.trim() || 'Sem e-mail cadastrado';
    const iniciais = obterIniciais(usuario?.displayName, usuario?.email);

    const carregar = useCallback(async () => {
        const [regs, eco] = await Promise.all([obterRegistros(), obterEconomia()]);
        setRegistros(regs);
        setEconomia(eco);
    }, []);

    useFocusEffect(
        useCallback(() => {
            carregar();
        }, [carregar])
    );

    const streak = calcularStreak(registros);
    const totalEconomizado = Object.values(economia).reduce((a, v) => a + v, 0);
    const dataDeInicio = registros.length
        ? [...registros].map((r) => r.date).sort()[0]
        : null;
    const rotuloDataDeInicio = dataDeInicio
        ? (() => {
              const [ano, mes, dia] = dataDeInicio.split('-');
              return `${dia}/${mes}/${ano}`;
          })()
        : '—';

    function handleVoltar() {
        navigation.goBack();
    }

    function handleSair() {
        if (Platform.OS === 'web') {
            const confirmado = window.confirm('Quer mesmo sair da sua conta?');
            if (confirmado) {
                executarSaida('Login');
            }
            return;
        }

        Alert.alert('Sair', 'Quer mesmo sair da sua conta?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sair',
                style: 'destructive',
                onPress: () => executarSaida('Login'),
            },
        ]);
    }

    async function executarSaida(proximaTelaDeAuth) {
        setOcupado(true);
        try {
            await sair(proximaTelaDeAuth);
        } finally {
            setOcupado(false);
        }
    }

    async function abrirTelaDeAuth(proximaTelaDeAuth) {
        if (ocupado) {
            return;
        }

        await executarSaida(proximaTelaDeAuth);
    }

    return (
        <View style={{ flex: 1, backgroundColor: cores.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: cores.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                titulo="Perfil"
                subtitulo={ehConvidado ? 'Você tá no modo convidado' : 'Seus dados'}
                cores={cores}
                aoPressionarVoltar={handleVoltar}
                mostrarPerfil={false}
            />

            {ehConvidado ? (
                <>
                    <View style={[styles.profileCard, { backgroundColor: cores.card }, SOMBRA.media]}>
                        <View style={[styles.avatar, { backgroundColor: cores.primaryLight }]}>
                            <Text style={[styles.avatarText, { color: cores.primaryDark }]}>G</Text>
                        </View>

                        <Text style={[styles.name, { color: cores.text }]}>Você tá como convidado</Text>
                        <Text style={[styles.guestText, { color: cores.textMuted }]}>Entra ou cria uma conta pra não perder seu progresso — seus dados ficam salvos na nuvem.</Text>
                    </View>

                    <View style={styles.guestActions}>
                        <TouchableOpacity
                            style={[styles.primaryAction, { backgroundColor: cores.primary }, SOMBRA.pequena]}
                            onPress={() => abrirTelaDeAuth('Login')}
                            disabled={ocupado}
                        >
                            <Text style={styles.primaryActionText}>Entrar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.secondaryAction, { borderColor: cores.primary, backgroundColor: cores.card }, SOMBRA.pequena]}
                            onPress={() => abrirTelaDeAuth('SignUp')}
                            disabled={ocupado}
                        >
                            <Text style={[styles.secondaryActionText, { color: cores.primaryDark }]}>Cadastrar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="cloud-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Modo convidado</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>Seus dados ficam só neste aparelho até você entrar numa conta.</Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="calendar-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Início da jornada</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{rotuloDataDeInicio}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: cores.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="flame-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Dias sem usar</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{streak}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: cores.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="cash-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Total economizado</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>R$ {totalEconomizado.toFixed(2)}</Text>
                            </View>
                        </View>
                    </View>
                </>
            ) : (
                <>
                    <View style={[styles.profileCard, { backgroundColor: cores.card }, SOMBRA.media]}>
                        <View style={[styles.avatar, { backgroundColor: cores.primaryLight }]}>
                            <Text style={[styles.avatarText, { color: cores.primaryDark }]}>{iniciais}</Text>
                        </View>

                        <Text style={[styles.name, { color: cores.text }]}>{nomeExibido}</Text>
                        <Text style={[styles.email, { color: cores.textMuted }]}>{email}</Text>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="person-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Nome</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{nomeExibido}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: cores.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="mail-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>E-mail</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{email}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="calendar-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Início da jornada</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{rotuloDataDeInicio}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: cores.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="flame-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Dias sem usar</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>{streak}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: cores.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: cores.primaryLight }]}>
                                <Ionicons name="cash-outline" size={18} color={cores.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: cores.textMuted }]}>Total economizado</Text>
                                <Text style={[styles.infoValue, { color: cores.text }]}>R$ {totalEconomizado.toFixed(2)}</Text>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.logoutBtn, { backgroundColor: cores.danger }, SOMBRA.pequena]}
                        onPress={handleSair}
                        disabled={ocupado}
                    >
                        <Ionicons name="log-out-outline" size={20} color="#fff" />
                        <Text style={styles.logoutText}>Sair</Text>
                    </TouchableOpacity>
                </>
            )}
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    profileCard: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RAIO.lg,
        padding: 20,
        alignItems: 'center',
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    avatarText: {
        fontSize: 28,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    email: { fontSize: 13, marginTop: 6, textAlign: 'center' },
    guestText: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
    infoCard: {
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: RAIO.lg,
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    infoIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    infoTextWrap: { flex: 1 },
    infoLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    infoValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E0E0E0' },
    guestActions: {
        paddingHorizontal: 16,
        marginTop: 4,
        gap: 10,
    },
    primaryAction: {
        minHeight: 48,
        borderRadius: RAIO.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    secondaryAction: {
        minHeight: 48,
        borderRadius: RAIO.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryActionText: { fontSize: 15, fontWeight: '700' },
    logoutBtn: {
        marginHorizontal: 16,
        marginTop: 18,
        borderRadius: RAIO.lg,
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    logoutText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
