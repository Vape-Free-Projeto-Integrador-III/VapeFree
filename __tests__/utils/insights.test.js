import {
  horarioDeRiscoDeCrise,
  MIN_CRISES_PARA_HORARIO_DE_RISCO,
} from '../../utils/insights';

// Sessão de crise mínima pro cálculo de horário: só `time` importa.
function sessao(time) {
  return { id: 1, date: '2025-03-10', time, outcome: 'passou' };
}

describe('horarioDeRiscoDeCrise', () => {
  it('devolve null sem crises suficientes no mesmo período', () => {
    expect(horarioDeRiscoDeCrise([])).toBeNull();
    expect(horarioDeRiscoDeCrise(null)).toBeNull();
    expect(horarioDeRiscoDeCrise([sessao('19:00'), sessao('20:30')])).toBeNull();
  });

  it('exige MIN_CRISES_PARA_HORARIO_DE_RISCO no período mais frequente', () => {
    const sessoes = Array.from({ length: MIN_CRISES_PARA_HORARIO_DE_RISCO }, () => sessao('19:00'));
    expect(horarioDeRiscoDeCrise(sessoes.slice(0, -1))).toBeNull();
    expect(horarioDeRiscoDeCrise(sessoes)).toMatchObject({ periodo: 'noite' });
  });

  it('usa a mediana das horas do período mais frequente', () => {
    const sessoes = [sessao('18:10'), sessao('20:00'), sessao('23:40'), sessao('09:00')];

    expect(horarioDeRiscoDeCrise(sessoes)).toEqual({
      periodo: 'noite',
      rotulo: 'à noite',
      contagem: 3,
      hora: 20,
    });
  });

  it('no empate par prefere a hora mais cedo', () => {
    const sessoes = [sessao('12:00'), sessao('13:00'), sessao('16:00'), sessao('17:00')];

    expect(horarioDeRiscoDeCrise(sessoes).hora).toBe(13);
  });

  it('ignora sessão sem hora em vez de contar como madrugada', () => {
    const sessoes = [sessao(undefined), sessao(''), sessao('sem hora'), sessao('14:00')];

    expect(horarioDeRiscoDeCrise(sessoes)).toBeNull();
  });
});
