import {
    metaDeDinheiroValida,
    ritmoDiario,
    progressoDaMetaDeDinheiro,
} from '../../utils/metaDeDinheiro';

// Datas fixas: nenhum teste pode depender do dia atual.
const HOJE = '2024-03-14';

// 14 dias terminando em HOJE: '2024-03-01' até '2024-03-14'.
const ECONOMIA = {
    '2024-02-20': 100, // fora da janela do ritmo, mas dentro do acumulado
    '2024-03-10': 5,
    '2024-03-12': 7,
    '2024-03-14': 8,
};

describe('metaDeDinheiroValida', () => {
    it('aceita meta com valor positivo', () => {
        expect(metaDeDinheiroValida({ amount: 400 })).toBe(true);
    });

    it('recusa null, valor zero, negativo e não numérico', () => {
        expect(metaDeDinheiroValida(null)).toBe(false);
        expect(metaDeDinheiroValida({ amount: 0 })).toBe(false);
        expect(metaDeDinheiroValida({ amount: -10 })).toBe(false);
        expect(metaDeDinheiroValida({ amount: 'abc' })).toBe(false);
    });
});

describe('ritmoDiario', () => {
    it('divide pelos dias com entrada, não pelo tamanho da janela', () => {
        // 5 + 7 + 8 em 3 dias com entrada. O dia de fora da janela não conta.
        expect(ritmoDiario(ECONOMIA, HOJE)).toBeCloseTo(20 / 3);
    });

    it('devolve null quando nenhum dia da janela tem entrada', () => {
        expect(ritmoDiario({ '2024-02-20': 100 }, HOJE)).toBeNull();
        expect(ritmoDiario({}, HOJE)).toBeNull();
        expect(ritmoDiario(null, HOJE)).toBeNull();
    });

    it('conta dia com economia zero como dia registrado', () => {
        expect(ritmoDiario({ '2024-03-14': 0 }, HOJE)).toBe(0);
    });
});

describe('progressoDaMetaDeDinheiro', () => {
    it('devolve null com meta inválida', () => {
        expect(progressoDaMetaDeDinheiro(null, ECONOMIA, HOJE)).toBeNull();
        expect(progressoDaMetaDeDinheiro({ amount: 0 }, ECONOMIA, HOJE)).toBeNull();
    });

    it('acumula tudo o que já está no bolso, inclusive antes da janela do ritmo', () => {
        const progresso = progressoDaMetaDeDinheiro({ amount: 400 }, ECONOMIA, HOJE);
        expect(progresso.acumulado).toBe(120);
        expect(progresso.faltando).toBe(280);
        expect(progresso.percentual).toBe(30);
        expect(progresso.concluida).toBe(false);
    });

    it('estima os dias que faltam pelo ritmo da janela', () => {
        // Faltam 280 com ritmo de 20/3 (~6,67) por dia = 42 dias.
        const progresso = progressoDaMetaDeDinheiro({ amount: 400 }, ECONOMIA, HOJE);
        expect(progresso.diasEstimados).toBe(42);
        expect(progresso.dataEstimada).toBe('2024-04-25');
    });

    it('capa o percentual em 100 e zera a estimativa quando a meta foi alcançada', () => {
        const progresso = progressoDaMetaDeDinheiro({ amount: 50 }, ECONOMIA, HOJE);
        expect(progresso.concluida).toBe(true);
        expect(progresso.percentual).toBe(100);
        expect(progresso.faltando).toBe(0);
        expect(progresso.diasEstimados).toBe(0);
        expect(progresso.dataEstimada).toBeNull();
    });

    it('fica sem estimativa quando a janela do ritmo está vazia', () => {
        const progresso = progressoDaMetaDeDinheiro({ amount: 400 }, { '2024-02-20': 100 }, HOJE);
        expect(progresso.acumulado).toBe(100);
        expect(progresso.ritmoDiario).toBeNull();
        expect(progresso.diasEstimados).toBeNull();
        expect(progresso.dataEstimada).toBeNull();
    });

    it('fica sem estimativa quando o ritmo daria uma data absurda', () => {
        // 1 centavo por dia pra juntar 1000 daria mais de 270 anos.
        const progresso = progressoDaMetaDeDinheiro({ amount: 1000 }, { [HOJE]: 0.01 }, HOJE);
        expect(progresso.ritmoDiario).toBe(0.01);
        expect(progresso.diasEstimados).toBeNull();
        expect(progresso.dataEstimada).toBeNull();
    });

    it('devolve o rótulo da meta, e string vazia quando não há', () => {
        expect(
            progressoDaMetaDeDinheiro({ amount: 400, label: 'fone' }, ECONOMIA, HOJE).label
        ).toBe('fone');
        expect(progressoDaMetaDeDinheiro({ amount: 400 }, ECONOMIA, HOJE).label).toBe('');
    });
});
