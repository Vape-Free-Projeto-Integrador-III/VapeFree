# Dados / Banco

Toda leitura e escrita passa por `utils/storage.js`. Nenhuma outra parte do app deve chamar `AsyncStorage` ou `firestore` para dados de domínio diretamente (exceção: telas de auth gravam o doc inicial do usuário — ver [auth.md](auth.md)).

## Duas fontes, uma API

Cada função pública de `storage.js` decide a fonte olhando `auth.currentUser`:

```js
function getUid() {
  return auth.currentUser ? auth.currentUser.uid : null;
}
```

- **Logado** (`uid` existe) → Cloud Firestore, sob `users/{uid}/...`.
- **Convidado** (`uid` nulo) → `AsyncStorage` local, chaves fixas (`@vapefree_records`, `@vapefree_device`, `@vapefree_economy`, `@vapefree_achievements`, `@vapefree_crisis`, `@vapefree_missions`, `@vapefree_xp`).

Não há cache/estado duplicado entre as duas fontes — cada chamada relê a fonte atual.

## Modelo de dados

**Record** (um por `salvarRegistro`, id = `Date.now()`):
```js
{ id, date /* 'YYYY-MM-DD' */, time /* 'HH:MM' */, devType /* 'desc'|'rec' */,
  used /* bool */, puffs /* number */, triggers /* string[] label */,
  helps /* string[] label */, intensity /* 0-10 */ }
```
Firestore: subcoleção `users/{uid}/records`, doc id = `String(record.id)`. Convidado: array em `@vapefree_records`.

`salvarRegistro`/`atualizarRegistro` passam o registro por `normalizarRegistro` (`utils/records.js`) antes de gravar: com `used: false`, `puffs` vira `0` e `triggers` vira `[]`. Para somar puxadas em qualquer lugar (gráficos, totais, economia, insights) use `puxadasDoRegistro(record)` / `somarPuxadas(records)` do mesmo arquivo — nunca `record.puffs` direto, porque registros salvos antes dessa normalização podem ter `puffs > 0` com `used: false` (foi editado de "usei" para "não usei").

**Device** (um por usuário):
```js
{ name, type /* 'desc'|'rec' */, price, totalPuffs, days }
```
Firestore: campo `aparelho` no doc `users/{uid}`. Convidado: `@vapefree_device`.

**Economy**: mapa `{ [date]: valorEconomizadoNoDia }`, recalculado por `recalcularEconomia(records, device)` — nunca editado manualmente pela UI. Firestore: campo `economia` no doc `users/{uid}`. Convidado: `@vapefree_economy`.

**Achievement (desbloqueada)**: `{ id, unlockedAt }`. Firestore: subcoleção `users/{uid}/achievements`, doc id = `String(achievementId)`. Convidado: array em `@vapefree_achievements`. Lista completa de conquistas possíveis (não persistida, é código) está em `utils/achievements.js` — ver `CONQUISTAS`. Cada `condicao(records, economy, completedMissions, context)` recebe em `contexto` o que não está nos registros: `{ crisisSessions, appOpenDays, shieldDates }` (montado por `verificarEDesbloquearConquistas`, ou passado pronto pela tela que já carregou esses dados).

**StreakShield**: `{ count, usedDates, earnedMilestone, earnedAt, updatedAt }`. Firestore: campo `streakShield` no doc `users/{uid}`. Convidado: `@vapefree_streak_shield`. Escudo de proteção do streak: 1 escudo (máximo 1 guardado) a cada 7 dias de sequência; quando um dia quebra o streak — sem registro **ou** com registro `used === true` — o escudo é consumido e esse dia entra em `usedDates`, passando a contar como dia limpo. `earnedMilestone` é o múltiplo de 7 já premiado (não ganha duas vezes pelo mesmo marco, e cai junto quando o streak quebra de vez); `earnedAt` é o dia do último escudo ganho — escudo nunca cobre dia anterior a ele, senão emendaria o streak com um passado já quebrado. Sincronizado por `sincronizarEscudoDeStreak(records)` no `carregar()` da HomeScreen e no `darRecompensas` da RegisterScreen; devolve também `diasConsumidos` (dias protegidos naquela chamada) pra tela avisar o usuário.

**AppOpenDays**: array de datas `'YYYY-MM-DD'` em que o app foi aberto (uma entrada por dia, máximo 60 dias). Firestore: campo `appOpenDays` no doc `users/{uid}`. Convidado: `@vapefree_app_opens`. Gravado por `registrarAberturaDoApp()` no `carregar()` da HomeScreen (idempotente no dia); só serve à conquista `app_open_7`.

