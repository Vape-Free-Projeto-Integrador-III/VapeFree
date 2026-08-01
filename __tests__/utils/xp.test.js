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
