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
    deleteField,
    writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import {
    ESPELHOS,
    comTempoLimite,
    enfileirar,
    escreverCache,
    espelhoEstaCompleto,
    espelhoEstaFresco,
    esquecerLeituraFria,
    estaOnline,
    invalidarEspelho,
    lerCache,
    limparCacheEFila,
    marcarLeituraDoServidor,
    registrarLeituraFria,
    sincronizar,
} from './offline';
import { verificarConquistas, calcularStreak, calcularEstadoDeStreak } from './achievements';
import { montarContextoDeMissoes, verificarMissoes } from './missions';
import { normalizarRegistro, somarPuxadas, custoPorPuxada } from './records';
import { aparelhoEm, historicoComNovoAparelho, normalizarHistorico } from './aparelhos';
import { limiteDoDia } from './meta';
import {
    resumoDeXp,
    ID_DO_RESUMO_DE_MISSOES,
    avancarLimite,
    jaEstaNoResumo,
    limiteDoResumo,
    periodoDaEntrada,
} from './xp';
import { dataDeHoje, ultimosNDias, converterDataLocal, inicioDaSemana } from './datas';

export { calcularStreak, calcularEstadoDeStreak };

const CHAVES = {
    REGISTROS: '@vapefree_records',
    APARELHO: '@vapefree_device',
    HISTORICO_DE_APARELHOS: '@vapefree_device_history',
    META: '@vapefree_goal',
    META_DE_DINHEIRO: '@vapefree_money_goal',
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

// ─── Invalidação da gamificação ─────────────────────────────────────────────
// Conquistas, missões e XP são derivados dos dados salvos: sem escrita no meio
// (e dentro do mesmo dia e do mesmo uid) recalcular dá exatamente o mesmo
// resultado. Toda escrita que entra nesse cálculo suja a flag; quem consome é
// sincronizarGamificacao(), lá no fim do arquivo.
//
// Marcado de forma conservadora: as escritas sujam antes de saber se deram
// certo, porque sujar à toa só custa um recálculo, enquanto não sujar deixa
// conquista/missão sem desbloquear até a próxima escrita.
let gamificacaoSuja = true;
let ultimaSincronizacao = null;
// Trava de execução única do sincronizarGamificacao() — ver lá embaixo.
let sincronizacaoDeGamificacaoEmAndamento = null;

export function marcarGamificacaoSuja() {
    gamificacaoSuja = true;
}

// Memo da abertura do dia: registrarAberturaDoApp() roda a cada foco da Home
// (trocar de aba já é um foco) e é idempotente, mas sem isso cada foco pagava
// uma obterDiasDeAbertura(). Guarda uid + dia como o memo da sincronização
// acima: trocar de conta ou virar o dia derruba sozinho. Só apagar dados
// precisa limpar na mão.
let ultimaAbertura = null;

function esquecerAberturaMemoizada() {
    ultimaAbertura = null;
}

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
//
// Espelho lido do servidor há menos de VALIDADE_DO_ESPELHO também é servido
// direto (ver offline.js): toda tela recarrega no useFocusEffect, e sem isso
// trocar de aba relia a coleção inteira toda vez. Escrita local não é afetada
// — ela atualiza o espelho na hora.
async function lerDaConta(uid, nome, buscarNoServidor, padrao) {
    const { pendentes } = await sincronizar(uid);
    if (pendentes > 0) {
        return lerCache(uid, nome, padrao);
    }
    if (espelhoEstaFresco(uid, nome)) {
        return lerCache(uid, nome, padrao);
    }
    try {
        const remoto = await comTempoLimite(buscarNoServidor());
        // Espelho completo: veio do servidor. Isso apaga tanto a marca de
        // parcial quanto a de leitura fria que uma falha anterior tenha deixado.
        await escreverCache(uid, nome, remoto);
        marcarLeituraDoServidor(uid, nome);
        esquecerLeituraFria(uid, nome);
        return remoto;
    } catch {
        // Servidor fora (ou comTempoLimite estourado) COM o espelho frio ou
        // truncado: o padrão vazio que sai daqui não é o estado da conta, é só
        // a ausência de resposta. A tela recebe ele porque precisa renderizar
        // algo, mas a leitura fica marcada — é o que impede uma escrita
        // derivada de subir por cima da conta (podeEscreverDerivado) e o que
        // faz o banner avisar que a tela está incompleta.
        if (!(await espelhoEstaCompleto(uid, nome))) {
            registrarLeituraFria(uid, nome);
        }
        return lerCache(uid, nome, padrao);
    }
}

// Escrita do usuário logado: espelho na hora, fila depois, sincronização em
// segundo plano (sem await de propósito — a tela não pode esperar a rede).
//
// `parcial` diz se o valor gravado no espelho é o estado da conta ou só um
// pedaço dele — ver escreverListaNaConta.
async function escreverNaConta(uid, nome, valorNoEspelho, mutacao, parcial = false) {
    await escreverCache(uid, nome, valorNoEspelho, parcial);
    await enfileirar(uid, mutacao);
    sincronizar(uid);
}

// Escrita de LISTA (registros, conquistas, crises, missões): o valor novo do
// espelho é montado a partir do que já estava nele (`[...cache, entrada]`). Com
// o espelho frio — leitura remota que falhou num aparelho novo — isso não
// resulta na conta, e sim só no que foi escrito DEPOIS da falha. A escrita do
// usuário sobe igual (a mutação vai pra fila e o servidor não perde nada), mas
// o espelho nasce marcado como parcial, pra ninguém tratá-lo como verdade: é o
// que antes deixava o histórico truncado servir de base pra economia e pro XP.
// A primeira leitura que der certo substitui tudo e limpa a marca.
async function escreverListaNaConta(uid, nome, lista, mutacao) {
    const parcial = !(await espelhoEstaCompleto(uid, nome));
    await escreverNaConta(uid, nome, lista, mutacao, parcial);
}

// Economia, XP, dias de abertura e histórico de aparelhos são valores DERIVADOS
// que sobem INTEIROS (o merge_usuario usa mergeFields, que substitui o campo por
// completo). Calculados em cima de um histórico que não foi carregado, eles
// APAGAM o que está na conta: o mapa de economia de meses vira o mapa de um dia
// só.
//
// Estar online não prova nada — era exatamente esse o furo. Com o espelho frio
// e o getDocs estourando o comTempoLimite, obterRegistros devolve [] com o
// aparelho ONLINE, e a escrita derivada saía por cima da conta. A única prova
// de que o cálculo enxergou o histórico é o espelho de origem estar COMPLETO,
// isto é, ter vindo do servidor (nem frio, nem truncado por escrita local).
//
// Recusar aqui não perde nada: o valor é derivado, então a próxima leitura que
// der certo o recalcula igual.
async function podeEscreverDerivado(uid, nomeDeOrigem) {
    return espelhoEstaCompleto(uid, nomeDeOrigem);
}

// Aquece o espelho logo depois do login/reconexão, pra que o app já funcione
// se o usuário ficar offline antes de abrir cada tela. Ver ConnectionContext.
export async function precarregarEspelho() {
    const uid = obterUid();
    if (!uid || !(await estaOnline())) return false;
    // Roda no login e na volta da conexão: é justamente quando o espelho pode
    // estar atrás do servidor, então a validade não vale mais.
    invalidarEspelho(uid);
    await Promise.all([
        obterRegistros(),
        obterConquistas(),
        obterSessoesDeCrise(),
        obterMissoes(),
        obterAparelho(),
        obterHistoricoDeAparelhos(),
        obterMeta(),
        obterMetaDeDinheiro(),
        obterEconomia(),
        obterEstadoDeXp(),
        obterDiasDeAbertura(),
    ]);
    return true;
}

// "Puxar pra atualizar": o usuário está pedindo dado novo explicitamente, então
// a próxima leitura tem que ir no servidor mesmo dentro da validade do espelho.
// No modo convidado é no-op (não existe leitura remota).
export function forcarLeituraRemota() {
    const uid = obterUid();
    if (uid) invalidarEspelho(uid);
}

// Chamada no logout: só descarta o espelho se não sobrou nada pra subir.
export async function descartarEspelhoDaConta(uid) {
    await limparCacheEFila(uid);
}

export async function obterDadosLocaisDoConvidado() {
    const [
        registros,
        aparelho,
        historicoDeAparelhos,
        meta,
        metaDeDinheiro,
        economia,
        conquistas,
        sessoesDeCrise,
        missoes,
        xp,
        diasDeAbertura,
    ] = await Promise.all([
        lerJson(CHAVES.REGISTROS, []),
        lerJson(CHAVES.APARELHO, null),
        lerJson(CHAVES.HISTORICO_DE_APARELHOS, []),
        lerJson(CHAVES.META, null),
        lerJson(CHAVES.META_DE_DINHEIRO, null),
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
        // Convidado antigo (aparelho salvo antes do histórico existir) sobe com
        // a lista vazia — quem lê aplica o mesmo fallback de
        // obterHistoricoDeAparelhos e trata `device` como válido desde sempre.
        historicoDeAparelhos: normalizarHistorico(historicoDeAparelhos),
        meta: meta && typeof meta === 'object' ? meta : null,
        metaDeDinheiro:
            metaDeDinheiro && typeof metaDeDinheiro === 'object' ? metaDeDinheiro : null,
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
        dados.metaDeDinheiro !== null ||
        Object.keys(dados.economia).length > 0 ||
        dados.conquistas.length > 0 ||
        dados.sessoesDeCrise.length > 0 ||
        dados.missoes.length > 0
    );
}

export async function limparDadosLocaisDoConvidado() {
    marcarGamificacaoSuja();
    esquecerAberturaMemoizada();
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

// `risco`: lembrete extra agendado no horário em que as crises do usuário mais
// batem (ver horarioDeRiscoDeCrise em utils/insights.js). Só sai do papel
// quando existe crise suficiente pra apontar um período — então liga por
// padrão sem incomodar quem nunca usou o modo crise.
//
// `diaCritico`: aviso semanal no dia da semana em que o usuário mais usa (ver
// diaDeRiscoDaSemana em utils/insights.js). Mesma ideia do `risco`, só que por
// dia da semana em vez de horário — também liga por padrão porque só existe
// quando há registro suficiente pra apontar um dia.
export const PREFERENCIAS_DE_NOTIFICACAO_PADRAO = {
    ativas: true,
    hora: 9,
    minuto: 0,
    risco: true,
    diaCritico: true,
};

export async function obterPreferenciasDeNotificacao() {
    const salvo = await lerJson(CHAVE_NOTIFICACOES, null);
    if (!salvo || typeof salvo !== 'object') {
        return { ...PREFERENCIAS_DE_NOTIFICACAO_PADRAO };
    }
    return {
        ativas: salvo.ativas !== false,
        hora: Number.isInteger(salvo.hora) ? salvo.hora : PREFERENCIAS_DE_NOTIFICACAO_PADRAO.hora,
        minuto: Number.isInteger(salvo.minuto)
            ? salvo.minuto
            : PREFERENCIAS_DE_NOTIFICACAO_PADRAO.minuto,
        risco: salvo.risco !== false,
        diaCritico: salvo.diaCritico !== false,
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

// Limite duro do Firestore: um writeBatch aceita no máximo 500 operações.
const OPERACOES_POR_LOTE = 500;

// Executa `operacoes` (cada uma recebe o lote e agenda um set/delete nele) em
// batches de 500, commitando um por vez. Cada commit é atômico: se falhar no
// meio, o lote inteiro não vale — sobra dado consistente, não meio documento.
async function executarEmLotes(operacoes) {
    for (let i = 0; i < operacoes.length; i += OPERACOES_POR_LOTE) {
        const lote = writeBatch(db);
        for (const agendar of operacoes.slice(i, i + OPERACOES_POR_LOTE)) {
            agendar(lote);
        }
        await comTempoLimite(lote.commit());
    }
}

// Deixa a subcoleção com exatamente `entradas`. A ORDEM importa: escreve o novo
// ANTES de apagar o velho. Falhar no meio deixa dado a mais (o velho que ainda
// não saiu), nunca dado a menos — e o usuário pode tentar de novo. O contrário
// (apagar primeiro) perde tudo se a rede cair entre as duas fases.
async function substituirDocsDaColecao(uid, subcolecao, entradas) {
    const snap = await comTempoLimite(getDocs(collection(db, 'users', uid, subcolecao)));

    const novas = Array.isArray(entradas) ? entradas : [];
    const idsNovos = new Set(novas.map((entrada) => String(entrada.id)));

    await executarEmLotes(
        novas.map(
            (entrada) => (lote) =>
                lote.set(doc(db, 'users', uid, subcolecao, String(entrada.id)), entrada)
        )
    );

    // Só o que não foi reescrito acima: apagar um id que acabou de subir
    // desfaria a escrita.
    const obsoletos = snap.docs.filter((item) => !idsNovos.has(item.id));
    await executarEmLotes(obsoletos.map((item) => (lote) => lote.delete(item.ref)));
}

// Sobrepõe TUDO o que a conta tem com `dados` (mesmo formato de
// obterDadosLocaisDoConvidado). Usado pela migração de convidado e pela
// importação de backup — as duas únicas escritas em massa do app.
//
// NÃO funciona offline: precisa listar o que já existe no servidor pra sobrepor
// as subcoleções (substituirDocsDaColecao). Falha no meio deixa dado a mais no
// servidor, nunca a menos — a próxima tentativa reescreve e limpa o resto. Toda
// operação passa por comTempoLimite: se a rede cair depois do estaOnline(), o
// SDK não rejeita e a tela que chamou ficaria presa pra sempre — o timeout vira
// falha.
async function escreverTudoNaConta(uid, dados) {
    try {
        await comTempoLimite(
            setDoc(
                doc(db, 'users', uid),
                {
                    device: dados.aparelho ?? null,
                    deviceHistory: dados.historicoDeAparelhos,
                    goal: dados.meta ?? null,
                    moneyGoal: dados.metaDeDinheiro ?? null,
                    economy:
                        dados.economia && typeof dados.economia === 'object' ? dados.economia : {},
                    xp: dados.xp ?? null,
                    appOpenDays: dados.diasDeAbertura,
                },
                { merge: true }
            )
        );

        await substituirDocsDaColecao(uid, 'records', dados.registros);
        await substituirDocsDaColecao(uid, 'achievements', dados.conquistas);
        await substituirDocsDaColecao(uid, 'crisisSessions', dados.sessoesDeCrise);
        await substituirDocsDaColecao(uid, 'missions', dados.missoes);
    } catch (e) {
        console.log('Erro ao escrever os dados na conta:', e);
        return false;
    }

    // Já aquece o espelho com o que acabou de subir, pra conta funcionar
    // offline sem precisar de uma leitura remota antes.
    await Promise.all([
        escreverCache(uid, ESPELHOS.REGISTROS, dados.registros),
        escreverCache(uid, ESPELHOS.CONQUISTAS, dados.conquistas),
        escreverCache(uid, ESPELHOS.SESSOES_DE_CRISE, dados.sessoesDeCrise),
        escreverCache(uid, ESPELHOS.MISSOES, dados.missoes),
        escreverCache(uid, ESPELHOS.APARELHO, dados.aparelho ?? null),
        escreverCache(uid, ESPELHOS.HISTORICO_DE_APARELHOS, dados.historicoDeAparelhos),
        escreverCache(uid, ESPELHOS.META, dados.meta ?? null),
        escreverCache(uid, ESPELHOS.META_DE_DINHEIRO, dados.metaDeDinheiro ?? null),
        escreverCache(uid, ESPELHOS.ECONOMIA, dados.economia),
        escreverCache(uid, ESPELHOS.XP, dados.xp ?? null),
        escreverCache(uid, ESPELHOS.ABERTURAS, dados.diasDeAbertura),
    ]);

    return true;
}

// Só limpa os dados locais depois que tudo subiu: falhar antes disso deixa o
// convidado com o histórico intacto pra tentar de novo com internet.
export async function migrarDadosDoConvidadoParaConta(uid = obterUid()) {
    if (!uid || !(await estaOnline())) {
        return false;
    }

    const dados = await obterDadosLocaisDoConvidado();

    if (!(await escreverTudoNaConta(uid, dados))) {
        return false;
    }

    await limparDadosLocaisDoConvidado();
    return true;
}

// Grava um conjunto completo de dados por cima do que existe hoje — é o caminho
// de escrita da importação de backup (utils/importacao.js). Sobrepõe, não
// mistura: o que estava salvo e não veio no backup some.
//
// `dados` vem no formato de obterDadosLocaisDoConvidado(); quem monta ele é
// quem valida (a importação normaliza o JSON antes de chegar aqui).
export async function substituirTodosOsDados(dados) {
    const uid = obterUid();
    marcarGamificacaoSuja();
    esquecerAberturaMemoizada();

    if (!uid) {
        try {
            await Promise.all([
                AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(dados.registros)),
                AsyncStorage.setItem(CHAVES.APARELHO, JSON.stringify(dados.aparelho ?? null)),
                AsyncStorage.setItem(
                    CHAVES.HISTORICO_DE_APARELHOS,
                    JSON.stringify(dados.historicoDeAparelhos)
                ),
                AsyncStorage.setItem(CHAVES.META, JSON.stringify(dados.meta ?? null)),
                AsyncStorage.setItem(
                    CHAVES.META_DE_DINHEIRO,
                    JSON.stringify(dados.metaDeDinheiro ?? null)
                ),
                AsyncStorage.setItem(CHAVES.ECONOMIA, JSON.stringify(dados.economia)),
                AsyncStorage.setItem(CHAVES.CONQUISTAS, JSON.stringify(dados.conquistas)),
                AsyncStorage.setItem(CHAVES.CRISE, JSON.stringify(dados.sessoesDeCrise)),
                AsyncStorage.setItem(CHAVES.MISSOES, JSON.stringify(dados.missoes)),
                AsyncStorage.setItem(CHAVES.XP, JSON.stringify(dados.xp ?? null)),
                AsyncStorage.setItem(CHAVES.ABERTURAS, JSON.stringify(dados.diasDeAbertura)),
            ]);
            return OK;
        } catch (e) {
            console.log('Erro ao importar os dados no modo convidado:', e);
            return falha('falhou');
        }
    }

    if (!(await estaOnline())) {
        return falha('rede');
    }

    // A fila pendente é de escritas do estado ANTIGO: deixá-la subir depois da
    // importação ressuscitaria dado que o backup acabou de substituir.
    await limparCacheEFila(uid);

    return (await escreverTudoNaConta(uid, dados)) ? OK : falha('rede');
}

// A conta já tem progresso salvo? Usado no login pra saber se importar os dados
// de convidado vai SOBREPOR algo (ver escreverTudoNaConta) — é o que muda o
// texto da pergunta. Só faz sentido chamar com o usuário JÁ logado.
//
// Devolve { ok, temDados }: `ok: false` é "NÃO DEU PRA CONFERIR", que é
// diferente de conta vazia e o login é obrigado a tratar separado. Antes essa
// distinção não existia e custava dado do usuário: a função lia pelas funções
// normais, que caem no espelho local quando o servidor falha ou estoura o
// comTempoLimite — num aparelho novo o espelho está vazio, então uma leitura
// que só FALHOU virava "conta vazia", o modal oferecia importar sem avisar da
// sobreposição e substituirDocsDaColecao apagava o histórico da nuvem.
//
// Por isso aqui a leitura é direta no Firestore, sem passar por lerDaConta: o
// fallback pro espelho é justamente o que não pode acontecer nesta pergunta.
export async function contaTemDados() {
    const uid = obterUid();
    if (!uid) return { ok: true, temDados: false };

    if (!(await estaOnline())) {
        return { ok: false, temDados: false };
    }

    // Fila pendente = escrita local que ainda não subiu; o servidor sozinho não
    // é a verdade completa da conta, então também não dá pra afirmar nada.
    const { pendentes } = await sincronizar(uid);
    if (pendentes > 0) {
        return { ok: false, temDados: false };
    }

    try {
        const [perfil, ...colecoes] = await Promise.all([
            comTempoLimite(getDoc(doc(db, 'users', uid))),
            ...SUBCOLECOES.map((subcolecao) =>
                comTempoLimite(getDocs(collection(db, 'users', uid, subcolecao)))
            ),
        ]);

        const dados = perfil.exists() ? (perfil.data() ?? {}) : {};

        return {
            ok: true,
            temDados:
                colecoes.some((snap) => snap.docs.length > 0) ||
                (dados.device ?? null) !== null ||
                (dados.goal ?? null) !== null ||
                (dados.moneyGoal ?? null) !== null ||
                (dados.xp ?? null) !== null ||
                Object.keys(dados.economy ?? {}).length > 0,
        };
    } catch (e) {
        console.log('Erro ao conferir se a conta tem dados:', e);
        return { ok: false, temDados: false };
    }
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
    await executarEmLotes(snap.docs.map((item) => (lote) => lote.delete(item.ref)));
}

// Apaga só os DADOS da conta (registros, conquistas, crises, missões e os
// campos derivados do doc do usuário). O documento users/{uid} continua
// existindo — quem apaga ele é apagarContaNoBanco, na exclusão de conta.
async function apagarDadosDaConta(uid) {
    marcarGamificacaoSuja();
    esquecerAberturaMemoizada();
    await limparCacheEFila(uid);

    for (const subcolecao of SUBCOLECOES) {
        await apagarDocsDaColecao(uid, subcolecao);
    }

    // `economy` é um MAP e o merge do Firestore é profundo: escrever `{}` nele
    // seria no-op e as chaves de data antigas sobreviveriam no servidor —
    // voltariam inteiras na próxima leitura online em outro aparelho. Só
    // deleteField() apaga o campo de verdade. Os outros são escalar/array, que
    // o merge substitui normalmente.
    await comTempoLimite(
        setDoc(
            doc(db, 'users', uid),
            {
                device: null,
                deviceHistory: [],
                goal: null,
                moneyGoal: null,
                economy: deleteField(),
                xp: null,
                appOpenDays: [],
            },
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
        escreverCache(uid, ESPELHOS.HISTORICO_DE_APARELHOS, []),
        escreverCache(uid, ESPELHOS.META, null),
        escreverCache(uid, ESPELHOS.META_DE_DINHEIRO, null),
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

// Um registro por dia é regra do app, mas a conta pode acabar com DOIS
// documentos da mesma `date`: escrita offline com espelho frio (login novo,
// cache limpo) não enxerga o registro daquele dia que só existe no servidor,
// então não tem como enfileirar o delete dele — e os dois sobem. Somados na
// Home isso vira puxada dobrada, economia errada e XP inflado.
//
// Por isso a leitura online reconcilia: por dia fica o de `id` maior (o id vem
// de Date.now() na criação, então o maior é o mais recente — a intenção mais
// nova do usuário) e os perdedores viram delete na fila.
function reconciliarRegistrosDoDia(registros) {
    const vencedorPorDia = new Map();
    for (const registro of registros) {
        const atual = vencedorPorDia.get(registro.date);
        if (!atual || Number(registro.id ?? 0) > Number(atual.id ?? 0)) {
            vencedorPorDia.set(registro.date, registro);
        }
    }
    const vencedores = [...vencedorPorDia.values()];
    return { registros: vencedores, duplicados: registros.filter((r) => !vencedores.includes(r)) };
}

export async function obterRegistros() {
    const uid = obterUid();
    if (uid) {
        return lerDaConta(
            uid,
            ESPELHOS.REGISTROS,
            async () => {
                const snap = await getDocs(collection(db, 'users', uid, 'records'));
                const { registros, duplicados } = reconciliarRegistrosDoDia(
                    snap.docs.map((d) => d.data())
                );
                // Só chega aqui com a fila vazia (lerDaConta serve o espelho
                // quando tem pendência), então o delete não atropela escrita
                // do usuário esperando pra subir.
                for (const duplicado of duplicados) {
                    await enfileirar(uid, {
                        tipo: 'delete',
                        colecao: 'records',
                        docId: String(duplicado.id),
                    });
                }
                if (duplicados.length > 0) sincronizar(uid);
                return registros;
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
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
            // Registro antigo do mesmo dia sai junto: como o id vem de Date.now(),
            // o doc velho tem outro docId e precisa de um delete próprio na fila,
            // senão volta na próxima leitura online.
            const antigosDoDia = registros.filter(
                (r) => r.date === registro.date && r.id !== registro.id
            );
            for (const antigo of antigosDoDia) {
                await enfileirar(uid, {
                    tipo: 'delete',
                    colecao: 'records',
                    docId: String(antigo.id),
                });
            }
            await escreverListaNaConta(
                uid,
                ESPELHOS.REGISTROS,
                [
                    ...registros.filter((r) => r.id !== registro.id && r.date !== registro.date),
                    registro,
                ],
                { tipo: 'set', colecao: 'records', docId: String(registro.id), dados: registro }
            );
            return OK;
        }
        const registros = await obterRegistros();
        const restantes = registros.filter((r) => r.date !== registro.date);
        restantes.push(registro);
        await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(restantes));
        return OK;
    } catch {
        return falha('rede');
    }
}

export async function excluirRegistro(id) {
    const uid = obterUid();
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
            await escreverListaNaConta(
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
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const registros = await lerCache(uid, ESPELHOS.REGISTROS, []);
            // Mesma regra de um-registro-por-dia do salvarRegistro: se a edição
            // moveu o registro pra um dia que já tinha outro, o outro sai (e o doc
            // dele precisa de um delete próprio na fila).
            const antigosDoDia = registros.filter(
                (r) => r.date === registroAtualizado.date && r.id !== registroAtualizado.id
            );
            for (const antigo of antigosDoDia) {
                await enfileirar(uid, {
                    tipo: 'delete',
                    colecao: 'records',
                    docId: String(antigo.id),
                });
            }
            await escreverListaNaConta(
                uid,
                ESPELHOS.REGISTROS,
                [
                    ...registros.filter(
                        (r) => r.id !== registroAtualizado.id && r.date !== registroAtualizado.date
                    ),
                    registroAtualizado,
                ],
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
        if (!registros.some((r) => r.id === registroAtualizado.id)) {
            return falha('nao_encontrado');
        }
        const restantes = registros.filter(
            (r) => r.id !== registroAtualizado.id && r.date !== registroAtualizado.date
        );
        restantes.push(registroAtualizado);
        await AsyncStorage.setItem(CHAVES.REGISTROS, JSON.stringify(restantes));
        return OK;
    } catch {
        return falha('rede');
    }
}

// ─── Aparelho ───────────────────────────────────────────────────────────────
// Modo conta: campo "device" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage, como já era antes.
//
// `device` é sempre o aparelho ATUAL — é ele que a UI inteira lê. Ao lado dele
// mora `deviceHistory`, a lista de aparelhos com vigência que a economia usa
// pra precificar cada dia com o aparelho daquela data (ver utils/aparelhos.js).

export async function obterAparelho() {
    const uid = obterUid();
    if (uid) {
        return lerDaConta(
            uid,
            ESPELHOS.APARELHO,
            async () => {
                const snap = await getDoc(doc(db, 'users', uid));
                return snap.exists() ? (snap.data().device ?? null) : null;
            },
            null
        );
    }
    return lerJson(CHAVES.APARELHO, null);
}

// Histórico de aparelhos, em ordem cronológica. Quem nunca trocou de aparelho
// depois dessa feature não tem o campo salvo: nesse caso o aparelho atual vira
// a entrada única, SEM `desde` — ou seja, valendo pra todo o passado, que é
// exatamente o comportamento que o app já tinha.
export async function obterHistoricoDeAparelhos() {
    const uid = obterUid();
    let historico;
    if (uid) {
        historico = await lerDaConta(
            uid,
            ESPELHOS.HISTORICO_DE_APARELHOS,
            async () => {
                const snap = await getDoc(doc(db, 'users', uid));
                return snap.exists() ? (snap.data().deviceHistory ?? []) : [];
            },
            []
        );
    } else {
        historico = await lerJson(CHAVES.HISTORICO_DE_APARELHOS, []);
    }

    const lista = normalizarHistorico(historico);
    if (lista.length > 0) return lista;

    const aparelho = await obterAparelho();
    return normalizarHistorico(aparelho ? [{ ...aparelho }] : []);
}

export async function salvarAparelho(aparelho) {
    const uid = obterUid();
    marcarGamificacaoSuja();
    try {
        // O histórico é lido ANTES da escrita do aparelho: depois dela o
        // fallback de obterHistoricoDeAparelhos já devolveria o aparelho novo
        // como se ele valesse desde sempre, apagando a vigência do anterior.
        const historico = historicoComNovoAparelho(
            await obterHistoricoDeAparelhos(),
            aparelho,
            dataDeHoje()
        );

        if (uid) {
            await escreverNaConta(uid, ESPELHOS.APARELHO, aparelho, {
                tipo: 'merge_usuario',
                dados: { device: aparelho },
            });
            // Segunda escrita, mesma fila: offline as duas sobem juntas quando
            // a rede voltar.
            //
            // O histórico é DERIVADO do que já estava salvo (a vigência antiga
            // vem da leitura acima) e sobe inteiro: montado em cima de uma
            // leitura que falhou, ele apagaria a vigência de todos os aparelhos
            // anteriores — e aí a economia do passado seria recalculada com o
            // preço do vape de agora. Sem espelho de origem confiável, só o
            // `device` (que o usuário acabou de digitar, e vale por si) sobe; a
            // vigência entra na próxima vez, já com o histórico carregado.
            if (await podeEscreverDerivado(uid, ESPELHOS.HISTORICO_DE_APARELHOS)) {
                await escreverNaConta(uid, ESPELHOS.HISTORICO_DE_APARELHOS, historico, {
                    tipo: 'merge_usuario',
                    dados: { deviceHistory: historico },
                });
            }
            return OK;
        }
        await AsyncStorage.setItem(CHAVES.APARELHO, JSON.stringify(aparelho));
        await AsyncStorage.setItem(CHAVES.HISTORICO_DE_APARELHOS, JSON.stringify(historico));
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
                return snap.exists() ? (snap.data().goal ?? null) : null;
            },
            null
        );
    }
    return lerJson(CHAVES.META, null);
}

export async function salvarMeta(meta) {
    const uid = obterUid();
    const valor = meta ?? null;
    marcarGamificacaoSuja();
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

// ─── Meta de dinheiro ───────────────────────────────────────────────────────
// Modo conta: campo "moneyGoal" dentro do documento users/{uid}.
// Modo convidado: AsyncStorage.
//
// Irmã da meta de redução, e igualmente dado de ENTRADA — mesmo padrão, sem
// podeEscreverDerivado. As duas são independentes de propósito: remover uma não
// mexe na outra. Salvar esta NÃO recalcula a economia, porque ela não é limite
// de puxadas — só um alvo pro que já ficou no bolso.

export async function obterMetaDeDinheiro() {
    const uid = obterUid();
    if (uid) {
        return lerDaConta(
            uid,
            ESPELHOS.META_DE_DINHEIRO,
            async () => {
                const snap = await getDoc(doc(db, 'users', uid));
                return snap.exists() ? (snap.data().moneyGoal ?? null) : null;
            },
            null
        );
    }
    return lerJson(CHAVES.META_DE_DINHEIRO, null);
}

export async function salvarMetaDeDinheiro(metaDeDinheiro) {
    const uid = obterUid();
    const valor = metaDeDinheiro ?? null;
    marcarGamificacaoSuja();
    try {
        if (uid) {
            await escreverNaConta(uid, ESPELHOS.META_DE_DINHEIRO, valor, {
                tipo: 'merge_usuario',
                dados: { moneyGoal: valor },
            });
            return OK;
        }
        if (valor === null) {
            await AsyncStorage.removeItem(CHAVES.META_DE_DINHEIRO);
            return OK;
        }
        await AsyncStorage.setItem(CHAVES.META_DE_DINHEIRO, JSON.stringify(valor));
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
                return snap.exists() ? (snap.data().economy ?? {}) : {};
            },
            {}
        );
    }
    return lerJson(CHAVES.ECONOMIA, {});
}

export async function definirEconomia(mapaDeEconomia) {
    const uid = obterUid();
    marcarGamificacaoSuja();
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

// O limite de cada dia sai de limiteDoDia() (utils/meta.js): a meta declarada
// pelo usuário ganha da meta do aparelho a partir do startDate dela; antes
// disso o dia continua valendo pelo aparelho. `meta` é opcional — sem ela a
// função lê a atual, então quem não tem a meta em mãos chama com dois
// argumentos, como antes.
//
// Cada dia é precificado pelo aparelho que valia NAQUELA data (aparelhoEm, em
// utils/aparelhos.js), não pelo atual: senão cadastrar um vape mais caro
// reescreveria a economia do passado inteiro. `historico` também é opcional —
// sem ele a função lê o atual, pelo mesmo motivo do `meta`.
export async function recalcularEconomia(registros, aparelho, meta, historico) {
    if (!aparelho) return {};
    // Aparelho sem preço/total não precifica nada — nem o dia de hoje, nem o
    // passado (o histórico descarta entrada assim). Mapa vazio, como antes.
    if (custoPorPuxada(aparelho) === null) return {};
    const metaAtual = meta !== undefined ? meta : await obterMeta();
    const historicoAtual =
        historico !== undefined
            ? normalizarHistorico(historico)
            : await obterHistoricoDeAparelhos();

    // Agrupa os registros por data
    const porData = {};
    registros.forEach((r) => {
        if (!porData[r.date]) porData[r.date] = [];
        porData[r.date].push(r);
    });

    const mapaDeEconomia = {};
    Object.entries(porData).forEach(([data, registrosDoDia]) => {
        const usadasHoje = somarPuxadas(registrosDoDia);
        const aparelhoDoDia = aparelhoEm(historicoAtual, data) ?? aparelho;
        const custoDaPuxada = custoPorPuxada(aparelhoDoDia);
        // Sem limite nenhum pro dia não dá pra saber quanto foi poupado.
        const limite = limiteDoDia(metaAtual, aparelhoDoDia, data);
        const naoDadas = limite === null ? 0 : Math.max(0, limite - usadasHoje);
        mapaDeEconomia[data] =
            custoDaPuxada === null ? 0 : parseFloat((naoDadas * custoDaPuxada).toFixed(2));
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
    const meses = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
    ];
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
        if (ultimaAbertura !== null && ultimaAbertura.uid === uid && ultimaAbertura.dia === hoje) {
            return ultimaAbertura.dias;
        }
        const dias = await obterDiasDeAbertura();
        if (dias.includes(hoje)) {
            ultimaAbertura = { uid, dia: hoje, dias };
            return dias;
        }
        const atualizados = [...dias, hoje].sort().slice(-LIMITE_DE_ABERTURAS);
        marcarGamificacaoSuja();

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
        ultimaAbertura = { uid, dia: hoje, dias: atualizados };
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
            await escreverListaNaConta(
                uid,
                ESPELHOS.CONQUISTAS,
                conquistas.find((c) => c.id === idDaConquista)
                    ? conquistas
                    : [...conquistas, entrada],
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
                return snap.exists() ? (snap.data().xp ?? null) : null;
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
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const sessoes = await lerCache(uid, ESPELHOS.SESSOES_DE_CRISE, []);
            await escreverListaNaConta(
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

// Edição pela tela de histórico de crises: o usuário só muda desfecho e nota
// (o resto — data, método, duração — é medido pelo app, não digitado).
export async function atualizarSessaoDeCrise(sessao) {
    const uid = obterUid();
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const sessoes = await lerCache(uid, ESPELHOS.SESSOES_DE_CRISE, []);
            await escreverListaNaConta(
                uid,
                ESPELHOS.SESSOES_DE_CRISE,
                [...sessoes.filter((s) => s.id !== sessao.id), sessao],
                { tipo: 'set', colecao: 'crisisSessions', docId: String(sessao.id), dados: sessao }
            );
            return OK;
        }
        const sessoes = await obterSessoesDeCrise();
        if (!sessoes.some((s) => s.id === sessao.id)) {
            return falha('nao_encontrado');
        }
        const atualizadas = sessoes.map((s) => (s.id === sessao.id ? sessao : s));
        await AsyncStorage.setItem(CHAVES.CRISE, JSON.stringify(atualizadas));
        return OK;
    } catch {
        return falha('rede');
    }
}

export async function excluirSessaoDeCrise(id) {
    const uid = obterUid();
    marcarGamificacaoSuja();
    try {
        if (uid) {
            const sessoes = await lerCache(uid, ESPELHOS.SESSOES_DE_CRISE, []);
            await escreverListaNaConta(
                uid,
                ESPELHOS.SESSOES_DE_CRISE,
                sessoes.filter((s) => s.id !== id),
                { tipo: 'delete', colecao: 'crisisSessions', docId: String(id) }
            );
            return OK;
        }
        const sessoes = await obterSessoesDeCrise();
        await AsyncStorage.setItem(
            CHAVES.CRISE,
            JSON.stringify(sessoes.filter((s) => s.id !== id))
        );
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
//
// ─── Resumo dos períodos fechados ───────────────────────────────────────────
// Guardar uma entrada por missão por período cresce sem teto (~3 diárias x 365
// + ~6 semanais x 52 ≈ 1400 documentos/ano), e TODAS eram lidas em toda
// sincronização. Só que de período fechado ninguém usa mais nada além do `xp`:
// `verificarMissoes` só olha as chaves do período atual.
//
// Então, quando o período vira, as entradas fechadas são trocadas por UMA
// entrada de resumo, com id fixo `_resumo`:
//
//   { id: '_resumo', summary: true, xp, count, until, updatedAt }
//     xp    -> soma do xp de todas as missões já consolidadas
//     count -> quantas foram
//     until -> { daily, weekly }: maior periodKey já contado DE CADA TIPO
//              (trava contra contar duas vezes). São dois valores porque a
//              periodKey da diária é um dia qualquer e a da semanal é a
//              segunda-feira da semana: com uma marca só, as diárias fechando
//              todo dia passavam por cima da semanal ainda aberta e comiam o
//              xp dela. Resumo antigo com `until` string é convertido na
//              leitura por limiteDoResumo (utils/xp.js).
//
// Ela viaja junto com as outras na lista de obterMissoes() de propósito: como
// tem `xp`, `calcularXp` (utils/xp.js) soma o resumo e ignora a entrada crua
// que já esteja coberta pelo `until`; como nenhum `missionId_periodKey` colide
// com `_resumo`, `verificarMissoes` a ignora.
// Cuidado: por isso `missoesConcluidas.length` NÃO é o número de missões
// concluídas (a conquista `first_mission` só pergunta se é >= 1, o que continua
// certo — o resumo só existe se houve pelo menos uma).
// O id vem de utils/xp.js (lá é que a soma precisa reconhecer o resumo).

function ehResumoDeMissoes(entrada) {
    return entrada?.id === ID_DO_RESUMO_DE_MISSOES;
}

// Aberto = o período da entrada ainda é o corrente. Cada tipo tem o seu: a
// diária fecha na virada do dia, a semanal na virada da semana.
//
// Comparar a periodKey contra as duas pontas de uma vez (o que era feito aqui
// antes) deixava a DIÁRIA de segunda-feira "aberta" a semana inteira, porque a
// periodKey dela é igual à da semana. Só a entrada antiga que não tem `period`
// continua nesse critério frouxo: sem saber o tipo, é o que evita fechá-la
// cedo demais.
function periodoEstaAberto(entrada, hoje) {
    const periodo = periodoDaEntrada(entrada);
    if (periodo === 'weekly') return entrada.periodKey === inicioDaSemana(hoje);
    if (periodo === 'daily') return entrada.periodKey === hoje;
    return entrada.periodKey === hoje || entrada.periodKey === inicioDaSemana(hoje);
}

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
            await escreverListaNaConta(
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

// Troca as entradas de período fechado pela entrada de resumo (ver o bloco
// acima) e devolve a lista já consolidada — quem chama aproveita o retorno em
// vez de reler. Roda dentro de sincronizarGamificacao, então na prática
// acontece no máximo uma vez por dia; quem já está consolidado não paga nada.
// Nunca lança: na dúvida devolve a lista como veio e tenta de novo depois.
export async function consolidarMissoesFechadas(hoje = dataDeHoje(), entradas) {
    const uid = obterUid();
    const lista = entradas ?? (await obterMissoes());
    try {
        const fechadas = lista.filter(
            (entrada) => !ehResumoDeMissoes(entrada) && !periodoEstaAberto(entrada, hoje)
        );
        if (fechadas.length === 0) return lista;

        const resumoAtual = lista.find(ehResumoDeMissoes) ?? null;
        const limite = limiteDoResumo(resumoAtual);
        // `until` é o que impede contar duas vezes: um delete que falhou e voltou
        // do servidor na leitura seguinte é apagado de novo, mas não soma XP. Ele
        // é uma marca POR TIPO DE PERÍODO — com uma marca só, as diárias (que
        // fecham todo dia) empurravam a marca por cima da semanal e o xp dela era
        // descartado aqui sem nunca entrar no resumo. Ver utils/xp.js.
        const naoContadas = fechadas.filter((entrada) => !jaEstaNoResumo(entrada, limite));
        const resumo = {
            id: ID_DO_RESUMO_DE_MISSOES,
            summary: true,
            xp: (resumoAtual?.xp ?? 0) + naoContadas.reduce((soma, e) => soma + (e.xp || 0), 0),
            count: (resumoAtual?.count ?? 0) + naoContadas.length,
            until: avancarLimite(limite, fechadas),
            updatedAt: new Date().toISOString(),
        };
        const abertas = lista.filter(
            (entrada) => !ehResumoDeMissoes(entrada) && periodoEstaAberto(entrada, hoje)
        );
        const consolidada = [resumo, ...abertas];

        if (uid) {
            for (const fechada of fechadas) {
                await enfileirar(uid, {
                    tipo: 'delete',
                    colecao: 'missions',
                    docId: String(fechada.id),
                });
            }
            await escreverListaNaConta(uid, ESPELHOS.MISSOES, consolidada, {
                tipo: 'set',
                colecao: 'missions',
                docId: ID_DO_RESUMO_DE_MISSOES,
                dados: resumo,
            });
        } else {
            await AsyncStorage.setItem(CHAVES.MISSOES, JSON.stringify(consolidada));
        }
        return consolidada;
    } catch (e) {
        console.log('Erro ao consolidar as missões:', e);
        return lista;
    }
}

// Avalia as missões do período atual, salva as que acabaram de ser concluídas
// e devolve só essas novas (pra tela mostrar o toast de XP).
export async function verificarEConcluirMissoes(
    registros,
    economia,
    sessoesDeCrise,
    meta,
    aparelho
) {
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
//
// Recalcular isso a cada foco de tela era desperdício: sem escrita no meio, o
// resultado é sempre o mesmo (nenhuma missão nova, nenhuma conquista nova,
// ganho 0), mas custava a leitura das missões e a reescrita do snapshot de XP.
// Agora só roda de verdade quando `marcarGamificacaoSuja()` foi chamado (toda
// escrita passa por lá), quando o dia virou (missão diária/streak dependem da
// data) ou quando o uid mudou (login/logout/migração). Fora disso devolve o
// resultado guardado da última execução, com recompensas vazias.
//
// Serializada: duas telas focando quase juntas (trocar de aba rápido) chamariam
// isto em paralelo, as duas leriam `gamificacaoSuja === true` antes do reset e
// as duas devolveriam a MESMA conquista em `recompensas` — o troféu abria duas
// vezes. Cada chamada espera a anterior terminar; a segunda já encontra a flag
// limpa e o resultado guardado, então cai no reuso com recompensas vazias.
export function sincronizarGamificacao(entrada = {}) {
    const anterior = sincronizacaoDeGamificacaoEmAndamento ?? Promise.resolve();
    const minha = anterior.catch(() => {}).then(() => executarSincronizacaoDeGamificacao(entrada));

    sincronizacaoDeGamificacaoEmAndamento = minha;
    minha
        .catch(() => {})
        .then(() => {
            if (sincronizacaoDeGamificacaoEmAndamento === minha) {
                sincronizacaoDeGamificacaoEmAndamento = null;
            }
        });

    return minha;
}

async function executarSincronizacaoDeGamificacao(entrada) {
    const uid = obterUid();
    const hoje = dataDeHoje();
    const podeReusar =
        !gamificacaoSuja &&
        ultimaSincronizacao !== null &&
        ultimaSincronizacao.uid === uid &&
        ultimaSincronizacao.dia === hoje;

    const registros = entrada.registros ?? (await obterRegistros());
    const economia = entrada.economia ?? (await obterEconomia());
    const sessoesDeCrise = entrada.sessoesDeCrise ?? (await obterSessoesDeCrise());
    const diasDeAbertura = entrada.diasDeAbertura ?? (await obterDiasDeAbertura());
    const meta = entrada.meta !== undefined ? entrada.meta : await obterMeta();
    const aparelho = entrada.aparelho !== undefined ? entrada.aparelho : await obterAparelho();

    if (podeReusar) {
        return {
            registros,
            economia,
            sessoesDeCrise,
            diasDeAbertura,
            meta,
            aparelho,
            missoesConcluidas: ultimaSincronizacao.missoesConcluidas,
            resumo: ultimaSincronizacao.resumo,
            recompensas: { conquistas: [], missoes: [], ganho: 0 },
        };
    }

    // Zerado ANTES do trabalho: escrita que aconteça durante esta execução
    // (ou logo depois dela) tem que deixar a próxima suja de novo.
    gamificacaoSuja = false;

    const novasMissoes = await verificarEConcluirMissoes(
        registros,
        economia,
        sessoesDeCrise,
        meta,
        aparelho
    );
    // Aproveita a leitura da lista pra fechar os períodos que já passaram: a
    // lista volta com o resumo no lugar das entradas antigas.
    const missoesConcluidas = await consolidarMissoesFechadas(hoje);
    const novasConquistas = await verificarEDesbloquearConquistas(
        registros,
        economia,
        missoesConcluidas,
        { sessoesDeCrise, diasDeAbertura, meta, aparelho, hoje: dataDeHoje() }
    );
    const resumo = await atualizarXp(registros, null, missoesConcluidas);

    ultimaSincronizacao = { uid, dia: hoje, missoesConcluidas, resumo };

    return {
        registros,
        economia,
        sessoesDeCrise,
        diasDeAbertura,
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
