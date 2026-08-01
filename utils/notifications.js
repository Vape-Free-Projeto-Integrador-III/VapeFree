//
// Notificações LOCAIS (in-app) motivadoras, sem precisar de servidor/push.
// Usa a biblioteca oficial `expo-notifications`. Funciona normalmente no
// Expo Go (notificações remotas/push é que pararam de funcionar no Expo Go
// a partir do SDK 53+, mas notificações locais continuam funcionando).
//
// Estratégia: agendamos uma notificação por dia (mesmo horário) pros
// próximos DIAS_DE_ANTECEDENCIA dias, com frases motivacionais sorteadas
// entre as DICAS que já existem em utils/theme.js, mais um fallback
// SEMANAL que começa onde essa janela acaba. Toda vez que o app é reaberto
// com o usuário logado, reagendamos tudo — então, quanto mais o usuário
// abre o app, mais variadas ficam as mensagens. Se o app ficar semanas sem
// abrir, o fallback semanal segue lembrando (repetindo a mesma frase), em
// vez de o usuário simplesmente nunca mais receber nada.

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DICAS } from './theme';
import {
  obterRegistros,
  dataDeHoje,
  calcularStreak,
  obterPreferenciasDeNotificacao,
} from './storage';

// Identificador base: um id por dia agendado (ID_NOTIFICACAO_DIARIA-0, -1, ...),
// assim cancelamos todos antes de criar os próximos (evita duplicar notificações).
const ID_NOTIFICACAO_DIARIA = 'vapefree-motivational-daily';
const ID_NOTIFICACAO_DE_STREAK = 'vapefree-streak-warning-daily';
// Fallback semanal que começa onde a janela de DIAS_DE_ANTECEDENCIA acaba:
// é o que garante que quem passa uma semana sem abrir o app continue
// recebendo lembrete (as notificações DATE acabam e ninguém reagenda).
const ID_NOTIFICACAO_DE_FALLBACK = 'vapefree-motivational-weekly-fallback';

// Horário padrão do lembrete motivacional (9h da manhã) e do aviso de
// streak (20h) — horários diferentes pra não mandar os dois banners juntos
// pra quem tem streak e ainda não registrou.
const HORA_PADRAO = 9;
const MINUTO_PADRAO = 0;
const HORA_PADRAO_STREAK = 20;
const MINUTO_PADRAO_STREAK = 0;

// Quantos dias à frente agendar de uma vez. Só o dia 0 (hoje) reflete o
// estado real (se já registrou, streak atual); os demais dias usam
// conteúdo genérico (dica motivacional), pra não repetir uma afirmação
// ("você ainda não registrou hoje") que pode ficar falsa se o app ficar
// dias sem ser reaberto — um trigger DAILY único faria isso.
const DIAS_DE_ANTECEDENCIA = 7;

