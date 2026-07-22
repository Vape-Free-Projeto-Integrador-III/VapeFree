// src/utils/storage.js
//
// Camada de dados do app. As funções exportadas aqui (getRecords,
// saveRecord, getDevice, etc.) têm a MESMA assinatura de antes — as telas
// (HomeScreen, DeviceScreen, HistoryScreen, AchievementsScreen,
// RegisterScreen) não precisam saber ou se importar com ONDE os dados
// estão sendo guardados.
//
// Por baixo dos panos, cada função decide automaticamente:
//   - Usuário LOGADO (auth.currentUser existe)  -> Cloud Firestore,
//     guardado dentro de users/{uid}/..., ou seja, atrelado à conta.
//     Funciona em qualquer aparelho que ele logar.
//   - Usuário CONVIDADO (sem login)              -> AsyncStorage local,
//     como já era antes. Os dados ficam só naquele aparelho.
//
// Isso é decidido olhando "auth.currentUser" no momento da chamada — não
// existe nenhum estado duplicado pra manter sincronizado.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { checkAchievements, calcStreak, findStreakBreakDate } from './achievements';
import { buildMissionContext, checkMissions } from './missions';
import { normalizeRecord, sumPuffs } from './records';
import { getXpSummary } from './xp';

export { calcStreak };

const KEYS = {
  RECORDS: '@vapefree_records',
  DEVICE: '@vapefree_device',
  ECONOMY: '@vapefree_economy',
  ACHIEVEMENTS: '@vapefree_achievements',
  CRISIS: '@vapefree_crisis',
  MISSIONS: '@vapefree_missions',
  XP: '@vapefree_xp',
  APP_OPENS: '@vapefree_app_opens',
  STREAK_SHIELD: '@vapefree_streak_shield',
};

// Quantos dias de abertura do app ficam guardados. 60 cobre com folga a
// maior conquista de presença diária (7 dias seguidos).
const APP_OPENS_LIMIT = 60;

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Retorna o uid do usuário logado, ou null se estiver em modo convidado.
function getUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

export async function getGuestLocalData() {
  const [
    records,
    device,
    economy,
    achievements,
    crisisSessions,
    missions,
    xp,
    appOpenDays,
    streakShield,
  ] = await Promise.all([
    readJson(KEYS.RECORDS, []),
    readJson(KEYS.DEVICE, null),
    readJson(KEYS.ECONOMY, {}),
    readJson(KEYS.ACHIEVEMENTS, []),
    readJson(KEYS.CRISIS, []),
    readJson(KEYS.MISSIONS, []),
    readJson(KEYS.XP, null),
    readJson(KEYS.APP_OPENS, []),
    readJson(KEYS.STREAK_SHIELD, null),
  ]);

  return {
    records: Array.isArray(records) ? records : [],
    device: device ?? null,
    economy: economy && typeof economy === 'object' ? economy : {},
    achievements: Array.isArray(achievements) ? achievements : [],
    crisisSessions: Array.isArray(crisisSessions) ? crisisSessions : [],
    missions: Array.isArray(missions) ? missions : [],
    xp: xp && typeof xp === 'object' ? xp : null,
    appOpenDays: Array.isArray(appOpenDays) ? appOpenDays : [],
    streakShield: streakShield && typeof streakShield === 'object' ? streakShield : null,
  };
}

export async function hasGuestLocalData() {
  const data = await getGuestLocalData();
  return (
    data.records.length > 0 ||
    data.device !== null ||
    Object.keys(data.economy).length > 0 ||
    data.achievements.length > 0 ||
    data.crisisSessions.length > 0 ||
    data.missions.length > 0
  );
}

export async function clearGuestLocalData() {
  await Promise.all(Object.values(KEYS).map((key) => AsyncStorage.removeItem(key)));
}

async function replaceCollectionDocs(uid, subcollection, entries) {
  const snap = await getDocs(collection(db, 'users', uid, subcollection));

  await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  await Promise.all(
    entries.map((entry) =>
      setDoc(doc(db, 'users', uid, subcollection, String(entry.id)), entry)
    )
  );
}

