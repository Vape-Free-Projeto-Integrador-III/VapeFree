//
// Tela de conta: editar nome, trocar e-mail, trocar senha e excluir a conta.
// Só existe pra usuário logado — o convidado não tem conta pra editar (a
// SettingsScreen nem mostra o atalho).
//
// Esta tela fala com `firebase/auth` direto, como as telas de auth (ver
// docs/auth.md): nome/e-mail/senha são estado do Firebase Auth, não dado de
// domínio. O que é dado (o doc users/{uid}) continua passando por
// utils/storage.js — salvarPerfilDaConta no nome, apagarContaNoBanco na
// exclusão.
//
// Trocar e-mail/senha e excluir conta são operações "sensíveis": o Firebase
// exige login recente. Por isso pedimos a senha atual e refazemos a
// autenticação (reauthenticateWithCredential) antes de cada uma. Quem entrou
// com Google não tem senha — nesse caso não dá pra reautenticar aqui, e a tela
// pede pra sair e entrar de novo.

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    EmailAuthProvider,
    deleteUser,
    reauthenticateWithCredential,
    updatePassword,
    updateProfile,
    verifyBeforeUpdateEmail,
} from 'firebase/auth';

import Alert from '../utils/alert';
import { auth } from '../services/firebase';
import { usarAuth } from '../context/AuthContext';
import { usarTema } from '../context/ThemeContext';
import { usarToast } from '../context/ToastContext';
import { RAIO, SOMBRA } from '../utils/theme';
import { apagarContaNoBanco, salvarPerfilDaConta } from '../utils/storage';
import ScreenHeader from '../components/ScreenHeader';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarSenhaForte(senha) {
    return senha.length >= 8 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha);
}

// Mensagem de erro por código do Firebase. O resto cai num texto genérico —
// código cru não ajuda ninguém.
//
// `ehReautenticacao` separa as duas fases: só o erro vindo do
// reauthenticateWithCredential pode virar "senha atual incorreta". Erro de
// credencial vindo DEPOIS (a senha/e-mail já foi trocado) fala outra coisa —
// avisar "senha atual incorreta" numa troca que deu certo era exatamente o
// que confundia o usuário.
function mensagemDoErro(erro, ehReautenticacao = false) {
    switch (erro?.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return ehReautenticacao
                ? 'Senha atual incorreta.'
                : 'A operação foi feita, mas sua sessão expirou. Sai e entra de novo.';
        case 'auth/too-many-requests':
            return 'Muitas tentativas seguidas. Espera um pouco e tenta de novo.';
        case 'auth/email-already-in-use':
            return 'Esse e-mail já está em uso por outra conta.';
        case 'auth/invalid-email':
            return 'Esse e-mail não parece válido.';
        case 'auth/weak-password':
            return 'Essa senha é fraca demais. Tenta uma mais forte.';
        case 'auth/requires-recent-login':
            return 'Por segurança, sai e entra de novo na conta antes de fazer isso.';
        case 'auth/network-request-failed':
            return 'Sem conexão. Confere sua internet e tenta de novo.';
        default:
            return 'Não deu pra concluir. Tenta de novo daqui a pouco.';
    }
}