// Define como a notificação se comporta quando chega com o app ABERTO
// (em primeiro plano). Sem isso, no iOS a notificação pode não aparecer
// se o usuário estiver com o app em uso.
export function configurarHandlerDeNotificacoes() {
  if (Platform.OS === 'web') {
    // expo-notifications não tem suporte a notificações locais na web.
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Pede permissão ao usuário para mostrar notificações.
// Retorna true se o usuário permitiu, false caso contrário.
export async function pedirPermissaoDeNotificacoes() {
  // Notificações não são suportadas em emuladores/simuladores em alguns
  // casos, mas o requestPermissionsAsync já lida bem com isso; aqui só
  // evitamos rodar em web, onde expo-notifications não tem suporte.
  if (Platform.OS === 'web') {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// Sorteia uma frase do array DICAS (utils/theme.js).
function sortearDica() {
  const indice = Math.floor(Math.random() * DICAS.length);
  return DICAS[indice];
}

async function garantirCanalAndroid() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('motivational', {
      name: 'Mensagens motivadoras',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

async function conteudoDoLembreteDiario() {
  const registros = await obterRegistros();
  const temRegistroHoje = registros.some((registro) => registro.date === dataDeHoje());

  if (!temRegistroHoje) {
    return {
      title: 'VapeFree 💚',
      body: 'Você ainda não registrou hoje. Abra o app e registre seu dia para manter o controle.',
    };
  }

  return {
    title: 'VapeFree 💚',
    body: sortearDica(),
  };
}

// Conteúdo genérico pros dias futuros (dia > 0): não dá pra saber se o
// usuário vai ter registrado ou não naquele dia, então usamos só uma dica
// motivacional em vez de afirmar um estado que pode estar errado.
function conteudoGenericoDoLembrete() {
  return {
    title: 'VapeFree 💚',
    body: sortearDica(),
  };
}

// Calcula a data/hora do gatilho pro N-ésimo dia à frente (0 = hoje),
// no horário informado. Pro dia 0 o resultado pode estar no passado (o
// horário de hoje já passou) — quem chama é obrigado a checar isso e
// pular o dia, ver horarioDeHojeJaPassou.
function dataDoGatilho(diasAFrente, hora, minuto) {
  const data = new Date();
  data.setDate(data.getDate() + diasAFrente);
  data.setHours(hora, minuto, 0, 0);
  return data;
}

function horarioDeHojeJaPassou(hora, minuto) {
  return dataDoGatilho(0, hora, minuto).getTime() <= Date.now();
}

// expo-notifications usa weekday 1 = domingo ... 7 = sábado; Date.getDay()
// usa 0 = domingo.
function diaDaSemanaDoGatilho(diasAFrente, hora, minuto) {
  return dataDoGatilho(diasAFrente, hora, minuto).getDay() + 1;
}

async function conteudoDoAvisoDeStreak() {
  const registros = await obterRegistros();
  const hoje = dataDeHoje();
  const temRegistroHoje = registros.some((registro) => registro.date === hoje);
  const streak = calcularStreak(registros);

  if (temRegistroHoje || streak <= 0) {
    return null;
  }

  return {
    title: 'VapeFree 🔥',
    body: `Você já está a ${streak} dias sem perder o ritmo. Não deixe a sequência acabar agora, registre seu progresso de hoje!`,
  };
}

// Agenda (ou reagenda) a notificação motivadora diária.
// Chamar isso sempre que o usuário estiver autenticado (ex.: no login,
// ou ao abrir o app já logado).
export async function agendarNotificacoesMotivacionais(
  hora = HORA_PADRAO,
  minuto = MINUTO_PADRAO
) {
  if (Platform.OS === 'web') {
    // expo-notifications não tem suporte a notificações locais na web.
    return false;
  }

  const permitido = await pedirPermissaoDeNotificacoes();
  if (!permitido) {
    return false;
  }

  await garantirCanalAndroid();

  const conteudoDeHoje = await conteudoDoLembreteDiario();
  const jaPassou = horarioDeHojeJaPassou(hora, minuto);

  // Cancela as notificações diárias anteriores (se existirem) para não duplicar.
  await cancelarNotificacoesMotivacionais();

  // Onde a janela de datas fixas acaba e o fallback semanal assume. O
  // fallback é ancorado no dia da semana desse dia, então a primeira
  // repetição dele cai exatamente aí — sem sobrepor nenhum dia DATE.
  // Se o horário de hoje ainda não passou, o dia 0 conta na janela e o
  // fallback só poderia cair daqui a 6 dias (weekday de ontem): o dia 6
  // então sai da janela DATE e quem cobre ele é o próprio fallback.
  const primeiroDiaDoFallback = jaPassou ? DIAS_DE_ANTECEDENCIA : DIAS_DE_ANTECEDENCIA - 1;

  for (let dia = 0; dia < primeiroDiaDoFallback; dia++) {
    // Dia 0 só entra se o horário de hoje ainda não passou — senão o
    // gatilho seria uma data no passado (dispararia na hora).
    if (dia === 0 && jaPassou) {
      continue;
    }
    const conteudo = dia === 0 ? conteudoDeHoje : conteudoGenericoDoLembrete();
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_NOTIFICACAO_DIARIA}-${dia}`,
      content: { ...conteudo, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dataDoGatilho(dia, hora, minuto),
        channelId: Platform.OS === 'android' ? 'motivational' : undefined,
      },
    });
  }

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_DE_FALLBACK,
    content: { ...conteudoGenericoDoLembrete(), sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: diaDaSemanaDoGatilho(primeiroDiaDoFallback, hora, minuto),
      hour: hora,
      minute: minuto,
      channelId: Platform.OS === 'android' ? 'motivational' : undefined,
    },
  });

  return true;
}

export async function agendarNotificacaoDeStreak(
  hora = HORA_PADRAO_STREAK,
  minuto = MINUTO_PADRAO_STREAK
) {
  if (Platform.OS === 'web') {
    return false;
  }

  const permitido = await pedirPermissaoDeNotificacoes();
  if (!permitido) {
    return false;
  }

  await garantirCanalAndroid();

  const conteudo = await conteudoDoAvisoDeStreak();

  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_STREAK).catch(() => {});

  // Sem streak ativo / já registrou hoje, ou o horário do aviso já passou:
  // nada a agendar. O texto cita o número de dias da sequência, então ele
  // só vale pro dia de hoje — um trigger DAILY repetiria um número
  // congelado (e uma frase que pode já ter ficado falsa) todo dia.
  if (!conteudo || horarioDeHojeJaPassou(hora, minuto)) {
    return true;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_DE_STREAK,
    content: { ...conteudo, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: dataDoGatilho(0, hora, minuto),
      channelId: Platform.OS === 'android' ? 'motivational' : undefined,
    },
  });

  return true;
}

// Ponto único de agendamento: lê a preferência do aparelho (liga/desliga +
// horário do lembrete, ver utils/storage.js) e agenda ou cancela tudo de
// acordo. É o que a SettingsScreen chama depois de mudar a preferência e o que
// o AuthContext chama ao entrar no app.
//
// O horário escolhido vale pro lembrete diário. O aviso de streak continua no
// fim do dia (20h) de propósito — ele só faz sentido perto do fim do dia — mas
// obedece o liga/desliga junto.
export async function aplicarPreferenciasDeNotificacao() {
  const preferencias = await obterPreferenciasDeNotificacao();

  if (!preferencias.ativas) {
    await cancelarNotificacoesMotivacionais();
    await cancelarNotificacaoDeStreak();
    return { ...preferencias, permitido: true };
  }

  const agendou = await agendarNotificacoesMotivacionais(preferencias.hora, preferencias.minuto);
  await agendarNotificacaoDeStreak();

  return { ...preferencias, permitido: agendou };
}

// Cancela a notificação motivadora diária (chamar no logout, por exemplo,
// para não notificar quem não está mais usando a conta).
export async function cancelarNotificacoesMotivacionais() {
  if (Platform.OS === 'web') {
    return;
  }
  await Promise.all([
    ...Array.from({ length: DIAS_DE_ANTECEDENCIA }, (_, dia) =>
      Notifications.cancelScheduledNotificationAsync(`${ID_NOTIFICACAO_DIARIA}-${dia}`).catch(() => {})
    ),
    Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_FALLBACK).catch(() => {}),
  ]);
}

export async function cancelarNotificacaoDeStreak() {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_STREAK).catch(() => {});
}