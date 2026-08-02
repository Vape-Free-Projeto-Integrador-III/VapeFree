import {
    REGRAS_DE_XP,
    calcularMelhorStreak,
    contarDiasLimpos,
    calcularXp,
    obterNivel,
    resumoDeXp,
} from '../../utils/xp';

// Helpers: dia limpo = registro com used false.
const limpo = (date) => ({ date, used: false, puffs: 0 });
const usou = (date, puffs = 5) => ({ date, used: true, puffs });

const diasSeguidos = (inicioDia, quantidade) =>
    Array.from({ length: quantidade }, (_, i) =>
        limpo(`2026-03-${String(inicioDia + i).padStart(2, '0')}`)
    );

describe('calcularMelhorStreak', () => {
    it('devolve 0 pra lista vazia ou invalida', () => {
        expect(calcularMelhorStreak([])).toBe(0);
        expect(calcularMelhorStreak(null)).toBe(0);
    });

    it('conta dias limpos consecutivos', () => {
        expect(calcularMelhorStreak(diasSeguidos(1, 3))).toBe(3);
    });

    it('buraco de dia reinicia a contagem', () => {
        const registros = [limpo('2026-03-01'), limpo('2026-03-02'), limpo('2026-03-05')];
        expect(calcularMelhorStreak(registros)).toBe(2);
    });

    it('um unico registro com used quebra o dia inteiro', () => {
        const registros = [
            limpo('2026-03-01'),
            limpo('2026-03-02'),
            usou('2026-03-02'), // mesmo dia, mas usou
            limpo('2026-03-03'),
        ];
        expect(calcularMelhorStreak(registros)).toBe(1);
    });

    it('devolve a MELHOR sequencia historica, nao a atual', () => {
        const registros = [...diasSeguidos(1, 5), usou('2026-03-06'), limpo('2026-03-07')];
        expect(calcularMelhorStreak(registros)).toBe(5);
    });
});

describe('contarDiasLimpos', () => {
    it('conta dias, nao registros', () => {
        const registros = [
            limpo('2026-03-01'),
            limpo('2026-03-01'),
            limpo('2026-03-02'),
            usou('2026-03-03'),
        ];
        expect(contarDiasLimpos(registros)).toBe(2);
    });
});

