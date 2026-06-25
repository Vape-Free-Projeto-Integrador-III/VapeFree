// src/context/AuthContext.js
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

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/firebase';
import {
  scheduleMotivationalNotifications,
  cancelMotivationalNotifications,
} from '../utils/notifications';

const GUEST_MODE_KEY = '@vapefree_guest_mode';

const AuthContext = createContext({
  user: null,
  isGuest: false,
  initializing: true,
  continueAsGuest: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  // "initializing" controla a checagem inicial da sessão ao abrir o app.
  // Enquanto o Firebase não responder se existe (ou não) um usuário
  // autenticado, não decidimos a tela inicial (Main ou Login).
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Lê, em paralelo com a checagem do Firebase, se o usuário já tinha
    // escolhido "continuar sem conta" numa sessão anterior.
    AsyncStorage.getItem(GUEST_MODE_KEY)
      .then((value) => {
        if (isMounted && value === 'true') {
          setIsGuest(true);
        }
      })
      .catch(() => {});

    // onAuthStateChanged é chamado automaticamente:
    // - assim que o app abre (com o usuário restaurado da sessão, se houver)
    // - sempre que o usuário faz login
    // - sempre que o usuário faz logout
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        // Sempre que o callback disparar pela primeira vez (login existente,
        // ou null caso não haja sessão), a checagem inicial terminou.
        setInitializing(false);

        // Se um usuário REAL acabou de logar, não faz sentido continuar
        // marcado como convidado ao mesmo tempo.
        if (firebaseUser) {
          setIsGuest(false);
          AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
        }
      },
      (error) => {
        // Se o listener falhar por algum motivo (ex.: erro interno de
        // persistência), não deixamos a tela presa em loading: tratamos
        // como "sem usuário autenticado" e mostramos a tela de Login.
        console.log('onAuthStateChanged error:', error);
        setUser(null);
        setInitializing(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Agenda/cancela as notificações motivadoras conforme o usuário está
  // "dentro do app" (logado OU em modo convidado) ou não (tela de Login).
  // Separado do listener do Firebase acima para também reagir a mudanças
  // de modo convidado, que não passam pelo onAuthStateChanged.
  useEffect(() => {
    if (initializing) return;

    const estaDentroDoApp = !!user || isGuest;

    if (estaDentroDoApp) {
      scheduleMotivationalNotifications().catch((err) =>
        console.log('Erro ao agendar notificações motivadoras:', err)
      );
    } else {
      cancelMotivationalNotifications().catch((err) =>
        console.log('Erro ao cancelar notificações motivadoras:', err)
      );
    }
  }, [user, isGuest, initializing]);

  // Chamado pelo botão "Continuar sem conta" na tela de Login.
  async function continueAsGuest() {
    await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
    setIsGuest(true);
  }

  // Usado tanto para sair de uma conta real quanto para sair do modo
  // convidado — em ambos os casos o usuário volta para a tela de Login
  // e precisa escolher de novo (login ou "continuar sem conta") da
  // próxima vez.
  async function logout() {
    if (auth.currentUser) {
      await signOut(auth);
      // Não é necessário navegar manualmente: o onAuthStateChanged acima
      // vai disparar com user = null, e o AppNavigator reage a isso
      // trocando automaticamente para a stack de Login.
    }
    await AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
    setIsGuest(false);
  }

  return (
    <AuthContext.Provider value={{ user, isGuest, initializing, continueAsGuest, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}