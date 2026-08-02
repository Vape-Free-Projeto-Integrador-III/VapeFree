import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Alert from '../utils/alert';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithCredential,
} from 'firebase/auth';

import { auth } from '../services/firebase';
import { usarAuth } from '../context/AuthContext';
import {
    temDadosLocaisDoConvidado,
    limparDadosLocaisDoConvidado,
    migrarDadosDoConvidadoParaConta,
    salvarPerfilDaConta,
} from '../utils/storage';
import GuestDataChoiceModal from '../components/GuestDataChoiceModal';

/*Inicio import pro login do google*/
import React, { useState, useEffect } from 'react';

import * as WebBrowser from 'expo-web-browser';

import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();
/*Fim import pro login do google*/

// Client IDs do OAuth (projeto vapefree-pi no Google Cloud), um por plataforma.
// O de web é o que o Firebase criou sozinho ao habilitar o provedor Google.
//
// NÃO passe `redirectUri` pro useAuthRequest: sem ele o provider usa
// `com.vapefree.app:/oauthredirect` (o applicationId do app.json), que é o
// único formato que os clients Android/iOS aceitam. Passar um scheme próprio
// (`vapefree://`) dá redirect_uri_mismatch. Esse scheme precisa estar
// declarado no `scheme` do app.json, senão a volta do browser não chega aqui.
const CLIENT_ID_WEB = '445859118404-c0b3j87a7t0ej8s503oal396dfp2pdes.apps.googleusercontent.com';
const CLIENT_ID_ANDROID =
    '445859118404-bhlmovclojdicvdugl9umrgve85f37co.apps.googleusercontent.com';
const CLIENT_ID_IOS = '445859118404-tvijnoie97sqphusvr6sr66f5sm1o2ek.apps.googleusercontent.com';

const CORES = {
    background: '#FFFFFF',
    iconCircleBg: '#98FE98',
    iconCheck: '#4A9BB6',
    darkNavy: '#22384B',
    titleText: '#22384B',
    subtitleText: '#6F747B',
    labelText: '#22384B',
    inputBg: '#F7F8FA',
    inputBorder: '#E1E1E1',
    placeholderText: '#989FA6',
    inputIconColor: '#646B73',
    inputText: '#22384B',
    linkBlue: '#6684A7',
    buttonBg: '#4990E2',
    buttonText: '#FFFFFF',
    dividerLine: '#E1E1E1',
    dividerText: '#6F7378',
    googleBorder: '#E0E0E0',
    googleText: '#22384B',
    footerText: '#6F747B',
};