describe('calcularXp', () => {
    it('soma registros + dias limpos', () => {
        const registros = diasSeguidos(1, 2);
        expect(calcularXp(registros)).toBe(2 * REGRAS_DE_XP.REGISTRO + 2 * REGRAS_DE_XP.DIA_LIMPO);
    });

    it('paga bonus de streak a cada 7 dias completos', () => {
        const de14 = diasSeguidos(1, 14);
        const xpBase = 14 * REGRAS_DE_XP.REGISTRO + 14 * REGRAS_DE_XP.DIA_LIMPO;
        expect(calcularXp(de14)).toBe(xpBase + 2 * REGRAS_DE_XP.SEMANA_STREAK);

        const de13 = diasSeguidos(1, 13);
        const xpBase13 = 13 * REGRAS_DE_XP.REGISTRO + 13 * REGRAS_DE_XP.DIA_LIMPO;
        expect(calcularXp(de13)).toBe(xpBase13 + 1 * REGRAS_DE_XP.SEMANA_STREAK);
    });

    it('usa o xp gravado na propria entrada da missao', () => {
        expect(calcularXp([], [], [{ id: 'x_2026-03-01', xp: 40 }])).toBe(40);
    });

    it('nao conta duas vezes a missao ja coberta pelo resumo', () => {
        // Delete que falhou: a entrada crua de 2026-03-01 voltou do servidor e
        // convive com o resumo que já a contou (until.daily = 2026-03-02).
        const missoes = [
            {
                id: '_resumo',
                summary: true,
                xp: 70,
                count: 2,
                until: { daily: '2026-03-02', weekly: '' },
            },
            { id: 'x_2026-03-01', period: 'daily', periodKey: '2026-03-01', xp: 40 },
            { id: 'y_2026-03-05', period: 'daily', periodKey: '2026-03-05', xp: 25 },
        ];
        expect(calcularXp([], [], missoes)).toBe(70 + 25);
    });

    // O bug: `until` era uma string só pros dois tipos de período. Como a
    // diária fecha todo dia, a marca passava da segunda-feira da semana
    // CORRENTE em dois dias e a semanal ainda aberta sumia da soma — o total
    // caía sozinho no meio da semana.
    it('marca das diarias nao come o xp da semanal ainda aberta', () => {
        const missoes = [
            {
                id: '_resumo',
                summary: true,
                xp: 100,
                count: 4,
                until: { daily: '2026-08-04', weekly: '2026-07-27' },
            },
            // Semanal da semana que começou na segunda 2026-08-03: aberta.
            {
                id: 'weekly_clean_5_2026-08-03',
                period: 'weekly',
                periodKey: '2026-08-03',
                xp: 80,
            },
        ];
        expect(calcularXp([], [], missoes)).toBe(180);
    });

    it('semanal ja coberta pela marca semanal nao conta de novo', () => {
        const missoes = [
            {
                id: '_resumo',
                summary: true,
                xp: 100,
                until: { daily: '2026-08-04', weekly: '2026-08-03' },
            },
            {
                id: 'weekly_clean_5_2026-08-03',
                period: 'weekly',
                periodKey: '2026-08-03',
                xp: 80,
            },
        ];
        expect(calcularXp([], [], missoes)).toBe(100);
    });

    // Resumo gravado antes da correção: `until` é uma string. Ela vale como
    // marca das diárias; pra semanal volta uma semana, pra devolver a que o
    // bug tinha engolido.
    it('resumo antigo com until string: diaria travada, semanal da semana liberada', () => {
        const missoes = [
            { id: '_resumo', summary: true, xp: 100, until: '2026-08-04' },
            { id: 'daily_record_2026-08-04', period: 'daily', periodKey: '2026-08-04', xp: 15 },
            {
                id: 'weekly_clean_5_2026-08-03',
                period: 'weekly',
                periodKey: '2026-08-03',
                xp: 80,
            },
            // Semanal de duas semanas atrás: essa o resumo antigo já contou.
            {
                id: 'weekly_clean_5_2026-07-27',
                period: 'weekly',
                periodKey: '2026-07-27',
                xp: 80,
            },
        ];
        expect(calcularXp([], [], missoes)).toBe(180);
    });

    it('soma missao antiga sem periodKey mesmo com resumo presente', () => {
        const missoes = [
            { id: '_resumo', summary: true, xp: 70, until: { daily: '2026-03-02', weekly: '' } },
            { id: 'x_antiga', xp: 40 },
        ];
        expect(calcularXp([], [], missoes)).toBe(110);
    });

    // Sem `period` não dá pra saber qual marca cobre a entrada. Somar é a
    // escolha certa: perder XP é pior que o risco de contar duas vezes.
    it('soma missao antiga sem period mesmo com periodKey coberta', () => {
        const missoes = [
            { id: '_resumo', summary: true, xp: 70, until: { daily: '2026-03-02', weekly: '' } },
            { id: 'x_2026-03-01', periodKey: '2026-03-01', xp: 40 },
        ];
        expect(calcularXp([], [], missoes)).toBe(110);
    });

    it('ignora conquista com id desconhecido', () => {
        expect(calcularXp([], [{ id: 'nao_existe' }])).toBe(0);
    });

    it('devolve 0 sem dado nenhum', () => {
        expect(calcularXp()).toBe(0);
    });
});

describe('obterNivel', () => {
    it('minimo e inclusivo na fronteira exata', () => {
        expect(obterNivel(999).nome).toBe('Iniciante');
        expect(obterNivel(1000).nome).toBe('Resistente');
    });

    it('calcula progresso dentro do nivel', () => {
        const nivel = obterNivel(500);
        expect(nivel.numero).toBe(1);
        expect(nivel.xpNoNivel).toBe(500);
        expect(nivel.xpParaProximo).toBe(500);
        expect(nivel.progresso).toBeCloseTo(0.5);
        expect(nivel.nomeDoProximo).toBe('Resistente');
    });

    it('no nivel maximo nao ha proximo', () => {
        const nivel = obterNivel(50000);
        expect(nivel.nome).toBe('Lendário');
        expect(nivel.xpParaProximo).toBe(0);
        expect(nivel.nomeDoProximo).toBeNull();
        expect(nivel.progresso).toBe(1);
    });

    // findIndex nao acha faixa pra XP negativo; o fallback tem que cair no
    // primeiro nivel, nao no ultimo.
    it('XP negativo cai no primeiro nivel', () => {
        const nivel = obterNivel(-5);
        expect(nivel.nome).toBe('Iniciante');
        expect(nivel.indice).toBe(0);
    });

    it('XP negativo nao gera derivado negativo', () => {
        const nivel = obterNivel(-5);
        expect(nivel.xpNoNivel).toBe(0);
        expect(nivel.progresso).toBe(0);
        expect(nivel.xpParaProximo).toBe(1000);
    });
});

describe('resumoDeXp', () => {
    it('devolve xp e nivel juntos', () => {
        const resumo = resumoDeXp(diasSeguidos(1, 2));
        expect(resumo.xp).toBe(80);
        expect(resumo.nivel.nome).toBe('Iniciante');
    });
});
