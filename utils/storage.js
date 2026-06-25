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
import { checkAchievements } from './achievements';

const KEYS = {
  RECORDS: '@vapefree_records',
  DEVICE: '@vapefree_device',
  ECONOMY: '@vapefree_economy',
  ACHIEVEMENTS: '@vapefree_achievements',
};

// Retorna o uid do usuário logado, ou null se estiver em modo convidado.
function getUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
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

export async function saveRecord(record) {
  const uid = getUid();
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

export async function updateRecord(updatedRecord) {
  const uid = getUid();
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
    const usedToday = recs.reduce((sum, r) => sum + (r.puffs || 0), 0);
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

export function calcStreak(records) {
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

export async function checkAndUnlockAchievements(records, economy) {
  try {
    const unlocked = await getAchievements();
    const unlockedIds = new Set(unlocked.map((u) => u.id));
    const newUnlocks = [];

    const results = checkAchievements(records, economy);
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