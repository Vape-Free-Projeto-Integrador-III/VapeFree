import {
  mesDeData,
  mesAnterior,
  mesSeguinte,
  gradeDoMes,
  formatarDataCompleta,
  formatarDiaMes,
  formatarMesEAno,
  estadoDoDia,
  resumoDoMes,
  datasNoIntervalo,
  diasNoIntervalo,
  estaNoIntervalo,
} from '../../utils/calendario';

describe('mesDeData', () => {
  it('devolve ano e mes 0-11', () => {
    expect(mesDeData('2026-03-05')).toEqual({ ano: 2026, mes: 2 });
  });
});

describe('mesAnterior / mesSeguinte', () => {
  it('viram o ano nas pontas', () => {
    expect(mesAnterior({ ano: 2026, mes: 0 })).toEqual({ ano: 2025, mes: 11 });
    expect(mesSeguinte({ ano: 2026, mes: 11 })).toEqual({ ano: 2027, mes: 0 });
  });

  it('andam dentro do mesmo ano no meio', () => {
    expect(mesAnterior({ ano: 2026, mes: 5 })).toEqual({ ano: 2026, mes: 4 });
    expect(mesSeguinte({ ano: 2026, mes: 5 })).toEqual({ ano: 2026, mes: 6 });
  });
});

describe('gradeDoMes', () => {
  // Março de 2026 começa num domingo -> 6 casas vazias (semana começa segunda).
  it('preenche as casas vazias contando a semana a partir da segunda', () => {
    const grade = gradeDoMes(2026, 2);
    expect(grade.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grade[6]).toBe('2026-03-01');
    expect(grade).toHaveLength(6 + 31);
  });

  it('nao gera casa vazia quando o mes comeca numa segunda', () => {
    const grade = gradeDoMes(2026, 5); // junho/2026 comeca numa segunda
    expect(grade[0]).toBe('2026-06-01');
    expect(grade).toHaveLength(30);
  });

  it('respeita fevereiro de ano bissexto', () => {
    expect(gradeDoMes(2024, 1).filter(Boolean)).toHaveLength(29);
  });
});

describe('formatadores', () => {
  it('formatarDataCompleta', () => {
    expect(formatarDataCompleta('2026-03-05')).toBe('5 de março de 2026');
  });

  it('formatarDiaMes com zero a esquerda', () => {
    expect(formatarDiaMes('2026-03-05')).toBe('05/03');
  });

  it('formatarMesEAno com inicial maiuscula', () => {
    expect(formatarMesEAno({ ano: 2026, mes: 2 })).toBe('Março 2026');
  });
});

describe('estadoDoDia', () => {
  it('sem_registro quando o dia nao tem nada', () => {
    expect(estadoDoDia([])).toBe('sem_registro');
    expect(estadoDoDia(null)).toBe('sem_registro');
  });

  it('limpo quando nenhum registro tem used', () => {
    expect(estadoDoDia([{ used: false, puffs: 0 }])).toBe('limpo');
  });

  it('usou quando ha uso e nao ha meta pro dia', () => {
    expect(estadoDoDia([{ used: true, puffs: 10 }])).toBe('usou');
  });

  it('distingue usou_dentro de usou_acima pela meta do dia', () => {
    expect(estadoDoDia([{ used: true, puffs: 10 }], 20)).toBe('usou_dentro');
    expect(estadoDoDia([{ used: true, puffs: 30 }], 20)).toBe('usou_acima');
    expect(estadoDoDia([{ used: true, puffs: 20 }], 20)).toBe('usou_dentro'); // empate conta como dentro
  });
});

describe('resumoDoMes', () => {
  it('classifica cada dia do mes uma vez so', () => {
    const registros = [
      { date: '2026-03-01', used: false, puffs: 0 },
      { date: '2026-03-02', used: true, puffs: 5 },
      { date: '2026-03-02', used: false, puffs: 0 },
    ];
    const resumo = resumoDoMes(registros, 2026, 2);
    expect(resumo).toEqual({ diasLimpos: 1, diasComUso: 1, diasSemRegistro: 29 });
  });
});

describe('intervalos', () => {
  it('datasNoIntervalo e inclusivo nas duas pontas', () => {
    expect(datasNoIntervalo('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ]);
  });

  it('datasNoIntervalo auto-ordena quando as pontas vem trocadas', () => {
    expect(datasNoIntervalo('2026-03-03', '2026-03-01')).toEqual(
      datasNoIntervalo('2026-03-01', '2026-03-03')
    );
  });

  it('datasNoIntervalo devolve vazio sem uma das pontas', () => {
    expect(datasNoIntervalo('2026-03-01', null)).toEqual([]);
  });

  it('diasNoIntervalo conta as duas pontas', () => {
    expect(diasNoIntervalo('2026-03-01', '2026-03-01')).toBe(1);
    expect(diasNoIntervalo('2026-03-03', '2026-03-01')).toBe(3);
  });

  it('estaNoIntervalo inclui as bordas e exclui o resto', () => {
    expect(estaNoIntervalo('2026-03-01', '2026-03-01', '2026-03-03')).toBe(true);
    expect(estaNoIntervalo('2026-03-03', '2026-03-01', '2026-03-03')).toBe(true);
    expect(estaNoIntervalo('2026-03-04', '2026-03-01', '2026-03-03')).toBe(false);
    expect(estaNoIntervalo('2026-03-01', null, '2026-03-03')).toBe(false);
  });
});
