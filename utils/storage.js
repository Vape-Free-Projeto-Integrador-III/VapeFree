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
// Isso é decidido olhando "auth.currentUser" no momento da chamada.
//
// No modo conta o Firestore não é acessado direto: passa pelo espelho local +
// fila de utils/offline.js. Leitura serve o espelho quando não tem rede;
// escrita aplica no espelho na hora e sobe depois. Ou seja, escrita de usuário
// logado praticamente não retorna mais falha('rede') — ela é aceita local e
// sincroniza sozinha. Ver docs/database.md.
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
import {
  ESPELHOS,
  comTempoLimite,
  enfileirar,
  escreverCache,
  estaOnline,
  lerCache,
  limparCacheEFila,
  sincronizar,
  temEspelho,
} from './offline';
import { verificarConquistas, calcularStreak, calcularEstadoDeStreak } from './achievements';
import { montarContextoDeMissoes, verificarMissoes } from './missions';
import { normalizarRegistro, somarPuxadas, metaDiaria, custoPorPuxada } from './records';
import { resumoDeXp } from './xp';
import { dataDeHoje, ultimosNDias, converterDataLocal, inicioDaSemana } from './datas';

export { calcularStreak, calcularEstadoDeStreak };

const CHAVES = {
  REGISTROS: '@vapefree_records',
  APARELHO: '@vapefree_device',
  META: '@vapefree_goal',
  ECONOMIA: '@vapefree_economy',
  CONQUISTAS: '@vapefree_achievements',
  CRISE: '@vapefree_crisis',
  MISSOES: '@vapefree_missions',
  XP: '@vapefree_xp',
  ABERTURAS: '@vapefree_app_opens',
};

// Flag do tutorial de boas-vindas. Fica FORA de CHAVES de propósito: é
// preferência do aparelho (como tema e modo convidado), não dado do usuário —
// limparDadosLocaisDoConvidado() não pode apagá-la, senão o tutorial voltaria
// a aparecer depois de um login.
const CHAVE_ONBOARDING = '@vapefree_onboarding';

// Preferência de notificação (ligada/desligada + horário do lembrete). Também
// fica fora de CHAVES: é do aparelho, não da conta — quem troca de celular
// escolhe o horário de novo, e as notificações são agendadas localmente.
const CHAVE_NOTIFICACOES = '@vapefree_notifications';

// Quantos dias de abertura do app ficam guardados. 60 cobre com folga a
// maior conquista de presença diária (7 dias seguidos).
const LIMITE_DE_ABERTURAS = 60;

// Resultado das escritas iniciadas pelo usuário (registro, aparelho, economia,
// sessão de crise). Elas não podem falhar em silêncio: a tela checa `ok` e
// mostra um toast de erro. `motivo` distingue falha de infra ('rede') de regra
// de negócio ('data_invalida', 'nao_encontrado').
// As escritas de gamificação (conquista, missão, XP, abertura) continuam
// retornando boolean — são de fundo e se reprocessam no próximo foco de tela.
const OK = { ok: true };
const falha = (motivo) => ({ ok: false, motivo });

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

// ─── Modo conta: leitura e escrita via espelho ───────────────────────────────

// Leitura do usuário logado. Tenta esvaziar a fila antes de ir no servidor —
// senão um dado remoto antigo sobrescreveria o que o usuário acabou de
// escrever offline. Com fila pendente, ou com o servidor fora do ar, serve o
// espelho local.
async function lerDaConta(uid, nome, buscarNoServidor, padrao) {
  const { pendentes } = await sincronizar(uid);
  if (pendentes > 0) {
    return lerCache(uid, nome, padrao);
  }
  try {
    const remoto = await comTempoLimite(buscarNoServidor());
    await escreverCache(uid, nome, remoto);
    return remoto;
  } catch {
    return lerCache(uid, nome, padrao);
  }
}

// Escrita do usuário logado: espelho na hora, fila depois, sincronização em
// segundo plano (sem await de propósito — a tela não pode esperar a rede).
async function escreverNaConta(uid, nome, valorNoEspelho, mutacao) {
  await escreverCache(uid, nome, valorNoEspelho);
  await enfileirar(uid, mutacao);
  sincronizar(uid);
}

