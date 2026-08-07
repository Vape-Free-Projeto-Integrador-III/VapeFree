import React, { createContext, useContext, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_MODO_ESCURO = '@vapefree_dark_mode';

export const ThemeContext = createContext({
    estaEscuro: false,
    alternarTema: () => {},
    forcarTemaClaro: () => {},
    cores: {},
});

export function ThemeProvider({ children }) {
    // null = flag ainda não foi lida do AsyncStorage. Enquanto isso o provider não
    // renderiza nada: se assumisse "claro", quem usa dark mode via um flash branco
    // a cada abertura (mesmo padrão do onboarding em AppNavigator.js).
    const [estaEscuro, setEstaEscuro] = useState(null);
    // Telas de auth (Login/SignUp) têm layout de fundo branco fixo, então elas
    // pedem tema claro enquanto estão montadas. Fica aqui no provider (e não
    // dentro da tela) porque o toast e o ConfirmModal moram acima da navegação:
    // só forçando no tema global eles também ficam claros junto.
    const [claroForcado, setClaroForcado] = useState(false);

    React.useEffect(() => {
        AsyncStorage.getItem(CHAVE_MODO_ESCURO)
            .then((valor) => setEstaEscuro(valor === 'true'))
            .catch(() => setEstaEscuro(false));
    }, []);

    const alternarTema = () => {
        setEstaEscuro((anterior) => {
            const proximo = !anterior;
            AsyncStorage.setItem(CHAVE_MODO_ESCURO, String(proximo));
            return proximo;
        });
    };

    // "estaEscuro" exposto é o efetivo (o que a UI deve pintar); a preferência
    // salva continua intacta no state, então sair da tela de auth volta ao escuro.
    const escuroEfetivo = estaEscuro && !claroForcado;
    const cores = escuroEfetivo ? CORES_ESCURAS : CORES_CLARAS;

    // Componentes nativos (teclado, alerts, date picker) não leem o tema do app:
    // eles seguem o userInterfaceStyle do sistema. Como o app.json está em
    // "automatic", dá pra sobrescrever esse valor em runtime e manter o nativo
    // alinhado com o tema escolhido aqui (que é manual, não o do sistema).
    // Só existe no nativo: o Appearance do react-native-web não tem
    // setColorScheme, e chamar direto derrubava o provider inteiro (tela branca).
    React.useEffect(() => {
        if (typeof Appearance.setColorScheme !== 'function') return;
        Appearance.setColorScheme(escuroEfetivo ? 'dark' : 'light');
    }, [escuroEfetivo]);

    if (estaEscuro === null) return null;

    return (
        <ThemeContext.Provider
            value={{
                estaEscuro: escuroEfetivo,
                alternarTema,
                forcarTemaClaro: setClaroForcado,
                cores,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function usarTema() {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- hook custom em português (`usar*`), o lint só reconhece `use*`
    return useContext(ThemeContext);
}

// ─── Claro ───────────────────────────────────────────────────────────────────
// Mesma paleta das telas de auth (LoginScreen/SignUpScreen): azul #4990E2 como
// cor de marca e navy #22384B como texto. Os tons cinza (#6F747B, #989FA6,
// #E1E1E1, #F7F8FA) são exatamente os do `CORES` local daquelas telas.
const CORES_CLARAS = {
    primary: '#4990E2',
    primaryLight: '#EAF1FC',
    primaryMid: '#6684A7',
    primaryDark: '#22384B',
    background: '#F7F8FA',
    white: '#FFFFFF',
    card: '#FFFFFF',
    text: '#22384B',
    textSecondary: '#6F747B',
    textMuted: '#989FA6',
    border: '#E1E1E1',
    borderLight: '#F0F2F5',
    danger: '#E53935',
    warning: '#FB8C00',
    cardShadow: '#00000014',
    tabBar: '#FFFFFF',
    tabBorder: '#E1E1E1',
    inputBg: '#F7F8FA',
    modalBg: '#FFFFFF',
};

// ─── Escuro ─────────────────────────────────────────────────────────────────────
// Mesma família azul/navy, escurecida: o fundo é o próprio navy da auth puxado
// pro preto, e não um cinza neutro.
const CORES_ESCURAS = {
    primary: '#6BA8EA', // azul um pouco mais claro para contraste no escuro
    primaryLight: '#16283A', // azul escuro suave para fundos destacados
    primaryMid: '#8FB2D4',
    primaryDark: '#A8C9EE', // azul claro para textos sobre fundo escuro
    background: '#0C141C', // navy bem escuro
    white: '#16222E', // "branco" no dark = navy escuro para cards
    card: '#16222E',
    text: '#EAF0F6',
    textSecondary: '#A9B6C2',
    textMuted: '#6F7C89',
    border: '#26333F',
    borderLight: '#1D2A36',
    danger: '#EF5350',
    warning: '#FFA726',
    cardShadow: '#00000040',
    tabBar: '#111C25',
    tabBorder: '#26333F',
    inputBg: '#111C25',
    modalBg: '#16222E',
};
