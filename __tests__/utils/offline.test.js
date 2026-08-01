//
// Único arquivo de teste com mock: offline.js fala com AsyncStorage, NetInfo e
// firestore. Aqui os três são substituídos por versões controladas, o que
// permite escrever "simule offline" e "simule o firestore falhando" — cenários
// que não dá pra reproduzir à mão de forma confiável.
//
// offline.js guarda estado no próprio módulo (execucaoEmAndamento, o cache de
// conexão), então cada caso recarrega o módulo com jest.resetModules().

let mockArmazenamento = {};
let mockOnline = true;

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn((chave) => Promise.resolve(mockArmazenamento[chave] ?? null)),
    setItem: jest.fn((chave, valor) => {
        mockArmazenamento[chave] = valor;
        return Promise.resolve();
    }),
    removeItem: jest.fn((chave) => {
        delete mockArmazenamento[chave];
        return Promise.resolve();
    }),
    multiRemove: jest.fn((chaves) => {
        chaves.forEach((chave) => delete mockArmazenamento[chave]);
        return Promise.resolve();
    }),
}));

jest.mock('@react-native-community/netinfo', () => ({
    fetch: jest.fn(() =>
        Promise.resolve({ isConnected: mockOnline, isInternetReachable: mockOnline })
    ),
    addEventListener: jest.fn(() => () => {}),
}));

const mockSetDoc = jest.fn(() => Promise.resolve());
const mockDeleteDoc = jest.fn(() => Promise.resolve());

jest.mock('firebase/firestore', () => ({
    doc: jest.fn((...caminho) => ({ caminho: caminho.slice(1) })),
    setDoc: (...args) => mockSetDoc(...args),
    deleteDoc: (...args) => mockDeleteDoc(...args),
}));

jest.mock('../../services/firebase', () => ({ db: {} }));

const UID = 'uid1';
const CHAVE_DA_FILA = `@vapefree_queue_${UID}`;
const CHAVE_DAS_FALHAS = `@vapefree_failed_${UID}`;

const filaSalva = () => JSON.parse(mockArmazenamento[CHAVE_DA_FILA] || '[]');
const falhasSalvas = () => JSON.parse(mockArmazenamento[CHAVE_DAS_FALHAS] || '[]');
const semearFila = (mutacoes) => {
    mockArmazenamento[CHAVE_DA_FILA] = JSON.stringify(mutacoes);
};

let offline;

beforeEach(() => {
    mockArmazenamento = {};
    mockOnline = true;
    jest.clearAllMocks();
    jest.resetModules();
    offline = require('../../utils/offline');
});

describe('espelho', () => {
    it('escreverCache/lerCache fazem round-trip', async () => {
        await offline.escreverCache(UID, offline.ESPELHOS.REGISTROS, [{ id: 1 }]);
        expect(await offline.lerCache(UID, offline.ESPELHOS.REGISTROS)).toEqual([{ id: 1 }]);
    });

    it('lerCache devolve o padrao quando o espelho nunca foi preenchido', async () => {
        expect(await offline.lerCache(UID, offline.ESPELHOS.REGISTROS, [])).toEqual([]);
    });

    it('temEspelho distingue "vazio" de "nunca preenchido"', async () => {
        expect(await offline.temEspelho(UID, offline.ESPELHOS.ECONOMIA)).toBe(false);
        await offline.escreverCache(UID, offline.ESPELHOS.ECONOMIA, {});
        expect(await offline.temEspelho(UID, offline.ESPELHOS.ECONOMIA)).toBe(true);
    });

    it('sem uid nao escreve nada', async () => {
        expect(await offline.escreverCache(null, offline.ESPELHOS.REGISTROS, [1])).toBe(false);
        expect(mockArmazenamento).toEqual({});
    });
});

describe('enfileirar / compactar', () => {
    it('mutacao nova do mesmo doc substitui a anterior', async () => {
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 1 },
        });
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 2 },
        });

        const fila = filaSalva();
        expect(fila).toHaveLength(1);
        expect(fila[0].dados).toEqual({ puffs: 2 });
    });

    it('mutacao de outro doc nao e afetada', async () => {
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 1 },
        });
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '2',
            dados: { puffs: 9 },
        });
        expect(filaSalva()).toHaveLength(2);
    });

    it('delete substitui o set pendente do mesmo doc', async () => {
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 1 },
        });
        await offline.enfileirar(UID, { tipo: 'delete', colecao: 'records', docId: '1' });

        const fila = filaSalva();
        expect(fila).toHaveLength(1);
        expect(fila[0].tipo).toBe('delete');
    });

    it('merge_usuario tira do anterior so os campos repetidos', async () => {
        await offline.enfileirar(UID, {
            tipo: 'merge_usuario',
            dados: { xp: 10, economy: { a: 1 } },
        });
        await offline.enfileirar(UID, { tipo: 'merge_usuario', dados: { xp: 20 } });

        const fila = filaSalva();
        expect(fila).toHaveLength(2);
        expect(fila[0].dados).toEqual({ economy: { a: 1 } }); // xp saiu, economy ficou
        expect(fila[1].dados).toEqual({ xp: 20 });
    });

    it('merge_usuario que fica sem nenhum campo sai da fila', async () => {
        await offline.enfileirar(UID, { tipo: 'merge_usuario', dados: { xp: 10 } });
        await offline.enfileirar(UID, { tipo: 'merge_usuario', dados: { xp: 20 } });

        const fila = filaSalva();
        expect(fila).toHaveLength(1);
        expect(fila[0].dados).toEqual({ xp: 20 });
    });

    it('contarPendencias devolve o tamanho da fila', async () => {
        await offline.enfileirar(UID, { tipo: 'set', colecao: 'records', docId: '1', dados: {} });
        expect(await offline.contarPendencias(UID)).toBe(1);
    });
});