// Economia, XP e dias de abertura são valores DERIVADOS que sobem inteiros
// (não são um documento por item). Se o espelho de origem ainda está frio e
// não tem rede, esse valor teria sido calculado em cima de um histórico vazio
// e apagaria o que está na conta — nesse caso é melhor não escrever nada e
// deixar a próxima leitura online refazer a conta.
async function podeEscreverDerivado(uid, nomeDeOrigem) {
  if (await temEspelho(uid, nomeDeOrigem)) return true;
  return estaOnline();
}

// Aquece o espelho logo depois do login/reconexão, pra que o app já funcione
// se o usuário ficar offline antes de abrir cada tela. Ver ConnectionContext.
export async function precarregarEspelho() {
  const uid = obterUid();
  if (!uid || !(await estaOnline())) return false;
  await Promise.all([
    obterRegistros(),
    obterConquistas(),
    obterSessoesDeCrise(),
    obterMissoes(),
    obterAparelho(),
    obterMeta(),
    obterEconomia(),
    obterEstadoDeXp(),
    obterDiasDeAbertura(),
  ]);
  return true;
}

// Chamada no logout: só descarta o espelho se não sobrou nada pra subir.
export async function descartarEspelhoDaConta(uid) {
  await limparCacheEFila(uid);
}

export async function obterDadosLocaisDoConvidado() {
  const [
    registros,
    aparelho,
    meta,
    economia,
    conquistas,
    sessoesDeCrise,
    missoes,
    xp,
    diasDeAbertura,
  ] = await Promise.all([
    lerJson(CHAVES.REGISTROS, []),
    lerJson(CHAVES.APARELHO, null),
    lerJson(CHAVES.META, null),
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
    meta: meta && typeof meta === 'object' ? meta : null,
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
    dados.meta !== null ||
    Object.keys(dados.economia).length > 0 ||
    dados.conquistas.length > 0 ||
    dados.sessoesDeCrise.length > 0 ||
    dados.missoes.length > 0
  );
}

export async function limparDadosLocaisDoConvidado() {
  await Promise.all(Object.values(CHAVES).map((chave) => AsyncStorage.removeItem(chave)));
}

// ─── Tutorial de boas-vindas ────────────────────────────────────────────────
// Sempre local (AsyncStorage), nunca vai pro Firestore: é por aparelho, e
// precisa ser lida antes de existir usuário logado.

export async function onboardingFoiConcluido() {
  try {
    return (await AsyncStorage.getItem(CHAVE_ONBOARDING)) === 'true';
  } catch {
    // Na dúvida, não mostra o tutorial de novo pra quem já usa o app.
    return true;
  }
}

export async function concluirOnboarding() {
  try {
    await AsyncStorage.setItem(CHAVE_ONBOARDING, 'true');
    return true;
  } catch {
    return false;
  }
}

// Usado pelo "ver o tutorial de novo" das Configurações. A tela de tutorial é
// aberta pela navegação; apagar a flag aqui é só pra ele voltar a aparecer na
// próxima abertura do app caso o usuário feche no meio.
export async function reiniciarOnboarding() {
  try {
    await AsyncStorage.removeItem(CHAVE_ONBOARDING);
    return true;
  } catch {
    return false;
  }
}

// ─── Preferência de notificação ─────────────────────────────────────────────
// Sempre local, como o tutorial: o agendamento é feito pelo próprio aparelho
// (expo-notifications), então não faz sentido guardar isso na conta.

export const PREFERENCIAS_DE_NOTIFICACAO_PADRAO = { ativas: true, hora: 9, minuto: 0 };

export async function obterPreferenciasDeNotificacao() {
  const salvo = await lerJson(CHAVE_NOTIFICACOES, null);
  if (!salvo || typeof salvo !== 'object') {
    return { ...PREFERENCIAS_DE_NOTIFICACAO_PADRAO };
  }
  return {
    ativas: salvo.ativas !== false,
    hora: Number.isInteger(salvo.hora) ? salvo.hora : PREFERENCIAS_DE_NOTIFICACAO_PADRAO.hora,
    minuto: Number.isInteger(salvo.minuto) ? salvo.minuto : PREFERENCIAS_DE_NOTIFICACAO_PADRAO.minuto,
  };
}

export async function salvarPreferenciasDeNotificacao(preferencias) {
  try {
    const atuais = await obterPreferenciasDeNotificacao();
    const novas = { ...atuais, ...preferencias };
    await AsyncStorage.setItem(CHAVE_NOTIFICACOES, JSON.stringify(novas));
    return novas;
  } catch {
    return null;
  }
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

// Migração é a única operação que NÃO funciona offline: ela apaga os
// documentos remotos antes de escrever os novos (substituirDocsDaColecao), e
// parar no meio disso deixaria a conta pela metade. Por isso exige rede e só
// limpa os dados locais depois que tudo subiu.
export async function migrarDadosDoConvidadoParaConta(uid = obterUid()) {
  if (!uid || !(await estaOnline())) {
    return false;
  }

  const dados = await obterDadosLocaisDoConvidado();

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        device: dados.aparelho ?? null,
        goal: dados.meta ?? null,
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
  } catch (e) {
    // Os dados locais ficam intactos de propósito: o usuário pode tentar
    // importar de novo com internet.
    console.log('Erro ao migrar dados de convidado:', e);
    return false;
  }

  // Já aquece o espelho com o que acabou de subir, pra conta nova funcionar
  // offline sem precisar de uma leitura remota antes.
  await Promise.all([
    escreverCache(uid, ESPELHOS.REGISTROS, dados.registros),
    escreverCache(uid, ESPELHOS.CONQUISTAS, dados.conquistas),
    escreverCache(uid, ESPELHOS.SESSOES_DE_CRISE, dados.sessoesDeCrise),
    escreverCache(uid, ESPELHOS.MISSOES, dados.missoes),
    escreverCache(uid, ESPELHOS.APARELHO, dados.aparelho ?? null),
    escreverCache(uid, ESPELHOS.META, dados.meta ?? null),
    escreverCache(uid, ESPELHOS.ECONOMIA, dados.economia),
    escreverCache(uid, ESPELHOS.XP, dados.xp ?? null),
    escreverCache(uid, ESPELHOS.ABERTURAS, dados.diasDeAbertura),
  ]);

  await limparDadosLocaisDoConvidado();
  return true;
}

// ─── Apagar tudo ────────────────────────────────────────────────────────────
// Zera o progresso do usuário. Como a migração, é uma operação que NÃO funciona
// offline: pra apagar as subcoleções é preciso listar o que está no servidor, e
// parar no meio deixaria a conta pela metade. Por isso exige rede.
//
// O espelho e a fila são descartados antes: qualquer escrita pendente ia subir
// depois da limpeza e ressuscitar dado que o usuário mandou apagar.

const SUBCOLECOES = ['records', 'achievements', 'crisisSessions', 'missions'];

async function apagarDocsDaColecao(uid, subcolecao) {
  const snap = await comTempoLimite(getDocs(collection(db, 'users', uid, subcolecao)));
  await Promise.all(snap.docs.map((item) => comTempoLimite(deleteDoc(item.ref))));
}

// Apaga só os DADOS da conta (registros, conquistas, crises, missões e os
// campos derivados do doc do usuário). O documento users/{uid} continua
// existindo — quem apaga ele é apagarContaNoBanco, na exclusão de conta.
async function apagarDadosDaConta(uid) {
  await limparCacheEFila(uid);

  for (const subcolecao of SUBCOLECOES) {
    await apagarDocsDaColecao(uid, subcolecao);
  }

  await comTempoLimite(
    setDoc(
      doc(db, 'users', uid),
      { device: null, goal: null, economy: {}, xp: null, appOpenDays: [] },
      { merge: true }
    )
  );

  // Deixa o espelho quente e vazio, senão a próxima leitura offline devolveria
  // o padrão neutro sem saber que o dado foi apagado de propósito.
  await Promise.all([
    escreverCache(uid, ESPELHOS.REGISTROS, []),
    escreverCache(uid, ESPELHOS.CONQUISTAS, []),
    escreverCache(uid, ESPELHOS.SESSOES_DE_CRISE, []),
    escreverCache(uid, ESPELHOS.MISSOES, []),
    escreverCache(uid, ESPELHOS.APARELHO, null),
    escreverCache(uid, ESPELHOS.META, null),
    escreverCache(uid, ESPELHOS.ECONOMIA, {}),
    escreverCache(uid, ESPELHOS.XP, null),
    escreverCache(uid, ESPELHOS.ABERTURAS, []),
  ]);
}

export async function apagarTodosOsDados() {
  const uid = obterUid();

  if (!uid) {
    try {
      await limparDadosLocaisDoConvidado();
      return OK;
    } catch {
      return falha('rede');
    }
  }

  if (!(await estaOnline())) {
    return falha('rede');
  }

  try {
    await apagarDadosDaConta(uid);
    return OK;
  } catch (e) {
    console.log('Erro ao apagar os dados da conta:', e);
    return falha('rede');
  }
}

// Limpeza que precede o deleteUser do Firebase Auth (ver screens/AccountScreen).
// Apaga os dados E o documento users/{uid}, além do espelho local.
export async function apagarContaNoBanco(uid = obterUid()) {
  if (!uid) return falha('sem_conta');
  if (!(await estaOnline())) return falha('rede');

  try {
    await apagarDadosDaConta(uid);
    await comTempoLimite(deleteDoc(doc(db, 'users', uid)));
    await limparCacheEFila(uid);
    return OK;
  } catch (e) {
    console.log('Erro ao apagar a conta no banco:', e);
    return falha('rede');
  }
}

// ─── Registros ──────────────────────────────────────────────────────────────
// Modo conta: subcoleção users/{uid}/records, um documento por registro
// (id do documento = id do registro). Modo convidado: array no AsyncStorage,
// como já era antes.

export async function obterRegistros() {
  const uid = obterUid();
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.REGISTROS,
      async () => {
        const snap = await getDocs(collection(db, 'users', uid, 'records'));
        return snap.docs.map((d) => d.data());
      },
      []
    );
  }
  return lerJson(CHAVES.REGISTROS, []);
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
    return falha('data_invalida');
  }
  try {
    if (uid) {
      const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
      await escreverNaConta(
        uid,
        ESPELHOS.REGISTROS,
        [...registros.filter((r) => r.id !== registro.id), registro],
        { tipo: 'set', colecao: 'records', docId: String(registro.id), dados: registro }
      );
      return OK;
    }
    const registros = await obterRegistros();
    registros.push(registro);
    await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(registros));
    return OK;
  } catch {
    return falha('rede');
  }
}

