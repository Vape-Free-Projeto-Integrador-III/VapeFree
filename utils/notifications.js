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

// Identificador base: um id por dia agendado (ID_NOTIFICACAO_DIARIA-0, -1, ...),
// assim cancelamos todos antes de criar os próximos (evita duplicar notificações).
const ID_NOTIFICACAO_DIARIA = 'vapefree-motivational-daily';
const ID_NOTIFICACAO_DE_STREAK = 'vapefree-streak-warning-daily';

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
// no horário informado. Se o horário de hoje já passou, o dia 0 dispara
// no mesmo instante (expo-notifications já lida com isso reagendando pro
// próximo minuto), mas aqui sempre miramos hora:minuto do dia calculado.
function dataDoGatilho(diasAFrente, hora, minuto) {
  const data = new Date();
  data.setDate(data.getDate() + diasAFrente);
  data.setHours(hora, minuto, 0, 0);
  return data;
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

  const conteudoDeHoje = await conteudoDoLembreteDiario();

  // Cancela as notificações diárias anteriores (se existirem) para não duplicar.
  await Promise.all(
    Array.from({ length: DIAS_DE_ANTECEDENCIA }, (_, dia) =>
      Notifications.cancelScheduledNotificationAsync(`${ID_NOTIFICACAO_DIARIA}-${dia}`).catch(() => {})
    )
  );

  for (let dia = 0; dia < DIAS_DE_ANTECEDENCIA; dia++) {
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
}

export async function agendarNotificacaoDeStreak(
  hora = HORA_PADRAO_STREAK,
  minuto = MINUTO_PADRAO_STREAK
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
  await Promise.all(
    Array.from({ length: DIAS_DE_ANTECEDENCIA }, (_, dia) =>
      Notifications.cancelScheduledNotificationAsync(`${ID_NOTIFICACAO_DIARIA}-${dia}`).catch(() => {})
    )
  );
}

export async function cancelarNotificacaoDeStreak() {
  if (Platform.OS === 'web') {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(ID_NOTIFICACAO_DE_STREAK).catch(() => {});
}