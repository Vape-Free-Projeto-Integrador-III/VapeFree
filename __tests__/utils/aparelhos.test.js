import {
    aparelhoEm,
    historicoComNovoAparelho,
    normalizarHistorico,
    periodosDeAparelho,
} from '../../utils/aparelhos';

const BARATO = { name: 'Ignite', price: 50, totalPuffs: 5000, days: 10 };
const CARO = { name: 'Elfbar', price: 500, totalPuffs: 5000, days: 50 };

describe('normalizarHistorico', () => {
    it('descarta o que não dá pra calcular', () => {
        expect(normalizarHistorico(null)).toEqual([]);
        expect(normalizarHistorico('nada')).toEqual([]);
        expect(
            normalizarHistorico([{ name: 'sem preço', totalPuffs: 100, days: 5 }, BARATO])
        ).toEqual([BARATO]);
    });

    it('ordena por vigência, com o "desde sempre" na frente', () => {
        const fora = [
            { ...CARO, desde: '2026-03-10' },
            { ...BARATO, desde: '2026-03-01' },
            { ...BARATO, price: 30 },
        ];

        expect(normalizarHistorico(fora).map((a) => a.desde)).toEqual([
            undefined,
            '2026-03-01',
            '2026-03-10',
        ]);
    });
});

describe('aparelhoEm', () => {
    const historico = [
        { ...BARATO, desde: '2026-03-05' },
        { ...CARO, desde: '2026-03-10' },
    ];

    it('devolve null com histórico vazio', () => {
        expect(aparelhoEm([], '2026-03-05')).toBeNull();
    });

    it('no dia da troca já vale o aparelho novo', () => {
        expect(aparelhoEm(historico, '2026-03-10')).toMatchObject({ name: 'Elfbar' });
    });

    it('entre as vigências vale o anterior', () => {
        expect(aparelhoEm(historico, '2026-03-09')).toMatchObject({ name: 'Ignite' });
    });

    it('depois da última vigência vale a última', () => {
        expect(aparelhoEm(historico, '2026-12-31')).toMatchObject({ name: 'Elfbar' });
    });

    it('antes da primeira vigência cai no aparelho mais antigo', () => {
        // Registro anterior ao cadastro do vape continua sendo precificado —
        // era o que acontecia antes do histórico existir.
        expect(aparelhoEm(historico, '2026-01-01')).toMatchObject({ name: 'Ignite' });
    });

    it('entrada sem `desde` vale pra qualquer data', () => {
        expect(aparelhoEm([BARATO], '2020-01-01')).toMatchObject({ name: 'Ignite' });
    });
});

describe('historicoComNovoAparelho', () => {
    it('primeiro aparelho abre o histórico com a vigência de hoje', () => {
        expect(historicoComNovoAparelho([], BARATO, '2026-03-05')).toEqual([
            { ...BARATO, desde: '2026-03-05' },
        ]);
    });

    it('salvar o mesmo aparelho de novo não cria vigência', () => {
        const historico = [{ ...BARATO, desde: '2026-03-05' }];

        expect(historicoComNovoAparelho(historico, BARATO, '2026-03-20')).toEqual(historico);
    });

    it('corrigir o aparelho no mesmo dia substitui a vigência', () => {
        const historico = [{ ...BARATO, desde: '2026-03-05' }];

        expect(historicoComNovoAparelho(historico, { ...BARATO, price: 60 }, '2026-03-05')).toEqual(
            [{ ...BARATO, price: 60, desde: '2026-03-05' }]
        );
    });

    it('trocar de aparelho depois preserva a vigência antiga', () => {
        const historico = [{ ...BARATO, desde: '2026-03-05' }];

        expect(historicoComNovoAparelho(historico, CARO, '2026-03-10')).toEqual([
            { ...BARATO, desde: '2026-03-05' },
            { ...CARO, desde: '2026-03-10' },
        ]);
    });

    it('aparelho sem preço não entra no histórico', () => {
        const historico = [{ ...BARATO, desde: '2026-03-05' }];

        expect(historicoComNovoAparelho(historico, { name: 'quebrado' }, '2026-03-10')).toEqual(
            historico
        );
    });

    it('legado sem `desde` ganha a vigência da troca, sem perder o passado', () => {
        expect(historicoComNovoAparelho([BARATO], CARO, '2026-03-10')).toEqual([
            BARATO,
            { ...CARO, desde: '2026-03-10' },
        ]);
    });
});

describe('periodosDeAparelho', () => {
    it('fecha cada período no dia em que o próximo aparelho entra', () => {
        const historico = [
            { ...BARATO, desde: '2026-03-05' },
            { ...CARO, desde: '2026-03-10' },
        ];

        expect(periodosDeAparelho(historico)).toEqual([
            { aparelho: historico[0], de: '2026-03-05', ate: '2026-03-10' },
            { aparelho: historico[1], de: '2026-03-10', ate: null },
        ]);
    });

    it('legado sem `desde` vale desde sempre', () => {
        expect(periodosDeAparelho([BARATO])).toEqual([{ aparelho: BARATO, de: null, ate: null }]);
    });

    it('histórico vazio não tem período', () => {
        expect(periodosDeAparelho(null)).toEqual([]);
    });
});
