import {
    puxadasDoRegistro,
    somarPuxadas,
    normalizarRegistro,
    metaDiaria,
    custoPorPuxada,
    excessoDoDia,
    limitarPuxadas,
    normalizarNota,
    MAX_PUXADAS_DIA,
    MAX_NOTA,
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
