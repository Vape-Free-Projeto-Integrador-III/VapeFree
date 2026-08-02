//
// storage.js é a camada onde mais coisa pode dar errado em silêncio: cada
// função ramifica em convidado (AsyncStorage) vs conta (espelho + fila do
// offline.js), e o caminho da conta ainda se divide em online/offline.
//
// Aqui offline.js roda DE VERDADE — só AsyncStorage, NetInfo e o firestore são
// falsos. É de propósito: o que interessa testar é a coordenação entre espelho
// e fila, que é onde mora o bug, não cada arquivo isolado.
//
// O firestore falso guarda os documentos num objeto indexado por caminho
// ('users/uid1/records/123'), o que permite afirmar o que realmente subiu.

let mockArmazenamento = {};
let mockRemoto = {};
let mockOnline = true;
let mockDeslocamentoDoRelogio = 0;

const mockAuth = { currentUser: null };

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

// Firestore falso: `doc`/`collection` viram só um caminho em string.
jest.mock('firebase/firestore', () => {
    const caminhoDe = (_db, ...partes) => partes.join('/');
    const exigirRede = () => {
        if (!mockOnline) throw new Error('unavailable');
    };
    // O merge do Firestore é PROFUNDO em map: escrever {} num map não apaga as
    // chaves antigas, só deleteField() apaga. O mock precisa imitar isso, senão
    // some a diferença entre limpar de verdade e não limpar nada.
    const ehMapa = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const mesclar = (antigo, novo) => {
        const saida = { ...antigo };
        for (const [chave, valor] of Object.entries(novo)) {
            if (valor && valor.__apagarCampo) delete saida[chave];
            else if (ehMapa(valor) && ehMapa(saida[chave]))
                saida[chave] = mesclar(saida[chave], valor);
            else saida[chave] = valor;
        }
        return saida;
    };
    return {
        deleteField: () => ({ __apagarCampo: true }),
        doc: (db, ...partes) => ({ caminho: caminhoDe(db, ...partes) }),
        collection: (db, ...partes) => ({ caminho: caminhoDe(db, ...partes) }),
        getDoc: async (ref) => {
            exigirRede();
            const dados = mockRemoto[ref.caminho];
            return { exists: () => dados !== undefined, data: () => dados };
        },
        getDocs: async (ref) => {
            exigirRede();
            const prefixo = `${ref.caminho}/`;
            const docs = Object.entries(mockRemoto)
                .filter(([caminho]) => caminho.startsWith(prefixo))
                .map(([caminho, dados]) => ({
                    id: caminho.slice(prefixo.length),
                    data: () => dados,
                    ref: { caminho },
                }));
            return { docs };
        },
        setDoc: async (ref, dados, opcoes) => {
            exigirRede();
            const atual = mockRemoto[ref.caminho];
            if (opcoes?.mergeFields) {
                // mergeFields: cada campo listado é SUBSTITUÍDO inteiro, os
                // demais campos do doc ficam como estavam.
                const saida = { ...(atual || {}) };
                for (const campo of opcoes.mergeFields) saida[campo] = dados[campo];
                mockRemoto[ref.caminho] = saida;
                return;
            }
            mockRemoto[ref.caminho] = opcoes?.merge && atual ? mesclar(atual, dados) : dados;
        },
        deleteDoc: async (ref) => {
            exigirRede();
            delete mockRemoto[ref.caminho];
        },
        // Lote real do Firestore: no máximo 500 operações e commit atômico —
        // ou aplica tudo, ou nada. O mock imita os dois pra que estourar o
        // limite quebre o teste em vez de passar batido.
        writeBatch: () => {
            const operacoes = [];
            return {
                set: (ref, dados) => operacoes.push(() => (mockRemoto[ref.caminho] = dados)),
                delete: (ref) => operacoes.push(() => delete mockRemoto[ref.caminho]),
                commit: async () => {
                    if (operacoes.length > 500) throw new Error('batch acima de 500 operações');
                    exigirRede();
                    for (const aplicar of operacoes) aplicar();
                },
            };
        },
    };
});

jest.mock('../../services/firebase', () => ({ auth: mockAuth, db: {} }));

const UID = 'uid1';

const APARELHO = { price: 50, totalPuffs: 5000, days: 10 };
const SESSAO_DE_CRISE = {
    id: 1,
    date: '2026-03-01',
    time: '14:20',
    method: 'timer',
    durationSec: 300,
    completed: true,
    outcome: 'passou',
    note: null,
};

const chaveDoEspelho = (nome) => `@vapefree_cache_${UID}_${nome}`;
const filaSalva = () => JSON.parse(mockArmazenamento[`@vapefree_queue_${UID}`] || '[]');
const espelhoSalvo = (nome) => JSON.parse(mockArmazenamento[chaveDoEspelho(nome)] ?? 'null');
const registrosRemotos = () =>
    Object.entries(mockRemoto)
        .filter(([caminho]) => caminho.startsWith(`users/${UID}/records/`))
        .map(([, dados]) => dados);

