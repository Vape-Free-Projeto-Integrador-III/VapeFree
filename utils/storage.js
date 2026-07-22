// src/utils/storage.js
//
// Camada de dados do app. As funções exportadas aqui (obterRegistros,
// salvarRegistro, obterAparelho, etc.) são o único caminho de leitura/escrita
// — as telas (HomeScreen, DeviceScreen, HistoryScreen, AchievementsScreen,
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
//
// IMPORTANTE: os NOMES DOS CAMPOS gravados (date, puffs, used, triggers,
// price, totalPuffs, unlockedAt, ...) e as chaves do AsyncStorage continuam
// em inglês de propósito — já existe dado salvo com eles.

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
import { verificarConquistas, calcularStreak, calcularEstadoDeStreak } from './achievements';
import { montarContextoDeMissoes, verificarMissoes } from './missions';
import { normalizarRegistro, somarPuxadas } from './records';
import { resumoDeXp } from './xp';

export { calcularStreak, calcularEstadoDeStreak };

const CHAVES = {
  REGISTROS: '@vapefree_records',
  APARELHO: '@vapefree_device',
  ECONOMIA: '@vapefree_economy',
  CONQUISTAS: '@vapefree_achievements',
  CRISE: '@vapefree_crisis',
  MISSOES: '@vapefree_missions',
  XP: '@vapefree_xp',
  ABERTURAS: '@vapefree_app_opens',
};

// Quantos dias de abertura do app ficam guardados. 60 cobre com folga a
// maior conquista de presença diária (7 dias seguidos).
const LIMITE_DE_ABERTURAS = 60;

async function lerJson(chave, padrao) {
  try {
    const bruto = await AsyncStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

// Retorna o uid do usuário logado, ou null se estiver em modo convidado.
function obterUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}

export async function obterDadosLocaisDoConvidado() {
  const [
    registros,
    aparelho,
    economia,
    conquistas,
    sessoesDeCrise,
    missoes,
    xp,
    diasDeAbertura,
  ] = await Promise.all([
    lerJson(CHAVES.REGISTROS, []),
    lerJson(CHAVES.APARELHO, null),
    lerJson(CHAVES.ECONOMIA, {}),
    lerJson(CHAVES.CONQUISTAS, []),
    lerJson(CHAVES.CRISE, []),
    lerJson(CHAVES.MISSOES, []),
    lerJson(CHAVES.XP, null),
    lerJson(CHAVES.ABERTURAS, []),
  ]);

  return {
    registros: Array.isArray(registros) ? registros : [],
    aparelho: aparelho ?? null,
    economia: economia && typeof economia === 'object' ? economia : {},
    conquistas: Array.isArray(conquistas) ? conquistas : [],
    sessoesDeCrise: Array.isArray(sessoesDeCrise) ? sessoesDeCrise : [],
    missoes: Array.isArray(missoes) ? missoes : [],
    xp: xp && typeof xp === 'object' ? xp : null,
    diasDeAbertura: Array.isArray(diasDeAbertura) ? diasDeAbertura : [],
  };
}

export async function temDadosLocaisDoConvidado() {
  const dados = await obterDadosLocaisDoConvidado();
  return (
    dados.registros.length > 0 ||
    dados.aparelho !== null ||
    Object.keys(dados.economia).length > 0 ||
    dados.conquistas.length > 0 ||
    dados.sessoesDeCrise.length > 0 ||
    dados.missoes.length > 0
  );
}

export async function limparDadosLocaisDoConvidado() {
  await Promise.all(Object.values(CHAVES).map((chave) => AsyncStorage.removeItem(chave)));
}

async function substituirDocsDaColecao(uid, subcolecao, entradas) {
  const snap = await getDocs(collection(db, 'users', uid, subcolecao));

  await Promise.all(snap.docs.map((item) => deleteDoc(item.ref)));

  if (!Array.isArray(entradas) || entradas.length === 0) {
    return;
  }

  await Promise.all(
    entradas.map((entrada) =>
      setDoc(doc(db, 'users', uid, subcolecao, String(entrada.id)), entrada)
    )
  );
}

export async function migrarDadosDoConvidadoParaConta(uid = obterUid()) {
  if (!uid) {
    return false;
  }

  const dados = await obterDadosLocaisDoConvidado();

  await setDoc(
    doc(db, 'users', uid),
    {
      device: dados.aparelho ?? null,
      economy: dados.economia && typeof dados.economia === 'object' ? dados.economia : {},
      xp: dados.xp ?? null,
      appOpenDays: dados.diasDeAbertura,
    },
    { merge: true }
  );

  await substituirDocsDaColecao(uid, 'records', dados.registros);
  await substituirDocsDaColecao(uid, 'achievements', dados.conquistas);
  await substituirDocsDaColecao(uid, 'crisisSessions', dados.sessoesDeCrise);
  await substituirDocsDaColecao(uid, 'missions', dados.missoes);
  await limparDadosLocaisDoConvidado();
  return true;
}

// ─── Registros ──────────────────────────────────────────────────────────────
// Modo conta: subcoleção users/{uid}/records, um documento por registro
// (id do documento = id do registro). Modo convidado: array no AsyncStorage,
// como já era antes.

export async function obterRegistros() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'records'));
      return snap.docs.map((d) => d.data());
    }
    const bruto = await AsyncStorage.getItem(CHAVES.REGISTROS);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

