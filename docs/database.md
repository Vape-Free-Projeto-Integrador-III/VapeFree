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

**Record** (um por `saveRecord`, id = `Date.now()`):
```js
{ id, date /* 'YYYY-MM-DD' */, time /* 'HH:MM' */, devType /* 'desc'|'rec' */,
  used /* bool */, puffs /* number */, triggers /* string[] label */,
  helps /* string[] label */, intensity /* 0-10 */ }
```
Firestore: subcoleção `users/{uid}/records`, doc id = `String(record.id)`. Convidado: array em `@vapefree_records`.

**Device** (um por usuário):
```js
{ name, type /* 'desc'|'rec' */, price, totalPuffs, days }
```
Firestore: campo `device` no doc `users/{uid}`. Convidado: `@vapefree_device`.

**Economy**: mapa `{ [date]: valorEconomizadoNoDia }`, recalculado por `recalcEconomy(records, device)` — nunca editado manualmente pela UI. Firestore: campo `economy` no doc `users/{uid}`. Convidado: `@vapefree_economy`.

**Achievement (desbloqueada)**: `{ id, unlockedAt }`. Firestore: subcoleção `users/{uid}/achievements`, doc id = `String(achievementId)`. Convidado: array em `@vapefree_achievements`. Lista completa de conquistas possíveis (não persistida, é código) está em `utils/achievements.js` — ver `ACHIEVEMENTS`.

**Mission (concluída)**: `{ id, missionId, period, periodKey, xp, completedAt }`. `id` = `` `${missionId}_${periodKey}` `` (ex: `daily_clean_2026-07-22`), o que torna a gravação idempotente dentro do período. `period` ∈ `'daily' | 'weekly'`; `periodKey` é a data do dia (diária) ou da segunda-feira da semana (semanal). Firestore: subcoleção `users/{uid}/missions`, doc id = o próprio `id`. Convidado: array em `@vapefree_missions`. Só missões **concluídas** são gravadas — a lista de missões possíveis é código, em `utils/missions.js`. Ver [missions.md](missions.md).

**XP** (snapshot): `{ xp, level, levelName, updatedAt }`. Firestore: campo `xp` no doc `users/{uid}`. Convidado: `@vapefree_xp`. **Não é a fonte da verdade** — o XP é sempre *derivado* de registros + conquistas + missões + melhor streak por `calcXp` (`utils/xp.js`); esse snapshot é só cache do último cálculo, gravado por `refreshXp(records, achievements, missions)` (chamado no `load()` da HomeScreen, da MissionsScreen e depois de salvar registro/sessão de crise). Regras: +10 XP por registro, +30 por dia registrado sem uso, +100 por cada 7 dias seguidos sem uso (melhor streak histórico), + o campo `xp` de cada conquista desbloqueada, + o `xp` gravado em cada missão concluída. `refreshXp` também devolve `gained` (diferença pro snapshot anterior) — é o que alimenta o toast de XP. Níveis em `LEVELS`: Iniciante 0, Resistente 200, Guerreiro 500, Campeão 1000, Lendário 2000+.

**CrisisSession** (modo crise): `{ id, date, time, method, durationSec, completed, outcome, note }`. `id` = `Date.now()`, `method` ∈ `'respiracao' | 'timer' | 'distracao' | null`, `outcome` ∈ `'passou' | 'diminuiu' | 'usei' | null` (null = usuário pulou o feedback). Firestore: subcoleção `users/{uid}/crisisSessions`. Convidado: array em `@vapefree_crisis`. Salva sempre que o usuário encerra a `CrisisScreen`, mesmo sem responder o feedback — ter pedido ajuda já é dado. Lido por `recommendedCrisisMethod` (`utils/insights.js`) para sugerir na próxima crise o método que já funcionou.

## Cálculo de economia

`recalcEconomy(records, device)`: `costPerPuff = device.price / device.totalPuffs`, `dailyGoal = device.totalPuffs / device.days`. Para cada dia com registro, `economia = max(0, dailyGoal - puffsUsados) * costPerPuff`. Grava o mapa inteiro via `setEconomy`. Chamado depois de qualquer `saveRecord`/`updateRecord`/`deleteRecord` e depois de salvar um `device` novo.

## Migração convidado → conta

`migrateGuestLocalDataToUser(uid)`: lê tudo do `AsyncStorage`, grava `device`/`economy`/`xp` no doc `users/{uid}` (merge), substitui inteiramente as subcoleções `records`, `achievements`, `crisisSessions` e `missions` (apaga os docs existentes na conta antes de escrever — é uma sobreposição, não um merge de listas), depois limpa o `AsyncStorage`. Detalhe do fluxo de UI em [auth.md](auth.md).

## Helpers puros (sem I/O)

`todayString()`, `getLastNDays(n)`, `getLastNWeeks(n)`, `getLastNMonths(n)`, `getWeekLabel(dateStr)`, `getMonthLabel(dateStr)` — todos em `utils/storage.js`, usados pelas telas para montar os gráficos. `calcStreak(records)` vive em `utils/achievements.js` mas é re-exportado por `storage.js` (`export { calcStreak }`) por conveniência histórica — importe de onde for mais natural no arquivo, ambos funcionam.
