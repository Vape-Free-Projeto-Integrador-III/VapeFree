// src/utils/theme.js
export const CORES = {
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

export const RAIO = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const SOMBRA = {
  pequena: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  media: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const DICAS = [
  'Cada puxada que você não dá já é uma vitória.',
  'Beber água pode ajudar a reduzir o desejo de usar o vape.',
  'Respirar fundo por 4 segundos pode substituir uma puxada.',
  'Você já chegou até aqui. Continua registrando! 🎯',
  'Exercício físico libera endorfinas que reduzem a vontade de usar.',
  'Converse com alguém de confiança quando a vontade aparecer.',
  'Cada dia sem usar é economia no seu bolso e na sua saúde. 💚',
  'Você é mais forte que essa vontade.',
  'Pequenos passos todos os dias fazem uma grande diferença.',
  'Cada registro conta. Você tá criando um hábito novo.',
];

export const GATILHOS = [
  { id: 'ansiedade', rotulo: 'Ansiedade', emoji: '😰' },
  { id: 'tedio', rotulo: 'Tédio', emoji: '😴' },
  { id: 'social', rotulo: 'Social', emoji: '👥' },
  { id: 'apos_comer', rotulo: 'Após comer', emoji: '🍽️' },
  { id: 'estresse', rotulo: 'Estresse', emoji: '😤' },
  { id: 'tristeza', rotulo: 'Tristeza', emoji: '😢' },
  { id: 'antes_dormir', rotulo: 'Antes de dormir', emoji: '🌙' },
  { id: 'outro', rotulo: 'Outro', emoji: '➕' },
];

export const AJUDAS = [
  { id: 'forca_vontade', rotulo: 'Força de vontade', emoji: '💪' },
  { id: 'exercicio', rotulo: 'Fiz exercício', emoji: '🏃' },
  { id: 'agua', rotulo: 'Bebi água', emoji: '💧' },
  { id: 'respirei', rotulo: 'Respirei fundo', emoji: '🧘' },
  { id: 'conversei', rotulo: 'Conversei com alguém', emoji: '🗣️' },
  { id: 'outro', rotulo: 'Outro', emoji: '➕' },
];

// Distrações rápidas do modo crise. "detalhe" é a instrução concreta —
// vontade forte não combina com texto vago.
export const DISTRACOES = [
  { id: 'agua', rotulo: 'Beber um copo de água', emoji: '💧', detalhe: 'Devagar, gole por gole. Ocupa a boca e as mãos.' },
  { id: 'caminhar', rotulo: 'Dar uma volta de 5 min', emoji: '🚶', detalhe: 'Sai do ambiente onde a vontade apareceu.' },
  { id: 'musica', rotulo: 'Ouvir uma música inteira', emoji: '🎧', detalhe: 'Uma música dura mais que o pico da fissura.' },
  { id: 'ligar', rotulo: 'Ligar pra alguém', emoji: '📞', detalhe: 'Não precisa nem falar do vape. Só conversa.' },
  { id: 'banho', rotulo: 'Tomar um banho frio', emoji: '🚿', detalhe: 'Choque de temperatura corta o ciclo da ansiedade.' },
  { id: 'mao', rotulo: 'Ocupar as mãos', emoji: '🤲', detalhe: 'Lavar louça, arrumar algo, apertar uma bolinha.' },
];

// Frases do topo da tela de crise, para quando ainda não dá pra
// personalizar pelo gatilho mais comum (poucos registros).
export const MENSAGENS_DE_CRISE = [
  'A vontade é uma onda: sobe, quebra e passa. Geralmente em 3 a 5 minutos.',
  'Você não precisa aguentar pra sempre. Só os próximos minutos.',
  'Estar aqui já é escolher diferente. Isso conta.',
  'Essa vontade não é uma ordem. É só um impulso passando.',
  'Você já passou por isso antes e continuou aqui.',
];

export const MENSAGENS_MOTIVACIONAIS = [
  'Ótimo! Continue assim! 💪',
  'Incrível! Você é mais forte do que pensa! 🌟',
  'Registro salvo! Cada dia conta! ✨',
  'Parabéns! Você está no caminho certo! 🎯',
  'Muito bem! Orgulhe-se de si mesmo! 💚',
];
