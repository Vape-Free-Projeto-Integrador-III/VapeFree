import React, { useState } from 'react';
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
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
    temDadosLocaisDoConvidado,
    limparDadosLocaisDoConvidado,
    migrarDadosDoConvidadoParaConta,
} from '../utils/storage';
import GuestDataChoiceModal from '../components/GuestDataChoiceModal';

const CORES = {
    background: '#FFFFFF',
    iconCircleBg: '#98FE98',
    iconCheck: '#4A9BB6',
    titleText: '#22384B',
    subtitleText: '#6F747B',
    labelText: '#22384B',
    inputBg: '#F7F8FA',
    inputBorder: '#E1E1E1',
    placeholderText: '#989FA6',
    inputIconColor: '#646B73',
    inputText: '#22384B',
    buttonBg: '#4990E2',
    buttonText: '#FFFFFF',
    footerText: '#6F747B',
    linkBlue: '#6684A7',
};

function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validarSenhaForte(senha) {
    return senha.length >= 8;
}

export default function SignUpScreen({ navigation }) {
    const [nome, setNome] = useState('');
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [senhaConfirmacao, setSenhaConfirmacao] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [mostrarSenhaConfirmacao, setMostrarSenhaConfirmacao] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [escolhaConvidadoVisivel, setEscolhaConvidadoVisivel] = useState(false);
    const [configEscolhaConvidado, setConfigEscolhaConvidado] = useState(null);
    const resolverEscolhaConvidadoRef = React.useRef(null);

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
                // Transferir dados exige internet: é a única operação que não
                // funciona offline (ver migrarDadosDoConvidadoParaConta).
                Alert.alert(
                    'Erro',
                    'Não deu pra transferir seus dados de convidado. Confira sua conexão e tenta de novo — eles continuam salvos aqui no aparelho.'
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

    async function cadastrar() {
        const nomeFormatado = nome.trim();
        const emailFormatado = email.trim();

        if (!nomeFormatado || !emailFormatado || !senha || !senhaConfirmacao) {
            Alert.alert('Opa', 'Preencha nome, e-mail e senha pra continuar.');
            return;
        }

        if (!validarEmail(emailFormatado)) {
            Alert.alert('Opa', 'Esse e-mail não parece válido.');
            return;
        }

        if (!validarSenhaForte(senha)) {
            Alert.alert(
                'Opa',
                'Sua senha precisa ter pelo menos 8 caracteres.'
            );
            return;
        }

        if (senha !== senhaConfirmacao) {
            Alert.alert('Opa', 'As senhas não combinam.');
            return;
        }

        const acao = await perguntarSobreDadosDeConvidado({
            titulo: 'Achamos seus dados de convidado',
            mensagem: `Quer levar esses dados pra sua conta nova ou começar do zero?`,
            rotuloImportar: 'Levar meus dados',
            rotuloDescartar: 'Começar do zero',
        });

        if (acao === 'cancel') {
            return;
        }

        setCarregando(true);

        try {
            const credencialDoUsuario = await createUserWithEmailAndPassword(auth, emailFormatado, senha);

            await updateProfile(credencialDoUsuario.user, {
                displayName: nomeFormatado,
            });

            await setDoc(
                doc(db, 'users', credencialDoUsuario.user.uid),
                {
                    nome: nomeFormatado,
                    displayName: nomeFormatado,
                    email: emailFormatado,
                },
                { merge: true }
            );

            await finalizarDadosDeConvidado(credencialDoUsuario.user.uid, acao);

            Alert.alert('Prontinho', 'Sua conta foi criada!');
            navigation.goBack();
        } catch (erro) {
            if (erro?.code === 'auth/email-already-in-use') {
                Alert.alert('Erro', 'Esse e-mail já tem conta. Tenta outro ou faz login.');
                return;
            }

            if (erro?.code === 'auth/invalid-email') {
                Alert.alert('Erro', 'Esse e-mail não parece válido.');
                return;
            }

            if (erro?.code === 'auth/weak-password') {
                Alert.alert('Erro', 'Essa senha é fraca demais. Tenta uma mais forte.');
                return;
            }

            Alert.alert('Erro', 'Não deu pra criar sua conta. Tenta de novo.');
        } finally {
            setCarregando(false);
        }
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
                        Cria sua conta e começa agora
                    </Text>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Nome completo</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons
                                name="person-outline"
                                size={20}
                                color={CORES.inputIconColor}
                                style={styles.inputIconLeft}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Seu nome"
                                placeholderTextColor={CORES.placeholderText}
                                value={nome}
                                onChangeText={setNome}
                                autoCapitalize="words"
                            />
                        </View>
                    </View>

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

                    <View style={styles.fieldGroupLarge}>
                        <Text style={styles.label}>Confirmar senha</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons
                                name="lock-closed-outline"
                                size={20}
                                color={CORES.inputIconColor}
                                style={styles.inputIconLeft}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Confirme sua senha"
                                placeholderTextColor={CORES.placeholderText}
                                value={senhaConfirmacao}
                                onChangeText={setSenhaConfirmacao}
                                autoCapitalize="none"
                                secureTextEntry={!mostrarSenhaConfirmacao}
                            />
                            <TouchableOpacity
                                onPress={() => setMostrarSenhaConfirmacao((v) => !v)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={mostrarSenhaConfirmacao ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color={CORES.inputIconColor}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.button, carregando && styles.buttonDisabled]}
                        onPress={cadastrar}
                        activeOpacity={0.85}
                        disabled={carregando}
                    >
                        <Text style={styles.buttonText}>{carregando ? 'Criando conta...' : 'Cadastrar'}</Text>
                    </TouchableOpacity>

                    <View style={styles.footerRow}>
                        <Text style={styles.footerText}>Já tem uma conta? </Text>
                        <TouchableOpacity onPress={() => navigation.goBack()}>
                            <Text style={styles.footerLink}>Entrar</Text>
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
