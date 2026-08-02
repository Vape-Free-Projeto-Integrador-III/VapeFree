//
// Context responsável por TODO o gerenciamento de sessão do app.
// Ele escuta o Firebase Authentication via onAuthStateChanged() e
// expõe o usuário atual (ou null) para o restante da aplicação.
//
// Também controla o "modo convidado": o usuário pode optar por usar o
// app sem fazer login (os dados, nesse caso, ficam só no AsyncStorage do
// aparelho — ver utils/storage.js). Essa escolha é lembrada entre
// aberturas do app através de um flag simples salvo no AsyncStorage.
//
// Nenhuma senha ou dado sensível é armazenado aqui ou em AsyncStorage:
// a persistência da sessão de LOGIN é feita inteiramente pelo SDK do
// Firebase (ver services/firebase.js). O AsyncStorage usado aqui guarda
// apenas a preferência "está em modo convidado?" (true/false).

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import { contarPendencias, sincronizar } from '../utils/offline';
import { descartarEspelhoDaConta } from '../utils/storage';
import {
    aplicarPreferenciasDeNotificacao,
    cancelarNotificacoesMotivacionais,
    cancelarNotificacaoDeStreak,
    cancelarLembreteDeRisco,
    cancelarLembreteDeDiaCritico,
} from '../utils/notifications';

const CHAVE_MODO_CONVIDADO = '@vapefree_guest_mode';

const AuthContext = createContext({
    usuario: null,
    ehConvidado: false,
    telaDeAuth: 'Login',
    inicializando: true,
    migrando: false,
    iniciarMigracao: () => {},
    concluirMigracao: () => {},
    continuarSemConta: async () => {},
    sair: async () => {},
});

