// Fila global de toasts. Qualquer tela chama usarToast() e enfileira
// o que ganhou; o provider mostra um de cada vez, na ordem.
//
// Uso típico depois de salvar algo:
//   const { mostrarRecompensas } = usarToast();
//   mostrarRecompensas({ conquistas: novasConquistas, missoes: novasMissoes, ganho });
//
// A mesma fila também carrega os avisos de falha ao salvar:
//   const { mostrarErro } = usarToast();
//   mostrarErro('Não deu pra salvar', 'Verifique sua conexão e tente de novo.');
//
// Este provider também é o host visual do Alert.alert do app: ele registra
// { mostrarAviso, confirmar } no bridge de utils/alert.js, então todo
// Alert.alert vira toast (1 botão) ou ConfirmModal (2+ botões).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Toast, { DURACAO_DO_TOAST_LONGO } from '../components/Toast';
import AchievementCelebration from '../components/AchievementCelebration';
import ConfirmModal from '../components/ConfirmModal';
import { registrarManipuladorDeAlerta } from '../utils/alert';

const ToastContext = createContext(null);

const ICONE_POR_VARIANTE = {
    erro: '❌',
    aviso: '⚠️',
    sucesso: '✅',
};

export function ToastProvider({ children }) {
    const [fila, setFila] = useState([]);
    const [filaDeConquistas, setFilaDeConquistas] = useState([]);
    const [confirmacao, setConfirmacao] = useState(null);

    const enfileirar = useCallback((toast) => {
        setFila((anterior) => [...anterior, { key: `${Date.now()}_${anterior.length}`, ...toast }]);
    }, []);

    const mostrarXp = useCallback(
        (toast) => {
            if (!toast || !toast.xp || toast.xp <= 0) return;
            enfileirar({ variante: 'xp', ...toast });
        },
        [enfileirar]
    );

    // Recado sem XP (validação, erro, sucesso): não passa pelo guard de XP
    // acima (não tem XP nenhum) e fica mais tempo na tela, porque a mensagem é
    // mais longa de ler.
    const mostrarAviso = useCallback(
        (titulo, subtitulo, variante = 'aviso') => {
            enfileirar({
                variante,
                icone: ICONE_POR_VARIANTE[variante] || ICONE_POR_VARIANTE.aviso,
                titulo,
                subtitulo,
                duracao: DURACAO_DO_TOAST_LONGO,
            });
        },
        [enfileirar]
    );

    const mostrarErro = useCallback(
        (titulo, subtitulo) => {
            mostrarAviso(titulo, subtitulo, 'erro');
        },
        [mostrarAviso]
    );

    const mostrarGanhoDeXp = useCallback(
        (ganho, { icone = '⭐', titulo = 'Você ganhou XP' } = {}) => {
            mostrarXp({ icone, titulo, xp: ganho });
        },
        [mostrarXp]
    );

    // Conquista nova vira modal de celebração (uma por vez); missão nova vira
    // toast; o que sobrar do ganho total (registro, dia limpo, streak) vira um
    // toast genérico — a tela pode personalizar esse último com { icone, titulo }.
    const mostrarRecompensas = useCallback(
        ({ conquistas = [], missoes = [], ganho = 0, icone, titulo } = {}) => {
            let atribuido = 0;

            // Conquista não vira toast: o modal já mostra o +XP dela. Ainda soma
            // no atribuido pra o cálculo do resto não contar duas vezes.
            conquistas.forEach((conquista) => {
                atribuido += conquista.xp || 0;
            });
            if (conquistas.length > 0) {
                setFilaDeConquistas((anterior) => [...anterior, ...conquistas]);
            }

            missoes.forEach((missao) => {
                atribuido += missao.xp || 0;
                mostrarXp({
                    icone: missao.icone,
                    titulo: `Missão: ${missao.titulo}`,
                    xp: missao.xp,
                });
            });

            const resto = ganho - atribuido;
            if (resto > 0) mostrarGanhoDeXp(resto, { icone, titulo });
        },
        [mostrarXp, mostrarGanhoDeXp]
    );

    const aoEsconder = useCallback(() => {
        setFila((anterior) => anterior.slice(1));
    }, []);

    const avancarConquista = useCallback(() => {
        setFilaDeConquistas((anterior) => anterior.slice(1));
    }, []);

    // Só uma confirmação por vez: a última pedida vence (não tem fila, porque
    // confirmação nasce sempre de um toque do usuário).
    const confirmar = useCallback((config) => {
        setConfirmacao(config);
    }, []);

    // Fecha primeiro, depois executa — o onPress pode navegar/deslogar.
    const responderConfirmacao = useCallback((botao) => {
        setConfirmacao(null);
        botao?.onPress?.();
    }, []);

    const valor = useMemo(
        () => ({ mostrarXp, mostrarGanhoDeXp, mostrarRecompensas, mostrarErro, mostrarAviso, confirmar }),
        [mostrarXp, mostrarGanhoDeXp, mostrarRecompensas, mostrarErro, mostrarAviso, confirmar]
    );

    // Bridge do utils/alert.js: enquanto o provider estiver montado, Alert.alert
    // renderiza este toast/modal em vez do alerta do sistema.
    useEffect(() => {
        registrarManipuladorDeAlerta({ mostrarAviso, confirmar });
        return () => registrarManipuladorDeAlerta(null);
    }, [mostrarAviso, confirmar]);

    const atual = fila[0] || null;
    const conquistaAtual = filaDeConquistas[0] || null;

    return (
        <ToastContext.Provider value={valor}>
            {children}
            <Toast key={atual?.key} toast={atual} aoEsconder={aoEsconder} />
            <AchievementCelebration
                key={conquistaAtual?.id}
                conquista={conquistaAtual}
                aoFechar={avancarConquista}
            />
            <ConfirmModal
                visivel={!!confirmacao}
                titulo={confirmacao?.titulo}
                mensagem={confirmacao?.mensagem}
                botoes={confirmacao?.botoes || []}
                aoPressionar={responderConfirmacao}
            />
        </ToastContext.Provider>
    );
}

export function usarToast() {
    const contexto = useContext(ToastContext);
    if (!contexto) {
        throw new Error('usarToast precisa estar dentro de um ToastProvider');
    }
    return contexto;
}
