//
// XP e nível do usuário. O XP é SEMPRE derivado dos dados que já existem
// (registros, conquistas desbloqueadas, streak) — não é um contador que
// vai sendo somado a cada ação. Isso evita XP duplicado (registro editado,
// tela recarregada) e XP perdido (ação feita offline / em outro aparelho).
//
// O par obterEstadoDeXp/salvarEstadoDeXp em storage.js guarda só um snapshot
// do último valor calculado, pra quem precisar do XP sem recalcular tudo.

import { CONQUISTAS } from './achievements';
import { deslocarData } from './datas';

export const REGRAS_DE_XP = {
  REGISTRO: 10,       // por registro feito
  DIA_LIMPO: 30,      // por dia registrado sem usar o vape
  SEMANA_STREAK: 100, // bônus por cada 7 dias seguidos sem usar
};

export const NIVEIS = [
  { nome: 'Iniciante', icone: '🌱', minimo: 0, maximo: 1000 },
  { nome: 'Resistente', icone: '🛡️', minimo: 1000, maximo: 2500 },
  { nome: 'Guerreiro', icone: '⚔️', minimo: 2500, maximo: 5000 },
  { nome: 'Campeão', icone: '🏆', minimo: 5000, maximo: 10000 },
  { nome: 'Lendário', icone: '👑', minimo: 10000, maximo: Infinity },
];

// Maior sequência de dias seguidos sem usar já feita (não só a atual) —
// assim quebrar o streak não faz o usuário perder XP que já conquistou.
export function calcularMelhorStreak(registros) {
  if (!Array.isArray(registros) || registros.length === 0) return 0;

  const porData = {};
  registros.forEach((registro) => {
    if (!porData[registro.date]) porData[registro.date] = [];
    porData[registro.date].push(registro);
  });

  const datas = Object.keys(porData).sort();
  let melhor = 0;
  let atual = 0;
  let anterior = null;

  for (const data of datas) {
    const limpo = porData[data].every((registro) => !registro.used);
    const consecutivo = anterior !== null && ehDiaSeguinte(anterior, data);

    if (limpo) {
      atual = consecutivo ? atual + 1 : 1;
      melhor = Math.max(melhor, atual);
    } else {
      atual = 0;
    }
    anterior = data;
  }

  return melhor;
}

function ehDiaSeguinte(dataAnterior, data) {
  return deslocarData(dataAnterior, 1) === data;
}

export function contarDiasLimpos(registros) {
  if (!Array.isArray(registros) || registros.length === 0) return 0;

  const porData = {};
  registros.forEach((registro) => {
    if (!porData[registro.date]) porData[registro.date] = [];
    porData[registro.date].push(registro);
  });

  return Object.values(porData).filter((registrosDoDia) =>
    registrosDoDia.every((registro) => !registro.used)
  ).length;
}

// conquistasDesbloqueadas: array [{ id, unlockedAt }] vindo de obterConquistas().
// missoesConcluidas: array [{ id, missionId, xp, completedAt }] vindo de
// obterMissoes(). Aqui usamos o xp gravado na própria entrada (e não o valor
// atual em MISSOES) pra que mudar a tabela de missões não reescreva XP que
// o usuário já ganhou.
export function calcularXp(registros = [], conquistasDesbloqueadas = [], missoesConcluidas = []) {
  const xpDeRegistros = (registros?.length || 0) * REGRAS_DE_XP.REGISTRO;
  const xpDeDiasLimpos = contarDiasLimpos(registros) * REGRAS_DE_XP.DIA_LIMPO;
  const xpDeStreak = Math.floor(calcularMelhorStreak(registros) / 7) * REGRAS_DE_XP.SEMANA_STREAK;

  const xpPorId = new Map(CONQUISTAS.map((c) => [c.id, c.xp || 0]));
  const xpDeConquistas = (conquistasDesbloqueadas || []).reduce(
    (soma, conquista) => soma + (xpPorId.get(conquista.id) || 0),
    0
  );

  const xpDeMissoes = (missoesConcluidas || []).reduce(
    (soma, missao) => soma + (missao.xp || 0),
    0
  );

  return xpDeRegistros + xpDeDiasLimpos + xpDeStreak + xpDeConquistas + xpDeMissoes;
}

export function obterNivel(xp = 0) {
  const indiceEncontrado = NIVEIS.findIndex((nivel) => xp >= nivel.minimo && xp < nivel.maximo);
  const indice = indiceEncontrado === -1 ? NIVEIS.length - 1 : indiceEncontrado;
  const nivel = NIVEIS[indice];
  const ehMaximo = nivel.maximo === Infinity;

  return {
    indice,
    numero: indice + 1,
    nome: nivel.nome,
    icone: nivel.icone,
    minimo: nivel.minimo,
    maximo: nivel.maximo,
    xpNoNivel: xp - nivel.minimo,
    xpDoNivel: ehMaximo ? 0 : nivel.maximo - nivel.minimo,
    xpParaProximo: ehMaximo ? 0 : nivel.maximo - xp,
    nomeDoProximo: ehMaximo ? null : NIVEIS[indice + 1].nome,
    progresso: ehMaximo ? 1 : (xp - nivel.minimo) / (nivel.maximo - nivel.minimo),
  };
}

// Atalho pra quem tem registros + conquistas + missões em mãos e quer tudo
// de uma vez.
export function resumoDeXp(registros = [], conquistasDesbloqueadas = [], missoesConcluidas = []) {
  const xp = calcularXp(registros, conquistasDesbloqueadas, missoesConcluidas);
  return { xp, nivel: obterNivel(xp) };
}
