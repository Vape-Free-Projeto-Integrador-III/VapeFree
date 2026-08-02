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
import {
    assinarConexao,
    assinarDadosIncompletos,
    assinarFalhas,
    contarFalhas,
    contarPendencias,
    estaOnline,
    limparFalhas,
    sincronizar,
    temDadosIncompletos,
} from '../utils/offline';
import { precarregarEspelho } from '../utils/storage';
import { usarAuth } from './AuthContext';

const ConnectionContext = createContext({
    online: true,
    pendentes: 0,
    falhas: 0,
    dadosIncompletos: false,
    sincronizarAgora: async () => {},
    recarregarDados: async () => {},
    descartarFalhas: async () => {},
});

export function ConnectionProvider({ children }) {
    const { usuario } = usarAuth();
    const uid = usuario?.uid ?? null;

    const [online, setOnline] = useState(true);
    const [pendentes, setPendentes] = useState(0);
    // Mutações que a fila desistiu de enviar. Ficam visíveis no banner até o
    // usuário dar ciência — dado perdido em silêncio é pior que erro na tela.
    const [falhas, setFalhas] = useState(0);
    // Alguma leitura remota falhou sem espelho pra servir de reserva: as telas
    // estão mostrando o padrão vazio, não a conta. Some sozinho quando uma
    // leitura do servidor dá certo (utils/offline.js).
    const [dadosIncompletos, setDadosIncompletos] = useState(false);

    const sincronizarAgora = useCallback(async () => {
        if (!uid) {
            setPendentes(0);
            setFalhas(0);
            return;
        }
        const { pendentes: restantes, falhas: quantasFalhas } = await sincronizar(uid);
        setPendentes(restantes);
        setFalhas(quantasFalhas ?? 0);
    }, [uid]);

    // Tentar de novo a leitura que não deu certo. precarregarEspelho já invalida
    // a validade do espelho e relê tudo do servidor; cada leitura que passa
    // limpa a marca de dados incompletos sozinha.
    const recarregarDados = useCallback(async () => {
        await precarregarEspelho().catch(() => false);
    }, []);

    const descartarFalhas = useCallback(async () => {
        setFalhas(0);
        if (uid) await limparFalhas(uid);
    }, [uid]);

    // Aquece o espelho local logo depois do login, pra que o app já funcione se
    // o usuário ficar sem rede antes de abrir cada tela.
    useEffect(() => {
        if (!uid) {
            setPendentes(0);
            setFalhas(0);
            return;
        }
        contarPendencias(uid)
            .then(setPendentes)
            .catch(() => {});
        contarFalhas(uid)
            .then(setFalhas)
            .catch(() => {});
        precarregarEspelho().catch(() => {});
    }, [uid]);

    // Falha pode surgir de uma sincronização disparada pelo storage.js, fora
    // daqui — sem esse aviso o banner só apareceria na próxima contagem.
    useEffect(() => {
        if (!uid) return undefined;
        return assinarFalhas(setFalhas);
    }, [uid]);

    // Mesma ideia pras leituras: quem descobre que não deu pra carregar é a
    // tela que leu, em qualquer ponto do app.
    useEffect(() => {
        if (!uid) {
            setDadosIncompletos(false);
            return undefined;
        }
        setDadosIncompletos(temDadosIncompletos());
        return assinarDadosIncompletos(setDadosIncompletos);
    }, [uid]);

    useEffect(() => {
        let ativo = true;
        let jaTeveEvento = false;

        const cancelar = assinarConexao((estaConectado) => {
            jaTeveEvento = true;
            setOnline(estaConectado);
            if (estaConectado) {
                sincronizarAgora().catch(() => {});
            }
        });

        // O NetInfo só avisa em mudança: abrir o app já sem rede ficaria com o
        // `online: true` inicial (banner escondido) até a conexão mexer. A
        // leitura de agora corrige isso, mas nunca sobrescreve um evento que
        // tenha chegado antes dela.
        estaOnline()
            .then((inicial) => {
                if (!ativo || jaTeveEvento) return;
                setOnline(inicial);
            })
            .catch(() => {});

        return () => {
            ativo = false;
            cancelar();
        };
    }, [sincronizarAgora]);

    // Offline, o contador do banner precisa acompanhar as escritas que vão
    // entrando na fila — não existe evento pra isso, então conferimos de tempos
    // em tempos. Online, a fila fica vazia e não vale gastar o timer.
    useEffect(() => {
        if (!uid || online) return undefined;
        const relogio = setInterval(() => {
            contarPendencias(uid)
                .then(setPendentes)
                .catch(() => {});
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
        () => ({
            online,
            pendentes: uid ? pendentes : 0,
            falhas: uid ? falhas : 0,
            dadosIncompletos: uid ? dadosIncompletos : false,
            sincronizarAgora,
            recarregarDados,
            descartarFalhas,
        }),
        [
            online,
            pendentes,
            falhas,
            dadosIncompletos,
            uid,
            sincronizarAgora,
            recarregarDados,
            descartarFalhas,
        ]
    );

    return <ConnectionContext.Provider value={valor}>{children}</ConnectionContext.Provider>;
}

export function usarConexao() {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- hook custom em português (`usar*`), o lint só reconhece `use*`
    return useContext(ConnectionContext);
}
