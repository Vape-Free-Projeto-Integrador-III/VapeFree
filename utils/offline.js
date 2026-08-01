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
// users/{uid}; os seis últimos são campos do documento users/{uid} (PERFIL
// espelha os campos nome/displayName/email de uma vez só).
export const ESPELHOS = {
  REGISTROS: 'records',
  CONQUISTAS: 'achievements',
  SESSOES_DE_CRISE: 'crisisSessions',
  MISSOES: 'missions',
  APARELHO: 'device',
  META: 'goal',
  ECONOMIA: 'economy',
  XP: 'xp',
  ABERTURAS: 'appOpenDays',
  PERFIL: 'profile',
};

const PREFIXO_DE_CACHE = '@vapefree_cache_';
const PREFIXO_DE_FILA = '@vapefree_queue_';
const PREFIXO_DE_FALHAS = '@vapefree_failed_';

// Quanto tempo esperar uma escrita/leitura do Firestore antes de considerar
// que não tem rede.
const TEMPO_LIMITE_PADRAO = 8000;

// Quantas vezes tentar a mesma mutação antes de descartá-la. Serve pra erro
// permanente (regra de segurança, documento inválido): sem isso uma mutação
// impossível prenderia a fila inteira pra sempre.
const LIMITE_DE_TENTATIVAS = 5;

// Quantas falhas guardar pro aviso da UI. É só pra o usuário saber que algo
// não subiu — não precisa virar histórico infinito.
const LIMITE_DE_FALHAS_GUARDADAS = 20;

function chaveDeCache(uid, nome) {
  return `${PREFIXO_DE_CACHE}${uid}_${nome}`;
}

function chaveDeFila(uid) {
  return `${PREFIXO_DE_FILA}${uid}`;
}

