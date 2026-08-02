# Missões

Missões diárias e semanais que renovam sozinhas, dão XP e podem desbloquear conquistas. Lista de missões possíveis (código, não persistida): `utils/missions.js` → `MISSOES`.

## Modelo — mesma ideia das conquistas

Missão **não** é contador. O progresso é sempre derivado de dados que já existem (`registros`, `economia`, `sessoesDeCrise`); o que fica salvo é só a lista de missões **concluídas**. Assim reabrir a tela, editar um registro ou trocar de aparelho não duplica nem apaga XP. Ver [database.md](database.md) para o shape gravado e `utils/xp.js` para como o XP entra na conta.

Cada entrada em `MISSOES`:

```js
{ id, period: 'daily' | 'weekly', xp, icone, titulo, descricao,
  progresso: (ctx) => ({ atual, alvo }),   // concluída quando atual >= alvo
  disponivel: (ctx) => boolean }           // OPCIONAL — ver abaixo
```

`ctx` vem de `montarContextoDeMissoes({ registros, economia, sessoesDeCrise, meta, aparelho, hoje })` — **objeto, não argumentos posicionais** — e traz `{ registros, economia, sessoesDeCrise, meta, aparelho, hoje, diasDaSemana }`.

`disponivel(ctx)` filtra a missão da lista inteira quando ela não faz sentido pro usuário: as missões de meta somem pra quem não tem meta nem aparelho cadastrado, em vez de aparecer travadas em 0/1. Missão já concluída num período continua aparecendo mesmo que fique indisponível depois — o XP dela já é do usuário.

## Período e idempotência

- Diária: `periodKey` = `'YYYY-MM-DD'` do dia.
- Semanal: `periodKey` = data da segunda-feira daquela semana (`inicioDaSemana`).

O id da entrada salva é `` `${missionId}_${periodKey}` `` — é isso que faz a missão "renovar" quando o período vira e impede gravar duas vezes no mesmo período.

## Missões atuais

| id                        | período | XP  | condição                                                                             |
| ------------------------- | ------- | --- | ------------------------------------------------------------------------------------ |
| `daily_record`            | diária  | 15  | existe registro de hoje                                                              |
| `daily_clean`             | diária  | 25  | registro de hoje com `used === false`                                                |
| `daily_crisis_win`        | diária  | 20  | sessão de crise hoje com `outcome` ≠ `'usei'`                                        |
| `weekly_clean_5`          | semanal | 80  | 5 dias limpos na semana (não precisa ser seguido)                                    |
| `weekly_records_7`        | semanal | 60  | registro nos 7 dias da semana                                                        |
| `weekly_economy_10`       | semanal | 50  | soma de `economy[date]` da semana ≥ R$ 10                                            |
| `daily_under_goal`        | diária  | 20  | dia registrado e dentro da meta do dia (`metaEfetiva`) — só aparece com meta efetiva |
| `weekly_under_goal_5`     | semanal | 70  | 5 dias da semana dentro da meta do respectivo dia — só aparece com meta efetiva      |
| `weekly_crisis_over_vape` | semanal | 60  | 3 sessões de crise na semana com `outcome` ≠ `'usei'`                                |
| `weekly_streak_3`         | semanal | 40  | 3 dias consecutivos com registro dentro da semana                                    |

A "meta do dia" das duas primeiras vem de `metaEfetiva(meta, aparelho, data)` (`utils/meta.js`): a meta de redução declarada pelo usuário ganha da derivada do aparelho. Ver [database.md](database.md).

Concluir a primeira missão desbloqueia a conquista `first_mission` (`utils/achievements.js`).

## Fluxo em runtime

A tela **não** repete os passos na mão: chama `sincronizarGamificacao(entrada?)` (`utils/storage.js`), que faz o bloco inteiro na ordem certa e nunca lança:

1. Carrega `registros`, `economia`, `sessoesDeCrise` e `diasDeAbertura` — ou usa os que a tela já carregou e passou em `entrada` (`{ registros, economia, sessoesDeCrise, diasDeAbertura }`, todos opcionais).
2. `verificarEConcluirMissoes(records, economy, crisisSessions)` avalia, **salva** as recém-concluídas e devolve só essas novas.
3. `verificarEDesbloquearConquistas(records, economy, completedMissions, ctx)` — a ordem importa: concluir missão pode desbloquear conquista (ex: `first_mission`).
4. `atualizarXp(records, null, completedMissions)` por último, já com missão e conquista novas contabilizadas.

Devolve `{ registros, economia, sessoesDeCrise, diasDeAbertura, meta, aparelho, missoesConcluidas, resumo, recompensas }`. A tela então:

