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
- **Convidado** (`uid` nulo) → `AsyncStorage` local, chaves fixas (`@vapefree_records`, `@vapefree_device`, `@vapefree_economy`, `@vapefree_achievements`, `@vapefree_crisis`).

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

**CrisisSession** (modo crise): `{ id, date, time, method, durationSec, completed, outcome, note }`. `id` = `Date.now()`, `method` ∈ `'respiracao' | 'timer' | 'distracao' | null`, `outcome` ∈ `'passou' | 'diminuiu' | 'usei' | null` (null = usuário pulou o feedback). Firestore: subcoleção `users/{uid}/crisisSessions`. Convidado: array em `@vapefree_crisis`. Salva sempre que o usuário encerra a `CrisisScreen`, mesmo sem responder o feedback — ter pedido ajuda já é dado. Lido por `recommendedCrisisMethod` (`utils/insights.js`) para sugerir na próxima crise o método que já funcionou.

## Cálculo de economia

`recalcEconomy(records, device)`: `costPerPuff = device.price / device.totalPuffs`, `dailyGoal = device.totalPuffs / device.days`. Para cada dia com registro, `economia = max(0, dailyGoal - puffsUsados) * costPerPuff`. Grava o mapa inteiro via `setEconomy`. Chamado depois de qualquer `saveRecord`/`updateRecord`/`deleteRecord` e depois de salvar um `device` novo.

## Migração convidado → conta

`migrateGuestLocalDataToUser(uid)`: lê tudo do `AsyncStorage`, grava `device`/`economy` no doc `users/{uid}` (merge), substitui inteiramente as subcoleções `records`, `achievements` e `crisisSessions` (apaga os docs existentes na conta antes de escrever — é uma sobreposição, não um merge de listas), depois limpa o `AsyncStorage`. Detalhe do fluxo de UI em [auth.md](auth.md).

## Helpers puros (sem I/O)

`todayString()`, `getLastNDays(n)`, `getLastNWeeks(n)`, `getLastNMonths(n)`, `getWeekLabel(dateStr)`, `getMonthLabel(dateStr)` — todos em `utils/storage.js`, usados pelas telas para montar os gráficos. `calcStreak(records)` vive em `utils/achievements.js` mas é re-exportado por `storage.js` (`export { calcStreak }`) por conveniência histórica — importe de onde for mais natural no arquivo, ambos funcionam.
