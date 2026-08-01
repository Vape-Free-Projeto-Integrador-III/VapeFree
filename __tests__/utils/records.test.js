import {
  puxadasDoRegistro,
  somarPuxadas,
  normalizarRegistro,
  metaDiaria,
  custoPorPuxada,
  excessoDoDia,
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
    ).toEqual({ date: '2026-03-05', used: false, puffs: 0, triggers: [] });
  });

  it('devolve o registro intacto quando houve uso', () => {
    const registro = { date: '2026-03-05', used: true, puffs: 7, triggers: ['stress'] };
    expect(normalizarRegistro(registro)).toBe(registro);
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
