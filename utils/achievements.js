// src/utils/achievements.js

export const ACHIEVEMENTS = [
  {
    id: 'first_record',
    title: 'Primeiro Passo',
    description: 'Faça seu primeiro registro',
    icon: '📝',
    condition: (records) => records.length >= 1,
  },
  {
    id: 'streak_3',
    title: 'Início de Jornada',
    description: 'Complete 3 dias seguidos sem usar',
    icon: '🔥',
    condition: (records) => {
      const streak = calcStreak(records);
      return streak >= 3;
    },
  },
  {
    id: 'streak_7',
    title: 'Uma Semana',
    description: 'Complete 7 dias seguidos sem usar',
    icon: '🌟',
    condition: (records) => {
      const streak = calcStreak(records);
      return streak >= 7;
    },
  },
  {
    id: 'streak_14',
    title: 'Duas Semanas',
    description: 'Complete 14 dias seguidos sem usar',
    icon: '💪',
    condition: (records) => {
      const streak = calcStreak(records);
      return streak >= 14;
    },
  },
  {
    id: 'streak_30',
    title: 'Um Mês',
    description: 'Complete 30 dias seguidos sem usar',
    icon: '🏆',
    condition: (records) => {
      const streak = calcStreak(records);
      return streak >= 30;
    },
  },
  {
    id: 'no_puffs_1',
    title: 'Dia Livre',
    description: 'Não use nenhum cigarro eletrônico durante 1 dia',
    icon: '✅',
    condition: (records) => {
      const today = new Date().toISOString().slice(0, 10);
      const todayRecs = records.filter((r) => r.date === today);
      return todayRecs.length > 0 && todayRecs.every((r) => !r.used);
    },
  },
  {
    id: 'no_puffs_3',
    title: 'Três Dias Limpos',
    description: 'Não use nenhum cigarro eletrônico durante 3 dias',
    icon: '🎯',
    condition: (records) => {
      const dates = [...new Set(records.map((r) => r.date))].sort().reverse();
      let cleanDays = 0;
      for (const date of dates) {
        const dayRecs = records.filter((r) => r.date === date);
        if (dayRecs.length > 0 && dayRecs.every((r) => !r.used)) {
          cleanDays++;
        } else {
          break;
        }
      }
      return cleanDays >= 3;
    },
  },
  {
    id: 'total_no_7',
    title: 'Semana de Resistência',
    description: '7 dias no total sem usar (não precisa ser seguido)',
    icon: '🛡️',
    condition: (records) => {
      const noUseDays = new Set(
        records
          .filter((r) => !r.used)
          .map((r) => r.date)
      ).size;
      return noUseDays >= 7;
    },
  },
  {
    id: 'economy_50',
    title: 'Economista Iniciante',
    description: 'Economize R$ 50 evitando cigarro eletrônico',
    icon: '💰',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 50;
    },
  },
  {
    id: 'economy_200',
    title: 'Economista Expert',
    description: 'Economize R$ 200 evitando cigarro eletrônico',
    icon: '💵',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 200;
    },
  },
  {
    id: 'records_10',
    title: 'Consistência',
    description: 'Faça 10 registros',
    icon: '📊',
    condition: (records) => records.length >= 10,
  },
  {
    id: 'records_30',
    title: 'Dedicação',
    description: 'Faça 30 registros',
    icon: '⭐',
    condition: (records) => records.length >= 30,
  },
];

function calcStreak(records) {
  const dates = [...new Set(records.map((r) => r.date))].sort().reverse();
  if (!dates.length) return 0;
  let streak = 0;
  let d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.toISOString().slice(0, 10);
    if (dates.includes(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export async function checkAchievements(records, economy = {}) {
  const results = [];
  const today = new Date().toISOString();

  for (const achievement of ACHIEVEMENTS) {
    const unlocked = achievement.condition(records, economy);
    results.push({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      unlocked,
      unlockedAt: unlocked ? today : null,
    });
  }

  return results;
}