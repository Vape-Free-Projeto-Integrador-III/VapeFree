import {
  CONQUISTAS,
  DIAS_PARA_ESCUDO,
  calcularStreakDeDias,
  listarDiasLimpos,
  calcularEstadoDeStreak,
  calcularStreak,
  verificarConquistas,
} from '../../utils/achievements';

const limpo = (date) => ({ date, used: false, puffs: 0 });
const usou = (date, puffs = 5) => ({ date, used: true, puffs });

// Datas seguidas a partir de 2026-03-01.
const dia = (n) => `2026-03-${String(n).padStart(2, '0')}`;
const diasLimposSeguidos = (inicio, quantidade) =>
  Array.from({ length: quantidade }, (_, i) => limpo(dia(inicio + i)));

describe('calcularStreakDeDias', () => {
  it('devolve 0 pra lista vazia', () => {
    expect(calcularStreakDeDias([])).toBe(0);
    expect(calcularStreakDeDias(null)).toBe(0);
  });

  it('devolve a maior sequencia consecutiva, ignorando ordem e repetidas', () => {
    const datas = [
      '2026-03-05',
      '2026-03-01',
      '2026-03-02',
      '2026-03-02',
      '2026-03-06',
      '2026-03-07',
    ];
    expect(calcularStreakDeDias(datas)).toBe(3); // 05, 06, 07
  });
});

describe('listarDiasLimpos', () => {
  it('exclui o dia que tem qualquer registro com used, e ordena', () => {
    const registros = [
      limpo('2026-03-03'),
      limpo('2026-03-01'),
      limpo('2026-03-02'),
      usou('2026-03-02'),
    ];
    expect(listarDiasLimpos(registros)).toEqual(['2026-03-01', '2026-03-03']);
  });
});

describe('calcularEstadoDeStreak', () => {
  it('devolve estado zerado sem registro', () => {
    expect(calcularEstadoDeStreak([])).toEqual({
      streak: 0,
      escudos: 0,
      progresso: 0,
      diasProtegidos: [],
      ultimoDiaProtegido: null,
      gastouEscudoNoUltimoDia: false,
    });
  });

  it('concede escudo ao completar DIAS_PARA_ESCUDO dias limpos', () => {
    const antes = calcularEstadoDeStreak(diasLimposSeguidos(1, DIAS_PARA_ESCUDO - 1));
    expect(antes.escudos).toBe(0);
    expect(antes.progresso).toBe(DIAS_PARA_ESCUDO - 1);

    const depois = calcularEstadoDeStreak(diasLimposSeguidos(1, DIAS_PARA_ESCUDO));
    expect(depois.escudos).toBe(1);
    expect(depois.progresso).toBe(0);
    expect(depois.streak).toBe(DIAS_PARA_ESCUDO);
  });

  it('gasta o escudo num dia com uso: streak continua somando', () => {
    const registros = [...diasLimposSeguidos(1, 7), usou(dia(8))];
    const estado = calcularEstadoDeStreak(registros);
    expect(estado.streak).toBe(8);
    expect(estado.escudos).toBe(0);
    expect(estado.diasProtegidos).toEqual([dia(8)]);
    expect(estado.gastouEscudoNoUltimoDia).toBe(true);
  });

  it('escudo cobre UM dia falho, nao dois seguidos', () => {
    const registros = [...diasLimposSeguidos(1, 7), usou(dia(8)), usou(dia(9))];
    const estado = calcularEstadoDeStreak(registros);
    expect(estado.streak).toBe(0);
    expect(estado.escudos).toBe(0);
  });

  it('dia sem registro nenhum zera streak e escudo (esquecimento nao e coberto)', () => {
    const registros = [...diasLimposSeguidos(1, 7), limpo(dia(9))]; // dia 8 ausente
    const estado = calcularEstadoDeStreak(registros);
    expect(estado.streak).toBe(1);
    expect(estado.escudos).toBe(0);
  });

  it('nao transborda escudo: 14 dias limpos continuam valendo 1 escudo', () => {
    const estado = calcularEstadoDeStreak(diasLimposSeguidos(1, 14));
    expect(estado.escudos).toBe(1);
    expect(estado.progresso).toBe(DIAS_PARA_ESCUDO);
    expect(estado.streak).toBe(14);
  });

  it('calcularStreak e atalho pro campo streak', () => {
    const registros = diasLimposSeguidos(1, 3);
    expect(calcularStreak(registros)).toBe(calcularEstadoDeStreak(registros).streak);
  });
});

describe('verificarConquistas', () => {
  it('desbloqueia a conquista cuja condicao foi cumprida', async () => {
    const resultados = await verificarConquistas([limpo('2026-03-01')]);
    const porId = new Map(resultados.map((c) => [c.id, c]));
    expect(porId.get('first_record').desbloqueada).toBe(true);
    expect(porId.get('streak_30').desbloqueada).toBe(false);
    expect(porId.get('streak_30').desbloqueadaEm).toBeNull();
  });

  it('mantem desbloqueada e preserva a data de quem ja tinha desbloqueado', async () => {
    const resultados = await verificarConquistas([], {}, [
      { id: 'first_record', unlockedAt: '2026-01-01T10:00:00.000Z' },
    ]);
    const conquista = resultados.find((c) => c.id === 'first_record');
    expect(conquista.desbloqueada).toBe(true);
    expect(conquista.desbloqueadaEm).toBe('2026-01-01T10:00:00.000Z');
  });

  it('devolve uma entrada por conquista cadastrada', async () => {
    const resultados = await verificarConquistas([]);
    expect(resultados).toHaveLength(CONQUISTAS.length);
  });
});
