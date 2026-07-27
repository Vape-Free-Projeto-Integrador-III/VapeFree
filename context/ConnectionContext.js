// context/ConnectionContext.js
//
// Estado de conexão + pendências de sincronização, só pra UI (o banner de
// "sem internet"). Quem realmente sincroniza é utils/offline.js — aqui só
// escutamos o NetInfo, disparamos a fila quando a rede volta e contamos
// quantas alterações ainda não subiram.
//
// Só faz sentido pra usuário logado: em modo convidado tudo já é local e
// nunca tem nada pendente.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { assinarConexao, contarPendencias, sincronizar } from '../utils/offline';
import { precarregarEspelho } from '../utils/storage';
import { usarAuth } from './AuthContext';

const ConnectionContext = createContext({
  online: true,
  pendentes: 0,
  sincronizarAgora: async () => {},
});

export function ConnectionProvider({ children }) {
  const { usuario } = usarAuth();
  const uid = usuario?.uid ?? null;

  const [online, setOnline] = useState(true);
  const [pendentes, setPendentes] = useState(0);

  const sincronizarAgora = useCallback(async () => {
    if (!uid) {
      setPendentes(0);
      return;
    }
    const { pendentes: restantes } = await sincronizar(uid);
    setPendentes(restantes);
  }, [uid]);

  // Aquece o espelho local logo depois do login, pra que o app já funcione se
  // o usuário ficar sem rede antes de abrir cada tela.
  useEffect(() => {
    if (!uid) {
      setPendentes(0);
      return;
    }
    contarPendencias(uid).then(setPendentes).catch(() => {});
    precarregarEspelho().catch(() => {});
  }, [uid]);

  useEffect(() => {
    const cancelar = assinarConexao((estaOnline) => {
      setOnline(estaOnline);
      if (estaOnline) {
        sincronizarAgora().catch(() => {});
      }
    });
    return cancelar;
  }, [sincronizarAgora]);

  // Offline, o contador do banner precisa acompanhar as escritas que vão
  // entrando na fila — não existe evento pra isso, então conferimos de tempos
  // em tempos. Online, a fila fica vazia e não vale gastar o timer.
  useEffect(() => {
    if (!uid || online) return undefined;
    const relogio = setInterval(() => {
      contarPendencias(uid).then(setPendentes).catch(() => {});
    }, 4000);
    return () => clearInterval(relogio);
  }, [uid, online]);

  // Voltar pro app é o outro momento natural pra tentar subir o que ficou.
  useEffect(() => {
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        sincronizarAgora().catch(() => {});
      }
    });
    return () => inscricao.remove();
  }, [sincronizarAgora]);

  const valor = useMemo(
    () => ({ online, pendentes: uid ? pendentes : 0, sincronizarAgora }),
    [online, pendentes, uid, sincronizarAgora]
  );

  return <ConnectionContext.Provider value={valor}>{children}</ConnectionContext.Provider>;
}

export function usarConexao() {
  return useContext(ConnectionContext);
}