**Mission (concluída)**: `{ id, missionId, period, periodKey, xp, completedAt }`. `id` = `` `${missionId}_${periodKey}` `` (ex: `daily_clean_2026-07-22`), o que torna a gravação idempotente dentro do período. `period` ∈ `'daily' | 'weekly'`; `periodKey` é a data do dia (diária) ou da segunda-feira da semana (semanal). Firestore: subcoleção `users/{uid}/missions`, doc id = o próprio `id`. Convidado: array em `@vapefree_missions`. Só missões **concluídas** são gravadas — a lista de missões possíveis é código, em `utils/missions.js`. Ver [missions.md](missions.md).

**XP** (snapshot): `{ xp, level, levelName, updatedAt }`. Firestore: campo `xp` no doc `users/{uid}`. Convidado: `@vapefree_xp`. **Não é a fonte da verdade** — o XP é sempre *derivado* de registros + conquistas + missões + melhor streak por `calcularXp` (`utils/xp.js`); esse snapshot é só cache do último cálculo, gravado por `atualizarXp(records, achievements, missions)` (chamado no `carregar()` da HomeScreen, da MissionsScreen e depois de salvar registro/sessão de crise). Regras: +10 XP por registro, +30 por dia registrado sem uso, +100 por cada 7 dias seguidos sem uso (melhor streak histórico), + o campo `xp` de cada conquista desbloqueada, + o `xp` gravado em cada missão concluída. `atualizarXp` também devolve `ganho` (diferença pro snapshot anterior) — é o que alimenta o toast de XP. Níveis em `NIVEIS`: Iniciante 0, Resistente 200, Guerreiro 500, Campeão 1000, Lendário 2000+.

**CrisisSession** (modo crise): `{ id, date, time, method, durationSec, completed, outcome, note }`. `id` = `Date.now()`, `method` ∈ `'respiracao' | 'timer' | 'distracao' | null`, `outcome` ∈ `'passou' | 'diminuiu' | 'usei' | null` (null = usuário pulou o feedback). Firestore: subcoleção `users/{uid}/crisisSessions`. Convidado: array em `@vapefree_crisis`. Salva sempre que o usuário encerra a `CrisisScreen`, mesmo sem responder o feedback — ter pedido ajuda já é dado. Lido por `metodoDeCriseRecomendado` (`utils/insights.js`) para sugerir na próxima crise o método que já funcionou.

## Cálculo de economia

`recalcularEconomia(records, device)`: `costPerPuff = device.price / device.totalPuffs`, `dailyGoal = device.totalPuffs / device.days`. Para cada dia com registro, `economia = max(0, dailyGoal - puffsUsados) * costPerPuff`. Grava o mapa inteiro via `definirEconomia`. Chamado depois de qualquer `salvarRegistro`/`atualizarRegistro`/`excluirRegistro` e depois de salvar um `aparelho` novo.

## Migração convidado → conta

`migrarDadosDoConvidadoParaConta(uid)`: lê tudo do `AsyncStorage`, grava `aparelho`/`economia`/`xp` no doc `users/{uid}` (merge), substitui inteiramente as subcoleções `registros`, `conquistas`, `sessoesDeCrise` e `missoes` (apaga os docs existentes na conta antes de escrever — é uma sobreposição, não um merge de listas), depois limpa o `AsyncStorage`. Detalhe do fluxo de UI em [auth.md](auth.md).

## Helpers puros (sem I/O)

`dataDeHoje()`, `ultimosNDias(n)`, `ultimasNSemanas(n)`, `ultimosNMeses(n)`, `rotuloSemana(dateStr)`, `rotuloMes(dateStr)` — todos em `utils/storage.js`, usados pelas telas para montar os gráficos. `calcularStreak(records, protectedDates)` vive em `utils/achievements.js` mas é re-exportado por `storage.js` (`export { calcularStreak }`) por conveniência histórica — importe de onde for mais natural no arquivo, ambos funcionam. `diasProtegidos` são os `usedDates` do StreakShield — passe sempre que a tela mostrar streak ao usuário, senão o escudo não aparece na conta. `encontrarDataDeQuebraDeStreak(records, protectedDates)` (mesmo arquivo) devolve o dia que está segurando o streak, e é o que o escudo cobre.
