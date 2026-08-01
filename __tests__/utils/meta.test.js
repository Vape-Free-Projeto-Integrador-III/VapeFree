import {
    metaValida,
    metaDoDia,
    metaEfetiva,
    limiteDoDia,
    janelaDeDias,
    mediaDiariaNasDatas,
    comparativoSemanal,
    progressoDaMeta,
} from '../../utils/meta';

// Rampa de 100 -> 10 em 10 dias: cai 9 puxadas por dia.
const META = { baseline: 100, target: 10, startDate: '2026-03-01', endDate: '2026-03-11' };
const APARELHO = { price: 50, totalPuffs: 5000, days: 10 }; // metaDiaria = 500

describe('metaValida', () => {
    it('aceita meta bem formada', () => {
        expect(metaValida(META)).toBe(true);
    });

    it('rejeita alvo maior ou igual ao baseline', () => {
        expect(metaValida({ ...META, target: 100 })).toBe(false);
        expect(metaValida({ ...META, target: 150 })).toBe(false);
    });

    it('rejeita fim antes ou igual ao inicio', () => {
        expect(metaValida({ ...META, endDate: '2026-03-01' })).toBe(false);
        expect(metaValida({ ...META, endDate: '2026-02-01' })).toBe(false);
    });

    it('rejeita data fora do formato YYYY-MM-DD', () => {
        expect(metaValida({ ...META, startDate: '01/03/2026' })).toBe(false);
    });

    it('rejeita null e objeto vazio', () => {
        expect(metaValida(null)).toBe(false);
        expect(metaValida({})).toBe(false);
    });
});

describe('metaDoDia', () => {
    it('vale o baseline no primeiro dia e o alvo no ultimo', () => {
        expect(metaDoDia(META, '2026-03-01')).toBeCloseTo(100);
        expect(metaDoDia(META, '2026-03-11')).toBeCloseTo(10);
    });

    it('interpola linearmente no meio da rampa', () => {
        expect(metaDoDia(META, '2026-03-06')).toBeCloseTo(55); // metade do caminho
        expect(metaDoDia(META, '2026-03-02')).toBeCloseTo(91);
    });

    it('gruda nas pontas fora do intervalo', () => {
        expect(metaDoDia(META, '2026-02-20')).toBeCloseTo(100);
        expect(metaDoDia(META, '2026-04-01')).toBeCloseTo(10);
    });

    it('devolve null com meta invalida', () => {
        expect(metaDoDia(null, '2026-03-05')).toBeNull();
    });
});

describe('metaEfetiva', () => {
    it('a meta do usuario ganha da meta do aparelho', () => {
        expect(metaEfetiva(META, APARELHO, '2026-03-01')).toBeCloseTo(100);
    });

    it('cai na meta do aparelho quando nao ha meta declarada', () => {
        expect(metaEfetiva(null, APARELHO, '2026-03-01')).toBe(500);
    });

    it('devolve null sem meta e sem aparelho', () => {
        expect(metaEfetiva(null, null, '2026-03-01')).toBeNull();
    });
});

describe('limiteDoDia', () => {
    // Unico ponto onde difere de metaEfetiva: antes do startDate a meta ainda
    // nao existia. Usar o baseline no passado inflaria a economia ja registrada.
    it('antes do startDate usa o aparelho, nao o baseline da meta', () => {
        expect(limiteDoDia(META, APARELHO, '2026-02-20')).toBe(500);
        expect(metaEfetiva(META, APARELHO, '2026-02-20')).toBeCloseTo(100);
    });

    it('a partir do startDate segue a rampa', () => {
        expect(limiteDoDia(META, APARELHO, '2026-03-06')).toBeCloseTo(55);
    });
});