export async function excluirRegistro(id) {
  const uid = obterUid();
  try {
    if (uid) {
      const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
      await escreverNaConta(
        uid,
        ESPELHOS.REGISTROS,
        registros.filter((r) => r.id !== id),
        { tipo: 'delete', colecao: 'records', docId: String(id) }
      );
      return OK;
    }
    const registros = await obterRegistros();
    const restantes = registros.filter((r) => r.id !== id);
    await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(restantes));
    return OK;
  } catch {
    return falha('rede');
  }
}

export async function atualizarRegistro(registro) {
  const uid = obterUid();
  const registroAtualizado = normalizarRegistro(registro);
  try {
    if (uid) {
      const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
      await escreverNaConta(
        uid,
        ESPELHOS.REGISTROS,
        [...registros.filter((r) => r.id !== registroAtualizado.id), registroAtualizado],
        {
          tipo: 'set',
          colecao: 'records',
          docId: String(registroAtualizado.id),
          dados: registroAtualizado,
        }
      );
      return OK;
    }
    const registros = await obterRegistros();
    const indice = registros.findIndex((r) => r.id === registroAtualizado.id);
    if (indice !== -1) {
      registros[indice] = registroAtualizado;
      await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(registros));
      return OK;
    }
    return falha('nao_encontrado');
  } catch {
    return falha('rede');
  }
}

