import {
    economiaAcumuladaAte,
    serieDeEconomiaAcumulada,
    ganhoDaSerie,
    rotulosEspacados,
} from '../../utils/economia';

const ECONOMIA = {
    '2024-03-01': 2.5,
    '2024-03-02': 1.5,
    '2024-03-04': 4,
};

describe('economiaAcumuladaAte', () => {
    it('soma só os dias anteriores à data', () => {
        expect(economiaAcumuladaAte(ECONOMIA, '2024-03-04')).toBe(4);
    });

    it('devolve 0 quando não há dia anterior', () => {
        expect(economiaAcumuladaAte(ECONOMIA, '2024-03-01')).toBe(0);
    });

    it('devolve 0 sem economia', () => {
        expect(economiaAcumuladaAte(null, '2024-03-01')).toBe(0);
    });
});

describe('serieDeEconomiaAcumulada', () => {
    it('acumula dia a dia, repetindo o valor em dia sem economia', () => {
        const serie = serieDeEconomiaAcumulada(ECONOMIA, [
            '2024-03-01',
            '2024-03-02',
            '2024-03-03',
            '2024-03-04',
        ]);
        expect(serie.map((p) => p.acumulado)).toEqual([2.5, 4, 4, 8]);
        expect(serie[0].data).toBe('2024-03-01');
    });

    it('começa do que foi economizado antes da janela', () => {
        const serie = serieDeEconomiaAcumulada(ECONOMIA, ['2024-03-04', '2024-03-05']);
        expect(serie.map((p) => p.acumulado)).toEqual([8, 8]);
    });

    it('devolve lista vazia sem dias', () => {
        expect(serieDeEconomiaAcumulada(ECONOMIA, [])).toEqual([]);
    });

    it('trata economia ausente como zero em todos os dias', () => {
        const serie = serieDeEconomiaAcumulada(undefined, ['2024-03-01', '2024-03-02']);
        expect(serie.map((p) => p.acumulado)).toEqual([0, 0]);
    });

    it('ignora valor inválido no mapa', () => {
        const serie = serieDeEconomiaAcumulada({ '2024-03-01': 'abc', '2024-03-02': 3 }, [
            '2024-03-01',
            '2024-03-02',
        ]);
        expect(serie.map((p) => p.acumulado)).toEqual([0, 3]);
    });
});

describe('ganhoDaSerie', () => {
    it('é a diferença entre o último e o primeiro ponto', () => {
        const serie = serieDeEconomiaAcumulada(ECONOMIA, ['2024-03-01', '2024-03-04']);
        expect(ganhoDaSerie(serie)).toBe(4);
    });

    it('devolve 0 para série vazia', () => {
        expect(ganhoDaSerie([])).toBe(0);
    });
});

describe('rotulosEspacados', () => {
    it('escreve no máximo o número pedido de rótulos', () => {
        const dias = Array.from(
            { length: 30 },
            (_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`
        );
        const rotulos = rotulosEspacados(dias, 5);
        expect(rotulos).toHaveLength(30);
        expect(rotulos.filter(Boolean)).toHaveLength(5);
    });

    it('sempre mostra o último dia', () => {
        const rotulos = rotulosEspacados(['2024-03-01', '2024-03-02', '2024-03-03'], 2);
        expect(rotulos[rotulos.length - 1]).toBe('03/03');
    });

    it('formata como DD/MM', () => {
        expect(rotulosEspacados(['2024-03-09'], 5)).toEqual(['09/03']);
    });
});