// O cache de conexão do offline.js vale 30s; sem avançar o relógio, um teste
// que começa offline continuaria "offline" depois de voltar a rede.
const avancarRelogio = (ms) => {
    mockDeslocamentoDoRelogio += ms;
};

const entrarNaConta = () => {
    mockAuth.currentUser = { uid: UID };
};

// escreverNaConta dispara sincronizar() SEM await, de propósito (a tela não
// pode esperar a rede). Isso deixa uma drenagem solta correndo junto com o
// teste: se o teste religa a rede no meio dela, o resultado vira sorteio.
//
// Então o teste sempre encerra a drenagem solta ANTES de mexer em mockOnline.
// sincronizar() devolve a promise em andamento quando existe uma, então
// aguardá-la é justamente o ponto em que não há mais nada voando.
const aguardarDrenagemSolta = () => offline.sincronizar(UID);

// Esvazia a fila pra valer: encerra a drenagem solta e faz uma nova por cima.
const drenarTudo = async () => {
    await aguardarDrenagemSolta();
    await offline.sincronizar(UID);
};

// Religa a rede e drena a fila de forma determinística.
const religarRedeEDrenar = async () => {
    await aguardarDrenagemSolta();
    mockOnline = true;
    avancarRelogio(31000); // vence o cache de conexão de 30s do offline.js
    await offline.sincronizar(UID);
};

let storage;
let offline;
let datas;

const relogioReal = Date.now;

beforeEach(() => {
    mockArmazenamento = {};
    mockRemoto = {};
    mockOnline = true;
    mockDeslocamentoDoRelogio = 0;
    mockAuth.currentUser = null;
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockImplementation(() => relogioReal() + mockDeslocamentoDoRelogio);
    jest.resetModules();
    storage = require('../../utils/storage');
    offline = require('../../utils/offline');
    datas = require('../../utils/datas');
});

afterEach(() => {
    jest.restoreAllMocks();
});

// dataEhRegistravel é relativa ao dia atual por natureza, então estes testes
// derivam a data de hoje em vez de hardcodar — o comportamento afirmado
// continua determinístico.
const hoje = () => datas.dataDeHoje();
const registroDeHoje = (extras = {}) => ({
    id: 1001,
    date: hoje(),
    used: true,
    puffs: 100,
    triggers: [],
    // normalizarRegistro sempre grava a anotação livre, null quando não tem.
    note: null,
    ...extras,
});

