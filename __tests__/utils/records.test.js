import {
    puxadasDoRegistro,
    somarPuxadas,
    normalizarRegistro,
    metaDiaria,
    custoPorPuxada,
    excessoDoDia,
    limitarPuxadas,
    normalizarNota,
    normalizarBusca,
    notaCasaComBusca,
    MAX_PUXADAS_DIA,
    MAX_NOTA,
    resumoDeAparelhos,
} from '../../utils/records';

const APARELHO = { price: 50, totalPuffs: 5000, days: 10 };

describe('puxadasDoRegistro', () => {
    // Razao de o arquivo existir: registro editado pra "nao usei" pode ter
    // ficado com o puffs antigo no dado salvo.
    it('devolve 0 quando used e false, mesmo com puffs residual', () => {
        expect(puxadasDoRegistro({ used: false, puffs: 3 })).toBe(0);
    });

    it('devolve puffs quando used e true', () => {
        expect(puxadasDoRegistro({ used: true, puffs: 3 })).toBe(3);
    });
});

describe('somarPuxadas', () => {
    it('devolve 0 pra lista vazia', () => {
        expect(somarPuxadas([])).toBe(0);
    });

    it('ignora os registros sem uso', () => {
        expect(
            somarPuxadas([
                { used: true, puffs: 10 },
                { used: false, puffs: 99 },
                { used: true, puffs: 5 },
            ])
        ).toBe(15);
    });
});

describe('normalizarRegistro', () => {
    it('zera puffs e triggers quando nao houve uso', () => {
        expect(
            normalizarRegistro({ date: '2026-03-05', used: false, puffs: 7, triggers: ['stress'] })
        ).toEqual({ date: '2026-03-05', used: false, puffs: 0, triggers: [], note: null });
    });

    it('preserva os campos quando houve uso', () => {
        const registro = { date: '2026-03-05', used: true, puffs: 7, triggers: ['stress'] };
        expect(normalizarRegistro(registro)).toEqual({ ...registro, note: null });
    });

    it('prende puffs no teto quando houve uso', () => {
        expect(normalizarRegistro({ used: true, puffs: 999999 }).puffs).toBe(MAX_PUXADAS_DIA);
    });

    it('mantem a anotacao no dia com uso e no dia sem uso', () => {
        expect(normalizarRegistro({ used: true, puffs: 3, note: '  dia corrido ' }).note).toBe(
            'dia corrido'
        );
        expect(normalizarRegistro({ used: false, note: 'segurei a onda' }).note).toBe(
            'segurei a onda'
        );
    });
});

describe('normalizarNota', () => {
    it('devolve null pra nota vazia, só espaço ou ausente', () => {
        expect(normalizarNota('')).toBeNull();
        expect(normalizarNota('   ')).toBeNull();
        expect(normalizarNota(undefined)).toBeNull();
        expect(normalizarNota(null)).toBeNull();
    });

    it('apara as bordas', () => {
        expect(normalizarNota('  hoje foi dificil  ')).toBe('hoje foi dificil');
    });

    it('corta no teto de caracteres', () => {
        expect(normalizarNota('a'.repeat(MAX_NOTA + 50))).toHaveLength(MAX_NOTA);
    });

    it('ignora valor que nao e string', () => {
        expect(normalizarNota(42)).toBeNull();
    });
});

describe('notaCasaComBusca', () => {
    it('casa com tudo quando o termo esta vazio ou so tem espaco', () => {
        expect(notaCasaComBusca('hoje foi dificil', '')).toBe(true);
        expect(notaCasaComBusca(null, '   ')).toBe(true);
    });

    it('ignora caixa e acento dos dois lados', () => {
        expect(notaCasaComBusca('Tomei um Café e deu vontade', 'cafe')).toBe(true);
        expect(notaCasaComBusca('foi so ansiedade', 'ANSIEDADE')).toBe(true);
        expect(notaCasaComBusca('dia dificil', 'difícil')).toBe(true);
    });

    it('casa com pedaco no meio da nota', () => {
        expect(notaCasaComBusca('briga no trabalho', 'trabalh')).toBe(true);
    });

    it('nao casa quando o termo nao esta na nota', () => {
        expect(notaCasaComBusca('dia tranquilo', 'estresse')).toBe(false);
    });

    it('nao casa registro sem nota quando ha termo', () => {
        expect(notaCasaComBusca(null, 'cafe')).toBe(false);
        expect(notaCasaComBusca(undefined, 'cafe')).toBe(false);
    });
});

describe('normalizarBusca', () => {
    it('tira acento, caixa e bordas', () => {
        expect(normalizarBusca('  Ansiedade à Noite  ')).toBe('ansiedade a noite');
    });

    it('devolve string vazia pro que nao e string', () => {
        expect(normalizarBusca(null)).toBe('');
        expect(normalizarBusca(42)).toBe('');
    });

    it('preserva caractere nao-ascii que nao e acento conhecido', () => {
        expect(normalizarBusca('deu vontade 😤')).toBe('deu vontade 😤');
    });
});