// ─── Aparelho ───────────────────────────────────────────────────────────────
// Modo conta: campo "device" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function obterAparelho() {
  const uid = obterUid();
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.APARELHO,
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? snap.data().device ?? null : null;
      },
      null
    );
  }
  return lerJson(CHAVES.APARELHO, null);
}

export async function salvarAparelho(aparelho) {
  const uid = obterUid();
  try {
    if (uid) {
      await escreverNaConta(uid, ESPELHOS.APARELHO, aparelho, {
        tipo: 'merge_usuario',
        dados: { device: aparelho },
      });
      return OK;
    }
    await AsyncStorage.setItem(CHAVES.APARELHO, JSON.stringify(aparelho));
    return OK;
  } catch {
    return falha('rede');
  }
}

// ─── Meta de redução ────────────────────────────────────────────────────────
// Modo conta: campo "goal" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage.
//
// É dado de ENTRADA (o usuário declara o objetivo), não derivado dos
// registros — por isso segue salvarAparelho e NÃO passa por
// podeEscreverDerivado como a economia. salvarMeta(null) é o "remover meta".

export async function obterMeta() {
  const uid = obterUid();
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.META,
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? snap.data().goal ?? null : null;
      },
      null
    );
  }
  return lerJson(CHAVES.META, null);
}

