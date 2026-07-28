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
//
// Os campos que vão pro banco (id, missionId, period, periodKey, xp,
// completedAt) continuam em inglês de propósito: já existe dado salvo assim.

import { somarPuxadas } from './records';
import { metaEfetiva } from './meta';
import { calcularStreakDeDias } from './achievements';

// Segunda-feira da semana de uma data 'YYYY-MM-DD' (mesma lógica de
// rotuloSemana em storage.js, mas devolvendo a data inteira).
export function inicioDaSemana(dataStr) {
    const data = new Date(`${dataStr}T12:00:00`);
    const diaDaSemana = data.getDay();
    const diff = data.getDate() - diaDaSemana + (diaDaSemana === 0 ? -6 : 1);
    data.setDate(diff);
    return data.toISOString().slice(0, 10);
}

export function diasDaSemana(dataStr) {
    const inicio = new Date(`${inicioDaSemana(dataStr)}T12:00:00`);
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        dias.push(dia.toISOString().slice(0, 10));
    }
    return dias;
}

export function chaveDePeriodo(missao, dataStr) {
    return missao.period === 'weekly' ? inicioDaSemana(dataStr) : dataStr;
}

// Helpers usados pelas condições ─────────────────────────────────────────────

function registrosDoDia(registros, data) {
    return registros.filter((registro) => registro.date === data);
}

function ehDiaLimpo(registros, data) {
    const doDia = registrosDoDia(registros, data);
    return doDia.length > 0 && doDia.every((registro) => !registro.used);
}

// Dia registrado e dentro da meta daquele dia (meta do usuário se existir,
// senão a do aparelho — quem decide é metaEfetiva).
function ehDiaDentroDaMeta(ctx, data) {
    const doDia = registrosDoDia(ctx.registros, data);
    if (doDia.length === 0) return false;
    const meta = metaEfetiva(ctx.meta, ctx.aparelho, data);
    if (meta === null) return false;
    return somarPuxadas(doDia) <= meta;
}

function temMetaEfetiva(ctx) {
    return metaEfetiva(ctx.meta, ctx.aparelho, ctx.hoje) !== null;
}

// MISSOES ────────────────────────────────────────────────────────────────────
// progresso(ctx) -> { atual, alvo }. A missão é concluída quando
// atual >= alvo — não existe "condicao" separada.
//
// disponivel(ctx) -> boolean é OPCIONAL. Quando devolve false a missão nem
// aparece na lista, em vez de aparecer travada em 0/1: é o caso das missões de
// meta pra quem ainda não cadastrou meta nem aparelho.
//
// ctx = { registros, economia, sessoesDeCrise, meta, aparelho, hoje, diasDaSemana }