function chaveDeFalhas(uid) {
  return `${PREFIXO_DE_FALHAS}${uid}`;
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

// ─── Falhas ──────────────────────────────────────────────────────────────────
//
// Mutação que estourou LIMITE_DE_TENTATIVAS sai da fila (senão prende o
// resto) mas não pode sumir calada: o usuário salvou um registro que nunca
// subiu. Vai pra cá e o OfflineBanner avisa até ele descartar.
//
// Falha: { id, tipo, colecao, docId, motivo, em }

export async function lerFalhas(uid) {
  if (!uid) return [];
  try {
    const bruto = await AsyncStorage.getItem(chaveDeFalhas(uid));
    const falhas = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(falhas) ? falhas : [];
  } catch {
    return [];
  }
}

export async function contarFalhas(uid) {
  const falhas = await lerFalhas(uid);
  return falhas.length;
}

export async function limparFalhas(uid) {
  if (!uid) return false;
  try {
    await AsyncStorage.removeItem(chaveDeFalhas(uid));
    return true;
  } catch {
    return false;
  }
}

// A drenagem também roda fora do ConnectionContext (storage.js chama
// sincronizar direto depois de cada escrita), então o contexto precisa de um
// aviso pra atualizar o banner na hora em que a falha aparece.
let ouvintesDeFalha = [];

export function assinarFalhas(aoFalhar) {
  ouvintesDeFalha.push(aoFalhar);
  return () => {
    ouvintesDeFalha = ouvintesDeFalha.filter((o) => o !== aoFalhar);
  };
}

async function registrarFalha(uid, mutacao, erro) {
  const falha = {
    id: mutacao.id,
    tipo: mutacao.tipo,
    colecao: mutacao.colecao ?? null,
    docId: mutacao.docId ?? null,
    motivo: erro?.message ?? String(erro ?? 'desconhecido'),
    em: new Date().toISOString(),
  };
  const falhas = await lerFalhas(uid);
  const atualizadas = [...falhas, falha].slice(-LIMITE_DE_FALHAS_GUARDADAS);
  try {
    await AsyncStorage.setItem(chaveDeFalhas(uid), JSON.stringify(atualizadas));
  } catch {
    // Se nem isso grava, não há o que fazer — o console.log do drenar fica.
  }
  ouvintesDeFalha.forEach((aoFalhar) => aoFalhar(atualizadas.length));
  return atualizadas.length;
}

// ─── Conexão ─────────────────────────────────────────────────────────────────

// Último estado conhecido, alimentado por assinarConexao. Evita um
// NetInfo.fetch() a cada leitura de tela.
//
// Esse cache tem que poder envelhecer: se ninguém estiver escutando o NetInfo
// (listener ainda não montou, ou já desmontou), nada mais atualiza a variável
// e o último valor valeria pra sempre — o app ficaria achando que está
// offline muito depois da rede voltar. Duas travas: o contador de assinantes
// (ao cair pra zero o valor é jogado fora) e a validade por tempo.
let conexaoConhecida = null;
let conexaoConhecidaEm = 0;
let assinantesDeConexao = 0;

// Quanto tempo o valor em cache continua valendo sem nenhum evento novo.
const VALIDADE_DA_CONEXAO = 30000;

function ehConectado(estado) {
  return Boolean(estado?.isConnected) && estado?.isInternetReachable !== false;
}

function conexaoEmCacheValida() {
  return conexaoConhecida !== null && Date.now() - conexaoConhecidaEm < VALIDADE_DA_CONEXAO;
}

export async function estaOnline() {
  if (conexaoEmCacheValida()) return conexaoConhecida;
  try {
    const online = ehConectado(await NetInfo.fetch());
    conexaoConhecida = online;
    conexaoConhecidaEm = Date.now();
    return online;
  } catch {
    // Sem informação de rede, é melhor tentar do que bloquear: o
    // comTempoLimite segura a tela se estiver mesmo offline. Não guarda em
    // cache — é chute, não leitura.
    return true;
  }
}

// Chama `aoMudar(online)` a cada mudança de conectividade. Devolve a função
// de cancelamento do listener.
export function assinarConexao(aoMudar) {
  assinantesDeConexao += 1;
  const cancelarNoNetInfo = NetInfo.addEventListener((estado) => {
    const online = ehConectado(estado);
    conexaoConhecida = online;
    conexaoConhecidaEm = Date.now();
    aoMudar(online);
  });

  let cancelado = false;
  return () => {
    if (cancelado) return;
    cancelado = true;
    cancelarNoNetInfo();
    assinantesDeConexao -= 1;
    if (assinantesDeConexao <= 0) {
      assinantesDeConexao = 0;
      // Sem ninguém escutando, o valor guardado não tem mais como se
      // atualizar: a próxima leitura vai buscar no NetInfo.
      conexaoConhecida = null;
      conexaoConhecidaEm = 0;
    }
  };
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
  if (fila.length === 0) {
    return { enviadas: 0, pendentes: 0, falhas: await contarFalhas(uid) };
  }

  if (!(await estaOnline())) {
    return { enviadas: 0, pendentes: fila.length, falhas: await contarFalhas(uid) };
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
        // Erro que não é de rede (regra de segurança, dado inválido): sai da
        // fila pra não prender o resto pra sempre, mas vai pra lista de falhas
        // — o usuário precisa saber que essa alteração não subiu.
        console.log('Mutação descartada após tentativas demais:', mutacao.tipo, mutacao.colecao, e);
        await registrarFalha(uid, mutacao, e);
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

  return { enviadas, pendentes: restante.length, falhas: await contarFalhas(uid) };
}

export function sincronizar(uid) {
  if (!uid) return Promise.resolve({ enviadas: 0, pendentes: 0, falhas: 0 });
  if (execucaoEmAndamento) return execucaoEmAndamento;

  execucaoEmAndamento = drenar(uid)
    .catch(() => ({ enviadas: 0, pendentes: 0, falhas: 0 }))
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
    chaveDeFalhas(uid),
  ];
  try {
    await AsyncStorage.multiRemove(chaves);
  } catch {
    // Cache é descartável: falhar aqui não quebra nada.
  }
}
