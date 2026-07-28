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

Exceção às duas regras acima: `@vapefree_onboarding` (flag `'true'` do tutorial de boas-vindas, lida/gravada por `onboardingFoiConcluido()`/`concluirOnboarding()`). É preferência **do aparelho**, como `@vapefree_dark_mode` e `@vapefree_guest_mode`: nunca vai pro Firestore, não tem espelho e fica de fora de `CHAVES` de propósito, pra `limparDadosLocaisDoConvidado()` não apagá-la e o tutorial não reaparecer depois de um login.

O modo convidado fala direto com o `AsyncStorage`. O modo conta **não** fala direto com o Firestore: passa pelo espelho local + fila de `utils/offline.js` (ver abaixo).

## Offline-first (modo conta)

`utils/offline.js` é o motor; só `utils/storage.js` importa dele (a UI usa `context/ConnectionContext.js`). Duas peças:

- **Espelho** — cópia local do que está no Firestore, no `AsyncStorage`, sob `@vapefree_cache_{uid}_{nome}`, com `nome` ∈ `records`, `achievements`, `crisisSessions`, `missions`, `device`, `economy`, `xp`, `appOpenDays`.
- **Fila** — `@vapefree_queue_{uid}`, array ordenado de mutações `{ id, tipo, colecao, docId, dados, tentativas }`, com `tipo` ∈ `'set' | 'delete' | 'merge_usuario'` (esse último = `setDoc(users/{uid}, dados, { merge: true })`, usado por device/economy/xp/appOpenDays).

Como cada operação se comporta:

- **Leitura** (`lerDaConta`): tenta drenar a fila; se sobrou pendência, devolve o espelho. Senão busca no Firestore, atualiza o espelho e devolve. Sincronizar antes de ler é o que evita o dado remoto antigo sobrescrever o que o usuário acabou de escrever offline.
- **Escrita** (`escreverNaConta`): aplica no espelho, empilha a mutação e chama `sincronizar` sem `await` — a tela nunca espera a rede.
- **`comTempoLimite(promessa, 8000)`** envolve toda chamada de rede. É obrigatório: offline, o `setDoc` do SDK **não rejeita**, a promise fica pendurada pra sempre. Sem timeout a tela travava no "salvando", sem erro e sem sucesso.
- **Conflito**: last-write-wins com a fila local vencendo — a mutação enfileirada sobrescreve o servidor.
- **Compactação**: ao enfileirar, mutações anteriores do mesmo `(colecao, docId)` (ou do mesmo campo, no `merge_usuario`) são removidas, pra fila não crescer sem limite em dias offline.
- **Valores derivados** (`economy`, `xp`, `appOpenDays`) sobem inteiros, não documento por documento. `podeEscreverDerivado` bloqueia essa escrita quando o espelho de origem ainda está frio **e** não há rede — senão um cálculo feito em cima de histórico vazio apagaria o que está na conta. A próxima leitura online refaz. As subcoleções não precisam disso: usam `set`/`delete` por doc.
- Uma mutação que falha `LIMITE_DE_TENTATIVAS` (5) vezes é descartada — erro permanente (regra de segurança, dado inválido) não pode prender a fila inteira.

Por que fila própria e não `enablePersistence()`: o `persistentLocalCache` do firebase JS SDK depende de IndexedDB, que não existe em React Native. Só o `@react-native-firebase` (SDK nativo) teria essa opção.

`precarregarEspelho()` (em `storage.js`) aquece o espelho depois do login/reconexão — sem isso, quem loga e fica offline antes de abrir as telas ainda veria o app vazio. Chamado por `ConnectionContext`.

`descartarEspelhoDaConta(uid)` é usado no logout, e **só** quando a fila está vazia: com pendência, espelho e fila ficam salvos pra subir no próximo login nesse aparelho.

## Retorno das escritas

Escritas **iniciadas pelo usuário** devolvem `{ ok: true }` ou `{ ok: false, motivo }`:

`salvarRegistro`, `atualizarRegistro`, `excluirRegistro`, `salvarAparelho`, `definirEconomia`, `salvarSessaoDeCrise`.

Motivos: `'rede'` (falha de AsyncStorage), `'data_invalida'` (`salvarRegistro`, data fora da janela de 7 dias), `'nao_encontrado'` (`atualizarRegistro`, id inexistente em modo convidado). A tela **precisa** checar `ok` e chamar `mostrarErro` do `usarToast()` — e não pode conceder XP nem mostrar sucesso quando a gravação falhou.

Com o offline-first, `'rede'` praticamente sumiu do modo conta: a escrita é aceita no espelho e sobe depois. O contrato continua o mesmo pras telas (nada muda nelas), e `'rede'` segue possível no modo convidado.

Escritas **de fundo** continuam retornando boolean silencioso: `salvarConquista`, `salvarMissao`, `salvarEstadoDeXp`, `registrarAberturaDoApp`. Não têm ação de usuário atrás e são reprocessadas no próximo foco de tela.