describe('modo convidado (sem uid)', () => {
    it('salva e lê registro no AsyncStorage, sem tocar no firestore', async () => {
        const resultado = await storage.salvarRegistro(registroDeHoje());

        expect(resultado).toEqual({ ok: true });
        expect(await storage.obterRegistros()).toEqual([registroDeHoje()]);
        expect(mockRemoto).toEqual({});
        expect(filaSalva()).toEqual([]);
    });

    it('normaliza o registro antes de salvar: sem uso, sem puxadas e sem gatilhos', async () => {
        await storage.salvarRegistro(
            registroDeHoje({ used: false, puffs: 9, triggers: ['stress'] })
        );

        const [salvo] = await storage.obterRegistros();
        expect(salvo.puffs).toBe(0);
        expect(salvo.triggers).toEqual([]);
    });

    it('mantém um registro por dia: o novo substitui o do mesmo dia', async () => {
        await storage.salvarRegistro(registroDeHoje({ id: 1, puffs: 10 }));
        await storage.salvarRegistro(registroDeHoje({ id: 2, puffs: 20 }));

        const registros = await storage.obterRegistros();
        expect(registros).toHaveLength(1);
        expect(registros[0]).toMatchObject({ id: 2, puffs: 20 });
    });

    it('recusa registro fora da janela de dias permitida', async () => {
        const resultado = await storage.salvarRegistro(registroDeHoje({ date: '2020-01-01' }));

        expect(resultado).toEqual({ ok: false, motivo: 'data_invalida' });
        expect(await storage.obterRegistros()).toEqual([]);
    });

    it('atualizarRegistro de id inexistente devolve nao_encontrado', async () => {
        expect(await storage.atualizarRegistro(registroDeHoje({ id: 999 }))).toEqual({
            ok: false,
            motivo: 'nao_encontrado',
        });
    });

    it('excluirRegistro remove só o id pedido', async () => {
        await storage.salvarRegistro(registroDeHoje({ id: 1 }));
        await storage.salvarRegistro(
            registroDeHoje({ id: 2, date: datas.deslocarData(hoje(), -1) })
        );

        expect(await storage.excluirRegistro(1)).toEqual({ ok: true });

        const registros = await storage.obterRegistros();
        expect(registros).toHaveLength(1);
        expect(registros[0].id).toBe(2);
    });

    it('sessão de crise edita desfecho e nota, e apagar tira só o id pedido', async () => {
        await storage.salvarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 1 });
        await storage.salvarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 2 });

        expect(
            await storage.atualizarSessaoDeCrise({
                ...SESSAO_DE_CRISE,
                id: 1,
                outcome: 'usei',
                note: 'oi',
            })
        ).toEqual({ ok: true });
        expect(await storage.obterSessoesDeCrise()).toMatchObject([
            { id: 1, outcome: 'usei', note: 'oi' },
            { id: 2, outcome: 'passou' },
        ]);

        expect(await storage.excluirSessaoDeCrise(1)).toEqual({ ok: true });
        expect((await storage.obterSessoesDeCrise()).map((s) => s.id)).toEqual([2]);
    });

    it('atualizarSessaoDeCrise de id inexistente devolve nao_encontrado', async () => {
        expect(await storage.atualizarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 999 })).toEqual({
            ok: false,
            motivo: 'nao_encontrado',
        });
    });

    it('aparelho e meta vão pro AsyncStorage; salvarMeta(null) remove', async () => {
        expect(await storage.salvarAparelho(APARELHO)).toEqual({ ok: true });
        expect(await storage.obterAparelho()).toEqual(APARELHO);

        await storage.salvarMeta({ baseline: 100, target: 10 });
        expect(await storage.obterMeta()).toEqual({ baseline: 100, target: 10 });

        await storage.salvarMeta(null);
        expect(await storage.obterMeta()).toBeNull();
    });

    it('meta de dinheiro vai pro AsyncStorage; salvarMetaDeDinheiro(null) remove', async () => {
        const metaDeDinheiro = {
            amount: 400,
            label: 'fone novo',
            createdAt: '2024-03-14T12:00:00Z',
        };

        expect(await storage.salvarMetaDeDinheiro(metaDeDinheiro)).toEqual({ ok: true });
        expect(await storage.obterMetaDeDinheiro()).toEqual(metaDeDinheiro);

        await storage.salvarMetaDeDinheiro(null);
        expect(await storage.obterMetaDeDinheiro()).toBeNull();
    });

    it('remover a meta de redução não mexe na meta de dinheiro', async () => {
        await storage.salvarMeta({ baseline: 100, target: 10 });
        await storage.salvarMetaDeDinheiro({ amount: 400 });

        await storage.salvarMeta(null);

        expect(await storage.obterMeta()).toBeNull();
        expect(await storage.obterMetaDeDinheiro()).toEqual({ amount: 400 });
    });

    it('limparDadosLocaisDoConvidado preserva onboarding e preferência de notificação', async () => {
        await storage.salvarRegistro(registroDeHoje());
        await storage.concluirOnboarding();
        await storage.salvarPreferenciasDeNotificacao({ ativas: false, hora: 20 });

        await storage.limparDadosLocaisDoConvidado();

        expect(await storage.obterRegistros()).toEqual([]);
        expect(await storage.onboardingFoiConcluido()).toBe(true);
        expect(await storage.obterPreferenciasDeNotificacao()).toMatchObject({
            ativas: false,
            hora: 20,
        });
    });

    it('temDadosLocaisDoConvidado só é true quando existe dado de progresso', async () => {
        expect(await storage.temDadosLocaisDoConvidado()).toBe(false);
        await storage.salvarRegistro(registroDeHoje());
        expect(await storage.temDadosLocaisDoConvidado()).toBe(true);
    });
});