export default function AccountScreen({ navigation }) {
    const { cores } = usarTema();
    const { usuario, sair } = usarAuth();
    const { mostrarErro, mostrarAviso } = usarToast();

    const usaSenha = !!usuario?.providerData?.some((p) => p.providerId === 'password');

    const [nome, setNome] = useState(usuario?.displayName ?? '');
    const [email, setEmail] = useState(usuario?.email ?? '');
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmacaoDaSenha, setConfirmacaoDaSenha] = useState('');
    const [mostrarSenhas, setMostrarSenhas] = useState(false);
    const [ocupado, setOcupado] = useState(null);
    // `ocupado` é state: entre o toque e o re-render o botão ainda está
    // habilitado, e dois toques rápidos disparavam a operação duas vezes. Na
    // troca de senha isso dava um falso "senha atual incorreta" — a segunda
    // chamada reautenticava com a senha antiga, que acabara de ser trocada
    // pela primeira. O ref fecha essa janela (mesmo padrão do OnboardingScreen).
    const emAndamentoRef = React.useRef(false);

    function limparSenhas() {
        setSenhaAtual('');
        setNovaSenha('');
        setConfirmacaoDaSenha('');
    }

    // Refaz o login com a senha atual. É o que destrava updateEmail/
    // updatePassword/deleteUser quando a sessão já está velha.
    //
    // Erro daqui é SEMPRE de credencial ("senha atual incorreta"). Quem chama
    // trata a reautenticação e a operação em blocos separados de propósito: um
    // catch único faria um erro posterior (já com a senha trocada) ser
    // anunciado como senha errada.
    async function reautenticar() {
        const credencial = EmailAuthProvider.credential(auth.currentUser.email, senhaAtual);
        await reauthenticateWithCredential(auth.currentUser, credencial);
    }

    // Envolve uma operação sensível: trava o duplo toque, marca `ocupado`,
    // reautentica e só então roda `operacao`. Devolve true se rodou até o fim.
    async function executarOperacaoSensivel(chave, operacao, { exigeSenha = usaSenha } = {}) {
        if (emAndamentoRef.current) return false;
        emAndamentoRef.current = true;
        setOcupado(chave);

        try {
            if (exigeSenha) {
                try {
                    await reautenticar();
                } catch (erro) {
                    mostrarErro('Erro', mensagemDoErro(erro, true));
                    return false;
                }
            }

            await operacao();
            return true;
        } catch (erro) {
            mostrarErro('Erro', mensagemDoErro(erro));
            return false;
        } finally {
            emAndamentoRef.current = false;
            setOcupado(null);
        }
    }

    async function handleSalvarNome() {
        const nomeFormatado = nome.trim();

        if (!nomeFormatado) {
            mostrarErro('Opa', 'Coloca um nome pra continuar.');
            return;
        }
        if (nomeFormatado === usuario?.displayName) {
            mostrarAviso('Nada mudou', 'Esse já é o seu nome atual.');
            return;
        }

        // Trocar o nome não é operação sensível: não precisa de senha.
        await executarOperacaoSensivel(
            'nome',
            async () => {
                await updateProfile(auth.currentUser, { displayName: nomeFormatado });
                await salvarPerfilDaConta(auth.currentUser.uid, {
                    nome: nomeFormatado,
                    email: auth.currentUser.email,
                });
                mostrarAviso('Pronto', 'Seu nome foi atualizado.', 'sucesso');
            },
            { exigeSenha: false }
        );
    }

    async function handleTrocarEmail() {
        const emailFormatado = email.trim().toLowerCase();

        if (!EMAIL_VALIDO.test(emailFormatado)) {
            mostrarErro('Opa', 'Digita um e-mail válido.');
            return;
        }
        if (emailFormatado === usuario?.email) {
            mostrarAviso('Nada mudou', 'Esse já é o seu e-mail atual.');
            return;
        }
        if (!senhaAtual) {
            mostrarErro('Opa', 'Digita sua senha atual pra confirmar a troca.');
            return;
        }

        await executarOperacaoSensivel('email', async () => {
            // verifyBeforeUpdateEmail (e não updateEmail): o e-mail só troca de
            // verdade depois que o usuário clica no link enviado pro endereço
            // novo. É o caminho que o Firebase mantém com a proteção contra
            // enumeração de e-mail ligada.
            await verifyBeforeUpdateEmail(auth.currentUser, emailFormatado);
            limparSenhas();
            Alert.alert(
                'Confirma no seu e-mail',
                `Mandamos um link de confirmação pra ${emailFormatado}. O e-mail da conta só troca depois que você clicar nele.`
            );
        });
    }

    async function handleTrocarSenha() {
        if (!senhaAtual || !novaSenha || !confirmacaoDaSenha) {
            mostrarErro('Opa', 'Preenche a senha atual e a nova senha.');
            return;
        }
        if (!validarSenhaForte(novaSenha)) {
            mostrarErro(
                'Opa',
                'A nova senha precisa ter pelo menos 8 caracteres, com letra e número.'
            );
            return;
        }
        if (novaSenha !== confirmacaoDaSenha) {
            mostrarErro('Opa', 'As senhas não combinam.');
            return;
        }
        if (novaSenha === senhaAtual) {
            mostrarErro('Opa', 'A nova senha precisa ser diferente da atual.');
            return;
        }

        await executarOperacaoSensivel('senha', async () => {
            await updatePassword(auth.currentUser, novaSenha);
            limparSenhas();
            mostrarAviso('Pronto', 'Sua senha foi trocada.', 'sucesso');
        });
    }

    function handleExcluirConta() {
        if (usaSenha && !senhaAtual) {
            mostrarErro('Opa', 'Digita sua senha atual pra confirmar a exclusão.');
            return;
        }

        Alert.alert(
            'Excluir conta',
            'Isso apaga sua conta e todo o seu progresso pra sempre: registros, conquistas, missões e economia. Não dá pra desfazer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Excluir tudo', style: 'destructive', onPress: excluirConta },
            ]
        );
    }

    async function excluirConta() {
        await executarOperacaoSensivel('excluir', async () => {
            // Ordem importa: os dados no Firestore precisam ir embora ENQUANTO
            // o usuário ainda existe — depois do deleteUser não há mais quem
            // tenha permissão de escrever em users/{uid}.
            const resultado = await apagarContaNoBanco(auth.currentUser.uid);
            if (!resultado.ok) {
                mostrarErro(
                    'Erro',
                    'Não deu pra apagar seus dados agora. Excluir a conta precisa de internet — tenta de novo conectado.'
                );
                return;
            }

            await deleteUser(auth.currentUser);
            // O onAuthStateChanged já joga o app pra AuthStack; sair() só limpa
            // o modo convidado e a próxima tela de auth.
            await sair('Login');
        });
    }

    function renderizarCampo({ rotulo, icone, ...propsDoInput }) {
        return (
            <View style={styles.campo}>
                <Text style={[styles.label, { color: cores.textSecondary }]}>{rotulo}</Text>
                <View
                    style={[
                        styles.inputWrap,
                        { backgroundColor: cores.inputBg, borderColor: cores.border },
                    ]}
                >
                    <Ionicons name={icone} size={18} color={cores.textMuted} />
                    <TextInput
                        style={[styles.input, { color: cores.text }]}
                        placeholderTextColor={cores.textMuted}
                        {...propsDoInput}
                    />
                </View>
            </View>
        );
    }

    function renderizarBotao(rotulo, aoPressionar, chave, estilo = {}) {
        const carregando = ocupado === chave;
        return (
            <TouchableOpacity
                style={[styles.botao, { backgroundColor: cores.primary }, estilo, SOMBRA.pequena]}
                onPress={aoPressionar}
                disabled={!!ocupado}
                activeOpacity={0.85}
            >
                {carregando ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.botaoTexto}>{rotulo}</Text>
                )}
            </TouchableOpacity>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: cores.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={[styles.scroll, { backgroundColor: cores.background }]}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <ScreenHeader
                    titulo="Conta"
                    subtitulo="Seus dados de acesso"
                    cores={cores}
                    aoPressionarVoltar={() => navigation.goBack()}
                />

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    <Text style={[styles.cardTitulo, { color: cores.text }]}>Nome</Text>
                    {renderizarCampo({
                        rotulo: 'Como você quer ser chamado',
                        icone: 'person-outline',
                        placeholder: 'Seu nome',
                        value: nome,
                        onChangeText: setNome,
                        autoCapitalize: 'words',
                    })}
                    {renderizarBotao('Salvar nome', handleSalvarNome, 'nome')}
                </View>

                {usaSenha ? (
                    <>
                        <View
                            style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}
                        >
                            <Text style={[styles.cardTitulo, { color: cores.text }]}>
                                Senha atual
                            </Text>
                            <Text style={[styles.cardTexto, { color: cores.textSecondary }]}>
                                Trocar e-mail, trocar senha ou excluir a conta precisa da sua senha
                                atual.
                            </Text>
                            <View style={styles.campo}>
                                <View
                                    style={[
                                        styles.inputWrap,
                                        {
                                            backgroundColor: cores.inputBg,
                                            borderColor: cores.border,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="lock-closed-outline"
                                        size={18}
                                        color={cores.textMuted}
                                    />
                                    <TextInput
                                        style={[styles.input, { color: cores.text }]}
                                        placeholder="Sua senha atual"
                                        placeholderTextColor={cores.textMuted}
                                        value={senhaAtual}
                                        onChangeText={setSenhaAtual}
                                        secureTextEntry={!mostrarSenhas}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setMostrarSenhas((v) => !v)}>
                                        <Ionicons
                                            name={mostrarSenhas ? 'eye-off-outline' : 'eye-outline'}
                                            size={18}
                                            color={cores.textMuted}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        <View
                            style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}
                        >
                            <Text style={[styles.cardTitulo, { color: cores.text }]}>E-mail</Text>
                            {renderizarCampo({
                                rotulo: 'E-mail da conta',
                                icone: 'mail-outline',
                                placeholder: 'seu@email.com',
                                value: email,
                                onChangeText: setEmail,
                                autoCapitalize: 'none',
                                keyboardType: 'email-address',
                            })}
                            {renderizarBotao('Trocar e-mail', handleTrocarEmail, 'email')}
                        </View>

                        <View
                            style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}
                        >
                            <Text style={[styles.cardTitulo, { color: cores.text }]}>
                                Trocar senha
                            </Text>
                            {renderizarCampo({
                                rotulo: 'Nova senha',
                                icone: 'key-outline',
                                placeholder: 'Pelo menos 8 caracteres, com letra e número',
                                value: novaSenha,
                                onChangeText: setNovaSenha,
                                secureTextEntry: !mostrarSenhas,
                                autoCapitalize: 'none',
                            })}
                            {renderizarCampo({
                                rotulo: 'Confirmar nova senha',
                                icone: 'key-outline',
                                placeholder: 'Repete a nova senha',
                                value: confirmacaoDaSenha,
                                onChangeText: setConfirmacaoDaSenha,
                                secureTextEntry: !mostrarSenhas,
                                autoCapitalize: 'none',
                            })}
                            {renderizarBotao('Trocar senha', handleTrocarSenha, 'senha')}
                        </View>
                    </>
                ) : (
                    <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                        <Text style={[styles.cardTitulo, { color: cores.text }]}>
                            E-mail e senha
                        </Text>
                        <Text style={[styles.cardTexto, { color: cores.textSecondary }]}>
                            Você entrou com o Google, então o e-mail e a senha são gerenciados por
                            lá — dá pra trocar na sua conta Google.
                        </Text>
                    </View>
                )}

                <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.pequena]}>
                    <Text style={[styles.cardTitulo, { color: cores.danger }]}>Excluir conta</Text>
                    <Text style={[styles.cardTexto, { color: cores.textSecondary }]}>
                        Apaga sua conta e todo o progresso pra sempre. Precisa de internet.
                    </Text>
                    {renderizarBotao('Excluir minha conta', handleExcluirConta, 'excluir', {
                        backgroundColor: cores.danger,
                    })}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 32 },
    card: {
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: RAIO.lg,
        padding: 16,
    },
    cardTitulo: { fontSize: 16, fontFamily: 'Poppins_700Bold' },
    cardTexto: { fontSize: 13, fontFamily: 'Poppins_400Regular', lineHeight: 19, marginTop: 6 },
    campo: { marginTop: 12 },
    label: {
        fontSize: 11,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        marginBottom: 6,
    },
    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: RAIO.md,
        paddingHorizontal: 12,
        minHeight: 48,
    },
    input: { flex: 1, fontSize: 14, fontFamily: 'Poppins_400Regular', paddingVertical: 10 },
    botao: {
        marginTop: 14,
        minHeight: 46,
        borderRadius: RAIO.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    botaoTexto: { color: '#fff', fontSize: 14, fontFamily: 'Poppins_700Bold' },
});