export const MISSOES = [
    {
        id: 'daily_record',
        period: 'daily',
        xp: 15,
        icone: '📝',
        titulo: 'Faça seu registro de hoje',
        descricao: 'Registrar como foi o dia é o que move tudo por aqui',
        progresso: (ctx) => ({
            atual: registrosDoDia(ctx.registros, ctx.hoje).length > 0 ? 1 : 0,
            alvo: 1,
        }),
    },
    {
        id: 'daily_clean',
        period: 'daily',
        xp: 25,
        icone: '🚭',
        titulo: 'Passe o dia sem usar o vape',
        descricao: 'Registre o dia de hoje marcando que você não usou',
        progresso: (ctx) => ({
            atual: ehDiaLimpo(ctx.registros, ctx.hoje) ? 1 : 0,
            alvo: 1,
        }),
    },
    {
        id: 'daily_crisis_win',
        period: 'daily',
        xp: 20,
        icone: '🧘',
        titulo: 'Vença uma vontade',
        descricao: 'Use o "Estou com vontade" e segure firme até ela passar',
        progresso: (ctx) => {
            const venceu = ctx.sessoesDeCrise.some(
                (sessao) => sessao.date === ctx.hoje && sessao.outcome && sessao.outcome !== 'usei'
            );
            return { atual: venceu ? 1 : 0, alvo: 1 };
        },
    },
    {
        id: 'weekly_clean_5',
        period: 'weekly',
        xp: 80,
        icone: '🔥',
        titulo: '5 dias sem usar nesta semana',
        descricao: 'Não precisa ser seguido — vale qualquer dia da semana',
        progresso: (ctx) => ({
            atual: ctx.diasDaSemana.filter((data) => ehDiaLimpo(ctx.registros, data)).length,
            alvo: 5,
        }),
    },
    {
        id: 'weekly_records_7',
        period: 'weekly',
        xp: 60,
        icone: '📅',
        titulo: 'Registre todos os dias da semana',
        descricao: 'Um registro em cada um dos 7 dias',
        progresso: (ctx) => ({
            atual: ctx.diasDaSemana.filter((data) => registrosDoDia(ctx.registros, data).length > 0).length,
            alvo: 7,
        }),
    },
    {
        id: 'weekly_economy_10',
        period: 'weekly',
        xp: 50,
        icone: '💰',
        titulo: 'Economize R$ 10 esta semana',
        descricao: 'O dinheiro que ficou no seu bolso nesta semana',
        progresso: (ctx) => {
            const total = ctx.diasDaSemana.reduce((soma, data) => soma + (ctx.economia?.[data] || 0), 0);
            return { atual: parseFloat(total.toFixed(2)), alvo: 10 };
        },
    },
    {
        id: 'daily_under_goal',
        period: 'daily',
        xp: 20,
        icone: '🎯',
        titulo: 'Fique abaixo do seu limite',
        descricao: 'Registre o dia sem passar do limite de hoje',
        disponivel: temMetaEfetiva,
        progresso: (ctx) => ({
            atual: ehDiaDentroDaMeta(ctx, ctx.hoje) ? 1 : 0,
            alvo: 1,
        }),
    },
    {
        id: 'weekly_under_goal_5',
        period: 'weekly',
        xp: 70,
        icone: '📉',
        titulo: '5 dias dentro do limite',
        descricao: 'Cinco dias desta semana sem passar do limite do dia',
        disponivel: temMetaEfetiva,
        progresso: (ctx) => ({
            atual: ctx.diasDaSemana.filter((data) => ehDiaDentroDaMeta(ctx, data)).length,
            alvo: 5,
        }),
    },
    {
        id: 'weekly_crisis_over_vape',
        period: 'weekly',
        xp: 60,
        icone: '🛡️',
        titulo: 'Modo crise no lugar do vape',
        descricao: 'Três vezes nesta semana você usou o modo crise e não usou o vape',
        progresso: (ctx) => {
            const vitorias = ctx.sessoesDeCrise.filter(
                (sessao) =>
                    ctx.diasDaSemana.includes(sessao.date) &&
                    sessao.outcome &&
                    sessao.outcome !== 'usei'
            ).length;
            return { atual: vitorias, alvo: 3 };
        },
    },
    {
        id: 'weekly_streak_3',
        period: 'weekly',
        xp: 40,
        icone: '⛓️',
        titulo: 'Registre 3 dias seguidos',
        descricao: 'Três dias consecutivos com registro dentro desta semana',
        progresso: (ctx) => {
            const datas = ctx.diasDaSemana.filter(
                (data) => registrosDoDia(ctx.registros, data).length > 0
            );
            return { atual: calcularStreakDeDias(datas), alvo: 3 };
        },
    },
];

// Monta o contexto que as missões recebem. Recebe um OBJETO (e não argumentos
// posicionais) porque o contexto cresceu com meta/aparelho.
export function montarContextoDeMissoes(entrada = {}) {
    const { registros = [], economia = {}, sessoesDeCrise = [], meta = null, aparelho = null, hoje } = entrada;
    const data = hoje || new Date().toISOString().slice(0, 10);
    return {
        registros: Array.isArray(registros) ? registros : [],
        economia: economia && typeof economia === 'object' ? economia : {},
        sessoesDeCrise: Array.isArray(sessoesDeCrise) ? sessoesDeCrise : [],
        meta: meta ?? null,
        aparelho: aparelho ?? null,
        hoje: data,
        diasDaSemana: diasDaSemana(data),
    };
}

// entradasConcluidas: array [{ id, missionId, periodKey, xp, completedAt }]
// vindo de obterMissoes(). Devolve o estado de TODAS as missões do período
// atual — mesma ideia de verificarConquistas.
export function verificarMissoes(ctx, entradasConcluidas = []) {
    const mapaConcluidas = new Map((entradasConcluidas || []).map((entrada) => [entrada.id, entrada]));
    const agora = new Date().toISOString();

    // Missão indisponível some da lista, mas se já foi concluída antes ela
    // continua aparecendo — o XP dela já é do usuário.
    const disponiveis = MISSOES.filter((missao) => {
        if (!missao.disponivel || missao.disponivel(ctx)) return true;
        return mapaConcluidas.has(`${missao.id}_${chaveDePeriodo(missao, ctx.hoje)}`);
    });

    return disponiveis.map((missao) => {
        const periodKey = chaveDePeriodo(missao, ctx.hoje);
        const id = `${missao.id}_${periodKey}`;
        const salva = mapaConcluidas.get(id);
        const { atual, alvo } = missao.progresso(ctx);
        const concluida = salva ? true : atual >= alvo;

        return {
            id,
            missionId: missao.id,
            period: missao.period,
            periodKey,
            titulo: missao.titulo,
            descricao: missao.descricao,
            icone: missao.icone,
            xp: missao.xp,
            atual: Math.min(atual, alvo),
            alvo,
            concluida,
            completedAt: salva?.completedAt || (concluida ? agora : null),
        };
    });
}