export async function salvarMeta(meta) {
  const uid = obterUid();
  const valor = meta ?? null;
  try {
    if (uid) {
      await escreverNaConta(uid, ESPELHOS.META, valor, {
        tipo: 'merge_usuario',
        dados: { goal: valor },
      });
      return OK;
    }
    if (valor === null) {
      await AsyncStorage.removeItem(CHAVES.META);
      return OK;
    }
    await AsyncStorage.setItem(CHAVES.META, JSON.stringify(valor));
    return OK;
  } catch {
    return falha('rede');
  }
}

// ─── Perfil da conta ────────────────────────────────────────────────────────
// Campos nome/displayName/email do documento users/{uid}. Só existe no modo
// conta — convidado não tem perfil. Recebe o uid por parâmetro porque quem
// chama é a tela de cadastro, logo depois de createUserWithEmailAndPassword,
// quando auth.currentUser ainda pode não estar propagado.

export async function salvarPerfilDaConta(uid, { nome, email }) {
  if (!uid) return falha('sem_conta');
  const perfil = { nome, displayName: nome, email };
  try {
    await escreverNaConta(uid, ESPELHOS.PERFIL, perfil, {
      tipo: 'merge_usuario',
      dados: perfil,
    });
    return OK;
  } catch {
    return falha('rede');
  }
}

// ─── Economia ───────────────────────────────────────────────────────────────
// Modo conta: campo "economy" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.

export async function obterEconomia() {
  const uid = obterUid();
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.ECONOMIA,
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? snap.data().economy ?? {} : {};
      },
      {}
    );
  }
  return lerJson(CHAVES.ECONOMIA, {});
}

export async function definirEconomia(mapaDeEconomia) {
  const uid = obterUid();
  try {
    if (uid) {
      if (!(await podeEscreverDerivado(uid, ESPELHOS.REGISTROS))) {
        return falha('rede');
      }
      await escreverNaConta(uid, ESPELHOS.ECONOMIA, mapaDeEconomia, {
        tipo: 'merge_usuario',
        dados: { economy: mapaDeEconomia },
      });
      return OK;
    }
    await AsyncStorage.setItem(CHAVES.ECONOMIA, JSON.stringify(mapaDeEconomia));
    return OK;
  } catch {
    return falha('rede');
  }
}

// ─── Cálculo da economia ─────────────────────────────────────────────────────
// Função pura de cálculo — não muda entre conta/convidado.