describe('modo conta — escrita', () => {
    beforeEach(entrarNaConta);

    it('escreve no espelho e enfileira, e a leitura seguinte já enxerga o dado', async () => {
        mockOnline = false;

        const resultado = await storage.salvarRegistro(registroDeHoje());

        expect(resultado).toEqual({ ok: true });
        expect(espelhoSalvo('records')).toEqual([registroDeHoje()]);
        expect(filaSalva()).toHaveLength(1);
        expect(await storage.obterRegistros()).toEqual([registroDeHoje()]);
        expect(mockRemoto).toEqual({});
    });

    it('o que foi salvo offline sobe quando a rede volta', async () => {
        mockOnline = false;
        await storage.salvarRegistro(registroDeHoje());

        await religarRedeEDrenar();

        expect(registrosRemotos()).toEqual([registroDeHoje()]);
        expect(filaSalva()).toEqual([]);
    });

    it('um registro por dia: o antigo sai do espelho E ganha delete próprio na fila', async () => {
        mockOnline = false;
        await storage.salvarRegistro(registroDeHoje({ id: 1, puffs: 10 }));
        await storage.salvarRegistro(registroDeHoje({ id: 2, puffs: 20 }));

        const espelho = espelhoSalvo('records');
        expect(espelho).toHaveLength(1);
        expect(espelho[0].id).toBe(2);

        // Sem o delete o doc velho (outro docId) voltaria na próxima leitura online.
        const fila = filaSalva();
        expect(fila.some((m) => m.tipo === 'delete' && m.docId === '1')).toBe(true);
        expect(fila.some((m) => m.tipo === 'set' && m.docId === '2')).toBe(true);
    });

    it('o registro antigo do dia não ressuscita depois de sincronizar', async () => {
        mockOnline = false;
        await storage.salvarRegistro(registroDeHoje({ id: 1, puffs: 10 }));
        await storage.salvarRegistro(registroDeHoje({ id: 2, puffs: 20 }));

        await religarRedeEDrenar();

        expect(registrosRemotos()).toHaveLength(1);
        expect(registrosRemotos()[0].id).toBe(2);
    });

    it('excluirRegistro tira do espelho e enfileira o delete', async () => {
        mockOnline = false;
        await storage.salvarRegistro(registroDeHoje({ id: 1 }));

        expect(await storage.excluirRegistro(1)).toEqual({ ok: true });

        expect(espelhoSalvo('records')).toEqual([]);
        expect(filaSalva().at(-1)).toMatchObject({ tipo: 'delete', docId: '1' });
    });

    it('editar e apagar sessão de crise mexem no espelho e sobem quando a rede volta', async () => {
        mockOnline = false;
        await storage.salvarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 1 });
        await storage.salvarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 2 });

        await storage.atualizarSessaoDeCrise({ ...SESSAO_DE_CRISE, id: 1, outcome: 'usei' });
        expect(espelhoSalvo('crisisSessions')).toMatchObject([
            { id: 2 },
            { id: 1, outcome: 'usei' },
        ]);

        expect(await storage.excluirSessaoDeCrise(2)).toEqual({ ok: true });
        expect(espelhoSalvo('crisisSessions').map((s) => s.id)).toEqual([1]);
        expect(filaSalva().at(-1)).toMatchObject({
            tipo: 'delete',
            colecao: 'crisisSessions',
            docId: '2',
        });

        await religarRedeEDrenar();

        expect(mockRemoto[`users/${UID}/crisisSessions/2`]).toBeUndefined();
        expect(mockRemoto[`users/${UID}/crisisSessions/1`]).toMatchObject({ outcome: 'usei' });
    });

    it('aparelho vai como merge no doc do usuário', async () => {
        expect(await storage.salvarAparelho(APARELHO)).toEqual({ ok: true });
        await drenarTudo();

        expect(mockRemoto[`users/${UID}`]).toEqual({ device: APARELHO });
    });

    it('a data de registro inválida é recusada antes de tocar no espelho', async () => {
        const resultado = await storage.salvarRegistro(registroDeHoje({ date: '2020-01-01' }));

        expect(resultado).toEqual({ ok: false, motivo: 'data_invalida' });
        expect(filaSalva()).toEqual([]);
        expect(mockArmazenamento[chaveDoEspelho('records')]).toBeUndefined();
    });
});

describe('modo conta — leitura', () => {
    beforeEach(entrarNaConta);

    it('lê do servidor quando não há nada pendente, e aquece o espelho', async () => {
        mockRemoto[`users/${UID}/records/7`] = { id: 7, date: '2026-03-01', used: false, puffs: 0 };

        const registros = await storage.obterRegistros();

        expect(registros).toEqual([{ id: 7, date: '2026-03-01', used: false, puffs: 0 }]);
        expect(espelhoSalvo('records')).toEqual(registros);
    });

    it('com fila pendente serve o espelho: o remoto antigo não sobrescreve o que acabou de ser escrito', async () => {
        // Estado remoto desatualizado de propósito.
        mockRemoto[`users/${UID}/records/7`] = {
            id: 7,
            date: '2026-03-01',
            used: true,
            puffs: 999,
        };

        // Servidor no ar e legível, mas a subida falha — a fila fica pendente. É o
        // caso que separa "serve o espelho porque tem pendência" de "serve o
        // espelho porque não tem rede".
        const firestore = require('firebase/firestore');
        jest.spyOn(firestore, 'setDoc').mockRejectedValue(new Error('unavailable'));

        await storage.salvarRegistro(registroDeHoje({ id: 1, puffs: 5 }));
        await aguardarDrenagemSolta();

        const registros = await storage.obterRegistros();

        expect(registros).toHaveLength(1);
        expect(registros[0].id).toBe(1);
    });

    it('cai no espelho quando o servidor falha', async () => {
        await storage.salvarAparelho(APARELHO);
        await drenarTudo();

        mockOnline = false;
        avancarRelogio(31000);

        expect(await storage.obterAparelho()).toEqual(APARELHO);
    });

    it('reconcilia dois documentos do mesmo dia: fica o de id maior e o outro é apagado', async () => {
        // Como a conta chega nesse estado: registro antigo do dia só no
        // servidor + escrita offline com espelho frio (o delete do antigo não
        // tinha como entrar na fila).
        mockRemoto[`users/${UID}/records/100`] = {
            id: 100,
            date: '2026-03-01',
            used: true,
            puffs: 40,
        };
        mockRemoto[`users/${UID}/records/200`] = {
            id: 200,
            date: '2026-03-01',
            used: true,
            puffs: 10,
        };

        const registros = await storage.obterRegistros();

        expect(registros).toEqual([{ id: 200, date: '2026-03-01', used: true, puffs: 10 }]);
        expect(espelhoSalvo('records')).toEqual(registros);

        await drenarTudo();
        expect(registrosRemotos()).toEqual(registros);
    });

    it('escrita offline com espelho frio não deixa registro duplicado depois da volta da rede', async () => {
        mockRemoto[`users/${UID}/records/100`] = { id: 100, date: hoje(), used: true, puffs: 40 };

        mockOnline = false;
        await storage.salvarRegistro(registroDeHoje({ id: 200, puffs: 10 }));

        await religarRedeEDrenar();
        const registros = await storage.obterRegistros();
        await drenarTudo();

        expect(registros).toHaveLength(1);
        expect(registros[0].id).toBe(200);
        expect(registrosRemotos()).toHaveLength(1);
    });

    it('devolve o padrão quando não há espelho nem servidor', async () => {
        mockOnline = false;

        expect(await storage.obterRegistros()).toEqual([]);
        expect(await storage.obterAparelho()).toBeNull();
        expect(await storage.obterEconomia()).toEqual({});
    });
});