const CREDENCIAIS_INVALIDAS = [
    'auth/user-not-found',
    'auth/wrong-password',
    'auth/invalid-credential',
    'auth/invalid-email',
];

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [enviandoReset, setEnviandoReset] = useState(false);
    const [escolhaConvidadoVisivel, setEscolhaConvidadoVisivel] = useState(false);
    const [configEscolhaConvidado, setConfigEscolhaConvidado] = useState(null);
    const resolverEscolhaConvidadoRef = React.useRef(null);
    const escolhaConvidadoGooglePendenteRef = React.useRef('skip');

    const { continuarSemConta, iniciarMigracao, concluirMigracao } = usarAuth();

    async function handleContinuarSemConta() {
        await continuarSemConta();
    }

    async function perguntarSobreDadosDeConvidado({
        titulo,
        mensagem,
        rotuloImportar,
        rotuloDescartar,
    }) {
        if (!(await temDadosLocaisDoConvidado())) {
            return 'skip';
        }

        return new Promise((resolve) => {
            resolverEscolhaConvidadoRef.current = resolve;
            setConfigEscolhaConvidado({ titulo, mensagem, rotuloImportar, rotuloDescartar });
            setEscolhaConvidadoVisivel(true);
        });
    }

    async function finalizarDadosDeConvidado(uid, escolha) {
        if (escolha === 'import') {
            const importado = await migrarDadosDoConvidadoParaConta(uid);
            if (!importado) {
                // Importar dados exige internet: é a única operação que não
                // funciona offline (ver migrarDadosDoConvidadoParaConta).
                Alert.alert(
                    'Erro',
                    'Não deu pra importar seus dados de convidado. Confira sua conexão e tenta de novo — eles continuam salvos aqui no aparelho.'
                );
                return false;
            }
        }

        if (escolha === 'discard') {
            await limparDadosLocaisDoConvidado();
        }

        return true;
    }

    function fecharEscolhaConvidado(resultado) {
        setEscolhaConvidadoVisivel(false);
        setConfigEscolhaConvidado(null);
        const resolver = resolverEscolhaConvidadoRef.current;
        resolverEscolhaConvidadoRef.current = null;
        if (resolver) {
            resolver(resultado);
        }
    }

    // Se a tela sair com o modal aberto, o await de
    // perguntarSobreDadosDeConvidado ficaria órfão pra sempre. Resolve 'cancel',
    // que é o que os dois chamadores já tratam como "não segue".
    useEffect(() => {
        return () => {
            const resolver = resolverEscolhaConvidadoRef.current;
            resolverEscolhaConvidadoRef.current = null;
            if (resolver) {
                resolver('cancel');
            }
        };
    }, []);

    const [request, response, promptAsync] = Google.useAuthRequest({
        webClientId: CLIENT_ID_WEB,
        androidClientId: CLIENT_ID_ANDROID,
        iosClientId: CLIENT_ID_IOS,
        // Sempre mostrar o seletor de conta em vez de reusar a sessão que
        // já estiver aberta no browser.
        selectAccount: true,
    });

    useEffect(() => {
        async function autenticarComGoogle() {
            if (!response) {
                return;
            }

            if (response.type !== 'success') {
                // Cancelou ou deu erro: a escolha sobre os dados de convidado
                // não vale mais. Se ficasse pendurada no ref, o próximo login
                // que desse certo importaria/descartaria sem perguntar.
                escolhaConvidadoGooglePendenteRef.current = 'skip';

                if (response.type === 'error') {
                    Alert.alert('Erro', 'Não deu pra entrar com o Google agora.');
                }
                return;
            }

            // Antes do signIn: é ele que dispara o onAuthStateChanged, e a
            // MainStack não pode montar antes dos dados de convidado irem pro
            // lugar certo.
            iniciarMigracao();
            try {
                const idToken = response.authentication?.idToken ?? response.params?.id_token;
                const accessToken =
                    response.authentication?.accessToken ?? response.params?.access_token;

                if (!idToken && !accessToken) {
                    Alert.alert('Erro', 'Não deu pra pegar seu login do Google. Tenta de novo.');
                    return;
                }

                const credential = GoogleAuthProvider.credential(idToken, accessToken);

                const credencialDoUsuario = await signInWithCredential(auth, credential);

                // Nome/e-mail vêm prontos da conta Google — o login com Google
                // nunca passa pelo SignUpScreen, então é aqui que o doc
                // users/{uid} ganha esses campos. Mesmo critério do cadastro:
                // falhar aqui não desfaz o login, o perfil sobe pela fila
                // offline depois.
                const perfilSalvo = await salvarPerfilDaConta(credencialDoUsuario.user.uid, {
                    nome: credencialDoUsuario.user.displayName ?? '',
                    email: credencialDoUsuario.user.email ?? '',
                });
                if (!perfilSalvo.ok) {
                    console.log('Não deu pra salvar o perfil:', perfilSalvo.motivo);
                }

                await finalizarDadosDeConvidado(
                    credencialDoUsuario.user.uid,
                    escolhaConvidadoGooglePendenteRef.current
                );
                escolhaConvidadoGooglePendenteRef.current = 'skip';
            } catch (erro) {
                console.log('Erro no login com Google:', erro);
                Alert.alert('Erro', 'Não deu pra entrar com o Google agora.');
            } finally {
                concluirMigracao();
            }
        }

        autenticarComGoogle();
    }, [response, iniciarMigracao, concluirMigracao]);

    async function fazerLogin() {
        const emailFormatado = email.trim();

        if (!emailFormatado || !senha) {
            Alert.alert('Opa', 'Preenche seu e-mail e senha pra continuar.');
            return;
        }

        const acao = await perguntarSobreDadosDeConvidado({
            titulo: 'Achamos seus dados de convidado',
            mensagem: `Você tinha dados salvos como convidado. Quer usar esses dados na conta ${emailFormatado} ou começar do zero?`,
            rotuloImportar: 'Usar meus dados',
            rotuloDescartar: 'Começar do zero',
        });

        if (acao === 'cancel') {
            return;
        }

        setCarregando(true);
        // Antes do signIn: é ele que dispara o onAuthStateChanged, e a MainStack
        // não pode montar antes dos dados de convidado irem pro lugar certo.
        iniciarMigracao();
        try {
            const credencialDoUsuario = await signInWithEmailAndPassword(
                auth,
                emailFormatado,
                senha
            );
            await finalizarDadosDeConvidado(credencialDoUsuario.user.uid, acao);
        } catch (erro) {
            if (CREDENCIAIS_INVALIDAS.includes(erro?.code)) {
                Alert.alert('Erro', 'E-mail ou senha incorretos.');
            } else {
                Alert.alert('Erro', 'Não deu pra entrar. Tenta de novo.');
            }
        } finally {
            setCarregando(false);
            concluirMigracao();
        }
    }

    async function handleEsqueceuSenha() {
        if (enviandoReset) {
            return;
        }

        const emailFormatado = email.trim();

        if (!emailFormatado) {
            Alert.alert(
                'Opa',
                'Preenche seu e-mail primeiro pra gente mandar o link de recuperação.'
            );
            return;
        }

        setEnviandoReset(true);
        try {
            await sendPasswordResetEmail(auth, emailFormatado);
            Alert.alert(
                'Link enviado',
                `Se existir uma conta com ${emailFormatado}, o link pra criar uma senha nova chegou no e-mail. Dá uma olhada no spam também.`
            );
        } catch (erro) {
            if (erro?.code === 'auth/invalid-email') {
                Alert.alert('Erro', 'Esse e-mail não parece válido.');
            } else if (erro?.code === 'auth/user-not-found') {
                // Mesma mensagem do sucesso: não entrega quais e-mails têm conta.
                Alert.alert(
                    'Link enviado',
                    `Se existir uma conta com ${emailFormatado}, o link pra criar uma senha nova chegou no e-mail. Dá uma olhada no spam também.`
                );
            } else if (erro?.code === 'auth/too-many-requests') {
                Alert.alert(
                    'Calma lá',
                    'Você pediu muitos links seguidos. Espera um pouco e tenta de novo.'
                );
            } else {
                Alert.alert(
                    'Erro',
                    'Não deu pra enviar o link agora. Confira sua conexão e tenta de novo.'
                );
            }
        } finally {
            setEnviandoReset(false);
        }
    }

    function handleGoogleLogin() {
        if (!request || carregando) {
            return;
        }

        perguntarSobreDadosDeConvidado({
            titulo: 'Achamos seus dados de convidado',
            mensagem: 'Quer levar esses dados pra sua conta Google ou começar do zero?',
            rotuloImportar: 'Levar meus dados',
            rotuloDescartar: 'Começar do zero',
        }).then((acao) => {
            if (acao === 'cancel') {
                return;
            }

            escolhaConvidadoGooglePendenteRef.current = acao;

            setCarregando(true);

            promptAsync()
                .catch((erro) => {
                    console.log(erro);
                    Alert.alert('Erro', 'Não deu pra entrar com o Google.');
                    escolhaConvidadoGooglePendenteRef.current = 'skip';
                })
                .finally(() => {
                    setCarregando(false);
                });
        });
    }

    return (
        <View style={{ flex: 1, backgroundColor: CORES.background }}>
            {/* tela tem fundo branco fixo, sobrescreve o style="light" do App.js */}
            <StatusBar style="dark" />
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.content}>
                        <View style={styles.iconCircle}>
                            <Ionicons
                                name="checkmark-circle-outline"
                                size={32}
                                color={CORES.iconCheck}
                            />
                        </View>

                        <Text style={styles.title}>Respire Livre</Text>
                        <Text style={styles.subtitle}>Sua vida sem vape começa agora</Text>

                        <View style={styles.fieldGroup}>
                            <Text style={styles.label}>E-mail</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons
                                    name="mail-outline"
                                    size={20}
                                    color={CORES.inputIconColor}
                                    style={styles.inputIconLeft}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="seu@email.com"
                                    placeholderTextColor={CORES.placeholderText}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
                                />
                            </View>
                        </View>

                        <View style={styles.fieldGroupLarge}>
                            <Text style={styles.label}>Senha</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons
                                    name="lock-closed-outline"
                                    size={20}
                                    color={CORES.inputIconColor}
                                    style={styles.inputIconLeft}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Digite sua senha"
                                    placeholderTextColor={CORES.placeholderText}
                                    value={senha}
                                    onChangeText={setSenha}
                                    autoCapitalize="none"
                                    secureTextEntry={!mostrarSenha}
                                />
                                <TouchableOpacity
                                    onPress={() => setMostrarSenha((v) => !v)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons
                                        name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
                                        size={20}
                                        color={CORES.inputIconColor}
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.optionsRow}>
                            <TouchableOpacity
                                onPress={handleEsqueceuSenha}
                                disabled={enviandoReset}
                            >
                                <Text
                                    style={[
                                        styles.linkText,
                                        enviandoReset && styles.linkTextDisabled,
                                    ]}
                                >
                                    {enviandoReset ? 'Enviando...' : 'Esqueceu a senha?'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={[styles.button, carregando && styles.buttonDisabled]}
                            onPress={fazerLogin}
                            activeOpacity={0.85}
                            disabled={carregando}
                        >
                            <Text style={styles.buttonText}>
                                {carregando ? 'Entrando...' : 'Entrar'}
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>Ou continue com</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <TouchableOpacity
                            style={styles.googleButton}
                            onPress={handleGoogleLogin}
                            activeOpacity={0.85}
                        >
                            <Ionicons
                                name="logo-google"
                                size={20}
                                color={CORES.googleText}
                                style={styles.googleIcon}
                            />
                            <Text style={styles.googleText}>Google</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.guestButton}
                            onPress={handleContinuarSemConta}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.guestButtonText}>Continuar sem conta</Text>
                        </TouchableOpacity>

                        <View style={styles.footerRow}>
                            <Text style={styles.footerText}>Não tem uma conta? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                                <Text style={styles.footerLink}>Criar conta grátis</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>

                {configEscolhaConvidado ? (
                    <GuestDataChoiceModal
                        visivel={escolhaConvidadoVisivel}
                        titulo={configEscolhaConvidado.titulo}
                        mensagem={configEscolhaConvidado.mensagem}
                        rotuloImportar={configEscolhaConvidado.rotuloImportar}
                        rotuloDescartar={configEscolhaConvidado.rotuloDescartar}
                        aoImportar={() => fecharEscolhaConvidado('import')}
                        aoDescartar={() => fecharEscolhaConvidado('discard')}
                        aoCancelar={() => fecharEscolhaConvidado('cancel')}
                    />
                ) : null}
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
        backgroundColor: CORES.background,
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: CORES.background,
        paddingTop: 40,
        paddingBottom: 32,
    },
    content: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        paddingHorizontal: 28,
    },

    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: CORES.iconCircleBg,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 18,
    },

    title: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        color: CORES.titleText,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: CORES.subtitleText,
        textAlign: 'center',
        lineHeight: 21,
        paddingHorizontal: 8,
        marginBottom: 30,
    },

    fieldGroup: {
        marginBottom: 22,
    },
    fieldGroupLarge: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: CORES.labelText,
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        backgroundColor: CORES.inputBg,
        borderWidth: 1,
        borderColor: CORES.inputBorder,
        borderRadius: 12,
        paddingHorizontal: 14,
    },
    inputIconLeft: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: '100%',
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        color: CORES.inputText,
        padding: 0,
    },

    optionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginBottom: 26,
    },
    linkText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: CORES.linkBlue,
    },
    linkTextDisabled: {
        opacity: 0.6,
    },

    button: {
        height: 50,
        borderRadius: 12,
        backgroundColor: CORES.buttonBg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 2,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
        color: CORES.buttonText,
    },

    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 28,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: CORES.dividerLine,
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        color: CORES.dividerText,
    },

    googleButton: {
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: CORES.googleBorder,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    googleIcon: {
        marginRight: 10,
    },
    googleText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        color: CORES.googleText,
    },

    guestButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        marginBottom: 20,
    },
    guestButtonText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: CORES.linkBlue,
        textDecorationLine: 'underline',
    },

    footerRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        color: CORES.footerText,
    },
    footerLink: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: CORES.linkBlue,
    },
});
