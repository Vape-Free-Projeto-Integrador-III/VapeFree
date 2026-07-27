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
import { Ionicons } from '@expo/vector-icons';

import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithCredential,
} from 'firebase/auth';

import { auth } from '../services/firebase';
import { usarAuth } from '../context/AuthContext';
import {
    temDadosLocaisDoConvidado,
    limparDadosLocaisDoConvidado,
    migrarDadosDoConvidadoParaConta,
} from '../utils/storage';
import GuestDataChoiceModal from '../components/GuestDataChoiceModal';

/*Inicio import pro login do google*/
import React, { useState, useEffect } from 'react';

import * as WebBrowser from 'expo-web-browser';

import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();
/*Fim import pro login do google*/

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
    checkboxBorder: '#757575',
    checkboxCheckedBg: '#4990E2',
    rememberText: '#22384B',
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
    const [lembrarMe, setLembrarMe] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [escolhaConvidadoVisivel, setEscolhaConvidadoVisivel] = useState(false);
    const [configEscolhaConvidado, setConfigEscolhaConvidado] = useState(null);
    const resolverEscolhaConvidadoRef = React.useRef(null);
    const escolhaConvidadoGooglePendenteRef = React.useRef('skip');

    const { continuarSemConta } = usarAuth();

    async function handleContinuarSemConta() {
        await continuarSemConta();
    }

    async function perguntarSobreDadosDeConvidado({ titulo, mensagem, rotuloImportar, rotuloDescartar }) {
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

    const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'vapefree',
    });

    console.log(redirectUri);

    const [request, response, promptAsync] =
        Google.useAuthRequest({

            webClientId:
                '445859118404-c0b3j87a7t0ej8s503oal396dfp2pdes.apps.googleusercontent.com',

            androidClientId:
                'COLOQUE_AQUI_O_ANDROID_CLIENT_ID.apps.googleusercontent.com',

            redirectUri,

        });

    useEffect(() => {
        async function autenticarComGoogle() {
            if (response?.type !== 'success') {
                return;
            }

            try {
                const idToken = response.authentication?.idToken ?? response.params?.id_token;
                const accessToken = response.authentication?.accessToken ?? response.params?.access_token;

                if (!idToken && !accessToken) {
                    Alert.alert(
                        'Erro',
                        'Não deu pra pegar seu login do Google. Tenta de novo.'
                    );
                    return;
                }

                const credential = GoogleAuthProvider.credential(idToken, accessToken);

                const credencialDoUsuario = await signInWithCredential(auth, credential);
                await finalizarDadosDeConvidado(credencialDoUsuario.user.uid, escolhaConvidadoGooglePendenteRef.current);
                escolhaConvidadoGooglePendenteRef.current = 'skip';
            } catch (erro) {
                console.log('Erro no login com Google:', erro);
                Alert.alert(
                    'Erro',
                    'Não deu pra entrar com o Google agora.'
                );
            }
        }

        autenticarComGoogle();
    }, [response]);


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
        try {
            const credencialDoUsuario = await signInWithEmailAndPassword(auth, emailFormatado, senha);
            await finalizarDadosDeConvidado(credencialDoUsuario.user.uid, acao);
        } catch (erro) {
            if (CREDENCIAIS_INVALIDAS.includes(erro?.code)) {
                Alert.alert('Erro', 'E-mail ou senha incorretos.');
            } else {
                Alert.alert('Erro', 'Não deu pra entrar. Tenta de novo.');
            }
        } finally {
            setCarregando(false);
        }
    }

    function handleEsqueceuSenha() {
        Alert.alert('Ainda não rolou', 'Em breve você vai poder trocar sua senha por aqui.');
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
                    Alert.alert(
                        'Erro',
                        'Não deu pra entrar com o Google.'
                    );
                    escolhaConvidadoGooglePendenteRef.current = 'skip';
                })
                .finally(() => {
                    setCarregando(false);
                });
        });
    }

    return (
        <View style={{ flex: 1, backgroundColor: CORES.background }}>
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
                        <Ionicons name="checkmark-circle-outline" size={32} color={CORES.iconCheck} />
                    </View>

                    <Text style={styles.title}>Respire Livre</Text>
                    <Text style={styles.subtitle}>
                        Sua vida sem vape começa agora
                    </Text>

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
                            style={styles.rememberWrap}
                            onPress={() => setLembrarMe((v) => !v)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.checkbox, lembrarMe && styles.checkboxChecked]}>
                                {lembrarMe && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                            </View>
                            <Text style={styles.rememberText}>Lembrar-me</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={handleEsqueceuSenha}>
                            <Text style={styles.linkText}>Esqueceu a senha?</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, carregando && styles.buttonDisabled]}
                        onPress={fazerLogin}
                        activeOpacity={0.85}
                        disabled={carregando}
                    >
                        <Text style={styles.buttonText}>{carregando ? 'Entrando...' : 'Entrar'}</Text>
                    </TouchableOpacity>

                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>Ou continue com</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    <TouchableOpacity
                        style={styles.googleButton}
                        onPress={handleGoogleLogin}
                        activeOpacity={0.85}>

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
                        activeOpacity={0.7}>
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
        fontSize: 15, fontFamily: 'Poppins_400Regular',
        color: CORES.inputText,
        padding: 0,
    },

    optionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 26,
    },
    rememberWrap: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 3,
        borderWidth: 1.5,
        borderColor: CORES.checkboxBorder,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        backgroundColor: 'transparent',
    },
    checkboxChecked: {
        backgroundColor: CORES.checkboxCheckedBg,
        borderColor: CORES.checkboxCheckedBg,
    },
    rememberText: {
        fontSize: 14, fontFamily: 'Poppins_400Regular',
        color: CORES.rememberText,
    },
    linkText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        color: CORES.linkBlue,
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
        fontSize: 13, fontFamily: 'Poppins_400Regular',
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
        fontSize: 14, fontFamily: 'Poppins_400Regular',
        color: CORES.footerText,
    },
    footerLink: {
        fontSize: 14,
        fontFamily: 'Poppins_700Bold',
        color: CORES.linkBlue,
    },
});
