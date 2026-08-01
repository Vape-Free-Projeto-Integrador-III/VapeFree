//
// Comportamento, não aparência: o boundary tem que (1) engolir a exceção em vez
// de deixar derrubar a árvore, (2) oferecer saída, e (3) voltar a renderizar os
// filhos quando o usuário toca em "Tentar de novo".

import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import ErrorBoundary from '../../components/ErrorBoundary';

// React sempre loga o erro capturado no console — silenciar pra não poluir a
// saída dos testes (e pra o log não parecer uma falha real).
let espiaoDeErro;
beforeEach(() => {
    espiaoDeErro = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    espiaoDeErro.mockRestore();
});

function Explosivo({ explodir }) {
    if (explodir) throw new Error('boom no render');
    return <Text>conteúdo ok</Text>;
}

describe('ErrorBoundary', () => {
    it('renderiza os filhos normalmente quando não há erro', async () => {
        await render(
            <ErrorBoundary>
                <Explosivo explodir={false} />
            </ErrorBoundary>
        );

        expect(screen.getByText('conteúdo ok')).toBeTruthy();
    });

    it('mostra a tela de erro em vez de propagar a exceção do render', async () => {
        await render(
            <ErrorBoundary>
                <Explosivo explodir={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Algo deu errado')).toBeTruthy();
        expect(screen.getByText('Tentar de novo')).toBeTruthy();
        expect(screen.queryByText('conteúdo ok')).toBeNull();
    });

    it('avisa quem capturou o erro pelo aoCapturar', async () => {
        const aoCapturar = jest.fn();

        await render(
            <ErrorBoundary aoCapturar={aoCapturar}>
                <Explosivo explodir={true} />
            </ErrorBoundary>
        );

        expect(aoCapturar).toHaveBeenCalled();
        expect(aoCapturar.mock.calls[0][0].message).toBe('boom no render');
    });

    it('volta a renderizar os filhos ao tocar em "Tentar de novo"', async () => {
        const { rerender } = await render(
            <ErrorBoundary>
                <Explosivo explodir={true} />
            </ErrorBoundary>
        );

        expect(screen.getByText('Algo deu errado')).toBeTruthy();

        // Causa do erro some (ex.: dado que voltou a carregar) e o usuário tenta de novo.
        await rerender(
            <ErrorBoundary>
                <Explosivo explodir={false} />
            </ErrorBoundary>
        );
        await fireEvent.press(screen.getByText('Tentar de novo'));

        expect(screen.getByText('conteúdo ok')).toBeTruthy();
        expect(screen.queryByText('Algo deu errado')).toBeNull();
    });
});