**Leituras** seguem com fallback neutro (`[]`, `{}`, `null`) quando nem servidor nem espelho respondem — aí sim não dá pra distinguir "vazio" de "falhou". Com espelho quente, offline devolve o dado real.

## Modelo de dados

**Record** (um por `salvarRegistro`, id = `Date.now()`):
```js
{ id, date /* 'YYYY-MM-DD' */, time /* 'HH:MM' */,
  used /* bool */, puffs /* number */, triggers /* string[] label */,
  helps /* string[] label */, intensity /* 0-10 */ }
```
Firestore: subcoleção `users/{uid}/records`, doc id = `String(record.id)`. Convidado: array em `@vapefree_records`.

`salvarRegistro`/`atualizarRegistro` passam o registro por `normalizarRegistro` (`utils/records.js`) antes de gravar: com `used: false`, `puffs` vira `0` e `triggers` vira `[]`. Para somar puxadas em qualquer lugar (gráficos, totais, economia, insights) use `puxadasDoRegistro(record)` / `somarPuxadas(records)` do mesmo arquivo — nunca `record.puffs` direto, porque registros salvos antes dessa normalização podem ter `puffs > 0` com `used: false` (foi editado de "usei" para "não usei").

**Janela de criação**: `salvarRegistro` recusa (`{ ok: false, motivo: 'data_invalida' }`) qualquer `date` fora de `datasRegistraveis()` — hoje ou até `DIAS_PARA_TRAS_NO_REGISTRO` (7) dias atrás. Vale só pra criação: `atualizarRegistro` continua aceitando qualquer data, pra edição de registro antigo pelo histórico seguir funcionando. Existe porque o XP é derivado dos registros (ver `utils/xp.js`) — sem o limite dava pra preencher anos de dias limpos falsos e inflar XP/conquistas. A RegisterScreen usa a mesma lista pra montar o seletor de data, mas a checagem no storage é a que vale.

**Device** (um por usuário):
```js
{ name, price, totalPuffs, days }
```
Firestore: campo `device` no doc `users/{uid}`. Convidado: `@vapefree_device`.

**Economy**: mapa `{ [date]: valorEconomizadoNoDia }`, recalculado por `recalcularEconomia(records, device)` — nunca editado manualmente pela UI. Firestore: campo `economy` no doc `users/{uid}`. Convidado: `@vapefree_economy`.

**Achievement (desbloqueada)**: `{ id, unlockedAt }`. Firestore: subcoleção `users/{uid}/achievements`, doc id = `String(achievementId)`. Convidado: array em `@vapefree_achievements`. Lista completa de conquistas possíveis (não persistida, é código) está em `utils/achievements.js` — ver `CONQUISTAS`. Cada `condicao(records, economy, completedMissions, context)` recebe em `contexto` o que não está nos registros: `{ crisisSessions, appOpenDays }` (montado por `verificarEDesbloquearConquistas`, ou passado pronto pela tela que já carregou esses dados).

**AppOpenDays**: array de datas `'YYYY-MM-DD'` em que o app foi aberto (uma entrada por dia, máximo 60 dias). Firestore: campo `appOpenDays` no doc `users/{uid}`. Convidado: `@vapefree_app_opens`. Gravado por `registrarAberturaDoApp()` no `carregar()` da HomeScreen (idempotente no dia); só serve à conquista `app_open_7`.

**Mission (concluída)**: `{ id, missionId, period, periodKey, xp, completedAt }`. `id` = `` `${missionId}_${periodKey}` `` (ex: `daily_clean_2026-07-22`), o que torna a gravação idempotente dentro do período. `period` ∈ `'daily' | 'weekly'`; `periodKey` é a data do dia (diária) ou da segunda-feira da semana (semanal). Firestore: subcoleção `users/{uid}/missions`, doc id = o próprio `id`. Convidado: array em `@vapefree_missions`. Só missões **concluídas** são gravadas — a lista de missões possíveis é código, em `utils/missions.js`. Ver [missions.md](missions.md).

**XP** (snapshot): `{ xp, level, levelName, updatedAt }`. Firestore: campo `xp` no doc `users/{uid}`. Convidado: `@vapefree_xp`. **Não é a fonte da verdade** — o XP é sempre *derivado* de registros + conquistas + missões + melhor streak por `calcularXp` (`utils/xp.js`); esse snapshot é só cache do último cálculo, gravado por `atualizarXp(records, achievements, missions)` (chamado no `carregar()` da HomeScreen, da MissionsScreen e depois de salvar registro/sessão de crise). Regras: +10 XP por registro, +30 por dia registrado sem uso, +100 por cada 7 dias seguidos sem uso (melhor streak histórico), + o campo `xp` de cada conquista desbloqueada, + o `xp` gravado em cada missão concluída. `atualizarXp` também devolve `ganho` (diferença pro snapshot anterior) — é o que alimenta o toast de XP. Níveis em `NIVEIS`: Iniciante 0, Resistente 200, Guerreiro 500, Campeão 1000, Lendário 2000+.