// Janela em que dá pra criar registro: hoje ou até DIAS_PARA_TRAS_NO_REGISTRO
// dias atrás. Sem isso o usuário podia preencher anos de histórico falso e
// inflar XP/conquistas (o XP é derivado dos registros — ver utils/xp.js).
// Vale só pra criação: editar um registro antigo pela tela de histórico
// continua liberado.
export const DIAS_PARA_TRAS_NO_REGISTRO = 7;

export function datasRegistraveis() {
  return ultimosNDias(DIAS_PARA_TRAS_NO_REGISTRO + 1);
}

export function dataEhRegistravel(data) {
  return datasRegistraveis().includes(data);
}

export async function salvarRegistro(novoRegistro) {
  const uid = obterUid();
  const registro = normalizarRegistro(novoRegistro);
  if (!dataEhRegistravel(registro.date)) {
    return false;
  }
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'records', String(registro.id)), registro);
      return true;
    }
    const registros = await obterRegistros();
    registros.push(registro);
    await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(registros));
    return true;
  } catch {
    return false;
  }
}

export async function excluirRegistro(id) {
  const uid = obterUid();
  try {
    if (uid) {
      await deleteDoc(doc(db, 'users', uid, 'records', String(id)));
      return true;
    }
    const registros = await obterRegistros();
    const restantes = registros.filter((r) => r.id !== id);
    await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(restantes));
    return true;
  } catch {
    return false;
  }
}

export async function atualizarRegistro(registro) {
  const uid = obterUid();
  const registroAtualizado = normalizarRegistro(registro);
  try {
    if (uid) {
      await setDoc(
        doc(db, 'users', uid, 'records', String(registroAtualizado.id)),
        registroAtualizado
      );
      return true;
    }
    const registros = await obterRegistros();
    const indice = registros.findIndex((r) => r.id === registroAtualizado.id);
    if (indice !== -1) {
      registros[indice] = registroAtualizado;
      await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(registros));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Aparelho ───────────────────────────────────────────────────────────────
// Modo conta: campo "device" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function obterAparelho() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().device ?? null : null;
    }
    const bruto = await AsyncStorage.getItem(CHAVES.APARELHO);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export async function salvarAparelho(aparelho) {
  const uid = obterUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { device: aparelho }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(CHAVES.APARELHO, JSON.stringify(aparelho));
    return true;
  } catch {
    return false;
  }
}

// ─── Economia ───────────────────────────────────────────────────────────────
// Modo conta: campo "economy" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function obterEconomia() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().economy ?? {} : {};
    }
    const bruto = await AsyncStorage.getItem(CHAVES.ECONOMIA);
    return bruto ? JSON.parse(bruto) : {};
  } catch {
    return {};
  }
}

export async function definirEconomia(mapaDeEconomia) {
  const uid = obterUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { economy: mapaDeEconomia }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(CHAVES.ECONOMIA, JSON.stringify(mapaDeEconomia));
    return true;
  } catch {
    return false;
  }
}

// ─── Cálculo da economia ─────────────────────────────────────────────────────
// Função pura de cálculo — não muda entre conta/convidado.

export async function recalcularEconomia(registros, aparelho) {
  if (!aparelho) return {};
  const custoPorPuxada = aparelho.price / aparelho.totalPuffs;
  const metaDiaria = aparelho.totalPuffs / aparelho.days;

  // Agrupa os registros por data
  const porData = {};
  registros.forEach((r) => {
    if (!porData[r.date]) porData[r.date] = [];
    porData[r.date].push(r);
  });

  const mapaDeEconomia = {};
  Object.entries(porData).forEach(([data, registrosDoDia]) => {
    const usadasHoje = somarPuxadas(registrosDoDia);
    const naoDadas = Math.max(0, metaDiaria - usadasHoje);
    mapaDeEconomia[data] = parseFloat((naoDadas * custoPorPuxada).toFixed(2));
  });

  await definirEconomia(mapaDeEconomia);
  return mapaDeEconomia;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Funções puras (sem leitura/escrita de dados).

export function dataDeHoje() {
  return new Date().toISOString().slice(0, 10);
}

export function ultimosNDias(n) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

export function ultimasNSemanas(n) {
  const semanas = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i * 7);
    semanas.push(d.toISOString().slice(0, 10));
  }
  return semanas;
}

