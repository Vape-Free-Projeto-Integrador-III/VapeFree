// src/utils/missions.js
//
// Missões diárias e semanais. Seguem o MESMO modelo das conquistas
// (utils/achievements.js): a condição é pura e derivada dos dados que já
// existem (registros, economia, sessões de crise). O que fica persistido é
// só a lista de missões já concluídas — assim reabrir a tela, editar um
// registro ou trocar de aparelho não duplica nem apaga XP.
//
// Cada missão concluída vira uma entrada com id composto
// `${missionId}_${periodKey}`, onde periodKey é:
//   - diária  -> 'YYYY-MM-DD' do dia
//   - semanal -> 'YYYY-MM-DD' da segunda-feira daquela semana
// Isso é o que faz a missão "renovar" sozinha quando o período vira.

// Segunda-feira da semana de uma data 'YYYY-MM-DD' (mesma lógica de
// getWeekLabel em storage.js, mas devolvendo a data inteira).
export function getWeekStart(dateStr) {
    const date = new Date(`${dateStr}T12:00:00`);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().slice(0, 10);
}

export function getWeekDays(dateStr) {
    const start = new Date(`${getWeekStart(dateStr)}T12:00:00`);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        days.push(day.toISOString().slice(0, 10));
    }
    return days;
}

export function periodKeyFor(mission, dateStr) {
    return mission.period === 'weekly' ? getWeekStart(dateStr) : dateStr;
}

// Helpers usados pelas condições ─────────────────────────────────────────────

function recordsOfDay(records, date) {
    return records.filter((record) => record.date === date);
}

function isCleanDay(records, date) {
    const dayRecords = recordsOfDay(records, date);
    return dayRecords.length > 0 && dayRecords.every((record) => !record.used);
}

// MISSIONS ───────────────────────────────────────────────────────────────────
// progress(ctx) -> { current, target }. A missão é concluída quando
// current >= target — não existe "condition" separada.
//
// ctx = { records, economy, crisisSessions, today, weekDays }

export const MISSIONS = [
    {
        id: 'daily_record',
        period: 'daily',
        xp: 15,
        icon: '📝',
        title: 'Faça seu registro de hoje',
        description: 'Registrar como foi o dia é o que move tudo por aqui',
        progress: (ctx) => ({
            current: recordsOfDay(ctx.records, ctx.today).length > 0 ? 1 : 0,
            target: 1,
        }),
    },
    {
        id: 'daily_clean',
        period: 'daily',
        xp: 25,
        icon: '🚭',
        title: 'Passe o dia sem usar o vape',
        description: 'Registre o dia de hoje marcando que você não usou',
        progress: (ctx) => ({
            current: isCleanDay(ctx.records, ctx.today) ? 1 : 0,
            target: 1,
        }),
    },
    {
        id: 'daily_crisis_win',
        period: 'daily',
        xp: 20,
        icon: '🧘',
        title: 'Vença uma vontade',
        description: 'Use o "Estou com vontade" e segure firme até ela passar',
        progress: (ctx) => {
            const won = ctx.crisisSessions.some(
                (session) => session.date === ctx.today && session.outcome && session.outcome !== 'usei'
            );
            return { current: won ? 1 : 0, target: 1 };
        },
    },
    {
        id: 'weekly_clean_5',
        period: 'weekly',
        xp: 80,
        icon: '🔥',
        title: '5 dias sem usar nesta semana',
        description: 'Não precisa ser seguido — vale qualquer dia da semana',
        progress: (ctx) => ({
            current: ctx.weekDays.filter((date) => isCleanDay(ctx.records, date)).length,
            target: 5,
        }),
    },
    {
        id: 'weekly_records_7',
        period: 'weekly',
        xp: 60,
        icon: '📅',
        title: 'Registre todos os dias da semana',
        description: 'Um registro em cada um dos 7 dias',
        progress: (ctx) => ({
            current: ctx.weekDays.filter((date) => recordsOfDay(ctx.records, date).length > 0).length,
            target: 7,
        }),
    },
    {
        id: 'weekly_economy_10',
        period: 'weekly',
        xp: 50,
        icon: '💰',
        title: 'Economize R$ 10 esta semana',
        description: 'O dinheiro que ficou no seu bolso nesta semana',
        progress: (ctx) => {
            const total = ctx.weekDays.reduce((sum, date) => sum + (ctx.economy?.[date] || 0), 0);
            return { current: parseFloat(total.toFixed(2)), target: 10 };
        },
    },
];

// Monta o contexto que as missões recebem.
export function buildMissionContext(records = [], economy = {}, crisisSessions = [], today) {
    const date = today || new Date().toISOString().slice(0, 10);
    return {
        records: Array.isArray(records) ? records : [],
        economy: economy && typeof economy === 'object' ? economy : {},
        crisisSessions: Array.isArray(crisisSessions) ? crisisSessions : [],
        today: date,
        weekDays: getWeekDays(date),
    };
}

// completedEntries: array [{ id, missionId, periodKey, xp, completedAt }]
// vindo de getMissions(). Devolve o estado de TODAS as missões do período
// atual — mesma ideia de checkAchievements.
export function checkMissions(ctx, completedEntries = []) {
    const completedMap = new Map((completedEntries || []).map((entry) => [entry.id, entry]));
    const now = new Date().toISOString();

    return MISSIONS.map((mission) => {
        const periodKey = periodKeyFor(mission, ctx.today);
        const id = `${mission.id}_${periodKey}`;
        const saved = completedMap.get(id);
        const { current, target } = mission.progress(ctx);
        const completed = saved ? true : current >= target;

        return {
            id,
            missionId: mission.id,
            period: mission.period,
            periodKey,
            title: mission.title,
            description: mission.description,
            icon: mission.icon,
            xp: mission.xp,
            current: Math.min(current, target),
            target,
            completed,
            completedAt: saved?.completedAt || (completed ? now : null),
        };
    });
}
