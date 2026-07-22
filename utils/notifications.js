// src/utils/notifications.js
//
// Notificações LOCAIS (in-app) motivadoras, sem precisar de servidor/push.
// Usa a biblioteca oficial `expo-notifications`. Funciona normalmente no
// Expo Go (notificações remotas/push é que pararam de funcionar no Expo Go
// a partir do SDK 53+, mas notificações locais continuam funcionando).
//
// Estratégia simples: agendamos UMA notificação diária (mesmo horário todo
// dia) com uma frase motivacional escolhida aleatoriamente entre as DICAS
// que já existem em utils/theme.js. Toda vez que o app é reaberto com o
// usuário logado, reagendamos para sortear uma nova frase — então, quanto
// mais o usuário abre o app, mais variadas ficam as mensagens. Se o app
// ficar muitos dias sem abrir, a última frase agendada continua repetindo
// todo dia naquele horário (não é tempo real, é um agendamento simples).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DICAS } from './theme';
import { obterRegistros, dataDeHoje, calcularStreak } from './storage';

// Identificador fixo: usamos sempre o mesmo, assim cancelamos a notificação
// anterior antes de criar uma nova (evita duplicar notificações).
const ID_NOTIFICACAO_DIARIA = 'vapefree-motivational-daily';
const ID_NOTIFICACAO_DE_STREAK = 'vapefree-streak-warning-daily';

// Horário padrão do lembrete diário (9h da manhã).
const HORA_PADRAO = 9;
const MINUTO_PADRAO = 0;

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
    return;
  }

  const permitido = await pedirPermissaoDeNotificacoes();
  if (!permitido) {
    return;
  }

  await garantirCanalAndroid();

  const conteudo = await conteudoDoLembreteDiario();

  // Cancela a notificação diária anterior (se existir) para não duplicar.
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DIARIA).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_DIARIA,
    content: { ...conteudo, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hora,
      minute: minuto,
      channelId: Platform.OS === 'android' ? 'motivational' : undefined,
    },
  });
}

export async function agendarNotificacaoDeStreak(
  hora = HORA_PADRAO,
  minuto = MINUTO_PADRAO
) {
  if (Platform.OS === 'web') {
    return;
  }

  const permitido = await pedirPermissaoDeNotificacoes();
  if (!permitido) {
    return;
  }

  await garantirCanalAndroid();

  const conteudo = await conteudoDoAvisoDeStreak();

  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_STREAK).catch(() => {});

  if (!conteudo) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: ID_NOTIFICACAO_DE_STREAK,
    content: { ...conteudo, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hora,
      minute: minuto,
      channelId: Platform.OS === 'android' ? 'motivational' : undefined,
    },
  });
}

// Cancela a notificação motivadora diária (chamar no logout, por exemplo,
// para não notificar quem não está mais usando a conta).
export async function cancelarNotificacoesMotivacionais() {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DIARIA).catch(() => {});
}

export async function cancelarNotificacaoDeStreak() {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_STREAK).catch(() => {});
}