describe('validade do espelho (TTL de leitura)', () => {
    beforeEach(entrarNaConta);

    // Escrever direto no remoto simula outro aparelho: se a leitura enxergar o
    // dado novo, ela foi ao servidor; se não, foi servida pelo espelho.
    const registroSoNoRemoto = (id, date) => {
        mockRemoto[`users/${UID}/records/${id}`] = { id, date, used: false, puffs: 0 };
    };

    it('segunda leitura dentro da validade serve o espelho, sem ir no servidor', async () => {
        registroSoNoRemoto(7, '2026-03-01');
        expect(await storage.obterRegistros()).toHaveLength(1);

        registroSoNoRemoto(8, '2026-03-02');

        expect(await storage.obterRegistros()).toHaveLength(1);
    });

    it('vencida a validade, volta a ler do servidor', async () => {
        registroSoNoRemoto(7, '2026-03-01');
        await storage.obterRegistros();
        registroSoNoRemoto(8, '2026-03-02');

        avancarRelogio(31000);

        expect(await storage.obterRegistros()).toHaveLength(2);
    });

    it('forcarLeituraRemota ignora a validade', async () => {
        registroSoNoRemoto(7, '2026-03-01');
        await storage.obterRegistros();
        registroSoNoRemoto(8, '2026-03-02');

        storage.forcarLeituraRemota();

        expect(await storage.obterRegistros()).toHaveLength(2);
    });

    it('escrita local aparece na leitura seguinte mesmo dentro da validade', async () => {
        registroSoNoRemoto(7, '2026-03-01');
        await storage.obterRegistros();

        await storage.salvarRegistro(registroDeHoje({ id: 9, puffs: 3 }));
        const registros = await storage.obterRegistros();

        expect(registros.map((r) => r.id).sort()).toEqual([7, 9]);
    });
});

describe('valores derivados (podeEscreverDerivado)', () => {
    beforeEach(entrarNaConta);

    it('recusa gravar economia com espelho frio e sem rede', async () => {
        mockOnline = false;

        // Sem essa trava, uma economia calculada em cima de histórico vazio
        // apagaria a economia real que está na conta.
        const resultado = await storage.definirEconomia({ '2026-03-01': 10 });

        expect(resultado).toEqual({ ok: false, motivo: 'rede' });
        expect(mockArmazenamento[chaveDoEspelho('economy')]).toBeUndefined();
    });

    it('grava economia offline quando o espelho de registros já está quente', async () => {
        await storage.obterRegistros(); // aquece o espelho de origem, online
        mockOnline = false;
        avancarRelogio(31000);

        expect(await storage.definirEconomia({ '2026-03-01': 10 })).toEqual({ ok: true });
        expect(espelhoSalvo('economy')).toEqual({ '2026-03-01': 10 });
    });

    it('grava economia online mesmo com espelho frio', async () => {
        expect(await storage.definirEconomia({ '2026-03-01': 10 })).toEqual({ ok: true });
    });
});

describe('recalcularEconomia', () => {
    it('precifica só as puxadas não dadas, dia a dia', async () => {
        // metaDiaria = 500/dia, custo = R$ 0,01 por puxada.
        const registros = [
            { date: '2026-03-01', used: true, puffs: 100 }, // poupou 400 -> R$ 4,00
            { date: '2026-03-02', used: false, puffs: 0 }, // poupou 500 -> R$ 5,00
        ];

        const mapa = await storage.recalcularEconomia(registros, APARELHO, null);

        expect(mapa).toEqual({ '2026-03-01': 4, '2026-03-02': 5 });
    });

    it('devolve mapa vazio sem aparelho (não dá pra precificar)', async () => {
        expect(
            await storage.recalcularEconomia([{ date: '2026-03-01', used: true, puffs: 1 }], null)
        ).toEqual({});
    });

    it('não gera economia negativa em dia que passou do limite', async () => {
        const mapa = await storage.recalcularEconomia(
            [{ date: '2026-03-01', used: true, puffs: 900 }],
            APARELHO,
            null
        );

        expect(mapa['2026-03-01']).toBe(0);
    });
});

