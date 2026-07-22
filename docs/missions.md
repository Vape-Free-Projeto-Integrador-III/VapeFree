# Missões

Missões diárias e semanais que renovam sozinhas, dão XP e podem desbloquear conquistas. Lista de missões possíveis (código, não persistida): `utils/missions.js` → `MISSOES`.

## Modelo — mesma ideia das conquistas

Missão **não** é contador. O progresso é sempre derivado de dados que já existem (`registros`, `economia`, `sessoesDeCrise`); o que fica salvo é só a lista de missões **concluídas**. Assim reabrir a tela, editar um registro ou trocar de aparelho não duplica nem apaga XP. Ver [database.md](database.md) para o shape gravado e `utils/xp.js` para como o XP entra na conta.

Cada entrada em `MISSOES`:

```js
{ id, period: 'daily' | 'weekly', xp, icone, titulo, descricao,
  progress: (ctx) => ({ atual, alvo }) }   // concluída quando current >= target
```

`ctx` vem de `montarContextoDeMissoes(records, economy, crisisSessions, today)` e traz `{ records, economy, crisisSessions, today, weekDays }`.

## Período e idempotência

- Diária: `periodKey` = `'YYYY-MM-DD'` do dia.
- Semanal: `periodKey` = data da segunda-feira daquela semana (`inicioDaSemana`).

O id da entrada salva é `` `${missionId}_${periodKey}` `` — é isso que faz a missão "renovar" quando o período vira e impede gravar duas vezes no mesmo período.

## Missões atuais

| id | período | XP | condição |
|---|---|---|---|
| `daily_record` | diária | 15 | existe registro de hoje |
| `daily_clean` | diária | 25 | registro de hoje com `used === false` |
| `daily_crisis_win` | diária | 20 | sessão de crise hoje com `outcome` ≠ `'usei'` |
| `weekly_clean_5` | semanal | 80 | 5 dias limpos na semana (não precisa ser seguido) |
| `weekly_records_7` | semanal | 60 | registro nos 7 dias da semana |
| `weekly_economy_10` | semanal | 50 | soma de `economy[date]` da semana ≥ R$ 10 |

Concluir a primeira missão desbloqueia a conquista `first_mission` (`utils/achievements.js`).

## Fluxo em runtime

1. A tela carrega `registros`, `economia` e `sessoesDeCrise`.
2. `verificarEConcluirMissoes(records, economy, crisisSessions)` (`utils/storage.js`) avalia, **salva** as recém-concluídas e devolve só essas novas.
3. `verificarEDesbloquearConquistas(records, economy, completedMissions)` e `atualizarXp(records, null, completedMissions)`.
4. `mostrarRecompensas({ achievements, missions, gained })` (`context/XpToastContext.js`) mostra um toast por conquista/missão nova e um genérico com o XP restante.
5. Para exibir, a tela usa `verificarMissoes(ctx, completedMissions)` — devolve o estado de todas as missões do período com `current`/`target`/`completed`.

Esse fluxo roda em `HomeScreen`, `MissionsScreen`, `RegisterScreen` (após salvar) e `CrisisScreen` (ao encerrar a sessão).

## UI

- `components/MissionsCard.js`: card na `HomeScreen`, logo abaixo do card de nível/XP. Mostra só as diárias, com contador `x/3` e barra de progresso; rodapé navega para `Missions`.
- `screens/MissionsScreen.js`: tela do `MainStack` (não é tab), seções "Hoje" e "Esta semana" com barra de progresso por missão.

## Ao adicionar uma missão nova

Adicione a entrada em `MISSOES` com `progress` **pura** (sem I/O) e um `id` novo e estável — o `id` faz parte da chave do documento salvo, então renomear id perde histórico. Não mude o `xp` de uma missão esperando corrigir XP passado: `calcularXp` usa o `xp` gravado na entrada concluída, de propósito.