describe('janelaDeDias', () => {
    it('devolve as N datas terminando na data informada, em ordem', () => {
        expect(janelaDeDias('2026-03-05', 3)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
    });
});

describe('mediaDiariaNasDatas', () => {
    const registros = [
        { date: '2026-03-01', used: true, puffs: 100 },
        { date: '2026-03-02', used: true, puffs: 50 },
        { date: '2026-03-02', used: true, puffs: 50 },
        { date: '2026-03-09', used: true, puffs: 999 }, // fora da janela
    ];

    it('conta so os dias COM registro (dia sem registro nao vira zero)', () => {
        const media = mediaDiariaNasDatas(registros, ['2026-03-01', '2026-03-02', '2026-03-03']);
        expect(media).toBe(100); // (100 + 100) / 2 dias registrados
    });

    it('devolve null quando nenhum dia da janela foi registrado', () => {
        expect(mediaDiariaNasDatas(registros, ['2026-05-01'])).toBeNull();
    });
});

describe('comparativoSemanal', () => {
    // Hoje = 2026-03-14. Semana atual: 03-08..03-14. Anterior: 03-01..03-07.
    const HOJE = '2026-03-14';

    it('marca queda quando a media diaria cai', () => {
        const registros = [
            { date: '2026-03-02', used: true, puffs: 100 },
            { date: '2026-03-05', used: true, puffs: 100 },
            { date: '2026-03-10', used: true, puffs: 40 },
            { date: '2026-03-12', used: true, puffs: 60 },
        ];
        const c = comparativoSemanal(registros, HOJE);
        expect(c.mediaAnterior).toBe(100);
        expect(c.mediaAtual).toBe(50);
        expect(c.diferenca).toBe(-50);
        expect(c.percentual).toBe(-50);
        expect(c.direcao).toBe('queda');
        expect(c.diasAtuais).toBe(2);
        expect(c.diasAnteriores).toBe(2);
    });

    it('marca alta quando a media diaria sobe', () => {
        const registros = [
            { date: '2026-03-03', used: true, puffs: 10 },
            { date: '2026-03-11', used: true, puffs: 30 },
        ];
        expect(comparativoSemanal(registros, HOJE).direcao).toBe('alta');
    });

    it('trata diferenca menor que meia puxada como estavel', () => {
        const registros = [
            { date: '2026-03-03', used: true, puffs: 10 },
            { date: '2026-03-11', used: true, puffs: 10 },
        ];
        expect(comparativoSemanal(registros, HOJE).direcao).toBe('estavel');
    });

    it('devolve direcao null quando falta registro em alguma semana', () => {
        const registros = [{ date: '2026-03-11', used: true, puffs: 10 }];
        const c = comparativoSemanal(registros, HOJE);
        expect(c.direcao).toBeNull();
        expect(c.diferenca).toBeNull();
        expect(c.mediaAnterior).toBeNull();
        expect(c.diasAnteriores).toBe(0);
    });

    it('devolve percentual null quando a semana anterior fechou em zero', () => {
        const registros = [
            { date: '2026-03-03', used: false, puffs: 0 },
            { date: '2026-03-11', used: true, puffs: 10 },
        ];
        const c = comparativoSemanal(registros, HOJE);
        expect(c.percentual).toBeNull();
        expect(c.direcao).toBe('alta');
    });

    it('conta dia registrado sem uso como zero na media', () => {
        const registros = [
            { date: '2026-03-02', used: true, puffs: 100 },
            { date: '2026-03-10', used: true, puffs: 100 },
            { date: '2026-03-11', used: false, puffs: 100 }, // puffs antigo ignorado
        ];
        expect(comparativoSemanal(registros, HOJE).mediaAtual).toBe(50);
    });
});

describe('progressoDaMeta', () => {
    it('marca dentroDaMeta quando o uso do dia nao passa da rampa', () => {
        const registros = [{ date: '2026-03-06', used: true, puffs: 50 }];
        const progresso = progressoDaMeta(META, registros, '2026-03-06');
        expect(progresso.usadasHoje).toBe(50);
        expect(progresso.metaDeHoje).toBeCloseTo(55);
        expect(progresso.dentroDaMeta).toBe(true);
        expect(progresso.diasRestantes).toBe(5);
        expect(progresso.percentualDoTempo).toBe(50);
    });

    it('marca fora da meta quando passa', () => {
        const registros = [{ date: '2026-03-06', used: true, puffs: 80 }];
        expect(progressoDaMeta(META, registros, '2026-03-06').dentroDaMeta).toBe(false);
    });

    it('devolve null com meta invalida', () => {
        expect(progressoDaMeta(null, [], '2026-03-06')).toBeNull();
    });
});