export async function migrateGuestLocalDataToUser(uid = getUid()) {
  if (!uid) {
    return false;
  }

  const data = await getGuestLocalData();

  await setDoc(
    doc(db, 'users', uid),
    {
      device: data.device ?? null,
      economy: data.economy && typeof data.economy === 'object' ? data.economy : {},
      xp: data.xp ?? null,
      appOpenDays: data.appOpenDays,
      streakShield: data.streakShield ?? null,
    },
    { merge: true }
  );

  await replaceCollectionDocs(uid, 'records', data.records);
  await replaceCollectionDocs(uid, 'achievements', data.achievements);
  await replaceCollectionDocs(uid, 'crisisSessions', data.crisisSessions);
  await replaceCollectionDocs(uid, 'missions', data.missions);
  await clearGuestLocalData();
  return true;
}

// ─── Records ────────────────────────────────────────────────────────────────
// Modo conta: subcoleção users/{uid}/records, um documento por registro
// (id do documento = id do registro). Modo convidado: array no AsyncStorage,
// como já era antes.

export async function getRecords() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'records'));
      return snap.docs.map((d) => d.data());
    }
    const raw = await AsyncStorage.getItem(KEYS.RECORDS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveRecord(newRecord) {
  const uid = getUid();
  const record = normalizeRecord(newRecord);
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'records', String(record.id)), record);
      return true;
    }
    const records = await getRecords();
    records.push(record);
    await AsyncStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export async function deleteRecord(id) {
  const uid = getUid();
  try {
    if (uid) {
      await deleteDoc(doc(db, 'users', uid, 'records', String(id)));
      return true;
    }
    const records = await getRecords();
    const updated = records.filter((r) => r.id !== id);
    await AsyncStorage.setItem(KEYS.RECORDS, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

export async function updateRecord(record) {
  const uid = getUid();
  const updatedRecord = normalizeRecord(record);
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'records', String(updatedRecord.id)), updatedRecord);
      return true;
    }
    const records = await getRecords();
    const index = records.findIndex((r) => r.id === updatedRecord.id);
    if (index !== -1) {
      records[index] = updatedRecord;
      await AsyncStorage.setItem(KEYS.RECORDS, JSON.stringify(records));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Device ─────────────────────────────────────────────────────────────────
// Modo conta: campo "device" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function getDevice() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().device ?? null : null;
    }
    const raw = await AsyncStorage.getItem(KEYS.DEVICE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveDevice(device) {
  const uid = getUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { device }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(KEYS.DEVICE, JSON.stringify(device));
    return true;
  } catch {
    return false;
  }
}

// ─── Economy ────────────────────────────────────────────────────────────────
// Modo conta: campo "economy" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function getEconomy() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().economy ?? {} : {};
    }
    const raw = await AsyncStorage.getItem(KEYS.ECONOMY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function setEconomy(economyMap) {
  const uid = getUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { economy: economyMap }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(KEYS.ECONOMY, JSON.stringify(economyMap));
    return true;
  } catch {
    return false;
  }
}

// ─── Economy Calculation ─────────────────────────────────────────────────────
// Função pura de cálculo, igual antes — não muda entre conta/convidado.

export async function recalcEconomy(records, device) {
  if (!device) return {};
  const costPerPuff = device.price / device.totalPuffs;
  const dailyGoal = device.totalPuffs / device.days;

  // Group records by date
  const byDate = {};
  records.forEach((r) => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });

  const economyMap = {};
  Object.entries(byDate).forEach(([date, recs]) => {
    const usedToday = sumPuffs(recs);
    const notGiven = Math.max(0, dailyGoal - usedToday);
    economyMap[date] = parseFloat((notGiven * costPerPuff).toFixed(2));
  });

  await setEconomy(economyMap);
  return economyMap;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Funções puras (sem leitura/escrita de dados) — continuam exatamente iguais.

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function getLastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export function getLastNWeeks(n) {
  const weeks = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks;
}