export async function recalcularEconomia(registros, aparelho) {
  if (!aparelho) return {};
  const custoDaPuxada = custoPorPuxada(aparelho);
  const meta = metaDiaria(aparelho);
  if (custoDaPuxada === null || meta === null) return {};

  // Agrupa os registros por data
  const porData = {};
  registros.forEach((r) => {
    if (!porData[r.date]) porData[r.date] = [];
    porData[r.date].push(r);
  });

  const mapaDeEconomia = {};
  Object.entries(porData).forEach(([data, registrosDoDia]) => {
    const usadasHoje = somarPuxadas(registrosDoDia);
    const naoDadas = Math.max(0, meta - usadasHoje);
    mapaDeEconomia[data] = parseFloat((naoDadas * custoDaPuxada).toFixed(2));
  });

  // O retorno continua sendo o mapa (as telas usam pra setState). Uma falha
  // aqui é rara — no modo conta a escrita vai pra fila e sempre dá ok — mas
  // não pode passar totalmente em branco.
  const resultado = await definirEconomia(mapaDeEconomia);
  if (!resultado.ok) {
    console.log('Não deu pra salvar a economia:', resultado.motivo);
  }
  return mapaDeEconomia;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Funções puras (sem leitura/escrita de dados).

// Datas de calendário moram em utils/datas.js (fonte única, sempre local).
// Reexportadas aqui porque as telas historicamente importam daqui.
export { dataDeHoje, ultimosNDias, ultimasNSemanas, ultimosNMeses } from './datas';

export function rotuloSemana(dataStr) {
  return inicioDaSemana(dataStr).slice(5, 10);
}

export function rotuloMes(dataStr) {
  const d = converterDataLocal(dataStr);
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
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.ABERTURAS,
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        const dias = snap.exists() ? snap.data().appOpenDays : null;
        return Array.isArray(dias) ? dias : [];
      },
      []
    );
  }
  return lerJson(CHAVES.ABERTURAS, []);
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
      if (!(await podeEscreverDerivado(uid, ESPELHOS.ABERTURAS))) {
        return dias;
      }
      await escreverNaConta(uid, ESPELHOS.ABERTURAS, atualizados, {
        tipo: 'merge_usuario',
        dados: { appOpenDays: atualizados },
      });
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
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.CONQUISTAS,
      async () => {
        const snap = await getDocs(collection(db, 'users', uid, 'achievements'));
        return snap.docs.map((d) => d.data());
      },
      []
    );
  }
  return lerJson(CHAVES.CONQUISTAS, []);
}

export async function salvarConquista(idDaConquista, desbloqueadaEm) {
  const uid = obterUid();
  try {
    const entrada = {
      id: idDaConquista,
      unlockedAt: desbloqueadaEm || new Date().toISOString(),
    };
    if (uid) {
      const conquistas = await lerCache(uid, ESPELHOS.CONQUISTAS, []);
      await escreverNaConta(
        uid,
        ESPELHOS.CONQUISTAS,
        conquistas.find((c) => c.id === idDaConquista) ? conquistas : [...conquistas, entrada],
        {
          tipo: 'set',
          colecao: 'achievements',
          docId: String(idDaConquista),
          dados: entrada,
        }
      );
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
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.XP,
      async () => {
        const snap = await getDoc(doc(db, 'users', uid));
        return snap.exists() ? snap.data().xp ?? null : null;
      },
      null
    );
  }
  return lerJson(CHAVES.XP, null);
}

