import {
    aparelhoEm,
    historicoComNovoAparelho,
    normalizarHistorico,
    periodosDeAparelho,
    normalizarDispositivos,
    dispositivosAtivos,
    dispositivoPadrao,
    comDispositivoPadrao,
    dispositivoDoRegistro,
    consumoPorDispositivo,
    estadoDoDispositivo,
    dispositivosDerivadosDoHistorico,
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

// ─── Lista de dispositivos ───────────────────────────────────────────────────

const POD = { ...BARATO, id: 1 };
const CANETA = { ...CARO, id: 2 };

describe('normalizarDispositivos', () => {
    it('descarta o que não dá pra calcular e o que não tem id', () => {
        expect(normalizarDispositivos([POD, BARATO, { id: 3, name: 'só nome' }])).toEqual([
            { ...POD, archived: false, isDefault: false },
        ]);
    });

    it('archived vira booleano', () => {
        expect(normalizarDispositivos([{ ...POD, archived: 'sim' }])[0].archived).toBe(false);
        expect(normalizarDispositivos([{ ...POD, archived: true }])[0].archived).toBe(true);
    });
});

describe('dispositivosAtivos', () => {
    it('deixa de fora o arquivado', () => {
        expect(dispositivosAtivos([POD, { ...CANETA, archived: true }]).map((d) => d.id)).toEqual([
            1,
        ]);
    });
});

describe('dispositivoDoRegistro', () => {
    const dispositivos = [POD, CANETA];
    const historico = [{ ...CARO, desde: '2026-03-10' }];

    it('o deviceId do registro manda', () => {
        expect(
            dispositivoDoRegistro(
                { date: '2026-03-15', deviceId: 1 },
                dispositivos,
                historico,
                CARO
            )
        ).toMatchObject({ id: 1 });
    });

    it('registro sem deviceId cai no aparelho que valia na data', () => {
        expect(
            dispositivoDoRegistro({ date: '2026-03-15' }, dispositivos, historico, null)
        ).toMatchObject({ name: 'Elfbar' });
    });

    it('sem histórico nenhum, cai no aparelho atual', () => {
        expect(dispositivoDoRegistro({ date: '2026-03-15' }, [], [], BARATO)).toBe(BARATO);
    });

    it('deviceId que não existe mais não inventa dispositivo', () => {
        expect(
            dispositivoDoRegistro({ date: '2026-03-15', deviceId: 99 }, dispositivos, [], null)
        ).toBeNull();
    });
});

describe('consumoPorDispositivo', () => {
    it('soma as puxadas por dispositivo e ignora o dia sem uso', () => {
        const registros = [
            { date: '2026-03-01', used: true, puffs: 100, deviceId: 1 },
            { date: '2026-03-02', used: true, puffs: 50, deviceId: 1 },
            { date: '2026-03-03', used: true, puffs: 30, deviceId: 2 },
            { date: '2026-03-04', used: false, puffs: 90, deviceId: 1 },
            { date: '2026-03-05', used: true, puffs: 10 },
        ];

        expect(consumoPorDispositivo(registros)).toEqual({ 1: 150, 2: 30 });
    });
});

describe('estadoDoDispositivo', () => {
    it('conta o que falta e marca esgotado ao chegar no total', () => {
        expect(estadoDoDispositivo(POD, 4000)).toEqual({
            usadas: 4000,
            total: 5000,
            restante: 1000,
            percentual: 80,
            esgotado: false,
        });
        expect(estadoDoDispositivo(POD, 5000).esgotado).toBe(true);
        expect(estadoDoDispositivo(POD, 6000)).toMatchObject({ restante: 0, percentual: 100 });
    });

    it('dispositivo sem total não esgota', () => {
        expect(estadoDoDispositivo({ id: 1 }, 100)).toMatchObject({
            total: null,
            esgotado: false,
        });
    });
});

describe('dispositivosDerivadosDoHistorico', () => {
    const historico = [
        { ...BARATO, desde: '2026-03-05' },
        { ...CARO, desde: '2026-03-10' },
    ];

    it('cada vigência vira um dispositivo, só o último ativo', () => {
        const derivados = dispositivosDerivadosDoHistorico(historico);

        expect(derivados.map((d) => [d.name, d.archived])).toEqual([
            ['Ignite', true],
            ['Elfbar', false],
        ]);
    });

    it('o id é estável entre chamadas (senão nenhum registro casaria)', () => {
        expect(dispositivosDerivadosDoHistorico(historico).map((d) => d.id)).toEqual(
            dispositivosDerivadosDoHistorico(historico).map((d) => d.id)
        );
    });

    it('histórico vazio não deriva nada', () => {
        expect(dispositivosDerivadosDoHistorico([])).toEqual([]);
    });
});

describe('dispositivoPadrao', () => {
    it('devolve o marcado como padrão', () => {
        expect(dispositivoPadrao([POD, { ...CANETA, isDefault: true }])).toMatchObject({ id: 2 });
    });

    it('sem marca nenhuma, cai no último ativo', () => {
        expect(dispositivoPadrao([POD, CANETA])).toMatchObject({ id: 2 });
    });

    it('padrão arquivado não vale', () => {
        expect(
            dispositivoPadrao([POD, { ...CANETA, archived: true, isDefault: true }])
        ).toMatchObject({ id: 1 });
    });

    it('sem dispositivo ativo, não tem padrão', () => {
        expect(dispositivoPadrao([{ ...POD, archived: true }])).toBeNull();
    });
});

describe('comDispositivoPadrao', () => {
    it('marca só um e tira a marca dos outros', () => {
        const lista = comDispositivoPadrao([{ ...POD, isDefault: true }, CANETA], 2);

        expect(lista.map((d) => d.isDefault)).toEqual([false, true]);
    });

    it('arquivado nunca vira padrão', () => {
        const lista = comDispositivoPadrao([POD, { ...CANETA, archived: true }], 2);

        expect(lista.every((d) => !d.isDefault)).toBe(true);
    });
});