describe('migrarDadosDoConvidadoParaConta', () => {
    it('exige rede: offline não migra e mantém os dados locais intactos', async () => {
        await storage.salvarRegistro(registroDeHoje());
        entrarNaConta();
        mockOnline = false;

        expect(await storage.migrarDadosDoConvidadoParaConta()).toBe(false);
        expect(mockRemoto).toEqual({});

        mockAuth.currentUser = null;
        expect(await storage.obterRegistros()).toHaveLength(1);
    });

    it('sobe tudo, aquece o espelho e só então limpa o local', async () => {
        await storage.salvarRegistro(registroDeHoje());
        await storage.salvarAparelho(APARELHO);
        entrarNaConta();

        expect(await storage.migrarDadosDoConvidadoParaConta()).toBe(true);

        expect(registrosRemotos()).toHaveLength(1);
        expect(mockRemoto[`users/${UID}`]).toMatchObject({ device: APARELHO });
        expect(espelhoSalvo('records')).toHaveLength(1);
        expect(espelhoSalvo('device')).toEqual(APARELHO);

        mockAuth.currentUser = null;
        expect(await storage.obterRegistros()).toEqual([]);
    });

    it('falha no meio da subida não apaga os dados locais', async () => {
        const silencio = jest.spyOn(console, 'log').mockImplementation(() => {});
        await storage.salvarRegistro(registroDeHoje());
        entrarNaConta();

        const firestore = require('firebase/firestore');
        jest.spyOn(firestore, 'setDoc').mockRejectedValueOnce(new Error('permission-denied'));

        expect(await storage.migrarDadosDoConvidadoParaConta()).toBe(false);

        mockAuth.currentUser = null;
        expect(await storage.obterRegistros()).toHaveLength(1);
        silencio.mockRestore();
    });

    it('escreve o novo antes de apagar o velho: falhar na limpeza não perde dado', async () => {
        const silencio = jest.spyOn(console, 'log').mockImplementation(() => {});
        await storage.salvarRegistro(registroDeHoje());
        entrarNaConta();
        // Lixo de uma migração anterior: precisa sair, mas só DEPOIS do novo subir.
        mockRemoto[`users/${UID}/records/999`] = { id: 999, date: '2026-01-01' };

        const firestore = require('firebase/firestore');
        const original = firestore.writeBatch;
        let commits = 0;
        jest.spyOn(firestore, 'writeBatch').mockImplementation((db) => {
            const lote = original(db);
            return {
                ...lote,
                commit: async () => {
                    commits += 1;
                    // 1º lote de 'records' escreve o novo, 2º apaga o velho.
                    if (commits === 2) throw new Error('unavailable');
                    return lote.commit();
                },
            };
        });

        expect(await storage.migrarDadosDoConvidadoParaConta()).toBe(false);

        // O registro novo já está no servidor mesmo com a limpeza falhando.
        expect(mockRemoto[`users/${UID}/records/1001`]).toMatchObject({ id: 1001 });
        // E o local continua intacto pra tentar de novo.
        mockAuth.currentUser = null;
        expect(await storage.obterRegistros()).toHaveLength(1);
        silencio.mockRestore();
    });

    it('quebra a subida em lotes de no máximo 500 operações', async () => {
        const registros = Array.from({ length: 1200 }, (_, i) => ({
            id: 2000 + i,
            date: '2026-03-01',
            used: true,
            puffs: 10,
            triggers: [],
        }));
        mockArmazenamento['@vapefree_records'] = JSON.stringify(registros);
        entrarNaConta();

        // O mock de writeBatch estoura se um commit passar de 500 operações.
        expect(await storage.migrarDadosDoConvidadoParaConta()).toBe(true);
        expect(registrosRemotos()).toHaveLength(1200);
    });

    it('rede que cai no meio (promise pendurada do SDK) falha por tempo limite', async () => {
        const silencio = jest.spyOn(console, 'log').mockImplementation(() => {});
        await storage.salvarRegistro(registroDeHoje());
        entrarNaConta();

        const firestore = require('firebase/firestore');
        // Offline o SDK do Firestore não rejeita: a promise fica pendurada.
        jest.spyOn(firestore, 'setDoc').mockReturnValueOnce(new Promise(() => {}));

        jest.useFakeTimers();
        const migracao = storage.migrarDadosDoConvidadoParaConta();
        await jest.advanceTimersByTimeAsync(9000);
        expect(await migracao).toBe(false);
        jest.useRealTimers();

        mockAuth.currentUser = null;
        expect(await storage.obterRegistros()).toHaveLength(1);
        silencio.mockRestore();
    });
});

describe('apagarTodosOsDados', () => {
    it('convidado: limpa o local', async () => {
        await storage.salvarRegistro(registroDeHoje());

        expect(await storage.apagarTodosOsDados()).toEqual({ ok: true });
        expect(await storage.obterRegistros()).toEqual([]);
    });

    it('conta offline: recusa em vez de apagar pela metade', async () => {
        entrarNaConta();
        mockOnline = false;

        expect(await storage.apagarTodosOsDados()).toEqual({ ok: false, motivo: 'rede' });
    });

    it('conta online: apaga o remoto e deixa o espelho quente e vazio', async () => {
        entrarNaConta();
        await storage.salvarRegistro(registroDeHoje());
        await storage.salvarAparelho(APARELHO);
        await drenarTudo();

        expect(await storage.apagarTodosOsDados()).toEqual({ ok: true });

        expect(registrosRemotos()).toEqual([]);
        expect(mockRemoto[`users/${UID}`]).toMatchObject({ device: null });
        expect(espelhoSalvo('records')).toEqual([]);
        expect(espelhoSalvo('device')).toBeNull();
    });

    it('conta online: apaga a economia no remoto, não só no espelho', async () => {
        entrarNaConta();
        await storage.salvarRegistro(registroDeHoje());
        await storage.salvarAparelho(APARELHO);
        await drenarTudo();
        expect(await storage.definirEconomia({ '2026-03-01': 12.4 })).toEqual({ ok: true });
        await drenarTudo();

        expect(await storage.apagarTodosOsDados()).toEqual({ ok: true });

        // Se o campo sobrevivesse no servidor, a economia inteira voltaria na
        // próxima leitura online em outro aparelho.
        expect(mockRemoto[`users/${UID}`].economy).toBeUndefined();
        expect(espelhoSalvo('economy')).toEqual({});
    });
});

