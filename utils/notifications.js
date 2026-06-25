// src/utils/notifications.js
//
// Notificações LOCAIS (in-app) motivadoras, sem precisar de servidor/push.
// Usa a biblioteca oficial `expo-notifications`. Funciona normalmente no
// Expo Go (notificações remotas/push é que pararam de funcionar no Expo Go
// a partir do SDK 53+, mas notificações locais continuam funcionando).
//
// Estratégia simples: agendamos UMA notificação diária (mesmo horário todo
// dia) com uma frase motivacional escolhida aleatoriamente entre as TIPS
// que já existem em utils/theme.js. Toda vez que o app é reaberto com o
// usuário logado, reagendamos para sortear uma nova frase — então, quanto
// mais o usuário abre o app, mais variadas ficam as mensagens. Se o app
// ficar muitos dias sem abrir, a última frase agendada continua repetindo
// todo dia naquele horário (não é tempo real, é um agendamento simples).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { TIPS } from './theme';

// Identificador fixo: usamos sempre o mesmo, assim cancelamos a notificação
// anterior antes de criar uma nova (evita duplicar notificações).
const DAILY_NOTIFICATION_ID = 'vapefree-motivational-daily';

// Horário padrão do lembrete diário (9h da manhã).
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

// Define como a notificação se comporta quando chega com o app ABERTO
// (em primeiro plano). Sem isso, no iOS a notificação pode não aparecer
// se o usuário estiver com o app em uso.
export function configureNotificationHandler() {
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
export async function requestNotificationPermissions() {
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

// Sorteia uma frase do array TIPS (utils/theme.js).
function pickRandomTip() {
  const index = Math.floor(Math.random() * TIPS.length);
  return TIPS[index];
}

// Agenda (ou reagenda) a notificação motivadora diária.
// Chamar isso sempre que o usuário estiver autenticado (ex.: no login,
// ou ao abrir o app já logado).
export async function scheduleMotivationalNotifications(
  hour = DEFAULT_HOUR,
  minute = DEFAULT_MINUTE
) {
  if (Platform.OS === 'web') {
    // expo-notifications não tem suporte a notificações locais na web.
    return;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) {
    return;
  }

  // No Android é obrigatório ter um canal de notificação configurado.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('motivational', {
      name: 'Mensagens motivadoras',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Cancela a notificação diária anterior (se existir) para não duplicar.
  await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_NOTIFICATION_ID,
    content: {
      title: 'VapeFree 💚',
      body: pickRandomTip(),
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? 'motivational' : undefined,
    },
  });
}

// Cancela a notificação motivadora diária (chamar no logout, por exemplo,
// para não notificar quem não está mais usando a conta).
export async function cancelMotivationalNotifications() {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(DAILY_NOTIFICATION_ID).catch(() => {});
}