5. `mostrarRecompensas(recompensas)` (`context/ToastContext.js`) — `recompensas` já vem no shape `{ conquistas, missoes, ganho }`; quem quer customizar o toast espalha e sobrescreve (`{ ...recompensas, icone, titulo }`, como o `RegisterScreen`).
6. Para exibir a lista, usa `verificarMissoes(ctx, missoesConcluidas)` — devolve o estado de todas as missões do período com `current`/`target`/`completed`.

### Períodos fechados viram um resumo

Passo 2.5 do bloco: `consolidarMissoesFechadas(hoje)` troca as entradas de período já fechado por uma única entrada `_resumo` (`{ summary: true, xp, count, until, updatedAt }`), mantendo detalhadas só as do dia e da semana corrente. Sem isso a subcoleção crescia ~1400 docs/ano e todos eram lidos toda vez, mesmo com só o `xp` importando depois que o período passa. Ela reaproveita a leitura que a sincronização já faz e devolve a lista consolidada — sem leitura extra.

O resumo entra na lista de `obterMissoes()` como qualquer entrada: `calcularXp` soma o `xp` dele e descarta a entrada crua já coberta pelo `until`, e `verificarMissoes` o ignora (`_resumo` não bate com nenhum `missionId_periodKey`). **`missoesConcluidas.length` não é o número de missões concluídas** — a conquista `first_mission` só pergunta `>= 1`, o que continua certo. Detalhe do shape e da trava `until` em [database.md](database.md).

### Recálculo só quando muda (dirty flag)

Os passos 2–4 são **derivados**: sem escrita no meio, dentro do mesmo dia e do mesmo uid, dão exatamente o mesmo resultado. Como toda tela chama `sincronizarGamificacao` no `useFocusEffect`, isso era uma leitura das missões + uma reescrita do snapshot de XP a cada troca de tela.

Hoje o bloco 2–4 só roda quando:

- alguma escrita marcou `marcarGamificacaoSuja()` (`utils/storage.js`) — toda escrita que entra no cálculo chama isso: registro (salvar/atualizar/excluir), aparelho, meta, economia, sessão de crise (salvar/atualizar/excluir), primeiro `registrarAberturaDoApp()` do dia, migração de convidado e apagamento de dados;
- **o dia virou** (missão diária e streak dependem da data); ou
- **o uid mudou** (login, logout, migração).

Fora disso a função ainda devolve os dados carregados, mas serve `missoesConcluidas` e `resumo` da última execução e `recompensas` vazio (`{ conquistas: [], missoes: [], ganho: 0 }`) — nenhuma leitura de missões, nenhuma escrita de XP. A marcação é conservadora de propósito: a escrita suja antes de saber se deu certo, porque sujar à toa custa um recálculo, enquanto não sujar deixaria conquista/missão presa.

Consequência para código novo: **escrita que influencia missão/conquista/XP e não passa por `utils/storage.js` precisa chamar `marcarGamificacaoSuja()`**, senão a recompensa só aparece na virada do dia. O único caso não coberto é dado que chega do servidor por outro aparelho — ele só entra no cálculo na próxima escrita local ou virada de dia.

**Execução serializada.** Cada chamada espera a anterior terminar (uma promise em andamento em `utils/storage.js`, mesma ideia do `sincronizar` de `utils/offline.js`). Sem isso, duas telas focando quase juntas (trocar de aba rápido) liam `gamificacaoSuja === true` antes do reset, rodavam `verificarEDesbloquearConquistas` sobre a mesma lista sem a conquista nova e devolviam a **mesma** conquista em `recompensas` — o `AchievementCelebration` abria o troféu duas vezes. Serializada, a segunda chamada já encontra a flag limpa e cai no reuso com recompensas vazias.

Chamam `sincronizarGamificacao`: `HomeScreen` (passando `diasDeAbertura` de `registrarAberturaDoApp`), `MissionsScreen`, `RegisterScreen` (após salvar), `CrisisScreen` (ao encerrar a sessão), `HistoryScreen` (após editar/excluir registro — muda puxadas e economia), `DeviceScreen` (após salvar aparelho — recalcula a economia inteira) e `AchievementsScreen` (ao focar — a lista exibida precisa do desbloqueio já persistido). **Não** reimplemente a sequência numa tela nova.

## UI

- `components/MissionsCard.js`: card na `HomeScreen`, logo abaixo do card de nível/XP. Mostra só as diárias, com contador `x/3` e barra de progresso; rodapé navega para `Missions`.
- `screens/MissionsScreen.js`: tela do `MainStack` (não é tab), seções "Hoje" e "Esta semana" com barra de progresso por missão.

## Ao adicionar uma missão nova

Adicione a entrada em `MISSOES` com `progress` **pura** (sem I/O) e um `id` novo e estável — o `id` faz parte da chave do documento salvo, então renomear id perde histórico. Não mude o `xp` de uma missão esperando corrigir XP passado: `calcularXp` usa o `xp` gravado na entrada concluída, de propósito.
