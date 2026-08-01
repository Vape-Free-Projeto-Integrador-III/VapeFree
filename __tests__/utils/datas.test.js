import {
    chaveDeData,
    chaveDeDataLocal,
    converterDataLocal,
    deslocarData,
    diferencaEmDias,
    inicioDaSemana,
    diasDaSemana,
} from '../../utils/datas';

describe('chaveDeData', () => {
    it('preenche mes e dia com zero a esquerda (mes e 0-11)', () => {
        expect(chaveDeData(2026, 0, 5)).toBe('2026-01-05');
        expect(chaveDeData(2026, 11, 31)).toBe('2026-12-31');
    });
});

describe('chaveDeDataLocal', () => {
    // Regressao do bug de fuso: no Brasil (UTC-3) as 23h30 ja e o dia seguinte em
    // UTC. toISOString().slice(0,10) devolveria '2026-03-06' aqui.
    it('usa o dia LOCAL mesmo perto da meia-noite', () => {
        expect(chaveDeDataLocal(new Date(2026, 2, 5, 23, 30))).toBe('2026-03-05');
    });

    it('nao volta um dia na madrugada', () => {
        expect(chaveDeDataLocal(new Date(2026, 2, 5, 0, 15))).toBe('2026-03-05');
    });
});

describe('converterDataLocal', () => {
    it('faz round-trip com chaveDeDataLocal', () => {
        expect(chaveDeDataLocal(converterDataLocal('2026-07-31'))).toBe('2026-07-31');
    });
});

describe('deslocarData', () => {
    it('vira o mes', () => {
        expect(deslocarData('2026-01-31', 1)).toBe('2026-02-01');
    });

    it('vira o ano pra tras', () => {
        expect(deslocarData('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('respeita ano bissexto', () => {
        expect(deslocarData('2024-02-28', 1)).toBe('2024-02-29');
        expect(deslocarData('2026-02-28', 1)).toBe('2026-03-01');
    });
});

describe('diferencaEmDias', () => {
    it('devolve b - a, com sinal', () => {
        expect(diferencaEmDias('2026-01-01', '2026-01-11')).toBe(10);
        expect(diferencaEmDias('2026-01-11', '2026-01-01')).toBe(-10);
        expect(diferencaEmDias('2026-01-01', '2026-01-01')).toBe(0);
    });
});

describe('inicioDaSemana', () => {
    it('devolve a propria data quando ja e segunda', () => {
        expect(inicioDaSemana('2026-03-02')).toBe('2026-03-02'); // segunda
    });

    it('domingo pertence a semana que comecou na segunda ANTERIOR', () => {
        expect(inicioDaSemana('2026-03-08')).toBe('2026-03-02'); // domingo
    });
});

describe('diasDaSemana', () => {
    it('devolve 7 datas de segunda a domingo', () => {
        expect(diasDaSemana('2026-03-05')).toEqual([
            '2026-03-02',
            '2026-03-03',
            '2026-03-04',
            '2026-03-05',
            '2026-03-06',
            '2026-03-07',
            '2026-03-08',
        ]);
    });
});