export function AuthProvider({ children }) {
    const [usuario, setUsuario] = useState(null);
    const [ehConvidado, setEhConvidado] = useState(false);
    const [telaDeAuth, setTelaDeAuth] = useState('Login');
    // "inicializando" controla a checagem inicial da sessão ao abrir o app.
    // Enquanto o Firebase não responder se existe (ou não) um usuário
    // autenticado, não decidimos a tela inicial (Main ou Login).
    const [inicializando, setInicializando] = useState(true);
    // "migrando" cobre a janela entre o signIn e o fim do tratamento dos dados
    // de convidado (importar/descartar). O onAuthStateChanged dispara no meio
    // dessa janela, então sem essa trava a MainStack montaria e a HomeScreen
    // rodaria carregar() em paralelo com a migração — gravando XP/economia/
    // aberturas derivados de um histórico ainda vazio por cima do que a
    // migração acabou de subir (ou vice-versa). Ver docs/auth.md.
    const [migrando, setMigrando] = useState(false);

    useEffect(() => {
        let montado = true;

        // Lê, em paralelo com a checagem do Firebase, se o usuário já tinha
        // escolhido "continuar sem conta" numa sessão anterior.
        AsyncStorage.getItem(CHAVE_MODO_CONVIDADO)
            .then((valor) => {
                if (montado && valor === 'true') {
                    setEhConvidado(true);
                }
            })
            .catch(() => {});

        // onAuthStateChanged é chamado automaticamente:
        // - assim que o app abre (com o usuário restaurado da sessão, se houver)
        // - sempre que o usuário faz login
        // - sempre que o usuário faz logout
        const cancelarInscricao = onAuthStateChanged(
            auth,
            (usuarioDoFirebase) => {
                setUsuario(usuarioDoFirebase);
                // Sempre que o callback disparar pela primeira vez (login existente,
                // ou null caso não haja sessão), a checagem inicial terminou.
                setInicializando(false);

                // Se um usuário REAL acabou de logar, não faz sentido continuar
                // marcado como convidado ao mesmo tempo.
                if (usuarioDoFirebase) {
                    setEhConvidado(false);
                    setTelaDeAuth('Login');
                    AsyncStorage.removeItem(CHAVE_MODO_CONVIDADO).catch(() => {});
                } else {
                    // Rede de segurança: sem usuário não há migração possível,
                    // então nunca deixamos a trava presa (ex.: logout no meio).
                    setMigrando(false);
                }
            },
            (erro) => {
                // Se o listener falhar por algum motivo (ex.: erro interno de
                // persistência), não deixamos a tela presa em loading: tratamos
                // como "sem usuário autenticado" e mostramos a tela de Login.
                console.log('Erro no onAuthStateChanged:', erro);
                setUsuario(null);
                setInicializando(false);
            }
        );

        return () => {
            montado = false;
            cancelarInscricao();
        };
    }, []);

    // Agenda/cancela as notificações motivadoras conforme o usuário está
    // "dentro do app" (logado OU em modo convidado) ou não (tela de Login).
    // Separado do listener do Firebase acima para também reagir a mudanças
    // de modo convidado, que não passam pelo onAuthStateChanged.
    useEffect(() => {
        if (inicializando) return;

        const estaDentroDoApp = !!usuario || ehConvidado;

        if (estaDentroDoApp) {
            // Respeita o liga/desliga e o horário escolhidos nas Configurações.
            aplicarPreferenciasDeNotificacao().catch((erro) =>
                console.log('Erro ao aplicar as preferências de notificação:', erro)
            );
        } else {
            cancelarNotificacoesMotivacionais().catch((erro) =>
                console.log('Erro ao cancelar notificações motivadoras:', erro)
            );
            cancelarNotificacaoDeStreak().catch((erro) =>
                console.log('Erro ao cancelar notificação de streak:', erro)
            );
            cancelarLembreteDeRisco().catch((erro) =>
                console.log('Erro ao cancelar lembrete de risco:', erro)
            );
            cancelarLembreteDeDiaCritico().catch((erro) =>
                console.log('Erro ao cancelar lembrete de dia crítico:', erro)
            );
        }
    }, [usuario, ehConvidado, inicializando]);

    // Chamadas pelas telas de auth em volta do par signIn + tratamento dos
    // dados de convidado. Precisam vir ANTES do signIn: é ele quem dispara o
    // onAuthStateChanged. Sempre em try/finally, senão o app fica preso no
    // loading.
    const iniciarMigracao = useCallback(() => setMigrando(true), []);
    const concluirMigracao = useCallback(() => setMigrando(false), []);

    // Chamado pelo botão "Continuar sem conta" na tela de Login.
    async function continuarSemConta() {
        await AsyncStorage.setItem(CHAVE_MODO_CONVIDADO, 'true');
        setEhConvidado(true);
        setTelaDeAuth('Login');
    }

    // Usado tanto para sair de uma conta real quanto para sair do modo
    // convidado — em ambos os casos o usuário volta para a tela de Login
    // e precisa escolher de novo (login ou "continuar sem conta") da
    // próxima vez.
    async function sair(proximaTelaDeAuth = 'Login') {
        try {
            const uid = auth.currentUser?.uid ?? null;
            if (uid) {
                // Tenta subir o que ficou na fila antes de sair. Se ainda sobrar algo
                // (sem internet), o espelho e a fila FICAM salvos — ao logar de novo
                // nesse aparelho o dado sobe. Só descartamos com a fila zerada.
                const { pendentes } = await sincronizar(uid);
                if (pendentes === 0 && (await contarPendencias(uid)) === 0) {
                    await descartarEspelhoDaConta(uid);
                }
                await signOut(auth);
            }
        } finally {
            await AsyncStorage.removeItem(CHAVE_MODO_CONVIDADO).catch(() => {});
            setEhConvidado(false);
            setTelaDeAuth(proximaTelaDeAuth);
        }
    }

    return (
        <AuthContext.Provider
            value={{
                usuario,
                ehConvidado,
                telaDeAuth,
                inicializando,
                migrando,
                iniciarMigracao,
                concluirMigracao,
                continuarSemConta,
                sair,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function usarAuth() {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- hook custom em português (`usar*`), o lint só reconhece `use*`
    return useContext(AuthContext);
}
