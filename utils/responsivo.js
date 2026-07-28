import { useWindowDimensions } from 'react-native';

// Larguras de layout. O app nasceu pra celular (um card por linha, esticado);
// no web a janela é larga demais pra isso — daí o teto de largura e as colunas.
export const LARGURA_MAXIMA = 1000;
export const QUEBRA_DUAS_COLUNAS = 900;

// Aplicado no bloco que vem DEPOIS do ScreenHeader — o header tem fundo
// cores.primary e precisa continuar de ponta a ponta.
export const estiloDoConteudo = {
    width: '100%',
    maxWidth: LARGURA_MAXIMA,
    alignSelf: 'center',
};

// useWindowDimensions (e não Dimensions.get) porque reage a resize da janela
// do navegador — Dimensions.get lido no topo do módulo congela na primeira carga.
export function usarLayoutResponsivo() {
    const { width } = useWindowDimensions();
    const colunas = width >= QUEBRA_DUAS_COLUNAS ? 2 : 1;
    return { largura: width, colunas, ehLargo: colunas > 1 };
}
