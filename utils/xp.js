// src/utils/xp.js
//
// XP e nível do usuário. O XP é SEMPRE derivado dos dados que já existem
// (registros, conquistas desbloqueadas, streak) — não é um contador que
// vai sendo somado a cada ação. Isso evita XP duplicado (registro editado,
// tela recarregada) e XP perdido (ação feita offline / em outro aparelho).
//
// O par getXpState/saveXpState em storage.js guarda só um snapshot do
// último valor calculado, pra quem precisar do XP sem recalcular tudo.

import { ACHIEVEMENTS } from './achievements';

export const XP_RULES = {
  RECORD: 10,        // por registro feito
  CLEAN_DAY: 30,     // por dia registrado sem usar o vape
  STREAK_WEEK: 100,  // bônus por cada 7 dias seguidos sem usar
};

export const LEVELS = [
  { name: 'Iniciante', icon: '🌱', min: 0, max: 200 },
  { name: 'Resistente', icon: '🛡️', min: 200, max: 500 },
  { name: 'Guerreiro', icon: '⚔️', min: 500, max: 1000 },
  { name: 'Campeão', icon: '🏆', min: 1000, max: 2000 },
  { name: 'Lendário', icon: '👑', min: 2000, max: Infinity },
];

// Maior sequência de dias seguidos sem usar já feita (não só a atual) —
// assim quebrar o streak não faz o usuário perder XP que já conquistou.
export function calcBestStreak(records) {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const byDate = {};
  records.forEach((record) => {
    if (!byDate[record.date]) byDate[record.date] = [];
    byDate[record.date].push(record);
  });

  const dates = Object.keys(byDate).sort();
  let best = 0;
  let current = 0;
  let previous = null;

  for (const date of dates) {
    const clean = byDate[date].every((record) => !record.used);
    const consecutive = previous !== null && isNextDay(previous, date);

    if (clean) {
      current = consecutive ? current + 1 : 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
    previous = date;
  }

  return best;
}

function isNextDay(previousDate, date) {
  const cursor = new Date(`${previousDate}T12:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  return cursor.toISOString().slice(0, 10) === date;
}

export function countCleanDays(records) {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const byDate = {};
  records.forEach((record) => {
    if (!byDate[record.date]) byDate[record.date] = [];
    byDate[record.date].push(record);
  });

  return Object.values(byDate).filter((dayRecords) =>
    dayRecords.every((record) => !record.used)
  ).length;
}

// unlockedAchievements: array [{ id, unlockedAt }] vindo de getAchievements().
// completedMissions: array [{ id, missionId, xp, completedAt }] vindo de
// getMissions(). Aqui usamos o xp gravado na própria entrada (e não o valor
// atual em MISSIONS) pra que mudar a tabela de missões não reescreva XP que
// o usuário já ganhou.
export function calcXp(records = [], unlockedAchievements = [], completedMissions = []) {
  const recordXp = (records?.length || 0) * XP_RULES.RECORD;
  const cleanDayXp = countCleanDays(records) * XP_RULES.CLEAN_DAY;
  const streakXp = Math.floor(calcBestStreak(records) / 7) * XP_RULES.STREAK_WEEK;

  const xpById = new Map(ACHIEVEMENTS.map((a) => [a.id, a.xp || 0]));
  const achievementXp = (unlockedAchievements || []).reduce(
    (sum, achievement) => sum + (xpById.get(achievement.id) || 0),
    0
  );

  const missionXp = (completedMissions || []).reduce(
    (sum, mission) => sum + (mission.xp || 0),
    0
  );

  return recordXp + cleanDayXp + streakXp + achievementXp + missionXp;
}

export function getLevel(xp = 0) {
  const index = LEVELS.findIndex((level) => xp >= level.min && xp < level.max);
  const levelIndex = index === -1 ? LEVELS.length - 1 : index;
  const level = LEVELS[levelIndex];
  const isMax = level.max === Infinity;

  return {
    index: levelIndex,
    number: levelIndex + 1,
    name: level.name,
    icon: level.icon,
    min: level.min,
    max: level.max,
    xpIntoLevel: xp - level.min,
    xpForLevel: isMax ? 0 : level.max - level.min,
    xpToNext: isMax ? 0 : level.max - xp,
    nextName: isMax ? null : LEVELS[levelIndex + 1].name,
    progress: isMax ? 1 : (xp - level.min) / (level.max - level.min),
  };
}

// Atalho pra quem tem records + conquistas + missões em mãos e quer tudo
// de uma vez.
export function getXpSummary(records = [], unlockedAchievements = [], completedMissions = []) {
  const xp = calcXp(records, unlockedAchievements, completedMissions);
  return { xp, level: getLevel(xp) };
}
