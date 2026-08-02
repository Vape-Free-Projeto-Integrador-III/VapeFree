# Notificações

Só notificações **locais** (`expo-notifications`), sem servidor/push remoto. Tudo em `utils/notifications.js`. Não funciona na web (`Platform.OS === 'web'` retorna cedo em toda função exportada).

## Preferência do usuário (liga/desliga + horário)

`{ ativas, hora, minuto, risco, diaCritico }`, padrão `{ true, 9, 0, true, true }`, em `@vapefree_notifications` — preferência **do aparelho**, como tema e tutorial: fica fora de `CHAVES` e nunca vai pro Firestore (quem agenda é o próprio aparelho). Lida/gravada por `obterPreferenciasDeNotificacao()`/`salvarPreferenciasDeNotificacao()` (`utils/storage.js`), editada na `SettingsScreen`.

`aplicarPreferenciasDeNotificacao()` é o **único ponto de agendamento** que o resto do app usa: lê a preferência e agenda as notificações no horário escolhido, ou cancela todas se `ativas` for `false`. Devolve `{ ativas, hora, minuto, risco, diaCritico, permitido }` — `permitido: false` quando o usuário negou a permissão do sistema, e é o que faz a `SettingsScreen` avisar que os lembretes estão bloqueados. Não chame `agendarNotificacoesMotivacionais`/`agendarNotificacaoDeStreak`/`agendarLembreteDeRisco`/`agendarLembreteDeDiaCritico` direto de tela nenhuma: isso reativaria lembrete desligado.

O horário escolhido vale só pro lembrete motivacional. O aviso de streak continua às 20h (só faz sentido perto do fim do dia), mas obedece o liga/desliga junto. O aviso de risco tem horário próprio (derivado das crises) e liga/desliga próprio (`risco`), e também é cancelado quando `ativas` é `false`. O aviso do dia crítico segue o horário escolhido + 2h, tem liga/desliga próprio (`diaCritico`) e morre junto do `ativas` também.

## Quatro notificações, horários diferentes (motivacional 9h, streak 20h por padrão, risco derivado, dia crítico +2h)

Horários separados de propósito: quem tem streak e não registrou não recebe os dois banners juntos.

- **Motivacional** (`vapefree-motivational-daily-0` .. `-6`): agenda `DIAS_DE_ANTECEDENCIA` (7) notificações de uma vez, uma por dia, com trigger `DATE` (não `DAILY`). Só o dia 0 (hoje) reflete o estado real — se o usuário não registrou nada hoje, lembra de registrar; se já registrou, manda uma dica aleatória de `DICAS`. Os demais dias usam sempre uma dica genérica, nunca a frase "você ainda não registrou hoje" — não dá pra saber o estado real de um dia futuro, e um trigger `DAILY` único repetiria essa frase mesmo depois do usuário já ter registrado, se o app ficasse dias sem ser reaberto. **O dia 0 é pulado quando o horário do lembrete já passou hoje** — o gatilho seria uma data no passado (dispararia na hora do agendamento).
- **Fallback semanal** (`vapefree-motivational-weekly-fallback`): trigger `WEEKLY` com dica genérica, ancorado no dia da semana do primeiro dia **depois** da janela `DATE`. É o que garante lembrete pra quem passa uma semana sem abrir o app — as notificações `DATE` acabam e ninguém está lá pra reagendar. Como a primeira repetição de um `WEEKLY` cai na próxima ocorrência daquele weekday, a âncora é escolhida pra ela cair exatamente no fim da janela, sem sobrepor nenhum dia `DATE`: dia 7 quando o horário de hoje já passou (dia 0 pulado), dia 6 quando ainda não passou — nesse caso o dia 6 sai da janela `DATE` e quem cobre ele é o fallback.
- **Aviso de streak** (`vapefree-streak-warning-daily`): trigger `DATE`, dia único (hoje), só agendado se `calcularStreak(records) > 0`, ainda não houver registro hoje **e** as 20h ainda não tiverem passado. Senão a chamada cancela a notificação existente e não agenda nova. Não é `DAILY` nem agendada N dias à frente porque o texto cita o número de dias da sequência: um trigger repetido devolveria um número congelado e uma frase que pode já ter ficado falsa (usuário registrou naquele dia). Quem não abre o app perde o aviso — mas nesse caso a sequência quebra de qualquer jeito.

