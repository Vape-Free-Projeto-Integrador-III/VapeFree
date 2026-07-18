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
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
    hasGuestLocalData,
    clearGuestLocalData,
    migrateGuestLocalDataToUser,
} from '../utils/storage';
import GuestDataChoiceModal from '../components/GuestDataChoiceModal';

const COLORS = {
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
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [guestChoiceVisible, setGuestChoiceVisible] = useState(false);
    const [guestChoiceConfig, setGuestChoiceConfig] = useState(null);
    const guestChoiceResolverRef = React.useRef(null);

    async function perguntarSobreDadosDeConvidado({ title, message, importLabel, discardLabel }) {
        if (!(await hasGuestLocalData())) {
            return 'skip';
        }

        return new Promise((resolve) => {
            guestChoiceResolverRef.current = resolve;
            setGuestChoiceConfig({ title, message, importLabel, discardLabel });
            setGuestChoiceVisible(true);
        });
    }

    async function finalizarDadosDeConvidado(uid, choice) {
        if (choice === 'import') {
            const imported = await migrateGuestLocalDataToUser(uid);
            if (!imported) {
                Alert.alert('Erro', 'Não foi possível transferir os dados do convidado para a conta.');
                return false;
            }
        }

        if (choice === 'discard') {
            await clearGuestLocalData();
        }

        return true;
    }

    function closeGuestChoice(result) {
        setGuestChoiceVisible(false);
        setGuestChoiceConfig(null);
        const resolver = guestChoiceResolverRef.current;
        guestChoiceResolverRef.current = null;
        if (resolver) {
            resolver(result);
        }
    }

    async function cadastrar() {
        const nomeFormatado = nome.trim();
        const emailFormatado = email.trim();

        if (!nomeFormatado || !emailFormatado || !senha) {
            Alert.alert('Atenção', 'Preencha nome, e-mail e senha para continuar.');
            return;
        }

        if (!validarEmail(emailFormatado)) {
            Alert.alert('Atenção', 'Informe um e-mail válido.');
            return;
        }

        if (!validarSenhaForte(senha)) {
            Alert.alert(
                'Atenção',
                'Sua senha precisa ter no mínimo 8 caracteres.'
            );
            return;
        }

        const acao = await perguntarSobreDadosDeConvidado({
            title: 'Dados de convidado encontrados',
            message: `Você já tem dados salvos como convidado. Deseja transferi-los para a conta ${nomeFormatado} ou começar do zero?`,
            importLabel: 'Transferir dados do convidado',
            discardLabel: 'Começar do zero',
        });

        if (acao === 'cancel') {
            return;
        }

        setCarregando(true);

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, emailFormatado, senha);

            await updateProfile(userCredential.user, {
                displayName: nomeFormatado,
            });

            await setDoc(
                doc(db, 'users', userCredential.user.uid),
                {
                    nome: nomeFormatado,
                    displayName: nomeFormatado,
                    email: emailFormatado,
                },
                { merge: true }
            );

            await finalizarDadosDeConvidado(userCredential.user.uid, acao);

            Alert.alert('Sucesso', 'Conta criada com sucesso!');
            navigation.goBack();
        } catch (error) {
            if (error?.code === 'auth/email-already-in-use') {
                Alert.alert('Erro', 'Este e-mail já está cadastrado. Use outro e-mail ou faça login.');
                return;
            }

            if (error?.code === 'auth/invalid-email') {
                Alert.alert('Erro', 'Informe um e-mail válido.');
                return;
            }

            if (error?.code === 'auth/weak-password') {
                Alert.alert('Erro', 'A senha informada é muito fraca. Use uma senha mais forte.');
                return;
            }

            Alert.alert('Erro', 'Não foi possível criar sua conta. Tente novamente.');
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
                    <View style={styles.iconCircle}>
                        <Ionicons name="checkmark-circle-outline" size={32} color={COLORS.iconCheck} />
                    </View>

                    <Text style={styles.title}>Respire Livre</Text>
                    <Text style={styles.subtitle}>
                        Crie sua conta e comece sua jornada sem vape
                    </Text>

                    <View style={styles.fieldGroup}>
                        <Text style={styles.label}>Nome completo</Text>
                        <View style={styles.inputContainer}>
                            <Ionicons
                                name="person-outline"
                                size={20}
                                color={COLORS.inputIconColor}
                                style={styles.inputIconLeft}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Seu nome"
                                placeholderTextColor={COLORS.placeholderText}
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
                            <Text style={styles.footerLink}>Faça login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            {guestChoiceConfig ? (
                <GuestDataChoiceModal
                    visible={guestChoiceVisible}
                    title={guestChoiceConfig.title}
                    message={guestChoiceConfig.message}
                    importLabel={guestChoiceConfig.importLabel}
                    discardLabel={guestChoiceConfig.discardLabel}
                    onImport={() => closeGuestChoice('import')}
                    onDiscard={() => closeGuestChoice('discard')}
                    onCancel={() => closeGuestChoice('cancel')}
                />
            ) : null}
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
