// src/context/ThemeContext.js
import React, { createContext, useContext, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE_MODO_ESCURO = '@vapefree_dark_mode';

export const ThemeContext = createContext({
  estaEscuro: false,
  alternarTema: () => {},
  cores: {},
});

export function ThemeProvider({ children }) {
  const [estaEscuro, setEstaEscuro] = useState(false);

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

  const cores = estaEscuro ? CORES_ESCURAS : CORES_CLARAS;

  return (
    <ThemeContext.Provider value={{ estaEscuro, alternarTema, cores }}>
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
