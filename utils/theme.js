// src/utils/theme.js
export const COLORS = {
  primary: '#4CAF50',
  primaryLight: '#E8F5E9',
  primaryMid: '#81C784',
  primaryDark: '#2E7D32',
  background: '#F9F9F9',
  white: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#555555',
  textMuted: '#888888',
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  danger: '#E53935',
  warning: '#FB8C00',
  cardShadow: '#00000014',
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const SHADOW = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const TIPS = [
  'Cada puxada que você não dá é uma vitória. Você está no controle!',
  'Beber água pode ajudar a reduzir o desejo de usar o vape.',
  'Respirar fundo por 4 segundos pode substituir uma puxada.',
  'Você já veio até aqui! Continue registrando seu progresso. 🎯',
  'Exercício físico libera endorfinas que reduzem a vontade de usar.',
  'Converse com alguém de confiança quando a vontade aparecer.',
  'Cada dia sem usar é economia no seu bolso e na sua saúde. 💚',
  'Sua mente é mais forte do que qualquer vício. Acredite nisso!',
  'Pequenos passos todos os dias fazem uma grande diferença.',
  'Orgulhe-se de cada registro! Você está construindo um hábito saudável.',
];

export const TRIGGERS = [
  { id: 'ansiedade', label: 'Ansiedade', emoji: '😰' },
  { id: 'tedio', label: 'Tédio', emoji: '😴' },
  { id: 'social', label: 'Social', emoji: '👥' },
  { id: 'apos_comer', label: 'Após comer', emoji: '🍽️' },
  { id: 'estresse', label: 'Estresse', emoji: '😤' },
  { id: 'tristeza', label: 'Tristeza', emoji: '😢' },
  { id: 'antes_dormir', label: 'Antes de dormir', emoji: '🌙' },
  { id: 'outro', label: 'Outro', emoji: '➕' },
];

export const HELPS = [
  { id: 'forca_vontade', label: 'Força de vontade', emoji: '💪' },
  { id: 'exercicio', label: 'Fiz exercício', emoji: '🏃' },
  { id: 'agua', label: 'Bebi água', emoji: '💧' },
  { id: 'respirei', label: 'Respirei fundo', emoji: '🧘' },
  { id: 'conversei', label: 'Conversei com alguém', emoji: '🗣️' },
  { id: 'outro', label: 'Outro', emoji: '➕' },
];

export const MOTIVATIONAL_MESSAGES = [
  'Ótimo! Continue assim! 💪',
  'Incrível! Você é mais forte do que pensa! 🌟',
  'Registro salvo! Cada dia conta! ✨',
  'Parabéns! Você está no caminho certo! 🎯',
  'Muito bem! Orgulhe-se de si mesmo! 💚',
];
