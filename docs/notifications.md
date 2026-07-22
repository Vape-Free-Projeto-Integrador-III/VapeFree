# Notificações

Só notificações **locais** (`expo-notifications`), sem servidor/push remoto. Tudo em `utils/notifications.js`. Não funciona na web (`Platform.OS === 'web'` retorna cedo em toda função exportada).

## Duas notificações agendadas, diárias, mesmo horário (9h por padrão)

- **Motivacional** (`vapefree-motivational-daily`): se o usuário não registrou nada hoje, lembra de registrar; se já registrou, manda uma dica aleatória de `DICAS` (`utils/theme.js`).
- **Aviso de streak** (`vapefree-streak-warning-daily`): só é agendada se `calcularStreak(records, shield.usedDates) > 0` **e** ainda não houver registro hoje — avisa pra não perder a sequência. Se não houver streak ativo ou já tiver registrado hoje, a chamada cancela a notificação existente e não agenda nova (retorna sem criar).

Ambas usam um `identifier` fixo — reagendar sempre cancela a anterior primeiro (`cancelScheduledNotificationAsync`), evitando duplicar.

## Quando são (re)agendadas

`AuthContext` chama `agendarNotificacoesMotivacionais()` + `agendarNotificacaoDeStreak()` sempre que `user || ehConvidado` fica verdadeiro (login, cadastro, ou "continuar sem conta"), e cancela ambas quando volta a ficar fora do app (logout). Além disso, `RegisterScreen.handleSave` reagenda as duas depois de cada registro salvo/editado — assim o conteúdo (dica sorteada, streak atual) fica atualizado no mesmo dia.

## Permissão

`pedirPermissaoDeNotificacoes()` é chamado internamente antes de agendar; se o usuário negar, a função de agendamento simplesmente não agenda nada (sem erro, sem alerta pro usuário).

## Android

Canal `motivational` (`AndroidImportance.DEFAULT`) criado sob demanda via `ensureAndroidChannel()` antes de qualquer agendamento no Android.
