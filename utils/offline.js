// utils/offline.js
//
// Motor offline-first do modo conta. Quem fala com este arquivo é só
// utils/storage.js — nenhuma tela importa nada daqui (o wiring de UI usa
// context/ConnectionContext.js).
//
// Duas peças:
//
//   1. ESPELHO (cache): uma cópia local, no AsyncStorage, do que está no
//      Firestore, separada por uid. É dela que as telas leem quando não tem
//      internet — antes disso o app logado sem rede aparecia zerado, porque
//      as leituras devolviam [] no catch.
//
//   2. FILA: toda escrita do usuário logado é aplicada no espelho na hora e
//      empilhada aqui. Quando a rede volta, a fila é drenada em ordem.
//
// Por que fila própria e não o cache do Firestore: o persistentLocalCache do
// firebase JS SDK depende de IndexedDB, que não existe em React Native. Só o
// @react-native-firebase (SDK nativo) tem essa opção.
//
// Detalhe importante que motiva o comTempoLimite: offline, o setDoc do SDK
// NÃO rejeita — a promise fica pendurada pra sempre esperando o servidor. Sem
// timeout, a tela trava no "salvando" sem erro e sem sucesso.
//
// Conflito é resolvido por last-write-wins com a fila local vencendo: a
// mutação enfileirada sobrescreve o que estiver no servidor.

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

// Nomes de espelho válidos. Os quatro primeiros são subcoleções de
// users/{uid}; os quatro últimos são campos do documento users/{uid}.
export const ESPELHOS = {
  REGISTROS: 'records',
  CONQUISTAS: 'achievements',
  SESSOES_DE_CRISE: 'crisisSessions',
  MISSOES: 'missions',
  APARELHO: 'device',
  ECONOMIA: 'economy',
  XP: 'xp',
  ABERTURAS: 'appOpenDays',
};

const PREFIXO_DE_CACHE = '@vapefree_cache_';
const PREFIXO_DE_FILA = '@vapefree_queue_';

// Quanto tempo esperar uma escrita/leitura do Firestore antes de considerar
// que não tem rede.
const TEMPO_LIMITE_PADRAO = 8000;

// Quantas vezes tentar a mesma mutação antes de descartá-la. Serve pra erro
// permanente (regra de segurança, documento inválido): sem isso uma mutação
// impossível prenderia a fila inteira pra sempre.
const LIMITE_DE_TENTATIVAS = 5;

function chaveDeCache(uid, nome) {
  return `${PREFIXO_DE_CACHE}${uid}_${nome}`;
}

function chaveDeFila(uid) {
  return `${PREFIXO_DE_FILA}${uid}`;
}

// ─── Espelho ─────────────────────────────────────────────────────────────────

export async function lerCache(uid, nome, padrao = null) {
  if (!uid) return padrao;
  try {
    const bruto = await AsyncStorage.getItem(chaveDeCache(uid, nome));
    if (bruto === null) return padrao;
    const valor = JSON.parse(bruto);
    return valor === undefined ? padrao : valor;
  } catch {
    return padrao;
  }
}

// Diferente de lerCache, distingue "espelho vazio" de "espelho nunca
// preenchido" — quem escreve valor derivado (economia, XP, aberturas) precisa
// dessa diferença pra não sobrescrever a conta com um cálculo feito em cima de
// um histórico que ainda não foi carregado.
export async function temEspelho(uid, nome) {
  if (!uid) return false;
  try {
    return (await AsyncStorage.getItem(chaveDeCache(uid, nome))) !== null;
  } catch {
    return false;
  }
}

export async function escreverCache(uid, nome, valor) {
  if (!uid) return false;
  try {
    await AsyncStorage.setItem(chaveDeCache(uid, nome), JSON.stringify(valor ?? null));
    return true;
  } catch {
    return false;
  }
}

// ─── Fila ────────────────────────────────────────────────────────────────────
//
// Mutação: { id, tipo, colecao, docId, dados, tentativas }
//   tipo 'set'           -> setDoc(users/{uid}/{colecao}/{docId}, dados)
//   tipo 'delete'        -> deleteDoc(users/{uid}/{colecao}/{docId})
//   tipo 'merge_usuario' -> setDoc(users/{uid}, dados, { merge: true })

let contadorDeMutacoes = 0;

function novoIdDeMutacao() {
  contadorDeMutacoes += 1;
  return `${Date.now()}_${contadorDeMutacoes}`;
}

export async function lerFila(uid) {
  if (!uid) return [];
  try {
    const bruto = await AsyncStorage.getItem(chaveDeFila(uid));
    const fila = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(fila) ? fila : [];
  } catch {
    return [];
  }
}

async function escreverFila(uid, fila) {
  try {
    await AsyncStorage.setItem(chaveDeFila(uid), JSON.stringify(fila));
    return true;
  } catch {
    return false;
  }
}

export async function contarPendencias(uid) {
  const fila = await lerFila(uid);
  return fila.length;
}

