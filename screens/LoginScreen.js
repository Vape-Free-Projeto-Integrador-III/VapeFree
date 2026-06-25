import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithCredential,
} from 'firebase/auth';

import { auth } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

/*Inicio import pro login do google*/
import React, { useState, useEffect } from 'react';

import * as WebBrowser from 'expo-web-browser';

import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();
/*Fim import pro login do google*/

// ─── Paleta extraída diretamente da imagem de referência ──────────────────
const COLORS = {
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

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [lembrarMe, setLembrarMe] = useState(false);
    const [carregando, setCarregando] = useState(false);

    const { continueAsGuest } = useAuth();

    async function handleContinuarSemConta() {
        // Não navegamos manualmente para 'Main'. Assim que isGuest vira
        // true, o AppNavigator troca de stack sozinho — mesmo princípio
        // usado no login normal e no login com Google.
        await continueAsGuest();
    }

    const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'vapefree',
    });

    console.log(redirectUri);

    const [request, response, promptAsync] =
        Google.useAuthRequest({

            webClientId:
                '445859118404-c0b3j87a7t0ej8s503oal396dfp2pdes.apps.googleusercontent.com',

            // OBRIGATÓRIO no Android: sem isso, o app quebra com
            // "Client Id property `androidClientId` must be defined to use
            // Google auth on this platform." assim que a LoginScreen
            // tenta renderizar em um celular Android.
            //
            // Troque pelo Client ID do tipo "Android" criado no Google
            // Cloud Console (veja instruções enviadas no chat).
            androidClientId:
                'COLOQUE_AQUI_O_ANDROID_CLIENT_ID.apps.googleusercontent.com',

            redirectUri,

        });

    useEffect(() => {

        if (response?.type === 'success') {

            const { id_token } =
                response.authentication;

            const credential =
                GoogleAuthProvider.credential(
                    id_token
                );

            signInWithCredential(
                auth,
                credential
            )

                .then(() => {
                    // Não navegamos manualmente para 'Main'.
                    // O onAuthStateChanged (em context/AuthContext.js) vai
                    // detectar o novo usuário autenticado automaticamente
                    // e o AppNavigator troca de tela sozinho.
                })

                .catch(() => {

                    Alert.alert(
                        'Erro',
                        'Não foi possível fazer login com o Google.'
                    );

                });

        }

    }, [response]);


    async function fazerLogin() {
        if (!email.trim() || !senha) {
            Alert.alert('Atenção', 'Preencha seu e-mail e senha para continuar.');
            return;
        }

        setCarregando(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), senha);
            // Não navegamos manualmente para 'Main' aqui.
            // O Firebase dispara onAuthStateChanged assim que o login é
            // concluído, e o AppNavigator (em navigation/AppNavigator.js)
            // reage a isso trocando a stack automaticamente para Main.
        } catch (error) {
            // Mensagem amigável e genérica para qualquer falha de login
            // (usuário inexistente, senha incorreta ou credencial inválida),
            // sem expor detalhes técnicos do Firebase ao usuário final.
            const codigosCredenciaisInvalidas = [
                'auth/user-not-found',
                'auth/wrong-password',
                'auth/invalid-credential',
                'auth/invalid-email',
            ];

            if (codigosCredenciaisInvalidas.includes(error.code)) {
                Alert.alert('Erro', 'E-mail ou senha incorretos.');
            } else {
                Alert.alert('Erro', 'Não foi possível fazer login. Tente novamente.');
            }
        } finally {
            setCarregando(false);
        }
    }

    function handleEsqueceuSenha() {
        // TODO: navegar para um fluxo real de recuperação de senha quando existir.
        Alert.alert('Recuperar senha', 'Em breve você poderá redefinir sua senha por aqui.');
    }

    async function handleGoogleLogin() {
        // Em React Native não existe signInWithPopup (API exclusiva da Web).
        // O fluxo correto com expo-auth-session é abrir a tela de
        // autenticação do Google via promptAsync(); o resultado é tratado
        // no useEffect acima, que finaliza o login com signInWithCredential.
        try {
            setCarregando(true);
            await promptAsync();
        } catch (error) {
            console.log(error);
            Alert.alert(
                'Erro',
                'Não foi possível fazer login com o Google.'
            );
        } finally {
            setCarregando(false);
        }
    }

    return (
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
                    {/* Logo / selo */}
                    <View style={styles.iconCircle}>
                        <Ionicons name="checkmark-circle-outline" size={32} color={COLORS.iconCheck} />
                    </View>

                    {/* Título e subtítulo */}
                    <Text style={styles.title}>Respire Livre</Text>
                    <Text style={styles.subtitle}>
                        Sua jornada para uma vida sem vape começa aqui
                    </Text>

                    {/* Campo E-mail */}
                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>E-mail</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons
                                name="mail-outline"
                                size={20}
                                color={COLORS.inputIconColor}
                                style={styles.inputIconLeft}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="seu@email.com"
                                placeholderTextColor={COLORS.placeholderText}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                            />
                        </View>
                    </View>

                    {/* Campo Senha */}
                    <View style={styles.fieldGroupLarge}>
                        <Text style={styles.label}>Senha</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={20}
                                color={COLORS.inputIconColor}
                                style={styles.inputIconLeft}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Digite sua senha"
                                placeholderTextColor={COLORS.placeholderText}
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
                                    color={COLORS.inputIconColor}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Lembrar-me / Esqueceu a senha */}
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

                    {/* Botão Entrar */}
                    <TouchableOpacity
                        style={[styles.button, carregando && styles.buttonDisabled]}
                        onPress={fazerLogin}
                        activeOpacity={0.85}
                        disabled={carregando}
                    >
                        <Text style={styles.buttonText}>{carregando ? 'Entrando...' : 'Entrar'}</Text>
                    </TouchableOpacity>

                    {/* Divisor "Ou continue com" */}
                    <View style={styles.dividerRow}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>Ou continue com</Text>
                        <View style={styles.dividerLine} />
                    </View>

                    {/* Botão Google */}
                    <TouchableOpacity
                        style={styles.googleButton}
                        onPress={handleGoogleLogin}
                        activeOpacity={0.85}>

                        <Ionicons
                            name="logo-google"
                            size={20}
                            color={COLORS.googleText}
                            style={styles.googleIcon}
                        />
                        <Text style={styles.googleText}>Google</Text>
                    </TouchableOpacity>

                    {/* Botão Continuar sem conta (modo convidado) */}
                    <TouchableOpacity
                        style={styles.guestButton}
                        onPress={handleContinuarSemConta}
                        activeOpacity={0.7}>
                        <Text style={styles.guestButtonText}>Continuar sem conta</Text>
                    </TouchableOpacity>

                    {/* Rodapé */}
                    <View style={styles.footerRow}>
                        <Text style={styles.footerText}>Não tem uma conta? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                            <Text style={styles.footerLink}>Cadastre-se gratuitamente</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        flexGrow: 1,
        backgroundColor: COLORS.background,
        paddingTop: 40,
        paddingBottom: 32,
    },
    content: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        paddingHorizontal: 28,
    },

    // Logo
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.iconCircleBg,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 18,
    },

    // Cabeçalho
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.titleText,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        fontWeight: '400',
        color: COLORS.subtitleText,
        textAlign: 'center',
        lineHeight: 21,
        paddingHorizontal: 8,
        marginBottom: 30,
    },

    // Campos
    fieldGroup: {
        marginBottom: 22,
    },
    fieldGroupLarge: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.labelText,
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 50,
        backgroundColor: COLORS.inputBg,
        borderWidth: 1,
        borderColor: COLORS.inputBorder,
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
        color: COLORS.inputText,
        padding: 0,
    },

    // Lembrar-me / Esqueceu a senha
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
        borderColor: COLORS.checkboxBorder,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        backgroundColor: 'transparent',
    },
    checkboxChecked: {
        backgroundColor: COLORS.checkboxCheckedBg,
        borderColor: COLORS.checkboxCheckedBg,
    },
    rememberText: {
        fontSize: 14,
        color: COLORS.rememberText,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.linkBlue,
    },

    // Botão Entrar
    button: {
        height: 50,
        borderRadius: 12,
        backgroundColor: COLORS.buttonBg,
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
        fontWeight: '700',
        color: COLORS.buttonText,
    },

    // Divisor
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 28,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: COLORS.dividerLine,
    },
    dividerText: {
        marginHorizontal: 12,
        fontSize: 13,
        color: COLORS.dividerText,
    },

    // Botão Google
    googleButton: {
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.googleBorder,
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
        fontWeight: '600',
        color: COLORS.googleText,
    },

    // Botão Continuar sem conta
    guestButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        marginBottom: 20,
    },
    guestButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.linkBlue,
        textDecorationLine: 'underline',
    },

    // Rodapé
    footerRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 14,
        color: COLORS.footerText,
    },
    footerLink: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.linkBlue,
    },
});