export function ultimosNMeses(n) {
  const meses = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push(d.toISOString().slice(0, 10));
  }
  return meses;
}

export function rotuloSemana(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  const diaDaSemana = d.getDay();
  const diff = d.getDate() - diaDaSemana + (diaDaSemana === 0 ? -6 : 1);
  const segunda = new Date(d.setDate(diff));
  return `${segunda.toISOString().slice(5, 10)}`;
}

export function rotuloMes(dataStr) {
  const d = new Date(dataStr + 'T00:00:00');
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Aberturas do app ────────────────────────────────────────────────────────
// Lista de datas 'YYYY-MM-DD' em que o app foi aberto (uma entrada por dia,
// no máximo LIMITE_DE_ABERTURAS dias). Só serve pra conquista de presença
// diária. Modo conta: campo "appOpenDays" no documento users/{uid}.
// Convidado: AsyncStorage.

export async function obterDiasDeAbertura() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      const dias = snap.exists() ? snap.data().appOpenDays : null;
      return Array.isArray(dias) ? dias : [];
    }
    const bruto = await AsyncStorage.getItem(CHAVES.ABERTURAS);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

// Marca hoje como dia aberto. Idempotente dentro do mesmo dia.
export async function registrarAberturaDoApp() {
  const uid = obterUid();
  try {
    const hoje = dataDeHoje();
    const dias = await obterDiasDeAbertura();
    if (dias.includes(hoje)) {
      return dias;
    }
    const atualizados = [...dias, hoje].sort().slice(-LIMITE_DE_ABERTURAS);

    if (uid) {
      await setDoc(doc(db, 'users', uid), { appOpenDays: atualizados }, { merge: true });
    } else {
      await AsyncStorage.setItem(CHAVES.ABERTURAS, JSON.stringify(atualizados));
    }
    return atualizados;
  } catch {
    return [];
  }
}

// ─── Conquistas ──────────────────────────────────────────────────────────────
// Modo conta: subcoleção users/{uid}/achievements, um documento por
// conquista desbloqueada (id do documento = id da conquista). Modo
// convidado: array no AsyncStorage, como já era antes.

export async function obterConquistas() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'achievements'));
      return snap.docs.map((d) => d.data());
    }
    const bruto = await AsyncStorage.getItem(CHAVES.CONQUISTAS);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

export async function salvarConquista(idDaConquista, desbloqueadaEm) {
  const uid = obterUid();
  try {
    const entrada = {
      id: idDaConquista,
      unlockedAt: desbloqueadaEm || new Date().toISOString(),
    };
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'achievements', String(idDaConquista)), entrada);
      return true;
    }
    const conquistas = await obterConquistas();
    if (!conquistas.find((c) => c.id === idDaConquista)) {
      conquistas.push(entrada);
      await AsyncStorage.setItem(CHAVES.CONQUISTAS, JSON.stringify(conquistas));
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

export async function obterEstadoDeXp() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? snap.data().xp ?? null : null;
    }
    const bruto = await AsyncStorage.getItem(CHAVES.XP);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export async function salvarEstadoDeXp(estado) {
  const uid = obterUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid), { xp: estado }, { merge: true });
      return true;
    }
    await AsyncStorage.setItem(CHAVES.XP, JSON.stringify(estado));
    return true;
  } catch {
    return false;
  }
}

// Recalcula o XP a partir dos registros/conquistas/missões atuais, salva o
// snapshot e devolve { xp, nivel, ganho }. "ganho" é a diferença pro
// snapshot anterior — é o que a tela usa pra mostrar o toast de "+X XP".
export async function atualizarXp(registros, conquistasDesbloqueadas, missoesConcluidas) {
  const regs = registros ?? (await obterRegistros());
  const conquistas = conquistasDesbloqueadas ?? (await obterConquistas());
  const missoes = missoesConcluidas ?? (await obterMissoes());
  const anterior = await obterEstadoDeXp();
  const resumo = resumoDeXp(regs, conquistas, missoes);

  await salvarEstadoDeXp({
    xp: resumo.xp,
    level: resumo.nivel.numero,
    levelName: resumo.nivel.nome,
    updatedAt: new Date().toISOString(),
  });

  return { ...resumo, ganho: resumo.xp - (anterior?.xp ?? resumo.xp) };
}

