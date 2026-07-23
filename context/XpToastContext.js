// src/context/XpToastContext.js
// Fila global de toasts de XP. Qualquer tela chama usarToastDeXp() e enfileira
// o que ganhou; o provider mostra um de cada vez, na ordem.
//
// Uso típico depois de salvar algo:
//   const { mostrarRecompensas } = usarToastDeXp();
//   mostrarRecompensas({ conquistas: novasConquistas, missoes: novasMissoes, ganho });
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import XpToast from '../components/XpToast';
import AchievementCelebration from '../components/AchievementCelebration';

const XpToastContext = createContext(null);

export function XpToastProvider({ children }) {
    const [fila, setFila] = useState([]);
    const [filaDeConquistas, setFilaDeConquistas] = useState([]);

    const mostrarXp = useCallback((toast) => {
        if (!toast || !toast.xp || toast.xp <= 0) return;
        setFila((anterior) => [...anterior, { key: `${Date.now()}_${anterior.length}`, ...toast }]);
    }, []);

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

    const valor = useMemo(
        () => ({ mostrarXp, mostrarGanhoDeXp, mostrarRecompensas }),
        [mostrarXp, mostrarGanhoDeXp, mostrarRecompensas]
    );

    const atual = fila[0] || null;
    const conquistaAtual = filaDeConquistas[0] || null;

    return (
        <XpToastContext.Provider value={valor}>
            {children}
            <XpToast key={atual?.key} toast={atual} aoEsconder={aoEsconder} />
            <AchievementCelebration
                key={conquistaAtual?.id}
                conquista={conquistaAtual}
                aoFechar={avancarConquista}
            />
        </XpToastContext.Provider>
    );
}

export function usarToastDeXp() {
    const contexto = useContext(XpToastContext);
    if (!contexto) {
        throw new Error('usarToastDeXp precisa estar dentro de um XpToastProvider');
    }
    return contexto;
}
