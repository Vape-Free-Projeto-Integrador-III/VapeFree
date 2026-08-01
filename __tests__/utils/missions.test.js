import {
    MISSOES,
    chaveDePeriodo,
    montarContextoDeMissoes,
    verificarMissoes,
} from '../../utils/missions';

const QUINTA = '2026-03-05'; // segunda da semana: 2026-03-02
const SEGUNDA_DA_SEMANA = '2026-03-02';

const missaoPorId = (lista, missionId) => lista.find((m) => m.missionId === missionId);

describe('chaveDePeriodo', () => {
    it('missao diaria usa a propria data', () => {
        expect(chaveDePeriodo({ period: 'daily' }, QUINTA)).toBe(QUINTA);
    });

    it('missao semanal usa a segunda-feira da semana', () => {
        expect(chaveDePeriodo({ period: 'weekly' }, QUINTA)).toBe(SEGUNDA_DA_SEMANA);
    });
});

describe('montarContextoDeMissoes', () => {
    it('respeita o hoje injetado e deriva os dias da semana dele', () => {
        const ctx = montarContextoDeMissoes({ hoje: QUINTA });
        expect(ctx.hoje).toBe(QUINTA);
        expect(ctx.diasDaSemana[0]).toBe(SEGUNDA_DA_SEMANA);
        expect(ctx.diasDaSemana).toHaveLength(7);
    });

    it('normaliza entrada faltando ou com tipo errado', () => {
        const ctx = montarContextoDeMissoes({ hoje: QUINTA, registros: null, economia: 'nada' });
        expect(ctx.registros).toEqual([]);
        expect(ctx.economia).toEqual({});
        expect(ctx.sessoesDeCrise).toEqual([]);
        expect(ctx.meta).toBeNull();
        expect(ctx.aparelho).toBeNull();
    });
});

describe('verificarMissoes', () => {
    it('monta o id composto missionId_periodKey', () => {
        const missoes = verificarMissoes(montarContextoDeMissoes({ hoje: QUINTA }));
        expect(missaoPorId(missoes, 'daily_record').id).toBe(`daily_record_${QUINTA}`);
        expect(missaoPorId(missoes, 'weekly_clean_5').id).toBe(
            `weekly_clean_5_${SEGUNDA_DA_SEMANA}`
        );
    });

    it('conclui a missao diaria quando o progresso alcanca o alvo', () => {
        const ctx = montarContextoDeMissoes({
            hoje: QUINTA,
            registros: [{ date: QUINTA, used: false, puffs: 0 }],
        });
        const missoes = verificarMissoes(ctx);
        expect(missaoPorId(missoes, 'daily_record').concluida).toBe(true);
        expect(missaoPorId(missoes, 'daily_clean').concluida).toBe(true);
        expect(missaoPorId(missoes, 'daily_crisis_win').concluida).toBe(false);
    });

    it('limita o atual ao alvo e conta os dias da semana', () => {
        const registros = [
            '2026-03-02',
            '2026-03-03',
            '2026-03-04',
            QUINTA,
            '2026-03-06',
            '2026-03-07',
        ].map((date) => ({ date, used: false, puffs: 0 }));
        const missoes = verificarMissoes(montarContextoDeMissoes({ hoje: QUINTA, registros }));
        const semanal = missaoPorId(missoes, 'weekly_clean_5');
        expect(semanal.atual).toBe(5); // 6 dias limpos, mas o alvo e 5
        expect(semanal.concluida).toBe(true);
    });

    it('esconde a missao de limite quando nao ha meta nem aparelho', () => {
        const missoes = verificarMissoes(montarContextoDeMissoes({ hoje: QUINTA }));
        expect(missaoPorId(missoes, 'daily_under_goal')).toBeUndefined();
        expect(missoes).toHaveLength(MISSOES.length - 2); // as duas de limite somem
    });

    it('mostra a missao de limite quando existe aparelho', () => {
        const ctx = montarContextoDeMissoes({
            hoje: QUINTA,
            aparelho: { price: 50, totalPuffs: 5000, days: 10 },
            registros: [{ date: QUINTA, used: true, puffs: 100 }],
        });
        const missoes = verificarMissoes(ctx);
        expect(missaoPorId(missoes, 'daily_under_goal').concluida).toBe(true); // 100 <= 500
        expect(missoes).toHaveLength(MISSOES.length);
    });

    it('missao ja salva continua concluida e preserva completedAt', () => {
        const id = `daily_record_${QUINTA}`;
        const missoes = verificarMissoes(montarContextoDeMissoes({ hoje: QUINTA }), [
            { id, missionId: 'daily_record', completedAt: '2026-03-05T10:00:00.000Z' },
        ]);
        const missao = missaoPorId(missoes, 'daily_record');
        expect(missao.concluida).toBe(true);
        expect(missao.completedAt).toBe('2026-03-05T10:00:00.000Z');
    });
});