// ─── Sessões de crise ────────────────────────────────────────────────────────
// Cada vez que o usuário abre o modo crise ("Estou com vontade") vira uma
// sessão aqui. Modo conta: subcoleção users/{uid}/crisisSessions. Modo
// convidado: array no AsyncStorage.
//
// Shape: { id, date, time, method, durationSec, completed, outcome, note }
//   method  -> 'respiracao' | 'timer' | 'distracao' | null
//   outcome -> 'passou' | 'diminuiu' | 'usei' | null (usuário pulou o feedback)

export async function obterSessoesDeCrise() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'crisisSessions'));
      return snap.docs.map((d) => d.data());
    }
    const bruto = await AsyncStorage.getItem(CHAVES.CRISE);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

export async function salvarSessaoDeCrise(sessao) {
  const uid = obterUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'crisisSessions', String(sessao.id)), sessao);
      return true;
    }
    const sessoes = await obterSessoesDeCrise();
    sessoes.push(sessao);
    await AsyncStorage.setItem(CHAVES.CRISE, JSON.stringify(sessoes));
    return true;
  } catch {
    return false;
  }
}

// ─── Missões ─────────────────────────────────────────────────────────────────
// Só as missões CONCLUÍDAS ficam salvas (a lista de missões possíveis é
// código, em utils/missions.js). Id da entrada = `${missionId}_${periodKey}`,
// o que torna a gravação idempotente dentro do período. Modo conta:
// subcoleção users/{uid}/missions. Convidado: array em @vapefree_missions.
//
// Shape: { id, missionId, period, periodKey, xp, completedAt }

export async function obterMissoes() {
  const uid = obterUid();
  try {
    if (uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'missions'));
      return snap.docs.map((d) => d.data());
    }
    const bruto = await AsyncStorage.getItem(CHAVES.MISSOES);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

export async function salvarMissao(entrada) {
  const uid = obterUid();
  try {
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'missions', String(entrada.id)), entrada);
      return true;
    }
    const missoes = await obterMissoes();
    if (!missoes.find((m) => m.id === entrada.id)) {
      missoes.push(entrada);
      await AsyncStorage.setItem(CHAVES.MISSOES, JSON.stringify(missoes));
    }
    return true;
  } catch {
    return false;
  }
}

// Avalia as missões do período atual, salva as que acabaram de ser concluídas
// e devolve só essas novas (pra tela mostrar o toast de XP).
export async function verificarEConcluirMissoes(registros, economia, sessoesDeCrise) {
  try {
    const regs = registros ?? (await obterRegistros());
    const eco = economia ?? (await obterEconomia());
    const sessoes = sessoesDeCrise ?? (await obterSessoesDeCrise());
    const concluidas = await obterMissoes();
    const idsConcluidas = new Set(concluidas.map((m) => m.id));

    const contexto = montarContextoDeMissoes(regs, eco, sessoes);
    const resultados = verificarMissoes(contexto, concluidas);
    const novasConclusoes = [];

    for (const resultado of resultados) {
      if (resultado.concluida && !idsConcluidas.has(resultado.id)) {
        const entrada = {
          id: resultado.id,
          missionId: resultado.missionId,
          period: resultado.period,
          periodKey: resultado.periodKey,
          xp: resultado.xp,
          completedAt: resultado.completedAt || new Date().toISOString(),
        };
        await salvarMissao(entrada);
        novasConclusoes.push(resultado);
      }
    }
    return novasConclusoes;
  } catch (e) {
    console.log('Erro ao verificar missões:', e);
    return [];
  }
}

export async function verificarEDesbloquearConquistas(
  registros,
  economia,
  missoesConcluidas,
  contexto
) {
  try {
    const desbloqueadas = await obterConquistas();
    const idsDesbloqueadas = new Set(desbloqueadas.map((c) => c.id));
    const missoes = missoesConcluidas ?? (await obterMissoes());
    const ctx = contexto ?? {
      sessoesDeCrise: await obterSessoesDeCrise(),
      diasDeAbertura: await obterDiasDeAbertura(),
    };
    const novasDesbloqueadas = [];

    const resultados = await verificarConquistas(
      registros,
      economia,
      desbloqueadas,
      missoes,
      ctx
    );
    for (const resultado of resultados) {
      if (resultado.desbloqueada && !idsDesbloqueadas.has(resultado.id)) {
        await salvarConquista(resultado.id, resultado.desbloqueadaEm);
        novasDesbloqueadas.push(resultado);
      }
    }
    return novasDesbloqueadas;
  } catch (e) {
    console.log('Erro ao verificar conquistas:', e);
    return [];
  }
}