**CrisisSession** (modo crise): `{ id, date, time, method, durationSec, completed, outcome, note }`. `id` = `Date.now()`, `method` ∈ `'respiracao' | 'timer' | 'distracao' | null`, `outcome` ∈ `'passou' | 'diminuiu' | 'usei' | null` (null = usuário pulou o feedback). Firestore: subcoleção `users/{uid}/crisisSessions`. Convidado: array em `@vapefree_crisis`. Salva sempre que o usuário encerra a `CrisisScreen`, mesmo sem responder o feedback — ter pedido ajuda já é dado. Lido por `metodoDeCriseRecomendado` (`utils/insights.js`) para sugerir na próxima crise o método que já funcionou.

## Cálculo de economia

As duas contas derivadas do aparelho ficam em `utils/records.js`, puras: `custoPorPuxada(device)` (`price / totalPuffs`) e `metaDiaria(device)` (`totalPuffs / days`). Ambas devolvem `null` quando algum campo não é número positivo. Use elas em vez de repetir a fórmula — são as mesmas usadas pela prévia do `DeviceScreen` e pelo alerta de excesso da Home.

`recalcularEconomia(records, device)`: para cada dia com registro, `economia = max(0, metaDiaria - puffsUsados) * custoPorPuxada`. Grava o mapa inteiro via `definirEconomia`. Devolve `{}` sem gravar nada se o aparelho não permitir o cálculo. Chamado depois de qualquer `salvarRegistro`/`atualizarRegistro`/`excluirRegistro` e depois de salvar um `aparelho` novo.

O `max(0, ...)` trunca o excesso: dia acima da meta vira economia `0` e o quanto passou não é persistido em lugar nenhum. Quem precisa desse número usa `excessoDoDia(registrosDoDia, device)` (`utils/records.js`), que devolve `{ puxadasAMais, custoAMais }` derivado na hora do render.

## Migração convidado → conta

`migrarDadosDoConvidadoParaConta(uid)`: lê tudo do `AsyncStorage`, grava `device`/`economy`/`xp`/`appOpenDays` no doc `users/{uid}` (merge), substitui inteiramente as subcoleções `records`, `achievements`, `crisisSessions` e `missions` (apaga os docs existentes na conta antes de escrever — é uma sobreposição, não um merge de listas), preenche o espelho local com o que subiu e só então limpa o `AsyncStorage`. Detalhe do fluxo de UI em [auth.md](auth.md).

É a **única operação que exige internet**: sai devolvendo `false` se `estaOnline()` for falso, e qualquer erro no meio é capturado — nesse caso os dados locais do convidado ficam intactos, pra dar pra tentar de novo. Não entra na fila offline porque apaga documentos remotos antes de escrever; parar no meio disso deixaria a conta pela metade.

## Helpers puros (sem I/O)

`dataDeHoje()`, `ultimosNDias(n)`, `ultimasNSemanas(n)`, `ultimosNMeses(n)`, `rotuloSemana(dateStr)`, `rotuloMes(dateStr)` — todos em `utils/storage.js`, usados pelas telas para montar os gráficos. `calcularEstadoDeStreak(records)` e o atalho `calcularStreak(records)` vivem em `utils/achievements.js` e são re-exportados por `storage.js` — importe de onde for mais natural no arquivo, ambos funcionam.

`calcularEstadoDeStreak` devolve `{ streak, escudos, progresso, diasProtegidos, ultimoDiaProtegido, gastouEscudoNoUltimoDia }`, simulando o histórico **pra frente**, do primeiro ao último dia com registro (dias depois do último registro não são avaliados, senão o streak quebraria sozinho antes de o usuário registrar hoje). Regras do escudo de streak:

- Dia limpo = dia com pelo menos um registro e nenhum com `used === true`; soma 1 no `streak` e 1 no `progresso`.
- A cada `DIAS_PARA_ESCUDO` (7) dias limpos ganha 1 escudo, máximo 1 guardado. Com o escudo cheio o `progresso` congela em 7 em vez de transbordar — senão gastar o escudo devolveria outro na hora.
- Dia com uso registrado, tendo escudo e `streak > 0`: gasta o escudo, o `streak` **ainda soma 1** e o `progresso` volta a zero (esse dia não conta pros próximos 7). O dia entra em `diasProtegidos`.
- Dia sem registro nenhum, ou dia com uso sem escudo: zera `streak`, `escudos` e `progresso` — escudo não cobre esquecimento e não sobrevive à quebra da sequência.

**O escudo não é dado persistido.** É derivado dos registros a cada leitura, o que torna impossível ele ficar dessincronizado: editar ou apagar um registro antigo recalcula tudo. A versão anterior guardava estado incremental (`streakShield` no Firestore) e ficava permanentemente errada depois de qualquer inconsistência.

Dia protegido conta **só para o streak**. Para XP (`utils/xp.js`), missões, gráficos e economia ele continua sendo dia de uso.