describe('definirEconomia (conta)', () => {
    it('mapa novo sem um dia apaga esse dia no remoto, não deixa o valor velho', async () => {
        entrarNaConta();
        await storage.salvarAparelho(APARELHO);
        await storage.salvarRegistro(registroDeHoje());
        await drenarTudo();

        await storage.definirEconomia({ '2026-03-01': 12.4, '2026-03-02': 8 });
        await drenarTudo();
        // Recálculo depois de excluir o registro do dia 01: o mapa novo não tem
        // mais essa chave. Com merge profundo ela sobreviveria com 12.4.
        await storage.definirEconomia({ '2026-03-02': 8 });
        await drenarTudo();

        expect(mockRemoto[`users/${UID}`].economy).toEqual({ '2026-03-02': 8 });
        // Os outros campos do doc do usuário continuam intactos.
        expect(mockRemoto[`users/${UID}`].device).toEqual(APARELHO);
    });
});

describe('sincronizarGamificacao (só recalcula quando precisa)', () => {
    // require() na hora da chamada de propósito: o jest.resetModules() do
    // beforeEach troca a instância do mock, e uma referência presa no topo do
    // describe contaria as chamadas de outro módulo (sempre zero).
    const escritasDeXp = () =>
        require('@react-native-async-storage/async-storage').setItem.mock.calls.filter(
            ([chave]) => chave === '@vapefree_xp'
        ).length;

    it('segunda chamada seguida não recalcula nem devolve recompensa de novo', async () => {
        await storage.salvarRegistro(registroDeHoje({ used: false, puffs: 0 }));

        const primeira = await storage.sincronizarGamificacao();
        expect(primeira.recompensas.conquistas.length).toBeGreaterThan(0);
        const xpDepoisDaPrimeira = escritasDeXp();

        const segunda = await storage.sincronizarGamificacao();

        expect(escritasDeXp()).toBe(xpDepoisDaPrimeira);
        expect(segunda.recompensas).toEqual({ conquistas: [], missoes: [], ganho: 0 });
        expect(segunda.resumo).toEqual(primeira.resumo);
        expect(segunda.missoesConcluidas).toEqual(primeira.missoesConcluidas);
    });

    it('escrita entre as duas chamadas volta a sujar e recalcula', async () => {
        await storage.salvarRegistro(registroDeHoje({ used: false, puffs: 0 }));
        await storage.sincronizarGamificacao();
        const xpAntes = escritasDeXp();

        await storage.salvarSessaoDeCrise(SESSAO_DE_CRISE);
        await storage.sincronizarGamificacao();

        expect(escritasDeXp()).toBeGreaterThan(xpAntes);
    });

    it('virada do dia recalcula mesmo sem escrita', async () => {
        await storage.salvarRegistro(registroDeHoje({ used: false, puffs: 0 }));
        await storage.sincronizarGamificacao();
        const xpAntes = escritasDeXp();

        // O dia de calendário sai de `new Date()` (utils/datas.js), que o spy de
        // Date.now não alcança — então quem vira o dia aqui é o próprio Date.
        const dataReal = global.Date;
        const umDia = 24 * 60 * 60 * 1000;
        global.Date = class extends dataReal {
            constructor(...args) {
                super(...(args.length ? args : [relogioReal() + umDia]));
            }
        };
        global.Date.now = dataReal.now;

        try {
            await storage.sincronizarGamificacao();
        } finally {
            global.Date = dataReal;
        }

        expect(escritasDeXp()).toBeGreaterThan(xpAntes);
    });

    it('login (troca de uid) recalcula mesmo sem escrita', async () => {
        await storage.salvarRegistro(registroDeHoje({ used: false, puffs: 0 }));
        await storage.sincronizarGamificacao();
        const xpAntes = escritasDeXp();

        entrarNaConta();
        await storage.sincronizarGamificacao();
        await drenarTudo();

        // Na conta o XP vai pro espelho, não pra chave de convidado: o que prova
        // o recálculo é o snapshot novo no espelho do uid.
        expect(escritasDeXp()).toBe(xpAntes);
        expect(espelhoSalvo('xp')).not.toBeNull();
    });
});