export function getLastNMonths(n) {
  const months = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 10));
  }
  return months;
}

export function getWeekLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.toISOString().slice(5, 10)}`;
}

export function getMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── App Opens ───────────────────────────────────────────────────────────────
// Lista de datas 'YYYY-MM-DD' em que o app foi aberto (uma entrada por dia,
// no máximo APP_OPENS_LIMIT dias). Só serve pra conquista de presença diária.
// Modo conta: campo "appOpenDays" no documento users/{uid}. Convidado:
// AsyncStorage.

export async function getAppOpenDays() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      const days = snap.exists() ? snap.data().appOpenDays : null;
      return Array.isArray(days) ? days : [];
    }
    const raw = await AsyncStorage.getItem(KEYS.APP_OPENS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Marca hoje como dia aberto. Idempotente dentro do mesmo dia.
export async function registerAppOpen() {
  const uid = getUid();
  try {
    const today = todayString();
    const days = await getAppOpenDays();
    if (days.includes(today)) {
      return days;
    }
    const updated = [...days, today].sort().slice(-APP_OPENS_LIMIT);

    if (uid) {
      await setDoc(doc(db, 'users', uid), { appOpenDays: updated }, { merge: true });
    } else {
      await AsyncStorage.setItem(KEYS.APP_OPENS, JSON.stringify(updated));
    }
    return updated;
  } catch {
    return [];
  }
}

// ─── Streak Shield ───────────────────────────────────────────────────────────
// Escudo de streak (mecânica tipo Duolingo): a cada SHIELD_STREAK_STEP dias de
// sequência o usuário ganha 1 escudo (máximo MAX_SHIELDS guardados). Quando um
// dia quebra o streak — porque ficou sem registro OU porque o registro teve
// `used === true` — o escudo é consumido e aquele dia entra em `usedDates`,
// passando a contar como dia limpo pro `calcStreak`.
//
// Estado: { count, usedDates: ['YYYY-MM-DD'], earnedMilestone, earnedAt }.
// `earnedMilestone` é o múltiplo de 7 que já rendeu escudo (evita ganhar duas
// vezes pelo mesmo marco) e `earnedAt` é o dia em que o último escudo foi
// ganho — escudo nunca cobre dia anterior a ele, senão o próprio escudo
// recém-ganho seria gasto pra emendar o streak com um passado já quebrado.
//
// Modo conta: campo "streakShield" no documento users/{uid}. Convidado:
// AsyncStorage.

const MAX_SHIELDS = 1;
const SHIELD_STREAK_STEP = 7;

const EMPTY_SHIELD = { count: 0, usedDates: [], earnedMilestone: 0, earnedAt: null };

function normalizeShield(state) {
  if (!state || typeof state !== 'object') {
    return { ...EMPTY_SHIELD };
  }
  return {
    count: Number.isFinite(state.count) ? state.count : 0,
    usedDates: Array.isArray(state.usedDates) ? state.usedDates : [],
    earnedMilestone: Number.isFinite(state.earnedMilestone) ? state.earnedMilestone : 0,
    earnedAt: state.earnedAt ?? null,
  };
}

export async function getStreakShield() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return normalizeShield(snap.exists() ? snap.data().streakShield : null);
    }
    const raw = await AsyncStorage.getItem(KEYS.STREAK_SHIELD);
    return normalizeShield(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...EMPTY_SHIELD };
  }
}

export async function saveStreakShield(state) {
  const uid = getUid();
  try {
    const entry = { ...normalizeShield(state), updatedAt: new Date().toISOString() };
    if (uid) {
      await setDoc(doc(db, 'users', uid), { streakShield: entry }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(KEYS.STREAK_SHIELD, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

// Consome escudo nos dias que quebraram o streak e concede escudo novo quando
// a sequência bate um múltiplo de SHIELD_STREAK_STEP. Devolve o estado já
// atualizado (com `consumedDates`: os dias protegidos agora, pra tela avisar).
export async function syncStreakShield(records) {
  try {
    const recs = records ?? (await getRecords());
    const state = await getStreakShield();
    let { count, usedDates, earnedMilestone, earnedAt } = state;
    const consumedDates = [];

    while (count > 0) {
      const breakDate = findStreakBreakDate(recs, usedDates);
      // Sem dia pra proteger, ou quebra anterior ao escudo: não gasta.
      if (!breakDate || !earnedAt || breakDate < earnedAt) {
        break;
      }
      usedDates = [...usedDates, breakDate].sort();
      consumedDates.push(breakDate);
      count -= 1;
    }

    const streak = calcStreak(recs, usedDates);
    const milestone = Math.floor(streak / SHIELD_STREAK_STEP);
    let earned = false;
    if (milestone < earnedMilestone) {
      // Streak quebrou de vez (sem escudo pra cobrir): o próximo marco de 7
      // dias volta a valer escudo.
      earnedMilestone = milestone;
    } else if (milestone > earnedMilestone) {
      earnedMilestone = milestone;
      if (count < MAX_SHIELDS) {
        count += 1;
        earnedAt = todayString();
        earned = true;
      }
    }

    const updated = { count, usedDates, earnedMilestone, earnedAt };
    const changed =
      consumedDates.length > 0 ||
      earned ||
      updated.earnedMilestone !== state.earnedMilestone;

    if (changed) {
      await saveStreakShield(updated);
    }

    return { ...updated, consumedDates, earned, streak };
  } catch {
    const fallback = await getStreakShield();
    return { ...fallback, consumedDates: [], earned: false, streak: 0 };
  }
}

// ─── Achievements ────────────────────────────────────────────────────────────
// Modo conta: subcoleção users/{uid}/achievements, um documento por
// conquista desbloqueada (id do documento = id da conquista). Modo
// convidado: array no AsyncStorage, como já era antes.

export async function getAchievements() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'achievements'));
      return snap.docs.map((d) => d.data());
    }
    const raw = await AsyncStorage.getItem(KEYS.ACHIEVEMENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAchievement(achievementId, unlockedAt) {
  const uid = getUid();
  try {
    const entry = { id: achievementId, unlockedAt: unlockedAt || new Date().toISOString() };
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'achievements', String(achievementId)), entry);
      return true;
    }
    const achievements = await getAchievements();
    if (!achievements.find((a) => a.id === achievementId)) {
      achievements.push(entry);
      await AsyncStorage.setItem(KEYS.ACHIEVEMENTS, JSON.stringify(achievements));
    }
    return true;
  } catch {
    return false;
  }
}

// ─── XP ──────────────────────────────────────────────────────────────────────
// O XP é derivado (ver utils/xp.js) — o que fica salvo aqui é só um snapshot
// do último valor calculado: { xp, level, levelName, updatedAt }. Serve pra
// quem precisa do XP sem carregar registros e conquistas (ex: notificações).
// Modo conta: campo "xp" no documento users/{uid}. Convidado: AsyncStorage.

export async function getXpState() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().xp ?? null : null;
    }
    const raw = await AsyncStorage.getItem(KEYS.XP);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveXpState(state) {
  const uid = getUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { xp: state }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(KEYS.XP, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Recalcula o XP a partir dos registros/conquistas/missões atuais, salva o
// snapshot e devolve { xp, level, gained }. "gained" é a diferença pro
// snapshot anterior — é o que a tela usa pra mostrar o toast de "+X XP".
export async function refreshXp(records, unlockedAchievements, completedMissions) {
  const recs = records ?? (await getRecords());
  const achievements = unlockedAchievements ?? (await getAchievements());
  const missions = completedMissions ?? (await getMissions());
  const previous = await getXpState();
  const summary = getXpSummary(recs, achievements, missions);

  await saveXpState({
    xp: summary.xp,
    level: summary.level.number,
    levelName: summary.level.name,
    updatedAt: new Date().toISOString(),
  });

  return { ...summary, gained: summary.xp - (previous?.xp ?? summary.xp) };
}

// ─── Crisis Sessions ─────────────────────────────────────────────────────────
// Cada vez que o usuário abre o modo crise ("Estou com vontade") vira uma
// sessão aqui. Modo conta: subcoleção users/{uid}/crisisSessions. Modo
// convidado: array no AsyncStorage.
//
// Shape: { id, date, time, method, durationSec, completed, outcome, note }
//   method  -> 'respiracao' | 'timer' | 'distracao' | null
//   outcome -> 'passou' | 'diminuiu' | 'usei' | null (usuário pulou o feedback)

export async function getCrisisSessions() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'crisisSessions'));
      return snap.docs.map((d) => d.data());
    }
    const raw = await AsyncStorage.getItem(KEYS.CRISIS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCrisisSession(session) {
  const uid = getUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'crisisSessions', String(session.id)), session);
      return true;
    }
    const sessions = await getCrisisSessions();
    sessions.push(session);
    await AsyncStorage.setItem(KEYS.CRISIS, JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

// ─── Missions ────────────────────────────────────────────────────────────────
// Só as missões CONCLUÍDAS ficam salvas (a lista de missões possíveis é
// código, em utils/missions.js). Id da entrada = `${missionId}_${periodKey}`,
// o que torna a gravação idempotente dentro do período. Modo conta:
// subcoleção users/{uid}/missions. Convidado: array em @vapefree_missions.
//
// Shape: { id, missionId, period, periodKey, xp, completedAt }

export async function getMissions() {
  const uid = getUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'missions'));
      return snap.docs.map((d) => d.data());
    }
    const raw = await AsyncStorage.getItem(KEYS.MISSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveMission(entry) {
  const uid = getUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'missions', String(entry.id)), entry);
      return true;
    }
    const missions = await getMissions();
    if (!missions.find((m) => m.id === entry.id)) {
      missions.push(entry);
      await AsyncStorage.setItem(KEYS.MISSIONS, JSON.stringify(missions));
    }
    return true;
  } catch {
    return false;
  }
}

// Avalia as missões do período atual, salva as que acabaram de ser concluídas
// e devolve só essas novas (pra tela mostrar o toast de XP).
export async function checkAndCompleteMissions(records, economy, crisisSessions) {
  try {
    const recs = records ?? (await getRecords());
    const eco = economy ?? (await getEconomy());
    const sessions = crisisSessions ?? (await getCrisisSessions());
    const completed = await getMissions();
    const completedIds = new Set(completed.map((m) => m.id));

    const context = buildMissionContext(recs, eco, sessions);
    const results = checkMissions(context, completed);
    const newCompletions = [];

    for (const result of results) {
      if (result.completed && !completedIds.has(result.id)) {
        const entry = {
          id: result.id,
          missionId: result.missionId,
          period: result.period,
          periodKey: result.periodKey,
          xp: result.xp,
          completedAt: result.completedAt || new Date().toISOString(),
        };
        await saveMission(entry);
        newCompletions.push(result);
      }
    }
    return newCompletions;
  } catch (e) {
    console.log('Error checking missions:', e);
    return [];
  }
}

export async function checkAndUnlockAchievements(records, economy, completedMissions, context) {
  try {
    const unlocked = await getAchievements();
    const unlockedIds = new Set(unlocked.map((u) => u.id));
    const missions = completedMissions ?? (await getMissions());
    const ctx = context ?? {
      crisisSessions: await getCrisisSessions(),
      appOpenDays: await getAppOpenDays(),
      shieldDates: (await getStreakShield()).usedDates,
    };
    const newUnlocks = [];

    const results = await checkAchievements(records, economy, unlocked, missions, ctx);
    for (const result of results) {
      if (result.unlocked && !unlockedIds.has(result.id)) {
        await saveAchievement(result.id, result.unlockedAt);
        newUnlocks.push(result);
      }
    }
    return newUnlocks;
  } catch (e) {
    console.log('Error checking achievements:', e);
    return [];
  }
}