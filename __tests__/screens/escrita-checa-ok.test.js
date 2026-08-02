//
// Invariante de UI, não de layout: escrita iniciada pelo usuário devolve
// `{ ok, motivo }` (ver CLAUDE.md e docs/database.md) e a tela é OBRIGADA a
// checar `ok` antes de dar sucesso ou XP.
//
// Quebrar isso não gera erro nenhum: a tela mostra "salvo!", concede XP e
// conquista por algo que nunca foi gravado. Nenhum teste de util pega —
// a checagem só existe dentro da tela.
//
// Estes testes afirmam COMPORTAMENTO (o que a tela faz), nunca aparência, pra
// sobreviverem a redesign. Cada tela tem o par: falha não premia, sucesso sim.

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const OK = { ok: true };
const falhaDeRede = { ok: false, motivo: 'rede' };

const mockMostrarErro = jest.fn();
const mockMostrarRecompensas = jest.fn();

const mockSalvarRegistro = jest.fn();
const mockAtualizarRegistro = jest.fn();
const mockSalvarAparelho = jest.fn();
const mockSalvarMeta = jest.fn();
const mockSalvarMetaDeDinheiro = jest.fn();
const mockAtualizarSessaoDeCrise = jest.fn();
const mockExcluirSessaoDeCrise = jest.fn();
const mockSincronizarGamificacao = jest.fn();

// Prefixo "mock" é o que deixa a factory hoisted do jest.mock referenciar isto.
const mockSessaoDeCrise = {
    id: 1,
    date: '2026-03-01',
    time: '14:20',
    method: 'timer',
    durationSec: 300,
    completed: true,
    outcome: 'passou',
    note: null,
};

jest.mock('../../utils/storage', () => {
    const datas = jest.requireActual('../../utils/datas');
    return {
        DIAS_PARA_TRAS_NO_REGISTRO: 7,
        dataDeHoje: datas.dataDeHoje,
        datasRegistraveis: () => datas.ultimosNDias(8),
        dataEhRegistravel: () => true,
        salvarRegistro: (...args) => mockSalvarRegistro(...args),
        atualizarRegistro: (...args) => mockAtualizarRegistro(...args),
        salvarAparelho: (...args) => mockSalvarAparelho(...args),
        salvarMeta: (...args) => mockSalvarMeta(...args),
        salvarMetaDeDinheiro: (...args) => mockSalvarMetaDeDinheiro(...args),
        obterMetaDeDinheiro: jest.fn(() => Promise.resolve(null)),
        atualizarSessaoDeCrise: (...args) => mockAtualizarSessaoDeCrise(...args),
        excluirSessaoDeCrise: (...args) => mockExcluirSessaoDeCrise(...args),
        sincronizarGamificacao: (...args) => mockSincronizarGamificacao(...args),
        obterSessoesDeCrise: jest.fn(() => Promise.resolve([mockSessaoDeCrise])),
        obterRegistros: jest.fn(() => Promise.resolve([])),
        obterAparelho: jest.fn(() => Promise.resolve(null)),
        obterHistoricoDeAparelhos: jest.fn(() => Promise.resolve([])),
        obterMeta: jest.fn(() => Promise.resolve(null)),
        obterEconomia: jest.fn(() => Promise.resolve({})),
        recalcularEconomia: jest.fn(() => Promise.resolve({})),
    };
});

jest.mock('../../utils/notifications', () => ({
    aplicarPreferenciasDeNotificacao: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/alert', () => ({
    __esModule: true,
    default: { alert: jest.fn() },
}));

// Qualquer token de cor devolve uma cor válida — o teste não olha estilo.
const mockCores = new Proxy({}, { get: () => '#111111' });

jest.mock('../../context/ThemeContext', () => ({
    usarTema: () => ({ cores: mockCores, estaEscuro: false }),
}));

jest.mock('../../context/ToastContext', () => ({
    usarToast: () => ({
        mostrarErro: mockMostrarErro,
        mostrarRecompensas: mockMostrarRecompensas,
    }),
}));

// O header depende de safe-area e do banner de conexão; nada disso importa aqui.
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');

// Ícone é pura aparência, e carregá-lo puxa expo-font -> expo-asset (que não
// está instalado neste projeto).
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// useFocusEffect existe só na navegação de verdade; aqui vale rodar uma vez.
jest.mock('@react-navigation/native', () => {
    const { useEffect } = require('react');
    return { useFocusEffect: (callback) => useEffect(callback, [callback]) };
});

const RegisterScreen = require('../../screens/RegisterScreen').default;
const DeviceScreen = require('../../screens/DeviceScreen').default;
const GoalScreen = require('../../screens/GoalScreen').default;
const CrisisHistoryScreen = require('../../screens/CrisisHistoryScreen').default;

const navegacao = { navigate: jest.fn(), goBack: jest.fn() };

// O toast de sucesso das telas roda um Animated.sequence com delay de 2s. Sem
// timer falso esse temporizador sobrevive ao fim do teste e o Jest reclama de
// worker que não encerrou.
beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSincronizarGamificacao.mockResolvedValue({ recompensas: { xp: 10 } });
});

afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
});

// Nenhuma premiação pode ter acontecido: nem XP, nem toast de recompensa.
const esperarNenhumaPremiacao = () => {
    expect(mockSincronizarGamificacao).not.toHaveBeenCalled();
    expect(mockMostrarRecompensas).not.toHaveBeenCalled();
};

