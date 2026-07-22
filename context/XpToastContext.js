// src/context/XpToastContext.js
// Fila global de toasts de XP. Qualquer tela chama usarToastDeXp() e enfileira
// o que ganhou; o provider mostra um de cada vez, na ordem.
//
// Uso típico depois de salvar algo:
//   const { mostrarRecompensas } = usarToastDeXp();
//   mostrarRecompensas({ conquistas: novasConquistas, missoes: novasMissoes, ganho });
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import XpToast from '../components/XpToast';

const XpToastContext = createContext(null);

export function XpToastProvider({ children }) {
    const [fila, setFila] = useState([]);

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

    // Mostra um toast por conquista e por missão nova; o que sobrar do ganho
    // total (registro, dia limpo, streak) vira um toast genérico — a tela pode
    // personalizar esse último com { icon, title }.
    const mostrarRecompensas = useCallback(
        ({ conquistas = [], missoes = [], ganho = 0, icone, titulo } = {}) => {
            let atribuido = 0;

            conquistas.forEach((conquista) => {
                atribuido += conquista.xp || 0;
                mostrarXp({
                    icone: conquista.icone,
                    titulo: `Conquista: ${conquista.titulo}`,
                    xp: conquista.xp,
                });
            });

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

    const valor = useMemo(
        () => ({ mostrarXp, mostrarGanhoDeXp, mostrarRecompensas }),
        [mostrarXp, mostrarGanhoDeXp, mostrarRecompensas]
    );

    const atual = fila[0] || null;

    return (
        <XpToastContext.Provider value={valor}>
            {children}
            <XpToast key={atual?.key} toast={atual} aoEsconder={aoEsconder} />
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
