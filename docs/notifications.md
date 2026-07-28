# Notificações

Só notificações **locais** (`expo-notifications`), sem servidor/push remoto. Tudo em `utils/notifications.js`. Não funciona na web (`Platform.OS === 'web'` retorna cedo em toda função exportada).

## Duas notificações, horários diferentes (motivacional 9h, streak 20h por padrão)

Horários separados de propósito: quem tem streak e não registrou não recebe os dois banners juntos.

- **Motivacional** (`vapefree-motivational-daily-0` .. `-6`): agenda `DIAS_DE_ANTECEDENCIA` (7) notificações de uma vez, uma por dia, com trigger `DATE` (não `DAILY`). Só o dia 0 (hoje) reflete o estado real — se o usuário não registrou nada hoje, lembra de registrar; se já registrou, manda uma dica aleatória de `DICAS`. Os dias 1..6 usam sempre uma dica genérica, nunca a frase "você ainda não registrou hoje" — não dá pra saber o estado real de um dia futuro, e um trigger `DAILY` único repetiria essa frase mesmo depois do usuário já ter registrado, se o app ficasse dias sem ser reaberto.
- **Aviso de streak** (`vapefree-streak-warning-daily`): só é agendada (dia único, hoje) se `calcularStreak(records) > 0` **e** ainda não houver registro hoje — avisa pra não perder a sequência. Se não houver streak ativo ou já tiver registrado hoje, a chamada cancela a notificação existente e não agenda nova (retorna sem criar). Não é agendada N dias à frente porque o streak muda todo dia — sem isso ficaria errado.

Motivacional usa `identifier`s fixos por dia — reagendar cancela todos os `-0` a `-6` antes de recriar. Streak usa um `identifier` fixo — reagendar cancela o anterior primeiro. Ambas evitam duplicar assim.

## Quando são (re)agendadas

`AuthContext` chama `agendarNotificacoesMotivacionais()` + `agendarNotificacaoDeStreak()` sempre que `user || ehConvidado` fica verdadeiro (login, cadastro, ou "continuar sem conta"), e cancela ambas quando volta a ficar fora do app (logout). Além disso, `RegisterScreen.handleSave` reagenda as duas depois de cada registro salvo/editado — assim o conteúdo (dica sorteada, streak atual) fica atualizado no mesmo dia.

## Permissão

`pedirPermissaoDeNotificacoes()` é chamado internamente antes de agendar; se o usuário negar, a função de agendamento simplesmente não agenda nada (sem erro, sem alerta pro usuário).

## Android

Canal `motivational` (`AndroidImportance.DEFAULT`) criado sob demanda via `ensureAndroidChannel()` antes de qualquer agendamento no Android.