describe('RegisterScreen', () => {
    const preencherEnviar = async () => {
        await fireEvent.press(screen.getByText('Não')); // "usou o vape?" -> não
        await fireEvent.press(screen.getByText('Salvar'));
    };

    it('salvarRegistro falhando não dá XP nem sucesso', async () => {
        mockSalvarRegistro.mockResolvedValue(falhaDeRede);
        await render(<RegisterScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        esperarNenhumaPremiacao();
    });

    it('data recusada pelo storage vira mensagem específica, sem XP', async () => {
        mockSalvarRegistro.mockResolvedValue({ ok: false, motivo: 'data_invalida' });
        await render(<RegisterScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        expect(mockMostrarErro.mock.calls[0][1]).toMatch(/7 dias atrás/);
        esperarNenhumaPremiacao();
    });

    it('salvarRegistro dando ok concede XP', async () => {
        mockSalvarRegistro.mockResolvedValue(OK);
        await render(<RegisterScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarRecompensas).toHaveBeenCalled());
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });
});

describe('DeviceScreen', () => {
    const preencherEnviar = async () => {
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: Vape Pod – Mint'), 'Pod Mint');
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 39.90'), '39.90');
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 600'), '600');
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 14'), '14');
        await fireEvent.press(screen.getByText('Salvar'));
    };

    it('salvarAparelho falhando não dá XP nem sucesso', async () => {
        mockSalvarAparelho.mockResolvedValue(falhaDeRede);
        await render(<DeviceScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        esperarNenhumaPremiacao();
    });

    it('salvarAparelho dando ok concede XP', async () => {
        mockSalvarAparelho.mockResolvedValue(OK);
        await render(<DeviceScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarRecompensas).toHaveBeenCalled());
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });
});

describe('CrisisHistoryScreen', () => {
    const abrirEdicaoESalvar = async () => {
        await fireEvent.press(await screen.findByLabelText('Editar crise'));
        await fireEvent.press(screen.getByText('😔 Acabei usando'));
        await fireEvent.press(screen.getByText('Salvar alterações'));
    };

    const apagar = async () => {
        await fireEvent.press(await screen.findByLabelText('Apagar crise'));
        await fireEvent.press(screen.getByText('Apagar'));
    };

    it('atualizarSessaoDeCrise falhando não dá XP nem fecha a edição', async () => {
        mockAtualizarSessaoDeCrise.mockResolvedValue(falhaDeRede);
        await render(<CrisisHistoryScreen navigation={navegacao} />);

        await abrirEdicaoESalvar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        esperarNenhumaPremiacao();
        // Modal continua aberto — a edição não pode sumir junto com o erro.
        expect(screen.getByText('Salvar alterações')).toBeTruthy();
    });

    it('atualizarSessaoDeCrise dando ok reavalia a gamificação', async () => {
        mockAtualizarSessaoDeCrise.mockResolvedValue(OK);
        await render(<CrisisHistoryScreen navigation={navegacao} />);

        await abrirEdicaoESalvar();

        await waitFor(() => expect(mockMostrarRecompensas).toHaveBeenCalled());
        expect(mockAtualizarSessaoDeCrise).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1, outcome: 'usei' })
        );
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });

    it('excluirSessaoDeCrise falhando não dá XP', async () => {
        mockExcluirSessaoDeCrise.mockResolvedValue(falhaDeRede);
        await render(<CrisisHistoryScreen navigation={navegacao} />);

        await apagar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        esperarNenhumaPremiacao();
    });

    it('excluirSessaoDeCrise dando ok reavalia a gamificação', async () => {
        mockExcluirSessaoDeCrise.mockResolvedValue(OK);
        await render(<CrisisHistoryScreen navigation={navegacao} />);

        await apagar();

        await waitFor(() => expect(mockMostrarRecompensas).toHaveBeenCalled());
        expect(mockExcluirSessaoDeCrise).toHaveBeenCalledWith(1);
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });
});

describe('GoalScreen', () => {
    const preencherEnviar = async () => {
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 100'), '100');
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 10'), '10');
        await fireEvent.press(screen.getByText('Salvar minha meta'));
    };

    it('salvarMeta falhando não dá XP nem sucesso', async () => {
        mockSalvarMeta.mockResolvedValue(falhaDeRede);
        await render(<GoalScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        esperarNenhumaPremiacao();
    });

    it('salvarMeta dando ok concede XP', async () => {
        mockSalvarMeta.mockResolvedValue(OK);
        await render(<GoalScreen navigation={navegacao} />);

        await preencherEnviar();

        await waitFor(() => expect(mockMostrarRecompensas).toHaveBeenCalled());
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });

    // A meta de dinheiro não gera XP (não mexe em limite nem em economia), então
    // o sinal de sucesso aqui é a confirmação na tela, não a premiação.
    const preencherEnviarDinheiro = async () => {
        await fireEvent.changeText(screen.getByPlaceholderText('Ex: 400'), '400');
        await fireEvent.press(screen.getByText('Salvar meta de dinheiro'));
    };

    it('salvarMetaDeDinheiro falhando não dá sucesso', async () => {
        mockSalvarMetaDeDinheiro.mockResolvedValue(falhaDeRede);
        await render(<GoalScreen navigation={navegacao} />);

        await preencherEnviarDinheiro();

        await waitFor(() => expect(mockMostrarErro).toHaveBeenCalled());
        expect(screen.queryByText(/Meta de dinheiro salva/)).toBeNull();
    });

    it('salvarMetaDeDinheiro dando ok confirma na tela', async () => {
        mockSalvarMetaDeDinheiro.mockResolvedValue(OK);
        await render(<GoalScreen navigation={navegacao} />);

        await preencherEnviarDinheiro();

        await waitFor(() => expect(screen.getByText(/Meta de dinheiro salva/)).toBeTruthy());
        expect(mockMostrarErro).not.toHaveBeenCalled();
    });
});
