import {
    MARCOS_DE_SAUDE,
    inicioDoTempoLimpo,
    calcularMarcosDeSaude,
    formatarDuracao,
} from '../../utils/saude';

// Datas fixas: nenhum teste pode depender do dia atual.
const AGORA = new Date('2026-03-10T09:00:00');

function registro(date, used, puffs = 0) {
    return { id: 1, date, used, puffs };
}

describe('inicioDoTempoLimpo', () => {
    it('devolve null sem registro nenhum', () => {
        expect(inicioDoTempoLimpo([])).toBeNull();
        expect(inicioDoTempoLimpo(null)).toBeNull();
    });

    it('conta da meia-noite do dia seguinte ao ultimo dia com uso', () => {
        const inicio = inicioDoTempoLimpo([
            registro('2026-03-01', true, 40),
            registro('2026-03-05', true, 10),
            registro('2026-03-06', false),
        ]);
        expect(inicio).toEqual(new Date('2026-03-06T00:00:00'));
    });

    it('sem nenhum dia com uso, conta da meia-noite do primeiro dia registrado', () => {
        const inicio = inicioDoTempoLimpo([
            registro('2026-03-04', false),
            registro('2026-03-02', false),
        ]);
        expect(inicio).toEqual(new Date('2026-03-02T00:00:00'));
    });

    it('ignora a ordem dos registros na lista', () => {
        const inicio = inicioDoTempoLimpo([
            registro('2026-03-06', false),
            registro('2026-03-05', true, 10),
            registro('2026-03-01', true, 40),
        ]);
        expect(inicio).toEqual(new Date('2026-03-06T00:00:00'));
    });
});

describe('calcularMarcosDeSaude', () => {
    it('nao fica pronto sem registro', () => {
        expect(calcularMarcosDeSaude([], AGORA).pronto).toBe(false);
    });

    it('marca usouHoje e nao conquista nada quando o uso foi hoje', () => {
        const estado = calcularMarcosDeSaude([registro('2026-03-10', true, 20)], AGORA);
        expect(estado.pronto).toBe(true);
        expect(estado.usouHoje).toBe(true);
        expect(estado.minutosLimpo).toBe(0);
        expect(estado.conquistados).toEqual([]);
        expect(estado.atual).toBeNull();
        expect(estado.proximo.id).toBe('min_20');
    });

    it('conquista os marcos abaixo do tempo limpo, na ordem', () => {
        // Uso em 08/03 -> relogio comeca 09/03 00:00; agora e 10/03 09:00 = 33h.
        const estado = calcularMarcosDeSaude([registro('2026-03-08', true, 20)], AGORA);
        expect(estado.minutosLimpo).toBe(33 * 60);
        expect(estado.conquistados.map((m) => m.id)).toEqual(['min_20', 'h_12', 'd_1']);
        expect(estado.atual.id).toBe('d_1');
        expect(estado.proximo.id).toBe('d_2');
        expect(estado.usouHoje).toBe(false);
    });

    it('progresso e o quanto andou entre o marco atual e o proximo', () => {
        // 33h limpo: entre 1 dia (24h) e 2 dias (48h) -> 9h de 24h.
        const estado = calcularMarcosDeSaude([registro('2026-03-08', true, 20)], AGORA);
        expect(estado.progresso).toBeCloseTo(9 / 24, 5);
        expect(estado.faltamMinutos).toBe(15 * 60);
    });

    it('dia sem registro nao zera o relogio', () => {
        // Uso em 01/03 e nada registrado depois: continua contando desde 02/03.
        const estado = calcularMarcosDeSaude([registro('2026-03-01', true, 20)], AGORA);
        expect(estado.atual.id).toBe('d_7');
        expect(estado.proximo.id).toBe('d_14');
    });

    it('passado o ultimo marco, nao tem proximo e o progresso e 1', () => {
        const estado = calcularMarcosDeSaude([registro('2024-01-01', true, 20)], AGORA);
        expect(estado.conquistados).toHaveLength(MARCOS_DE_SAUDE.length);
        expect(estado.proximo).toBeNull();
        expect(estado.progresso).toBe(1);
        expect(estado.faltamMinutos).toBe(0);
    });
});

describe('formatarDuracao', () => {
    it('usa a maior unidade que couber', () => {
        expect(formatarDuracao(45)).toBe('45 min');
        expect(formatarDuracao(60)).toBe('1 hora');
        expect(formatarDuracao(90)).toBe('2 horas');
        expect(formatarDuracao(24 * 60)).toBe('1 dia');
        expect(formatarDuracao(50 * 60)).toBe('3 dias');
    });

    it('nunca devolve negativo', () => {
        expect(formatarDuracao(-10)).toBe('0 min');
    });
});