describe('consolidação das missões de período fechado', () => {
    const HOJE = '2026-03-10';
    const missao = (id, periodKey, xp, period = 'daily') => ({
        id: `${id}_${periodKey}`,
        missionId: id,
        period,
        periodKey,
        xp,
        completedAt: `${periodKey}T10:00:00.000Z`,
    });
    const resumoDe = (lista) => lista.find((entrada) => entrada.id === '_resumo');
    const semanaDeHoje = () => datas.inicioDaSemana(HOJE);

    it('convidado: troca as fechadas por um resumo e mantém as do período atual', async () => {
        await storage.salvarMissao(missao('daily_no_vape', '2026-03-01', 30));
        await storage.salvarMissao(missao('weekly_streak_3', '2026-02-23', 40, 'weekly'));
        await storage.salvarMissao(missao('daily_no_vape', HOJE, 30));
        await storage.salvarMissao(missao('weekly_streak_3', semanaDeHoje(), 40, 'weekly'));

        const consolidada = await storage.consolidarMissoesFechadas(HOJE);

        expect(consolidada).toHaveLength(3);
        expect(resumoDe(consolidada)).toMatchObject({
            summary: true,
            xp: 70,
            count: 2,
            until: '2026-03-01',
        });
        expect(
            consolidada
                .filter((e) => e.id !== '_resumo')
                .map((e) => e.periodKey)
                .sort()
        ).toEqual([HOJE, semanaDeHoje()].sort());
        // E ficou persistido: a próxima leitura já vê a lista curta.
        expect(await storage.obterMissoes()).toEqual(consolidada);
    });

    it('o XP total não muda ao consolidar', async () => {
        await storage.salvarMissao(missao('daily_no_vape', '2026-03-01', 30));
        await storage.salvarMissao(missao('weekly_streak_3', '2026-02-23', 40, 'weekly'));
        const { calcularXp } = require('../../utils/xp');
        const antes = calcularXp([], [], await storage.obterMissoes());

        await storage.consolidarMissoesFechadas(HOJE);

        expect(calcularXp([], [], await storage.obterMissoes())).toBe(antes);
    });

    it('rodar de novo sem período novo fechado é no-op', async () => {
        await storage.salvarMissao(missao('daily_no_vape', '2026-03-01', 30));
        const primeira = await storage.consolidarMissoesFechadas(HOJE);

        const segunda = await storage.consolidarMissoesFechadas(HOJE);

        expect(segunda).toEqual(primeira);
    });

    it('conta: as fechadas somem do servidor e sobra o resumo', async () => {
        entrarNaConta();
        await storage.salvarMissao(missao('daily_no_vape', '2026-03-01', 30));
        await storage.salvarMissao(missao('daily_no_vape', HOJE, 30));
        await drenarTudo();

        await storage.consolidarMissoesFechadas(HOJE);
        await drenarTudo();

        const docsRemotos = Object.entries(mockRemoto)
            .filter(([caminho]) => caminho.startsWith(`users/${UID}/missions/`))
            .map(([caminho]) => caminho.split('/').pop());
        expect(docsRemotos.sort()).toEqual(['_resumo', `daily_no_vape_${HOJE}`]);
        expect(mockRemoto[`users/${UID}/missions/_resumo`]).toMatchObject({ xp: 30, count: 1 });
    });

    it('entrada já contada que ressuscita no servidor é apagada de novo, sem somar XP duas vezes', async () => {
        entrarNaConta();
        await storage.salvarMissao(missao('daily_no_vape', '2026-03-01', 30));
        await drenarTudo();
        await storage.consolidarMissoesFechadas(HOJE);
        await drenarTudo();

        // Simula o delete que não pegou: o doc velho volta na leitura seguinte.
        mockRemoto[`users/${UID}/missions/daily_no_vape_2026-03-01`] = missao(
            'daily_no_vape',
            '2026-03-01',
            30
        );
        avancarRelogio(31000); // vence a validade do espelho

        const consolidada = await storage.consolidarMissoesFechadas(HOJE);
        await drenarTudo();

        expect(resumoDe(consolidada)).toMatchObject({ xp: 30, count: 1 });
        expect(mockRemoto[`users/${UID}/missions/daily_no_vape_2026-03-01`]).toBeUndefined();
    });
});

describe('preferências locais', () => {
    it('preferência de notificação tem padrão e aceita alteração parcial', async () => {
        expect(await storage.obterPreferenciasDeNotificacao()).toEqual(
            storage.PREFERENCIAS_DE_NOTIFICACAO_PADRAO
        );

        await storage.salvarPreferenciasDeNotificacao({ hora: 21 });

        expect(await storage.obterPreferenciasDeNotificacao()).toEqual({
            ativas: true,
            hora: 21,
            minuto: 0,
            risco: true,
            diaCritico: true,
        });
    });

    it('onboarding: concluir e reiniciar', async () => {
        expect(await storage.onboardingFoiConcluido()).toBe(false);
        await storage.concluirOnboarding();
        expect(await storage.onboardingFoiConcluido()).toBe(true);
        await storage.reiniciarOnboarding();
        expect(await storage.onboardingFoiConcluido()).toBe(false);
    });
});