// Tira da fila o que a nova mutação já torna obsoleto. Sem isso, ficar dias
// offline editando o mesmo registro faria a fila crescer sem limite.
function compactar(fila, nova) {
  if (nova.tipo === 'merge_usuario') {
    const camposNovos = Object.keys(nova.dados || {});
    return fila
      .map((m) => {
        if (m.tipo !== 'merge_usuario') return m;
        const restante = { ...m.dados };
        camposNovos.forEach((campo) => delete restante[campo]);
        return { ...m, dados: restante };
      })
      .filter((m) => m.tipo !== 'merge_usuario' || Object.keys(m.dados || {}).length > 0);
  }
  return fila.filter((m) => !(m.colecao === nova.colecao && m.docId === nova.docId));
}

export async function enfileirar(uid, mutacao) {
  if (!uid) return false;
  const nova = { ...mutacao, id: novoIdDeMutacao(), tentativas: 0 };
  const fila = await lerFila(uid);
  return escreverFila(uid, [...compactar(fila, nova), nova]);
}

// ─── Conexão ─────────────────────────────────────────────────────────────────

// Último estado conhecido, alimentado por assinarConexao. Evita um
// NetInfo.fetch() a cada leitura de tela.
let conexaoConhecida = null;

function ehConectado(estado) {
  return Boolean(estado?.isConnected) && estado?.isInternetReachable !== false;
}

export async function estaOnline() {
  if (conexaoConhecida !== null) return conexaoConhecida;
  try {
    return ehConectado(await NetInfo.fetch());
  } catch {
    // Sem informação de rede, é melhor tentar do que bloquear: o
    // comTempoLimite segura a tela se estiver mesmo offline.
    return true;
  }
}

// Chama `aoMudar(online)` a cada mudança de conectividade. Devolve a função
// de cancelamento do listener.
export function assinarConexao(aoMudar) {
  return NetInfo.addEventListener((estado) => {
    const online = ehConectado(estado);
    conexaoConhecida = online;
    aoMudar(online);
  });
}

// ─── Sincronização ───────────────────────────────────────────────────────────

export function comTempoLimite(promessa, ms = TEMPO_LIMITE_PADRAO) {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error('tempo_limite')), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        rejeitar(erro);
      }
    );
  });
}

function aplicarMutacao(uid, mutacao) {
  if (mutacao.tipo === 'merge_usuario') {
    return setDoc(doc(db, 'users', uid), mutacao.dados, { merge: true });
  }
  const referencia = doc(db, 'users', uid, mutacao.colecao, String(mutacao.docId));
  if (mutacao.tipo === 'delete') {
    return deleteDoc(referencia);
  }
  return setDoc(referencia, mutacao.dados);
}

// Só uma drenagem por vez. Quem chamar no meio de uma execução espera a mesma
// promise em vez de mandar as mesmas mutações duas vezes.
let execucaoEmAndamento = null;

async function drenar(uid) {
  const fila = await lerFila(uid);
  if (fila.length === 0) return { enviadas: 0, pendentes: 0 };

  if (!(await estaOnline())) {
    return { enviadas: 0, pendentes: fila.length };
  }

  const resolvidas = new Set();
  const tentativasPorId = {};
  let enviadas = 0;

  for (const mutacao of fila) {
    try {
      await comTempoLimite(aplicarMutacao(uid, mutacao));
      resolvidas.add(mutacao.id);
      enviadas += 1;
    } catch (e) {
      const tentativas = (mutacao.tentativas ?? 0) + 1;
      if (tentativas >= LIMITE_DE_TENTATIVAS) {
        // Erro que não é de rede (regra de segurança, dado inválido): descarta
        // pra não prender o resto da fila pra sempre.
        console.log('Mutação descartada após tentativas demais:', mutacao.tipo, mutacao.colecao, e);
        resolvidas.add(mutacao.id);
      } else {
        tentativasPorId[mutacao.id] = tentativas;
      }
      // Para na primeira falha: a ordem da fila importa (salvar seguido de
      // excluir o mesmo id não pode chegar trocado).
      break;
    }
  }

  // Relê a fila em vez de sobrescrever com o que foi lido no começo — pode ter
  // entrado mutação nova enquanto isso.
  const filaAtual = await lerFila(uid);
  const restante = filaAtual
    .filter((m) => !resolvidas.has(m.id))
    .map((m) => (tentativasPorId[m.id] ? { ...m, tentativas: tentativasPorId[m.id] } : m));
  await escreverFila(uid, restante);

  return { enviadas, pendentes: restante.length };
}

export function sincronizar(uid) {
  if (!uid) return Promise.resolve({ enviadas: 0, pendentes: 0 });
  if (execucaoEmAndamento) return execucaoEmAndamento;

  execucaoEmAndamento = drenar(uid)
    .catch(() => ({ enviadas: 0, pendentes: 0 }))
    .finally(() => {
      execucaoEmAndamento = null;
    });

  return execucaoEmAndamento;
}

// ─── Limpeza ─────────────────────────────────────────────────────────────────

export async function limparCacheEFila(uid) {
  if (!uid) return;
  const chaves = [
    ...Object.values(ESPELHOS).map((nome) => chaveDeCache(uid, nome)),
    chaveDeFila(uid),
  ];
  try {
    await AsyncStorage.multiRemove(chaves);
  } catch {
    // Cache é descartável: falhar aqui não quebra nada.
  }
}
