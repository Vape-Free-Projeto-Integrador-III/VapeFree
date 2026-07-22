// src/utils/achievements.js

export const ACHIEVEMENTS = [
  {
    id: 'first_record',
    xp: 20,
    title: 'Primeiro Passo',
    description: 'Você fez seu primeiro registro',
    icon: '📝',
    condition: (records) => records.length >= 1,
  },
  {
    id: 'streak_3',
    xp: 40,
    title: 'Começando Bem',
    description: '3 dias seguidos sem usar',
    icon: '🔥',
    condition: (records, economy, completedMissions, context) => {
      const streak = calcStreak(records, context?.shieldDates);
      return streak >= 3;
    },
  },
  {
    id: 'streak_7',
    xp: 80,
    title: 'Uma Semana',
    description: '7 dias seguidos sem usar',
    icon: '🌟',
    condition: (records, economy, completedMissions, context) => {
      const streak = calcStreak(records, context?.shieldDates);
      return streak >= 7;
    },
  },
  {
    id: 'streak_14',
    xp: 120,
    title: 'Duas Semanas',
    description: '14 dias seguidos sem usar',
    icon: '💪',
    condition: (records, economy, completedMissions, context) => {
      const streak = calcStreak(records, context?.shieldDates);
      return streak >= 14;
    },
  },
  {
    id: 'streak_30',
    xp: 250,
    title: 'Um Mês',
    description: '30 dias seguidos sem usar',
    icon: '🏆',
    condition: (records, economy, completedMissions, context) => {
      const streak = calcStreak(records, context?.shieldDates);
      return streak >= 30;
    },
  },
  {
    id: 'no_puffs_1',
    xp: 20,
    title: 'Dia Livre',
    description: 'Passou 1 dia sem usar o vape',
    icon: '✅',
    condition: (records) => {
      const today = new Date().toISOString().slice(0, 10);
      const todayRecs = records.filter((r) => r.date === today);
      return todayRecs.length > 0 && todayRecs.every((r) => !r.used);
    },
  },
  {
    id: 'no_puffs_3',
    xp: 50,
    title: 'Três Dias Limpos',
    description: 'Passou 3 dias sem usar o vape',
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
    xp: 80,
    title: 'Resistência',
    description: '7 dias sem usar, não precisa ser seguido',
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
    xp: 50,
    title: 'Primeiras Economias',
    description: 'Você já guardou R$ 50 não usando o vape',
    icon: '💰',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 50;
    },
  },
  {
    id: 'economy_200',
    xp: 150,
    title: 'Economia de Verdade',
    description: 'Você já guardou R$ 200 não usando o vape',
    icon: '💵',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 200;
    },
  },
  {
    id: 'records_10',
    xp: 40,
    title: 'Constância',
    description: 'Você já fez 10 registros',
    icon: '📊',
    condition: (records) => records.length >= 10,
  },
  {
    id: 'first_mission',
    xp: 20,
    title: 'Missão Cumprida',
    description: 'Você concluiu sua primeira missão',
    icon: '🎯',
    condition: (records, economy, completedMissions) =>
      (completedMissions || []).length >= 1,
  },
  {
    id: 'records_30',
    xp: 100,
    title: 'Dedicação',
    description: 'Você já fez 30 registros',
    icon: '⭐',
    condition: (records) => records.length >= 30,
  },
  {
    id: 'economy_500',
    xp: 300,
    title: 'Meio Milhar',
    description: 'Você já guardou R$ 500 não usando o vape',
    icon: '💎',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 500;
    },
  },
  {
    id: 'economy_1000',
    xp: 500,
    title: 'Mil Reais Livres',
    description: 'Você já guardou R$ 1000 não usando o vape',
    icon: '👑',
    condition: (records, economy) => {
      const total = Object.values(economy || {}).reduce((a, v) => a + v, 0);
      return total >= 1000;
    },
  },
  {
    id: 'breathing_5',
    xp: 60,
    title: 'Respira Fundo',
    description: 'Você usou a técnica de respiração 5 vezes',
    icon: '🫁',
    condition: (records, economy, completedMissions, context) =>
      (context?.crisisSessions || []).filter(
        (s) => s.method === 'respiracao' && s.completed === true
      ).length >= 5,
  },
  {
    id: 'crisis_passed_3',
    xp: 80,
    title: 'Mais Forte que a Vontade',
    description: 'Você venceu a vontade 3 vezes no modo crise',
    icon: '🧗',
    condition: (records, economy, completedMissions, context) =>
      (context?.crisisSessions || []).filter((s) => s.outcome === 'passou').length >= 3,
  },
  {
    id: 'trigger_aware_3',
    xp: 50,
    title: 'Autoconhecimento',
    description: 'Você identificou o mesmo gatilho 3 vezes',
    icon: '🔍',
    condition: (records) => {
      const counts = new Map();
      for (const record of records || []) {
        for (const trigger of record.triggers || []) {
          const key = String(trigger).trim().toLowerCase();
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      return [...counts.values()].some((count) => count >= 3);
    },
  },
  {
    id: 'app_open_7',
    xp: 70,
    title: 'Presença Diária',
    description: 'Você abriu o app 7 dias seguidos',
    icon: '📆',
    condition: (records, economy, completedMissions, context) =>
      calcDayStreak(context?.appOpenDays) >= 7,
  },
];

// Maior sequência de dias consecutivos numa lista de datas 'YYYY-MM-DD'.
// Usada pelas conquistas que contam dias corridos fora dos registros
// (ex: abrir o app), então não olha o campo `used` de nada.
export function calcDayStreak(dates) {
  const unique = [...new Set((dates || []).filter(Boolean))].sort();
  if (unique.length === 0) {
    return 0;
  }

  let best = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i++) {
    const previous = new Date(`${unique[i - 1]}T12:00:00`);
    previous.setDate(previous.getDate() + 1);
    if (previous.toISOString().slice(0, 10) === unique[i]) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

function groupRecordsByDate(records) {
  return records.reduce((groups, record) => {
    if (!groups[record.date]) {
      groups[record.date] = [];
    }
    groups[record.date].push(record);
    return groups;
  }, {});
}

// Caminha do último registro pra trás enquanto o dia contar como limpo.
// `protectedDates` são os dias cobertos por escudo de streak (ver
// utils/storage.js `syncStreakShield`): contam como limpos mesmo que o dia
// não tenha registro nenhum ou tenha registro com `used === true`.
// Devolve { streak, breakDate }, onde `breakDate` é o dia que interrompeu a
// contagem (null quando a sequência chegou no começo do histórico).
function walkStreak(records, protectedDates = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return { streak: 0, breakDate: null };
  }

  const recordsByDate = groupRecordsByDate(records);
  const shielded = new Set(protectedDates || []);
  const dates = Object.keys(recordsByDate).sort();
  const firstRecordDate = dates[0];
  const latestRecordDate = dates[dates.length - 1];
  const cursor = new Date(`${latestRecordDate}T12:00:00`);
  let streak = 0;

  while (true) {
    const dateKey = cursor.toISOString().slice(0, 10);

    // Passou do primeiro registro do histórico — não existe dia pra proteger.
    if (dateKey < firstRecordDate) {
      return { streak, breakDate: null };
    }

    const dayRecords = recordsByDate[dateKey] || [];
    const clean = dayRecords.length > 0 && !dayRecords.some((record) => record.used === true);

    if (!clean && !shielded.has(dateKey)) {
      return { streak, breakDate: dateKey };
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
}

export function calcStreak(records, protectedDates = []) {
  return walkStreak(records, protectedDates).streak;
}

// Dia que está segurando o streak (sem registro ou com uso), ou null.
// É esse dia que o escudo cobre quando é consumido.
export function findStreakBreakDate(records, protectedDates = []) {
  return walkStreak(records, protectedDates).breakDate;
}

// `context` traz o que não está nos registros:
// { crisisSessions, appOpenDays, shieldDates }.
export async function checkAchievements(
  records,
  economy = {},
  unlockedAchievements = [],
  completedMissions = [],
  context = {}
) {
  const unlockedMap = new Map((unlockedAchievements || []).map((achievement) => [achievement.id, achievement]));
  const results = [];
  const today = new Date().toISOString();

  for (const achievement of ACHIEVEMENTS) {
    const savedAchievement = unlockedMap.get(achievement.id);
    const unlocked = savedAchievement
      ? true
      : achievement.condition(records, economy, completedMissions, context);
    results.push({
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      xp: achievement.xp || 0,
      unlocked,
      unlockedAt: savedAchievement?.unlockedAt || (unlocked ? today : null),
    });
  }

  return results;
}