- **Aviso no horário de risco** (`vapefree-risk-window-daily`): trigger `DAILY`, 30 min antes do horário em que a vontade mais bate. O horário sai de `horarioDeRiscoDeCrise(sessoes)` (`utils/insights.js`, puro): período do dia com mais sessões de crise (mínimo 3 — menos que isso é coincidência) e, dentro dele, a **mediana** das horas (mediana e não média pra uma crise na ponta do período não arrastar o horário; empate par pega a hora mais cedo). É a mesma função que gera o insight `crise_horario`, então texto e agendamento nunca divergem. Pode ser `DAILY` — diferente do streak — porque o texto não cita estado nenhum que envelheça; a cada abertura do app o horário é recalculado e reagendado. **Não agenda** quando não há crises suficientes, ou quando cairia a menos de 60 min do lembrete motivacional (dois banners colados viram ruído). `calcularHorarioDoLembreteDeRisco(hora, minuto)` expõe esse cálculo (retorna `{ hora, minuto, periodo, rotulo }` ou `null`) pra `SettingsScreen` mostrar que horas o aviso tocaria.

- **Aviso no dia da semana crítico** (`vapefree-risk-weekday-weekly`): trigger `WEEKLY`, no dia da semana em que o usuário mais usa, **2h depois** do lembrete motivacional (`MINUTOS_DEPOIS_DO_LEMBRETE`). O dia sai de `diaDeRiscoDaSemana(registros)` (`utils/insights.js`, puro): dia da semana com maior **média** de puxadas por registro (média, não total, pra dia da semana com mais registros não ganhar sozinho; dia registrado sem uso conta como zero). É a mesma função que gera o insight `dia_semana`, então texto e agendamento nunca divergem. Pode ser `WEEKLY` porque o texto cita só o dia da semana, que não envelhece — a cada abertura do app o dia é recalculado e reagendado. **Não agenda** quando o dia campeão tem menos de `MIN_REGISTROS_PARA_LEMBRETE_DE_DIA` (3) registros — mais que o mínimo do insight (2), porque insight o usuário lê quando quer e notificação chega sozinha — nem quando cairia a menos de 60 min do aviso de risco. Contra o motivacional não precisa checar: o horário é derivado dele. `calcularLembreteDeDiaCritico(hora, minuto)` expõe o cálculo (retorna `{ hora, minuto, dia, rotulo, media }` ou `null`) pra `SettingsScreen`.

Motivacional usa `identifier`s fixos por dia — reagendar cancela todos os `-0` a `-6` mais o fallback antes de recriar (`cancelarNotificacoesMotivacionais()`, usada tanto no reagendamento quanto no logout). Streak usa um `identifier` fixo — reagendar cancela o anterior primeiro. Ambas evitam duplicar assim.

## Quando são (re)agendadas

`AuthContext` chama `aplicarPreferenciasDeNotificacao()` sempre que `user || ehConvidado` fica verdadeiro (login, cadastro, ou "continuar sem conta"), e cancela as quatro quando volta a ficar fora do app (logout). Além disso, `RegisterScreen.handleSave` chama a mesma função depois de cada registro salvo/editado — assim o conteúdo (dica sorteada, streak atual) fica atualizado no mesmo dia. A `SettingsScreen` chama logo depois de salvar a preferência, pra o horário novo valer na hora e não só na próxima abertura.

## Permissão

`pedirPermissaoDeNotificacoes()` é chamado internamente antes de agendar; se o usuário negar, a função de agendamento simplesmente não agenda nada (sem erro, sem alerta pro usuário).

## Android

Canal `motivational` (`AndroidImportance.DEFAULT`) criado sob demanda via `ensureAndroidChannel()` antes de qualquer agendamento no Android.
