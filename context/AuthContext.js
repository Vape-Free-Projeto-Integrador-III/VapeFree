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
  scheduleStreakWarningNotification,
  cancelMotivationalNotifications,
  cancelStreakWarningNotification,
} from '../utils/notifications';

const GUEST_MODE_KEY = '@vapefree_guest_mode';

const AuthContext = createContext({
  user: null,
  isGuest: false,
  authScreen: 'Login',
  initializing: true,
  continueAsGuest: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [authScreen, setAuthScreen] = useState('Login');
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
          setAuthScreen('Login');
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
      scheduleStreakWarningNotification().catch((err) =>
        console.log('Erro ao agendar notificação de streak:', err)
      );
    } else {
      cancelMotivationalNotifications().catch((err) =>
        console.log('Erro ao cancelar notificações motivadoras:', err)
      );
      cancelStreakWarningNotification().catch((err) =>
        console.log('Erro ao cancelar notificação de streak:', err)
      );
    }
  }, [user, isGuest, initializing]);

  // Chamado pelo botão "Continuar sem conta" na tela de Login.
  async function continueAsGuest() {
    await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
    setIsGuest(true);
    setAuthScreen('Login');
  }

  // Usado tanto para sair de uma conta real quanto para sair do modo
  // convidado — em ambos os casos o usuário volta para a tela de Login
  // e precisa escolher de novo (login ou "continuar sem conta") da
  // próxima vez.
  async function logout(nextAuthScreen = 'Login') {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } finally {
      await AsyncStorage.removeItem(GUEST_MODE_KEY).catch(() => {});
      setIsGuest(false);
      setAuthScreen(nextAuthScreen);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, isGuest, authScreen, initializing, continueAsGuest, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}