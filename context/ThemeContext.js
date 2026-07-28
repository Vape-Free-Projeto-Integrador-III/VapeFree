// src/context/ThemeContext.js
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
  const [estaEscuro, setEstaEscuro] = useState(false);
  // Telas de auth (Login/SignUp) têm layout de fundo branco fixo, então elas
  // pedem tema claro enquanto estão montadas. Fica aqui no provider (e não
  // dentro da tela) porque o toast e o ConfirmModal moram acima da navegação:
  // só forçando no tema global eles também ficam claros junto.
  const [claroForcado, setClaroForcado] = useState(false);

  React.useEffect(() => {
    AsyncStorage.getItem(CHAVE_MODO_ESCURO).then((valor) => {
      if (valor === 'true') setEstaEscuro(true);
    });
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

  return (
    <ThemeContext.Provider
      value={{ estaEscuro: escuroEfetivo, alternarTema, forcarTemaClaro: setClaroForcado, cores }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function usarTema() {
  return useContext(ThemeContext);
}

// ─── Claro (original) ────────────────────────────────────────────────────────
const CORES_CLARAS = {
  primary: '#4CAF50',
  primaryLight: '#E8F5E9',
  primaryMid: '#81C784',
  primaryDark: '#2E7D32',
  background: '#F9F9F9',
  white: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#555555',
  textMuted: '#888888',
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  danger: '#E53935',
  warning: '#FB8C00',
  cardShadow: '#00000014',
  tabBar: '#FFFFFF',
  tabBorder: '#E0E0E0',
  inputBg: '#F9F9F9',
  modalBg: '#FFFFFF',
};

// ─── Escuro ─────────────────────────────────────────────────────────────────────
const CORES_ESCURAS = {
  primary: '#66BB6A',      // verde um pouco mais claro para contraste no escuro
  primaryLight: '#1B3A1E', // verde escuro suave para fundos destacados
  primaryMid: '#81C784',
  primaryDark: '#A5D6A7',  // verde claro para textos sobre fundo escuro
  background: '#0F0F0F',   // fundo bem escuro
  white: '#1E1E1E',        // "branco" no dark = cinza escuro para cards
  card: '#1E1E1E',
  text: '#F0F0F0',
  textSecondary: '#BBBBBB',
  textMuted: '#777777',
  border: '#2E2E2E',
  borderLight: '#252525',
  danger: '#EF5350',
  warning: '#FFA726',
  cardShadow: '#00000040',
  tabBar: '#161616',
  tabBorder: '#2A2A2A',
  inputBg: '#161616',
  modalBg: '#1E1E1E',
};