export async function salvarEstadoDeXp(estado) {
  const uid = obterUid();
  try {
    if (uid) {
      if (!(await podeEscreverDerivado(uid, ESPELHOS.REGISTROS))) {
        return false;
      }
      await escreverNaConta(uid, ESPELHOS.XP, estado, {
        tipo: 'merge_usuario',
        dados: { xp: estado },
      });
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
// Só vira sessão aqui quando o usuário conta o desfecho no fim do modo crise
// ("Estou com vontade"). Se ele pular o feedback ("Agora não"), nada é salvo.
// Modo conta: subcoleção users/{uid}/crisisSessions. Modo convidado: array no
// AsyncStorage.
//
// Shape: { id, date, time, method, durationSec, completed, outcome, note }
//   method  -> 'respiracao' | 'timer' | 'distracao' | null
//   outcome -> 'passou' | 'diminuiu' | 'usei'

export async function obterSessoesDeCrise() {
  const uid = obterUid();
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.SESSOES_DE_CRISE,
      async () => {
        const snap = await getDocs(collection(db, 'users', uid, 'crisisSessions'));
        return snap.docs.map((d) => d.data());
      },
      []
    );
  }
  return lerJson(CHAVES.CRISE, []);
}

export async function salvarSessaoDeCrise(sessao) {
  const uid = obterUid();
  try {
    if (uid) {
      const sessoes = await lerCache(uid, ESPELHOS.SESSOES_DE_CRISE, []);
      await escreverNaConta(
        uid,
        ESPELHOS.SESSOES_DE_CRISE,
        [...sessoes.filter((s) => s.id !== sessao.id), sessao],
        { tipo: 'set', colecao: 'crisisSessions', docId: String(sessao.id), dados: sessao }
      );
      return OK;
    }
    const sessoes = await obterSessoesDeCrise();
    sessoes.push(sessao);
    await AsyncStorage.setItem(CHAVES.CRISE, JSON.stringify(sessoes));
    return OK;
  } catch {
    return falha('rede');
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
  if (uid) {
    return lerDaConta(
      uid,
      ESPELHOS.MISSOES,
      async () => {
        const snap = await getDocs(collection(db, 'users', uid, 'missions'));
        return snap.docs.map((d) => d.data());
      },
      []
    );
  }
  return lerJson(CHAVES.MISSOES, []);
}

export async function salvarMissao(entrada) {
  const uid = obterUid();
  try {
    if (uid) {
      const missoes = await lerCache(uid, ESPELHOS.MISSOES, []);
      await escreverNaConta(
        uid,
        ESPELHOS.MISSOES,
        missoes.find((m) => m.id === entrada.id) ? missoes : [...missoes, entrada],
        { tipo: 'set', colecao: 'missions', docId: String(entrada.id), dados: entrada }
      );
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
export async function verificarEConcluirMissoes(registros, economia, sessoesDeCrise, meta, aparelho) {
  try {
    const regs = registros ?? (await obterRegistros());
    const eco = economia ?? (await obterEconomia());
    const sessoes = sessoesDeCrise ?? (await obterSessoesDeCrise());
    const metaAtual = meta !== undefined ? meta : await obterMeta();
    const aparelhoAtual = aparelho !== undefined ? aparelho : await obterAparelho();
    const concluidas = await obterMissoes();
    const idsConcluidas = new Set(concluidas.map((m) => m.id));

    const contexto = montarContextoDeMissoes({
      registros: regs,
      economia: eco,
      sessoesDeCrise: sessoes,
      meta: metaAtual,
      aparelho: aparelhoAtual,
    });
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
      meta: await obterMeta(),
      aparelho: await obterAparelho(),
      hoje: dataDeHoje(),
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

// ─── Sincronização de gamificação ────────────────────────────────────────────
// Bloco único de "carrega dados -> conclui missões -> desbloqueia conquistas ->
// atualiza XP". Toda tela que pode gerar recompensa (Home, Register, Crisis,
// Missions) chama isto em vez de repetir a sequência — a ordem importa:
// concluir missão pode desbloquear conquista (ex: first_mission), e o XP só é
// recalculado depois das duas.
//
// Aceita dados já carregados pela tela (evita reler) e devolve tudo o que as
// telas usam, incluindo `recompensas` pronto pro mostrarRecompensas() do
// usarToast(). Nunca lança — cada etapa já engole o próprio erro.
export async function sincronizarGamificacao(entrada = {}) {
  const registros = entrada.registros ?? (await obterRegistros());
  const economia = entrada.economia ?? (await obterEconomia());
  const sessoesDeCrise = entrada.sessoesDeCrise ?? (await obterSessoesDeCrise());
  const diasDeAbertura = entrada.diasDeAbertura ?? (await obterDiasDeAbertura());
  const meta = entrada.meta !== undefined ? entrada.meta : await obterMeta();
  const aparelho = entrada.aparelho !== undefined ? entrada.aparelho : await obterAparelho();

  const novasMissoes = await verificarEConcluirMissoes(
    registros,
    economia,
    sessoesDeCrise,
    meta,
    aparelho
  );
  const missoesConcluidas = await obterMissoes();
  const novasConquistas = await verificarEDesbloquearConquistas(
    registros,
    economia,
    missoesConcluidas,
    { sessoesDeCrise, diasDeAbertura, meta, aparelho, hoje: dataDeHoje() }
  );
  const resumo = await atualizarXp(registros, null, missoesConcluidas);

  return {
    registros,
    economia,
    sessoesDeCrise,
    meta,
    aparelho,
    missoesConcluidas,
    resumo,
    recompensas: {
      conquistas: novasConquistas,
      missoes: novasMissoes,
      ganho: resumo.ganho,
    },
  };
}
