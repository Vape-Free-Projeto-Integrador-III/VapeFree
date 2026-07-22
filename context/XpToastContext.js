// src/context/XpToastContext.js
// Fila global de toasts de XP. Qualquer tela chama useXpToast() e enfileira
// o que ganhou; o provider mostra um de cada vez, na ordem.
//
// Uso típico depois de salvar algo:
//   const { showRewards } = useXpToast();
//   showRewards({ achievements: novasConquistas, missions: novasMissoes, gained });
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import XpToast from '../components/XpToast';

const XpToastContext = createContext(null);

export function XpToastProvider({ children }) {
    const [queue, setQueue] = useState([]);

    const showXp = useCallback((toast) => {
        if (!toast || !toast.xp || toast.xp <= 0) return;
        setQueue((prev) => [...prev, { key: `${Date.now()}_${prev.length}`, ...toast }]);
    }, []);

    const showXpGain = useCallback(
        (gained, { icon = '⭐', title = 'Você ganhou XP' } = {}) => {
            showXp({ icon, title, xp: gained });
        },
        [showXp]
    );

    // Mostra um toast por conquista e por missão nova; o que sobrar do ganho
    // total (registro, dia limpo, streak) vira um toast genérico — a tela pode
    // personalizar esse último com { icon, title }.
    const showRewards = useCallback(
        ({ achievements = [], missions = [], gained = 0, icon, title } = {}) => {
            let attributed = 0;

            achievements.forEach((achievement) => {
                attributed += achievement.xp || 0;
                showXp({
                    icon: achievement.icon,
                    title: `Conquista: ${achievement.title}`,
                    xp: achievement.xp,
                });
            });

            missions.forEach((mission) => {
                attributed += mission.xp || 0;
                showXp({
                    icon: mission.icon,
                    title: `Missão: ${mission.title}`,
                    xp: mission.xp,
                });
            });

            const rest = gained - attributed;
            if (rest > 0) showXpGain(rest, { icon, title });
        },
        [showXp, showXpGain]
    );

    const handleHide = useCallback(() => {
        setQueue((prev) => prev.slice(1));
    }, []);

    const value = useMemo(
        () => ({ showXp, showXpGain, showRewards }),
        [showXp, showXpGain, showRewards]
    );

    const current = queue[0] || null;

    return (
        <XpToastContext.Provider value={value}>
            {children}
            <XpToast key={current?.key} toast={current} onHide={handleHide} />
        </XpToastContext.Provider>
    );
}

export function useXpToast() {
    const context = useContext(XpToastContext);
    if (!context) {
        throw new Error('useXpToast precisa estar dentro de um XpToastProvider');
    }
    return context;
}