describe('sincronizar', () => {
    it('online: envia tudo e esvazia a fila', async () => {
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 1 },
        });
        await offline.enfileirar(UID, { tipo: 'delete', colecao: 'records', docId: '2' });

        const resultado = await offline.sincronizar(UID);

        expect(resultado).toEqual({ enviadas: 2, pendentes: 0, falhas: 0 });
        expect(mockSetDoc).toHaveBeenCalledTimes(1);
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
        expect(filaSalva()).toEqual([]);
    });

    it('offline: nao toca no firestore e mantem as pendencias', async () => {
        await offline.enfileirar(UID, { tipo: 'set', colecao: 'records', docId: '1', dados: {} });
        mockOnline = false;

        const resultado = await offline.sincronizar(UID);

        expect(resultado).toEqual({ enviadas: 0, pendentes: 1, falhas: 0 });
        expect(mockSetDoc).not.toHaveBeenCalled();
        expect(filaSalva()).toHaveLength(1);
    });

    it('fila vazia nao chama o firestore', async () => {
        expect(await offline.sincronizar(UID)).toEqual({ enviadas: 0, pendentes: 0, falhas: 0 });
        expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('sem uid devolve resultado zerado', async () => {
        expect(await offline.sincronizar(null)).toEqual({ enviadas: 0, pendentes: 0, falhas: 0 });
    });

    it('falha PARA na primeira mutacao: a ordem da fila importa', async () => {
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '1',
            dados: { puffs: 1 },
        });
        await offline.enfileirar(UID, {
            tipo: 'set',
            colecao: 'records',
            docId: '2',
            dados: { puffs: 2 },
        });
        mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

        const resultado = await offline.sincronizar(UID);

        expect(resultado.enviadas).toBe(0);
        expect(mockSetDoc).toHaveBeenCalledTimes(1); // nao tentou a segunda
        const fila = filaSalva();
        expect(fila).toHaveLength(2);
        expect(fila[0].tentativas).toBe(1); // so a que falhou incrementou
        expect(fila[1].tentativas).toBe(0);
        expect(falhasSalvas()).toHaveLength(0);
    });

    it('mutacao no limite de tentativas sai da fila e vira falha registrada', async () => {
        const silencio = jest.spyOn(console, 'log').mockImplementation(() => {});
        semearFila([
            { id: 'm1', tipo: 'set', colecao: 'records', docId: '1', dados: {}, tentativas: 4 },
            { id: 'm2', tipo: 'set', colecao: 'records', docId: '2', dados: {}, tentativas: 0 },
        ]);
        mockSetDoc.mockRejectedValueOnce(new Error('permission-denied'));

        const resultado = await offline.sincronizar(UID);

        expect(resultado.enviadas).toBe(0);
        expect(resultado.falhas).toBe(1);
        const fila = filaSalva();
        expect(fila).toHaveLength(1);
        expect(fila[0].id).toBe('m2'); // a impossivel saiu, o resto continua
        expect(falhasSalvas()[0]).toMatchObject({ id: 'm1', motivo: 'permission-denied' });
        silencio.mockRestore();
    });

    it('duas chamadas concorrentes compartilham a mesma drenagem', async () => {
        await offline.enfileirar(UID, { tipo: 'set', colecao: 'records', docId: '1', dados: {} });

        const [a, b] = await Promise.all([offline.sincronizar(UID), offline.sincronizar(UID)]);

        expect(a).toBe(b); // mesma promise, nao duas drenagens
        expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });
});

describe('comTempoLimite', () => {
    it('rejeita com tempo_limite quando a promise nunca resolve', async () => {
        const nuncaResolve = new Promise(() => {});
        await expect(offline.comTempoLimite(nuncaResolve, 10)).rejects.toThrow('tempo_limite');
    });

    it('deixa passar o valor quando resolve a tempo', async () => {
        await expect(offline.comTempoLimite(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
    });
});

describe('limparCacheEFila', () => {
    it('apaga espelhos, fila e falhas do uid', async () => {
        await offline.escreverCache(UID, offline.ESPELHOS.REGISTROS, [1]);
        await offline.enfileirar(UID, { tipo: 'set', colecao: 'records', docId: '1', dados: {} });

        await offline.limparCacheEFila(UID);

        expect(mockArmazenamento).toEqual({});
    });
});