describe('limitarPuxadas', () => {
    it('prende no teto', () => {
        expect(limitarPuxadas(999999)).toBe(MAX_PUXADAS_DIA);
    });

    it('aceita string do TextInput', () => {
        expect(limitarPuxadas('42')).toBe(42);
    });

    it('devolve 0 pro que nao e numero, pra vazio e pra negativo', () => {
        expect(limitarPuxadas('')).toBe(0);
        expect(limitarPuxadas('abc')).toBe(0);
        expect(limitarPuxadas(-5)).toBe(0);
    });

    it('trunca decimal', () => {
        expect(limitarPuxadas(3.9)).toBe(3);
    });
});

describe('metaDiaria', () => {
    it('divide totalPuffs pelos dias', () => {
        expect(metaDiaria(APARELHO)).toBe(500);
    });

    it('devolve null com days invalido ou aparelho ausente', () => {
        expect(metaDiaria({ totalPuffs: 5000, days: 0 })).toBeNull();
        expect(metaDiaria(null)).toBeNull();
    });
});

describe('custoPorPuxada', () => {
    it('divide o preco pelo total de puxadas', () => {
        expect(custoPorPuxada(APARELHO)).toBe(0.01);
    });

    it('devolve null sem preco', () => {
        expect(custoPorPuxada({ totalPuffs: 5000 })).toBeNull();
    });
});

describe('excessoDoDia', () => {
    it('devolve 0 de excesso quando o dia ficou dentro da meta', () => {
        expect(excessoDoDia([{ used: true, puffs: 400 }], APARELHO)).toEqual({
            puxadasAMais: 0,
            custoAMais: 0,
        });
    });

    it('cobra o excesso pelo custo por puxada', () => {
        expect(excessoDoDia([{ used: true, puffs: 600 }], APARELHO)).toEqual({
            puxadasAMais: 100,
            custoAMais: 1,
        });
    });

    it('a meta do dia informada ganha da meta do aparelho', () => {
        expect(excessoDoDia([{ used: true, puffs: 300 }], APARELHO, 200).puxadasAMais).toBe(100);
    });

    it('custoAMais null quando existe meta mas nao existe aparelho', () => {
        expect(excessoDoDia([{ used: true, puffs: 300 }], null, 200)).toEqual({
            puxadasAMais: 100,
            custoAMais: null,
        });
    });

    it('devolve null sem meta nenhuma', () => {
        expect(excessoDoDia([{ used: true, puffs: 300 }], null)).toBeNull();
    });
});

describe('resumoDeAparelhos', () => {
    const BARATO = { name: 'Ignite', price: 50, totalPuffs: 5000, days: 10, desde: '2024-03-01' };
    const CARO = { name: 'Elfbar', price: 500, totalPuffs: 5000, days: 50, desde: '2024-03-10' };
    const REGISTROS = [
        { date: '2024-03-05', used: true, puffs: 100 },
        { date: '2024-03-05', used: true, puffs: 50 },
        { date: '2024-03-09', used: false, puffs: 30 },
        { date: '2024-03-10', used: true, puffs: 200 },
        { date: '2024-03-12', used: true, puffs: 100 },
    ];
    const ECONOMIA = { '2024-03-05': 1.5, '2024-03-09': 2, '2024-03-12': 10 };

    it('cobra cada período pelo custo por puxada do aparelho da época', () => {
        const resumo = resumoDeAparelhos([BARATO, CARO], REGISTROS, ECONOMIA);

        // 150 puxadas × R$ 0,01 no primeiro; 300 × R$ 0,10 no segundo.
        expect(resumo.map((r) => r.gasto)).toEqual([1.5, 30]);
        expect(resumo.map((r) => r.puxadas)).toEqual([150, 300]);
    });

    it('conta dias com registro e não puxadas de dia sem uso', () => {
        const resumo = resumoDeAparelhos([BARATO, CARO], REGISTROS, ECONOMIA);

        expect(resumo[0]).toMatchObject({ dias: 2, puxadas: 150 });
        expect(resumo[1]).toMatchObject({ dias: 2, puxadas: 300 });
    });

    it('divide a economia pelo período de vigência', () => {
        const resumo = resumoDeAparelhos([BARATO, CARO], REGISTROS, ECONOMIA);

        expect(resumo.map((r) => r.economizado)).toEqual([3.5, 10]);
    });

    it('aparelho sem histórico não gera resumo', () => {
        expect(resumoDeAparelhos([], REGISTROS, ECONOMIA)).toEqual([]);
    });

    it('legado sem `desde` leva tudo o que veio antes dele', () => {
        const legado = { name: 'Antigo', price: 50, totalPuffs: 5000, days: 10 };
        const resumo = resumoDeAparelhos([legado, CARO], REGISTROS, ECONOMIA);

        expect(resumo[0]).toMatchObject({ de: null, ate: '2024-03-10', puxadas: 150 });
    });
});
