//
// O arquivo importado vem de fora do app (o usuário escolhe um JSON qualquer no
// celular), então o que interessa testar aqui é a desconfiança: normalizarBackup
// tem que recusar o que não é backup e jogar fora o que não dá pra salvar, em
// vez de deixar dado quebrado chegar em substituirTodosOsDados.
//
// Só a parte pura é testada — escolher arquivo depende do seletor do sistema, e
// a escrita em massa já está coberta em storage.test.js.

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
}));
jest.mock('firebase/firestore', () => ({}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('../../services/firebase', () => ({ auth: { currentUser: null }, db: {} }));

const { normalizarBackup } = require('../../utils/importacao');

const BACKUP = {
    exportadoEm: '2025-03-10T12:00:00.000Z',
    registros: [
        {
            id: 1,
            date: '2025-03-01',
            used: true,
            puffs: 40,
            triggers: ['Estresse'],
            note: 'dia ruim',
        },
        { id: 2, date: '2025-03-02', used: false, puffs: 12, triggers: ['Estresse'] },
    ],
    aparelho: { price: 50, totalPuffs: 5000, days: 10 },
    historicoDeAparelhos: [{ id: 9, price: 50, totalPuffs: 5000, days: 10, since: '2025-03-01' }],
    meta: { target: 20 },
    metaDeDinheiro: { amount: 300 },
    economia: { '2025-03-01': 4.5, '2025-03-02': 5 },
    conquistas: [{ id: 'primeiro_dia', unlockedAt: '2025-03-01T10:00:00.000Z' }],
    sessoesDeCrise: [{ id: 3, date: '2025-03-02' }],
    missoes: [{ id: 'registrar_dia:2025-03-02', completedAt: '2025-03-02T20:00:00.000Z' }],
    xp: { total: 120 },
    diasDeAbertura: ['2025-03-01', '2025-03-02'],
};

describe('normalizarBackup', () => {
    it('aceita o backup completo que a exportação gera', () => {
        const resultado = normalizarBackup(BACKUP);

        expect(resultado.ok).toBe(true);
        expect(resultado.dados.registros).toHaveLength(2);
        expect(resultado.dados.aparelho).toEqual(BACKUP.aparelho);
        expect(resultado.dados.historicoDeAparelhos).toHaveLength(1);
        expect(resultado.dados.meta).toEqual({ target: 20 });
        expect(resultado.dados.metaDeDinheiro).toEqual({ amount: 300 });
        expect(resultado.dados.economia).toEqual({ '2025-03-01': 4.5, '2025-03-02': 5 });
        expect(resultado.dados.conquistas).toHaveLength(1);
        expect(resultado.dados.sessoesDeCrise).toHaveLength(1);
        expect(resultado.dados.missoes).toHaveLength(1);
        expect(resultado.dados.xp).toEqual({ total: 120 });
        expect(resultado.dados.diasDeAbertura).toEqual(['2025-03-01', '2025-03-02']);
    });

    it('recusa o que não tem a lista de registros', () => {
        expect(normalizarBackup({ qualquer: 'coisa' })).toEqual({ ok: false, motivo: 'formato' });
        expect(normalizarBackup(null)).toEqual({ ok: false, motivo: 'formato' });
        expect(normalizarBackup([])).toEqual({ ok: false, motivo: 'formato' });
        expect(normalizarBackup('{}')).toEqual({ ok: false, motivo: 'formato' });
    });

    it('aplica as regras do registro: dia sem uso não leva puxada nem gatilho', () => {
        const { dados } = normalizarBackup(BACKUP);
        const semUso = dados.registros.find((registro) => registro.date === '2025-03-02');

        expect(semUso.puffs).toBe(0);
        expect(semUso.triggers).toEqual([]);
    });

    it('descarta registro sem id ou com data fora do formato', () => {
        const { dados } = normalizarBackup({
            registros: [
                { id: 1, date: '2025-03-01', used: true, puffs: 10 },
                { date: '2025-03-02', used: true, puffs: 10 },
                { id: 3, date: '01/03/2025', used: true, puffs: 10 },
                { id: 4, used: true, puffs: 10 },
                'lixo',
            ],
        });

        expect(dados.registros.map((registro) => registro.id)).toEqual([1]);
    });

    it('descarta entrada de economia com chave ou valor inválido', () => {
        const { dados } = normalizarBackup({
            registros: [],
            economia: { '2025-03-01': 4.5, ontem: 3, '2025-03-02': 'muito' },
        });

        expect(dados.economia).toEqual({ '2025-03-01': 4.5 });
    });

    it('preenche com vazio o que o backup antigo não tinha', () => {
        const { dados } = normalizarBackup({ registros: [] });

        expect(dados.historicoDeAparelhos).toEqual([]);
        expect(dados.diasDeAbertura).toEqual([]);
        expect(dados.economia).toEqual({});
        expect(dados.conquistas).toEqual([]);
        expect(dados.aparelho).toBeNull();
        expect(dados.meta).toBeNull();
        expect(dados.xp).toBeNull();
    });
});
