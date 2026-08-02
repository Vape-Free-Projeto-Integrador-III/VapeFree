import {
    horarioDeRiscoDeCrise,
    MIN_CRISES_PARA_HORARIO_DE_RISCO,
    diaDeRiscoDaSemana,
    MIN_REGISTROS_PARA_DIA_DE_RISCO,
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
        const sessoes = Array.from({ length: MIN_CRISES_PARA_HORARIO_DE_RISCO }, () =>
            sessao('19:00')
        );
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

// Março de 2026: 01 é domingo, 02/09/16 são segundas, 03/10 são terças.
function registro(date, puffs, used = true) {
    return { id: 1, date, used, puffs };
}

describe('diaDeRiscoDaSemana', () => {
    it('devolve null sem lista ou sem dia da semana repetido', () => {
        expect(diaDeRiscoDaSemana([])).toBeNull();
        expect(diaDeRiscoDaSemana(null)).toBeNull();
        expect(diaDeRiscoDaSemana([registro('2026-03-02', 100)])).toBeNull();
    });

    it('exige MIN_REGISTROS_PARA_DIA_DE_RISCO no mesmo dia da semana', () => {
        const segundas = ['2026-03-02', '2026-03-09'].slice(0, MIN_REGISTROS_PARA_DIA_DE_RISCO);
        expect(diaDeRiscoDaSemana(segundas.slice(0, -1).map((d) => registro(d, 100)))).toBeNull();
        expect(diaDeRiscoDaSemana(segundas.map((d) => registro(d, 100)))).toMatchObject({ dia: 1 });
    });

    it('escolhe o dia da semana de maior média, não de maior total', () => {
        const registros = [
            registro('2026-03-02', 20),
            registro('2026-03-09', 20),
            registro('2026-03-16', 20), // segundas: total 60, média 20
            registro('2026-03-03', 50),
            registro('2026-03-10', 50), // terças: total 100, média 50
        ];

        expect(diaDeRiscoDaSemana(registros)).toEqual({
            dia: 2,
            contagem: 2,
            media: 50,
            rotulo: 'às terças-feiras',
        });
    });

    it('conta dia registrado sem uso como zero na média', () => {
        const registros = [
            registro('2026-03-02', 100),
            registro('2026-03-09', 100, false), // puffs antigo ignorado
            registro('2026-03-03', 60),
            registro('2026-03-10', 60),
        ];

        // Segundas: (100 + 0) / 2 = 50, perde pras terças. Se o dia sem uso
        // não fosse contado, a média das segundas seria 100 e elas ganhariam.
        expect(diaDeRiscoDaSemana(registros)).toMatchObject({ dia: 2, media: 60 });
    });

    it('ignora dia da semana com média zero', () => {
        const registros = [registro('2026-03-02', 0, false), registro('2026-03-09', 0, false)];

        expect(diaDeRiscoDaSemana(registros)).toBeNull();
    });
});
