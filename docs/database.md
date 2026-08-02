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
- **Convidado** (`uid` nulo) → `AsyncStorage` local, chaves fixas (`@vapefree_records`, `@vapefree_device`, `@vapefree_device_history`, `@vapefree_goal`, `@vapefree_money_goal`, `@vapefree_economy`, `@vapefree_achievements`, `@vapefree_crisis`, `@vapefree_missions`, `@vapefree_xp`).

Exceção às duas regras acima, as preferências **do aparelho** — como `@vapefree_dark_mode` e `@vapefree_guest_mode`, elas nunca vão pro Firestore, não têm espelho e ficam de fora de `CHAVES` de propósito, pra `limparDadosLocaisDoConvidado()` não apagá-las:

- `@vapefree_onboarding` — flag `'true'` do tutorial de boas-vindas (`onboardingFoiConcluido()`/`concluirOnboarding()`/`reiniciarOnboarding()`). Fora de `CHAVES` pra o tutorial não reaparecer depois de um login.
- `@vapefree_notifications` — `{ ativas, hora, minuto, risco, diaCritico }` do lembrete diário (`obterPreferenciasDeNotificacao()`/`salvarPreferenciasDeNotificacao()`). Quem agenda é o próprio aparelho, então guardar na conta não faria sentido. Ver [notifications.md](notifications.md).

O modo convidado fala direto com o `AsyncStorage`. O modo conta **não** fala direto com o Firestore: passa pelo espelho local + fila de `utils/offline.js` (ver abaixo).

## Offline-first (modo conta)

`utils/offline.js` é o motor; só `utils/storage.js` importa dele (a UI usa `context/ConnectionContext.js`). Duas peças:

- **Espelho** — cópia local do que está no Firestore, no `AsyncStorage`, sob `@vapefree_cache_{uid}_{nome}`, com `nome` ∈ `records`, `achievements`, `crisisSessions`, `missions`, `device`, `deviceHistory`, `goal`, `moneyGoal`, `economy`, `xp`, `appOpenDays`, `profile`.
- **Fila** — `@vapefree_queue_{uid}`, array ordenado de mutações `{ id, tipo, colecao, docId, dados, tentativas }`, com `tipo` ∈ `'set' | 'delete' | 'merge_usuario'` (esse último = `setDoc(users/{uid}, dados, { mergeFields: Object.keys(dados) })`, usado por device/deviceHistory/goal/moneyGoal/economy/xp/appOpenDays/profile). É `mergeFields` e **não** `merge: true` de propósito: `merge: true` faz merge **profundo** de map, e como `economy`/`device`/`goal`/`profile` são maps escritos sempre inteiros, a chave que sumiu do valor novo (dia excluído da economia) sobrevivia no servidor com o valor velho. `mergeFields` substitui cada campo listado por completo e não toca nos outros.

Como cada operação se comporta:

- **Leitura** (`lerDaConta`): tenta drenar a fila; se sobrou pendência, devolve o espelho. Senão, se o espelho foi lido do servidor há menos de `VALIDADE_DO_ESPELHO` (30s, ver abaixo), devolve o espelho. Senão busca no Firestore, atualiza o espelho e devolve. Sincronizar antes de ler é o que evita o dado remoto antigo sobrescrever o que o usuário acabou de escrever offline. Falhar sem espelho completo pra servir de reserva marca **leitura fria** (ver abaixo).
- **Escrita** (`escreverNaConta`): aplica no espelho, empilha a mutação e chama `sincronizar` sem `await` — a tela nunca espera a rede. Escrita de **lista** (registros, conquistas, crises, missões) passa por `escreverListaNaConta`, que marca o espelho como parcial quando ele ainda não era o estado da conta.
- **`comTempoLimite(promessa, 8000)`** envolve toda chamada de rede. É obrigatório: offline, o `setDoc` do SDK **não rejeita**, a promise fica pendurada pra sempre. Sem timeout a tela travava no "salvando", sem erro e sem sucesso.
- **Conflito**: last-write-wins com a fila local vencendo — a mutação enfileirada sobrescreve o servidor.
- **Compactação**: ao enfileirar, mutações anteriores do mesmo `(colecao, docId)` (ou do mesmo campo, no `merge_usuario`) são removidas, pra fila não crescer sem limite em dias offline.
- **Valores derivados** (`economy`, `xp`, `appOpenDays`, `deviceHistory`) sobem inteiros, não documento por documento — e `mergeFields` **substitui o campo por completo**. `podeEscreverDerivado(uid, origem)` só libera essa escrita quando o espelho de origem está **completo** (`espelhoEstaCompleto`). Estar online não vale como prova: com o espelho frio e o `getDocs` estourando o `comTempoLimite`, `obterRegistros` devolve `[]` com o aparelho online, e a economia recalculada em cima disso trocava meses de mapa por um dia só. Recusar não perde nada — o valor é derivado, e a próxima leitura que der certo refaz. Em `salvarAparelho` a trava vale só pro `deviceHistory`: o `device` é o que o usuário digitou e sobe sempre. As subcoleções não precisam disso: usam `set`/`delete` por doc.
- **Uma drenagem por vez, em corrente**: `sincronizar(uid)` chamado no meio de uma execução **não** recebe a promise dela — essa execução já leu a fila antes da mutação nova entrar e devolveria `pendentes` desatualizado (o banner sumiria achando que subiu tudo). A chamada nova espera a atual terminar e drena de novo, com o uid dela. Reusar acontece num caso só: já existe uma drenagem esperando (ainda não leu a fila) para o mesmo uid.
- **Trava da fila** (`comTravaDeFila`, por uid): `enfileirar` e a reescrita final do `drenar` são ler-modificar-escrever sobre a mesma chave do AsyncStorage e rodam concorrentes (a tela enfileira enquanto a drenagem solta está no ar). Sem trava, o `drenar` gravava por cima e a mutação recém-enfileirada sumia sem nunca subir.
- **Só erro permanente conta tentativa** (`erroEhDeRede`): `tempo_limite` do `comTempoLimite`, códigos transitórios do Firestore (`unavailable`, `deadline-exceeded`, `cancelled`, `resource-exhausted`, `internal`, `unknown`, `unauthenticated`, `aborted`, com ou sem prefixo `firestore/`) e mensagem de offline/network deixam a mutação **intacta** na fila. Sem isso, sinal ruim descartava dado do usuário: a drenagem roda muito (toda leitura chama `sincronizar`, ou seja, cada foco de tela, cada escrita, cada volta do AppState, cada reconexão), `estaOnline()` responde `true` (cache de 30s, e chuta `true` quando o NetInfo falha), e cinco timeouts seguidos jogavam fora o registro do dia — que ficava só no aparelho e nunca chegava na conta.
- Uma mutação que falha `LIMITE_DE_TENTATIVAS` (5) vezes sai da fila — erro permanente (regra de segurança, dado inválido) não pode prender a fila inteira. Mas **não some calada**: vai pra lista de falhas (`@vapefree_failed_{uid}`, últimas `LIMITE_DE_FALHAS_GUARDADAS` = 20), `registrarFalha` avisa quem assinou `assinarFalhas`, e o `OfflineBanner` mostra faixa vermelha até o usuário tocar e confirmar. API: `lerFalhas(uid)`, `contarFalhas(uid)`, `limparFalhas(uid)`, `assinarFalhas(cb)`. `drenar`/`sincronizar` devolvem `{ enviadas, pendentes, falhas }`. A chave de falhas também é apagada por `limparCacheEFila`.

Por que fila própria e não `enablePersistence()`: o `persistentLocalCache` do firebase JS SDK depende de IndexedDB, que não existe em React Native. Só o `@react-native-firebase` (SDK nativo) teria essa opção.

### Validade do espelho (TTL de leitura)

Toda tela recarrega no `useFocusEffect`, e cada leitura da conta é um `getDocs` da coleção inteira — trocar de aba três vezes lia o histórico inteiro três vezes (conta de Firestore e bateria). `utils/offline.js` guarda **em memória** quando cada espelho foi lido do servidor (`marcarLeituraDoServidor`, `espelhoEstaFresco`, `invalidarEspelho`) e `lerDaConta` serve o espelho enquanto essa leitura tiver menos de `VALIDADE_DO_ESPELHO` (30s, o mesmo do cache de conexão).

Em memória de propósito: vale só enquanto o app está aberto, então reabrir o app sempre busca do servidor. A janela de erro é só o tempo até uma escrita feita em **outro aparelho** aparecer aqui — escrita local não é afetada, porque atualiza o espelho na hora.

A validade é descartada em: `precarregarEspelho()` (login/reconexão), `limparCacheEFila` (logout, apagar dados) e `forcarLeituraRemota()` — este último é o "puxar pra atualizar" da `HomeScreen`, onde o usuário está pedindo dado novo explicitamente (no modo convidado é no-op).

`precarregarEspelho()` (em `storage.js`) aquece o espelho depois do login/reconexão — sem isso, quem loga e fica offline antes de abrir as telas ainda veria o app vazio. Chamado por `ConnectionContext`.

`descartarEspelhoDaConta(uid)` é usado no logout, e **só** quando a fila está vazia: com pendência, espelho e fila ficam salvos pra subir no próximo login nesse aparelho.

### Espelho completo x parcial x frio

Existir não basta — importa de onde o espelho veio:

- **completo** — preenchido por leitura do servidor (ou por `escreverTudoNaConta`/`apagarDadosDaConta`, que sobem tudo). É o estado da conta.
- **parcial** — montado por escrita local em cima de um espelho frio (`[...cache, registro]` com o cache vazio). Tem só o que o usuário escreveu **depois** da falha de leitura, não o histórico. Marcado em `@vapefree_partial_{uid}_{nome}`; `escreverCache(uid, nome, valor)` sem o quarto argumento limpa a marca, que é o que a leitura do servidor faz.
- **frio** — nunca preenchido (`temEspelho` false).

`espelhoEstaCompleto(uid, nome)` é a pergunta que `podeEscreverDerivado` faz. Nenhum dos três estados barra a escrita do usuário: ela vai pra fila e sobe igual — o que muda é o espelho parcial não poder virar base de um valor derivado.

### Leitura fria (aviso de dados incompletos)

Leitura remota que falha **sem espelho completo** devolve o padrão vazio (`[]`/`{}`/`null`) porque a tela precisa renderizar algo, mas isso não é a conta: o app aparece zerado (sem histórico, streak 0, R$ 0) mesmo com meses de dado salvos. `utils/offline.js` guarda essas leituras **em memória** (`registrarLeituraFria`, `esquecerLeituraFria`, `temDadosIncompletos`, `assinarDadosIncompletos`); a primeira leitura que der certo naquele espelho apaga a marca, e `limparCacheEFila` apaga todas do uid.

Quem consome é o `ConnectionContext` (`dadosIncompletos`, `recarregarDados`) e o `OfflineBanner`, que mostra "não deu pra carregar seus dados — toque pra tentar de novo" quando o app está **online**. Offline o aviso não aparece: a faixa de "sem internet" já explica a tela incompleta.

## Retorno das escritas

Escritas **iniciadas pelo usuário** devolvem `{ ok: true }` ou `{ ok: false, motivo }`:

`salvarRegistro`, `atualizarRegistro`, `excluirRegistro`, `salvarAparelho`, `salvarMeta`, `salvarMetaDeDinheiro`, `definirEconomia`, `salvarSessaoDeCrise`, `atualizarSessaoDeCrise`, `excluirSessaoDeCrise`.

Motivos: `'rede'` (falha de AsyncStorage), `'data_invalida'` (`salvarRegistro`, data fora da janela de 7 dias), `'nao_encontrado'` (`atualizarRegistro`/`atualizarSessaoDeCrise`, id inexistente em modo convidado). A tela **precisa** checar `ok` e chamar `mostrarErro` do `usarToast()` — e não pode conceder XP nem mostrar sucesso quando a gravação falhou.

Com o offline-first, `'rede'` praticamente sumiu do modo conta: a escrita é aceita no espelho e sobe depois. O contrato continua o mesmo pras telas (nada muda nelas), e `'rede'` segue possível no modo convidado.

Escritas **de fundo** continuam retornando boolean silencioso: `salvarConquista`, `salvarMissao`, `salvarEstadoDeXp`, `registrarAberturaDoApp`. Não têm ação de usuário atrás e são reprocessadas no próximo foco de tela.

**Leituras** seguem com fallback neutro (`[]`, `{}`, `null`) quando nem servidor nem espelho respondem — a tela precisa de algo pra renderizar. A diferença entre "vazio" e "falhou" não some, só sai do valor de retorno: fica registrada como leitura fria (ver acima), que é o que barra a escrita derivada e acende o aviso no banner. Com espelho quente, offline devolve o dado real.

## Modelo de dados

**Record** (um por `salvarRegistro`, id = `Date.now()`):

```js
{
    (id,
        date /* 'YYYY-MM-DD' */,
        time /* 'HH:MM' */,
        used /* bool */,
        puffs /* number */,
        triggers /* string[] label */,
        helps /* string[] label */,
        intensity /* 0-10 */,
        note); /* string ou null — anotação livre do dia */
}
```

Firestore: subcoleção `users/{uid}/records`, doc id = `String(record.id)`. Convidado: array em `@vapefree_records`.

`salvarRegistro`/`atualizarRegistro` passam o registro por `normalizarRegistro` (`utils/records.js`) antes de gravar: com `used: false`, `puffs` vira `0` e `triggers` vira `[]`. Para somar puxadas em qualquer lugar (gráficos, totais, economia, insights) use `puxadasDoRegistro(record)` / `somarPuxadas(records)` do mesmo arquivo — nunca `record.puffs` direto, porque registros salvos antes dessa normalização podem ter `puffs > 0` com `used: false` (foi editado de "usei" para "não usei").

**Anotação livre** (`note`): campo opcional do dia, mesmo espírito da nota da sessão de crise. `normalizarRegistro` passa por `normalizarNota`: apara, corta em `MAX_NOTA` (280, `utils/records.js`) e devolve `null` quando não sobra nada — `null` e não `undefined` porque é o que o Firestore grava. Vale tanto no dia com uso quanto no dia sem. Preenchido no RegisterScreen e editável no modal do HistoryScreen; aparece no card do histórico e na coluna `anotacao` do CSV exportado. É o único campo buscável: o campo "Buscar nas anotações" do `HistoryScreen` filtra por ele com `notaCasaComBusca(note, termo)` (`utils/records.js`), comparando sem caixa e sem acento — a busca entra no mesmo recorte dos outros filtros, então mexe também no gráfico e no contador, e o campo só aparece quando existe alguma anotação salva. Registro salvo antes disso não tem o campo — sempre leia com `record.note ?? ''`.

**Teto de puxadas**: `MAX_PUXADAS_DIA` (2000, `utils/records.js`) limita `puffs` de um dia. `normalizarRegistro` prende o valor na faixa `[0, MAX_PUXADAS_DIA]`, então nenhuma escrita passa disso — é a última linha de defesa. As duas telas que aceitam puxadas (RegisterScreen e o modal de edição do HistoryScreen) já limitam o input com `limitarPuxadas(texto)` e mostram um aviso ao bater no teto. Sem o teto, um `999999` digitado sem querer estourava a escala do gráfico do histórico e inflava a economia, que é puxadas × `custoPorPuxada`.

**Janela de criação**: `salvarRegistro` recusa (`{ ok: false, motivo: 'data_invalida' }`) qualquer `date` fora de `datasRegistraveis()` — hoje ou até `DIAS_PARA_TRAS_NO_REGISTRO` (7) dias atrás. Vale só pra criação: `atualizarRegistro` continua aceitando qualquer data, pra edição de registro antigo pelo histórico seguir funcionando. Existe porque o XP é derivado dos registros (ver `utils/xp.js`) — sem o limite dava pra preencher anos de dias limpos falsos e inflar XP/conquistas. A RegisterScreen usa a mesma lista pra montar o seletor de data, mas a checagem no storage é a que vale.

**Um registro por dia**: `salvarRegistro` substitui qualquer registro já existente com o mesmo `date` (nos dois modos). A regra vive no storage, não na tela — a confirmação de "sobrescrever" da RegisterScreen é só UX. Sem isso, registro duplicado inflava XP (`registros.length * 10`) e dobrava o total de puxadas do dia. No modo conta, o doc antigo (id diferente, gerado por `Date.now()`) ganha um `delete` próprio na fila antes do `set` do novo. `atualizarRegistro` aplica a mesma regra: editar a data de um registro pra um dia que já tem outro substitui o outro. Efeito colateral no modo convidado: o registro editado vai pro fim do array (todo consumidor ordena antes de usar, então não muda nada na tela).

O `delete` na fila só cobre o que o espelho local conhece. Com espelho frio (login novo, cache limpo) e sem rede, o registro daquele dia que só existe no servidor não ganha delete, e a fila subiria dois docs com a mesma `date`. Por isso `obterRegistros` **reconcilia toda leitura do servidor**: por dia fica o de `id` maior (id = `Date.now()` da criação, logo o mais recente) e cada perdedor vira um `delete` na fila. A reconciliação só roda no caminho do servidor, que por construção só é alcançado com a fila vazia — nenhuma escrita do usuário esperando pra subir é atropelada.

**Device** (um por usuário):

```js
{
    (name, price, totalPuffs, days);
}
```

Firestore: campo `device` no doc `users/{uid}`. Convidado: `@vapefree_device`. É sempre o aparelho **atual** — é ele que a UI inteira lê.

**DeviceHistory** (vigência dos aparelhos, ao lado do `device`):

```js
[{ name, price, totalPuffs, days, desde: 'YYYY-MM-DD' }, ...]  // ordem cronológica
```

Firestore: campo `deviceHistory` no doc `users/{uid}`. Convidado: `@vapefree_device_history`. Espelho `deviceHistory`. Existe só pro cálculo de economia: sem ele, cadastrar um vape mais caro reprecificava o histórico inteiro com o preço novo, inflando meses de economia já registrada e podendo disparar conquista `economy_*` de mentira.

`salvarAparelho` mantém os dois campos: grava o aparelho em `device` e acrescenta a vigência via `historicoComNovoAparelho(historico, aparelho, dataDeHoje())` (`utils/aparelhos.js`, puro e módulo folha). Salvar o mesmo aparelho de novo não cria vigência; corrigir o aparelho no mesmo dia **substitui** a última em vez de criar outra. O aparelho novo vale **de hoje em diante** — não dá pra rachar o dia, já que registro tem data e não hora de troca.

Entrada **sem `desde` válido vale desde sempre**: é assim que quem já tinha aparelho salvo antes desse campo existir é migrado sem inventar data — `obterHistoricoDeAparelhos()` devolve `[{ ...device }]` quando o campo está vazio, o que reproduz exatamente o comportamento antigo. Dia anterior à primeira vigência cai no aparelho mais antigo do histórico, pelo mesmo motivo (registro retroativo de quem só cadastrou o vape depois continua sendo precificado).

O `deviceHistory` também alimenta a lista "Seus aparelhos" do `DeviceScreen` (quanto cada aparelho custou). A conta é `resumoDeAparelhos(deviceHistory, records, economy)` (`utils/records.js`), que devolve por aparelho `{ aparelho, de, ate, puxadas, dias, gasto, economizado }`. Ela combina dois helpers puros: `periodosDeAparelho(historico)` (`utils/aparelhos.js`), que transforma o histórico em intervalos **meio-abertos** `[de, ate)` — `ate` é o `desde` do aparelho seguinte, e `null` no atual, exatamente o critério do `aparelhoEm` — e `economiaNoIntervalo(economia, de, ate)` (`utils/economia.js`). `gasto` é `puxadas do período × custoPorPuxada do aparelho do período`, ou seja, o dinheiro que aquele aparelho realmente consumiu.

**Goal** (meta de redução, uma por usuário):

```js
{ baseline, target, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
```

Firestore: campo `goal` no doc `users/{uid}`. Convidado: `@vapefree_goal`. Espelho `goal`. `null` = sem meta, e `salvarMeta(null)` é o "remover meta". É dado **de entrada** (o usuário declara o objetivo), então segue `salvarAparelho` e **não** passa por `podeEscreverDerivado` como a economia. Escrito pela `GoalScreen`, pelo passo 7 do tutorial (ver [navigation.md](navigation.md)) e por nada mais.

**MoneyGoal** (meta de dinheiro, uma por usuário):

```js
{
    (amount, label, createdAt);
}
```

Firestore: campo `moneyGoal` no doc `users/{uid}`. Convidado: `@vapefree_money_goal`. Espelho `moneyGoal`. `null` = sem meta, e `salvarMetaDeDinheiro(null)` remove. Também é dado **de entrada**, mesmo padrão de `goal`: não passa por `podeEscreverDerivado`. `amount` é o valor em reais a juntar, `label` é o texto livre do "pra quê" (opcional, ≤ 40 caracteres), `createdAt` é **instante** (`toISOString()` completo, como `unlockedAt`) e não entra em conta nenhuma.

É **independente** da `goal`: as duas são metas irmãs, salvas e removidas à parte, e mexer numa não mexe na outra. Ao contrário da `goal`, não tem prazo declarado (a data de chegada é estimada) e **não** dispara `recalcularEconomia` — não é limite de puxadas, só um alvo pra economia que já existe. Escrita pela `GoalScreen` e por nada mais. Helpers puros em `utils/metaDeDinheiro.js` (ver "Meta de dinheiro" abaixo).

**Profile** (só modo conta): `{ nome, displayName, email }`, campos do doc `users/{uid}`, gravados uma vez no cadastro por `salvarPerfilDaConta(uid, { nome, email })`. Espelho `profile`. Convidado não tem perfil. Nenhuma tela lê esses campos hoje — quem exibe o nome usa `auth.currentUser.displayName`.

**Economy**: mapa `{ [date]: valorEconomizadoNoDia }`, recalculado por `recalcularEconomia(records, device, goal)` — nunca editado manualmente pela UI. Firestore: campo `economy` no doc `users/{uid}`. Convidado: `@vapefree_economy`.

**Achievement (desbloqueada)**: `{ id, unlockedAt }`. Firestore: subcoleção `users/{uid}/achievements`, doc id = `String(achievementId)`. Convidado: array em `@vapefree_achievements`. Lista completa de conquistas possíveis (não persistida, é código) está em `utils/achievements.js` — ver `CONQUISTAS`. Cada `condicao(records, economy, completedMissions, context)` recebe em `contexto` o que não está nos registros: `{ crisisSessions, appOpenDays, meta, aparelho, hoje }` (montado por `verificarEDesbloquearConquistas`, ou passado pronto pela tela que já carregou esses dados).

**AppOpenDays**: array de datas `'YYYY-MM-DD'` em que o app foi aberto (uma entrada por dia, máximo 60 dias). Firestore: campo `appOpenDays` no doc `users/{uid}`. Convidado: `@vapefree_app_opens`. Gravado por `registrarAberturaDoApp()` no `carregar()` da HomeScreen (idempotente no dia); só serve à conquista `app_open_7`.

**Mission (concluída)**: `{ id, missionId, period, periodKey, xp, completedAt }`. `id` = `` `${missionId}_${periodKey}` `` (ex: `daily_clean_2026-07-22`), o que torna a gravação idempotente dentro do período. `period` ∈ `'daily' | 'weekly'`; `periodKey` é a data do dia (diária) ou da segunda-feira da semana (semanal). Firestore: subcoleção `users/{uid}/missions`, doc id = o próprio `id`. Convidado: array em `@vapefree_missions`. Só missões **concluídas** são gravadas — a lista de missões possíveis é código, em `utils/missions.js`. Ver [missions.md](missions.md).

**Mission (resumo dos períodos fechados)**: `{ id: '_resumo', summary: true, xp, count, until, updatedAt }`, um único doc/entrada no mesmo lugar das missões. Uma entrada por missão por período crescia sem teto (~1400 documentos/ano) e todas eram lidas em toda sincronização, mesmo com só o `xp` importando depois que o período passa. `consolidarMissoesFechadas(hoje)` (chamada dentro de `sincronizarGamificacao`, na prática uma vez por dia) apaga as entradas de período fechado e acumula `xp`/`count` aqui — o que fica detalhado é só o dia e a semana corrente. `until` é o maior `periodKey` já contado: uma entrada que ressuscite no servidor (delete que não pegou) é apagada de novo **sem** somar XP duas vezes. A trava vale nas duas pontas: `calcularXp` (`utils/xp.js`, dono da constante `ID_DO_RESUMO_DE_MISSOES`) descarta toda entrada com `periodKey <= until` antes de somar, então o XP não infla nem se a entrada crua e o resumo aparecerem juntos na mesma lista — não depende mais da consolidação ter rodado antes. Entrada sem `periodKey` (formato antigo) continua somando. A entrada de resumo viaja na lista de `obterMissoes()` de propósito — tem `xp`, então `calcularXp` soma o resumo, e nenhum `missionId_periodKey` colide com `_resumo`, então `verificarMissoes` a ignora. Por isso `missoesConcluidas.length` **não** é o número de missões concluídas.

**XP** (snapshot): `{ xp, level, levelName, updatedAt }`. Firestore: campo `xp` no doc `users/{uid}`. Convidado: `@vapefree_xp`. **Não é a fonte da verdade** — o XP é sempre _derivado_ de registros + conquistas + missões + melhor streak por `calcularXp` (`utils/xp.js`); esse snapshot é só cache do último cálculo, gravado por `atualizarXp(records, achievements, missions)` (chamado sempre via `sincronizarGamificacao` — ver `docs/missions.md`, nunca direto pela tela). Regras: +10 XP por registro, +30 por dia registrado sem uso, +100 por cada 7 dias seguidos sem uso (melhor streak histórico), + o campo `xp` de cada conquista desbloqueada, + o `xp` gravado em cada missão concluída. `atualizarXp` também devolve `ganho` (diferença pro snapshot anterior) — é o que alimenta o toast de XP. Níveis em `NIVEIS`: Iniciante 0, Resistente 200, Guerreiro 500, Campeão 1000, Lendário 2000+.

**CrisisSession** (modo crise): `{ id, date, time, method, durationSec, completed, outcome, note }`. `id` = `Date.now()`, `method` ∈ `'respiracao' | 'timer' | 'distracao' | null`, `outcome` ∈ `'passou' | 'diminuiu' | 'usei' | null` (null = usuário pulou o feedback). Firestore: subcoleção `users/{uid}/crisisSessions`. Convidado: array em `@vapefree_crisis`. Salva sempre que o usuário encerra a `CrisisScreen`, mesmo sem responder o feedback — ter pedido ajuda já é dado. Lido por `metodoDeCriseRecomendado` (`utils/insights.js`) para sugerir na próxima crise o método que já funcionou. Editável (`atualizarSessaoDeCrise`) e apagável (`excluirSessaoDeCrise`) pela `CrisisHistoryScreen` — a edição só troca `outcome`/`note`; `date`, `time`, `method` e `durationSec` são medidos pelo app, não digitados. A `note` da sessão também é buscável na própria `CrisisHistoryScreen`, pelo mesmo `notaCasaComBusca` do Histórico — só que ali a busca recorta apenas a lista: o card de estatísticas (total/superadas/taxa) continua sobre a base inteira, porque taxa de sucesso de um recorte por texto não significa nada.

## Meta do dia

`utils/meta.js` guarda os helpers puros da meta de redução. A meta de um dia é uma **rampa linear** entre `baseline` e `target`:

```js
metaDoDia(meta, data) = baseline - (baseline - target) * (diasPassados / diasTotais)
```

Vocabulário da UI: o número do dia aparece pro usuário como **"limite"** ("seu limite de hoje: 70 puxadas"), nunca como "meta" — meta/objetivo é só o alvo final (`target` + `endDate`). Sem isso o card lia como se o app estivesse mandando puxar 70 vezes. No código os identificadores continuam `meta`/`metaDoDia`/`metaEfetiva`.

Editar uma meta existente na `GoalScreen` **preserva o `startDate` salvo** (a tela o carrega junto com `baseline`/`target` e deriva o prazo de `diferencaEmDias(startDate, endDate)`): recriar o início zeraria o progresso da rampa e mudaria a data final sem o usuário pedir. `startDate` só volta a ser hoje quando a meta é nova ou quando a salva já venceu (`endDate` <= hoje). Como consequência, prazo curto demais numa rampa antiga é barrado na validação ("esse prazo termina antes de hoje").

Fora do intervalo ela gruda nas pontas (antes do `startDate` vale o `baseline`, depois do `endDate`, o `target`), e `metaValida(meta)` exige `target < baseline` e `endDate > startDate`.

**`metaEfetiva(meta, aparelho, data)` é a única fonte da meta em todo o app**: devolve a meta do usuário quando ela existe e cai em `metaDiaria(aparelho)` quando não existe. Nenhuma tela deve chamar `metaDiaria` direto — é o que garante que "a meta declarada ganha da derivada do aparelho" valha igual no alerta de excesso da Home, nas missões e nas conquistas.

O cálculo da economia usa a variante `limiteDoDia(meta, aparelho, data)`, que é `metaEfetiva` valendo só do `startDate` em diante — ver [Cálculo de economia](#cálculo-de-economia).

Também moram lá: `mediaDiariaNasDatas(registros, datas)` (média por dia contando só dias com registro), `janelaDeDias(ateData, n)` / `deslocarData` / `diferencaEmDias` (janela móvel usada pelas conquistas de redução) e `progressoDaMeta(meta, registros, hoje)`, que devolve de uma vez o que o card de meta da Home mostra (`{ metaDeHoje, usadasHoje, dentroDaMeta, diasRestantes, percentualDoTempo, concluida, alcancada }`). `concluida` é a rampa que já passou do `endDate` — o próprio dia do `endDate` ainda é rampa (`diasRestantes` 0) — e faz o card 🎯 da Home trocar de rosto: encerra a meta e convida pra próxima, em vez de exibir "0 dias restantes" pra sempre. `alcancada` compara o `target` com a média dos 7 dias que terminam no **`endDate`** (não em hoje: quem abre o app meses depois não pode ser julgado por dias fora do prazo); sem registro nessa janela é `false`. Concluir não muda limite nenhum — depois do fim `metaEfetiva` segue devolvendo o `target`. `comparativoSemanal(registros, hoje)` põe as duas janelas de 7 dias lado a lado (`{ mediaAtual, mediaAnterior, diasAtuais, diasAnteriores, diferenca, percentual, direcao }`) para o card "📊 Esta semana x semana passada" da Home: `direcao` é `'queda' | 'alta' | 'estavel'` (empate = diferença menor que meia puxada/dia) e vira `null` — junto com `diferenca` — quando alguma das semanas não tem nenhum dia registrado; `percentual` é `null` quando a semana anterior fechou em zero.

## Meta de dinheiro

`utils/metaDeDinheiro.js` guarda os helpers puros da meta de dinheiro (importa `utils/economia.js`, `utils/datas.js` e o `janelaDeDias` de `utils/meta.js`; nenhum I/O). É a contraparte de `utils/meta.js`, com a diferença de fundo: a meta de redução é uma **restrição com prazo**, esta é uma **recompensa sem prazo**.

- `metaDeDinheiroValida(metaDeDinheiro)` — objeto com `amount` numérico `> 0`.
- `ritmoDiario(economia, hoje, janela = 14)` — média diária de economia na janela que termina em `hoje`, dividindo pelos dias **com entrada** na economia, não pelo tamanho da janela (mesma escolha de `mediaDiariaNasDatas`: dia sem registro é dia sem dado, não dia de economia zero). `null` quando a janela inteira está vazia.
- `progressoDaMetaDeDinheiro(metaDeDinheiro, economia, hoje)` — o que o card da Home mostra numa chamada só: `{ alvo, label, acumulado, faltando, percentual, concluida, ritmoDiario, diasEstimados, dataEstimada }`. `null` com meta inválida.

O `acumulado` é `totalEconomizado(economia)`, o total **desde sempre** — o mesmo número do "Total no bolso" mostrado logo acima da barra na Home, senão o card se contradiria consigo mesmo. `percentual` é capado em 100.

Não há prazo declarado: `dataEstimada` é derivada de `deslocarData(hoje, ceil(faltando / ritmoDiario))`. Ela e `diasEstimados` são `null` quando não há ritmo ou quando a estimativa passa de 3650 dias — ritmo baixo demais gera uma data que só desanima. Meta concluída tem `diasEstimados` `0` e `dataEstimada` `null`.

## Cálculo de economia

As duas contas derivadas do aparelho ficam em `utils/records.js`, puras: `custoPorPuxada(device)` (`price / totalPuffs`) e `metaDiaria(device)` (`totalPuffs / days`). Ambas devolvem `null` quando algum campo não é número positivo. Use elas em vez de repetir a fórmula — são as mesmas usadas pela prévia do `DeviceScreen` e pelo fallback de `metaEfetiva`.

`recalcularEconomia(records, device, goal, deviceHistory)`: para cada dia com registro, `economia = max(0, limiteDoDia - puffsUsados) * custoPorPuxada`. Grava o mapa inteiro via `definirEconomia`. Devolve `{}` sem gravar nada se o aparelho não permitir o cálculo (sem `price`/`totalPuffs`); dia cujo limite é `null` fica com economia `0`. O terceiro e o quarto argumentos são opcionais — omitidos, a função lê a meta atual por `obterMeta()` e o histórico por `obterHistoricoDeAparelhos()`, então quem não tem esses dados em mãos chama com dois argumentos.

O `custoPorPuxada` **e** o `metaDiaria` de cada dia saem de `aparelhoEm(deviceHistory, data)`, o aparelho que valia naquela data — não do aparelho atual. Trocar de aparelho hoje não mexe em nenhum dia anterior. Chamado depois de qualquer `salvarRegistro`/`atualizarRegistro`/`excluirRegistro`, depois de salvar um `aparelho` novo e depois de salvar/remover a meta na `GoalScreen`.

O limite de cada dia vem de `limiteDoDia(meta, aparelho, data)` (`utils/meta.js`): é o `metaEfetiva` do dia, **mas só a partir do `startDate` da meta** — dias anteriores continuam valendo pela `metaDiaria(aparelho)`. Motivo: fora do intervalo `metaDoDia` gruda no `baseline` (o consumo atual, quase sempre maior que a meta do aparelho), e usar isso no passado inflaria retroativamente a economia já registrada quando o usuário cria uma meta.

O `max(0, ...)` trunca o excesso: dia acima do limite vira economia `0` e o quanto passou não é persistido em lugar nenhum. Quem precisa desse número usa `excessoDoDia(registrosDoDia, device, metaDoDia)` (`utils/records.js`), que devolve `{ puxadasAMais, custoAMais }` derivado na hora do render — o terceiro argumento vem de `metaEfetiva`, e `custoAMais` é `null` quando existe meta mas não existe aparelho pra precificar.

Leitura do mapa de economia para gráfico fica em `utils/economia.js` (puro, módulo folha): `serieDeEconomiaAcumulada(economia, dias)` devolve `[{ data, acumulado }]` — o acumulado começa em `economiaAcumuladaAte(economia, dias[0])`, ou seja, inclui tudo que veio **antes** da janela, pro último ponto bater com o "Total no bolso". Complementos: `ganhoDaSerie(serie)` (quanto foi economizado dentro da janela) e `rotulosEspacados(dias, maximo)` (rótulos `DD/MM` espaçados a partir do último dia, o resto string vazia — 30 rótulos escritos se sobrepõem no chart-kit). Usados pelo card "📈 Economia acumulada" da `HomeScreen` (últimos 30 dias, só aparece com aparelho cadastrado e economia > 0).

## Migração convidado → conta

`migrarDadosDoConvidadoParaConta(uid)`: lê tudo do `AsyncStorage`, grava `device`/`deviceHistory`/`goal`/`moneyGoal`/`economy`/`xp`/`appOpenDays` no doc `users/{uid}` (merge), substitui inteiramente as subcoleções `records`, `achievements`, `crisisSessions` e `missions` (é uma sobreposição, não um merge de listas), preenche o espelho local com o que subiu e só então limpa o `AsyncStorage`. Detalhe do fluxo de UI em [auth.md](auth.md).

A substituição (`substituirDocsDaColecao`) roda em `writeBatch` de **500 operações** (limite do Firestore) e na ordem **escreve o novo → apaga o que sobrou** (só os ids que não foram reescritos). Cada commit é atômico, então falhar no meio deixa dado **a mais** (docs velhos que ainda não saíram), nunca a menos — a próxima tentativa reescreve e limpa. A ordem inversa (apagar antes) perderia tudo se a rede caísse entre as duas fases.

É a **única operação que exige internet**: sai devolvendo `false` se `estaOnline()` for falso, e qualquer erro no meio é capturado — nesse caso os dados locais do convidado ficam intactos, pra dar pra tentar de novo. Não entra na fila offline porque mexe em documentos remotos que precisam ser listados no servidor.

O `estaOnline()` da entrada não basta: a rede pode cair depois dele, e aí o SDK não rejeita — a promise fica pendurada e as telas de login/cadastro travariam pra sempre em "Entrando..."/"Criando conta...", com a conta já criada. Por isso **toda chamada de rede da migração** (o `setDoc` do doc de perfil e o `getDocs`/`commit` de cada subcoleção) passa por `comTempoLimite`; o `tempo_limite` cai no mesmo `catch` e vira falha de migração comum.

## Apagar dados

`apagarTodosOsDados()` (Configurações → "Apagar todos os meus dados") zera o progresso mantendo a conta:

- **Convidado**: `limparDadosLocaisDoConvidado()` — o tutorial, o tema e a preferência de notificação sobrevivem (ficam fora de `CHAVES`).
- **Conta**: apaga todos os docs das quatro subcoleções, zera `device`/`deviceHistory`/`goal`/`moneyGoal`/`economy`/`xp`/`appOpenDays` no doc `users/{uid}` (o `economy` sai com `deleteField()`, não com `{}`: merge de map no Firestore é profundo, então escrever `{}` num map é no-op e as chaves de data antigas voltariam na próxima leitura online) e deixa o espelho **quente e vazio** (`[]`/`{}`/`null`), pra leitura offline não confundir "apagado" com "ainda não carregado".

Como a migração, **exige internet** (devolve `{ ok: false, motivo: 'rede' }` offline): apagar subcoleção depende de listar o que está no servidor. A fila é descartada antes da limpeza — escrita pendente que subisse depois ressuscitaria dado que o usuário mandou apagar.

`apagarContaNoBanco(uid)` é a versão usada na exclusão de conta: faz o mesmo e ainda apaga o documento `users/{uid}`. Precisa rodar **antes** do `deleteUser` do Firebase Auth — ver [auth.md](auth.md).

## Exportar dados

`utils/exportacao.js` → `exportarDados('csv' | 'json')`. Lê tudo por `storage.js`, então funciona igual pra convidado e conta (e offline, servido pelo espelho); não escreve nada. CSV traz só os registros, uma linha por registro, com a economia do dia junto; JSON traz o pacote completo (registros, aparelho, histórico de aparelhos, metas, economia, conquistas, sessões de crise, missões, XP, dias de abertura), que serve de backup. No nativo grava em `Paths.cache` (`expo-file-system`) e abre o `Sharing.shareAsync`; na web baixa por link temporário, porque `expo-sharing` não existe lá. Devolve `{ ok }` ou `{ ok: false, motivo }` com `motivo` ∈ `'sem_dados' | 'sem_compartilhamento' | 'falhou'`.

As chaves do JSON **são** o formato do backup — renomear qualquer uma quebra os arquivos que os usuários já guardaram e que `utils/importacao.js` lê de volta.

## Importar backup

`utils/importacao.js` → `importarBackup()`, chamado pela linha "Importar backup" das Configurações. Abre o `expo-document-picker`, lê o texto (nativo: `new File(uri).text()`; web: o `File` do browser que o próprio picker devolve), faz `JSON.parse` e passa por `normalizarBackup(bruto)`.

`normalizarBackup` é pura e desconfiada — o arquivo vem de fora do app: exige que exista a lista `registros` (senão `{ ok: false, motivo: 'formato' }`, o que evita apagar tudo por causa de um JSON qualquer), descarta entrada de subcoleção sem `id` (é o nome do documento no Firestore), registro com `date` fora de `'YYYY-MM-DD'` e chave/valor inválido da economia, roda `normalizarRegistro` em cada registro e preenche com vazio o que backup antigo não tinha (`historicoDeAparelhos`, `diasDeAbertura`).

A escrita é `substituirTodosOsDados(dados)` (`utils/storage.js`), que **sobrepõe** — o que estava salvo e não veio no backup some. No modo convidado grava as chaves do `AsyncStorage`; no modo conta descarta espelho + fila (a fila é do estado antigo, subiria por cima do backup) e usa o mesmo `escreverTudoNaConta` da migração de convidado, então **exige rede** (`{ ok: false, motivo: 'rede' }` offline). `importarBackup` devolve `{ ok: true, resumo }` ou `{ ok: false, motivo }` com `motivo` ∈ `'cancelado' | 'formato' | 'vazio' | 'rede' | 'falhou'` — `'cancelado'` (fechou o seletor) não vira erro na tela.

`contaTemDados()` mora no mesmo `storage.js` e serve ao login: diz se a conta logada já tem progresso, o que decide o texto da pergunta sobre dados de convidado (ver [auth.md](auth.md)). Devolve `{ ok, temDados }` e lê **direto do Firestore** (`getDoc` do perfil + `getDocs` das quatro subcoleções), sem passar por `lerDaConta` — o fallback pro espelho é justamente o que não pode acontecer aqui, porque a resposta decide uma sobreposição. Offline, com fila pendente ou com a leitura falhando, devolve `ok: false` ("não deu pra conferir"), que o login trata como caso à parte de conta vazia.

## Helpers puros (sem I/O)

`dataDeHoje()`, `ultimosNDias(n)`, `ultimasNSemanas(n)`, `ultimosNMeses(n)`, `rotuloSemana(dateStr)`, `rotuloMes(dateStr)` — importáveis de `utils/storage.js`, usados pelas telas para montar os gráficos. `calcularEstadoDeStreak(records)` e o atalho `calcularStreak(records)` vivem em `utils/achievements.js` e são re-exportados por `storage.js` — importe de onde for mais natural no arquivo, ambos funcionam.

### Datas (`utils/datas.js`)

**Toda** string de dia de calendário `'YYYY-MM-DD'` — campo `date` do registro, chave do mapa de economia, `periodKey` de missão, célula do heatmap, `startDate`/`endDate` da meta — sai deste módulo, e sempre em **horário local**.

| Função                                                  | O que faz                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `chaveDeData(ano, mes, dia)`                            | monta a string (`mes` 0-11, igual `Date.getMonth()`)                      |
| `chaveDeDataLocal(data)`                                | `Date` → `'YYYY-MM-DD'` pelos getters locais — primitivo de todo o resto  |
| `converterDataLocal(dataStr)`                           | `'YYYY-MM-DD'` → `Date` ao meio-dia local (evita off-by-one do parse UTC) |
| `dataDeHoje()`                                          | hoje, no fuso do aparelho                                                 |
| `ultimosNDias/ultimasNSemanas/ultimosNMeses(n)`         | janelas dos gráficos                                                      |
| `deslocarData(dataStr, dias)` / `diferencaEmDias(a, b)` | aritmética de dias                                                        |
| `inicioDaSemana(dataStr)` / `diasDaSemana(dataStr)`     | segunda-feira da semana / as 7 datas dela                                 |

`storage.js`, `meta.js`, `insights.js`, `calendario.js` e `missions.js` **reexportam** o que historicamente morava neles, então os imports antigos continuam valendo — mas em código novo importe direto de `utils/datas.js`.

Duas regras que não podem ser quebradas:

1. **Nunca** derive dia de calendário com `new Date().toISOString().slice(0, 10)`. Isso devolve UTC: no Brasil (UTC-3) o app virava o dia às 21h — registro noturno caía na data seguinte, streak quebrava, missão diária não contava, heatmap deslocava, economia ia pra data errada.
2. `toISOString()` **completo** continua correto para timestamp de instante (`unlockedAt`, `updatedAt`, `completedAt`, `exportadoEm`). Instante é global; dia de calendário é local. São coisas diferentes.

`utils/datas.js` é módulo **folha**: não importa nada de `utils/`, porque `storage.js`, `meta.js`, `missions.js`, `achievements.js` e `xp.js` dependem dele e um import de volta faria ciclo.

`calcularEstadoDeStreak` devolve `{ streak, escudos, progresso, diasProtegidos, ultimoDiaProtegido, gastouEscudoNoUltimoDia }`, simulando o histórico **pra frente**, do primeiro ao último dia com registro (dias depois do último registro não são avaliados, senão o streak quebraria sozinho antes de o usuário registrar hoje). Regras do escudo de streak:

- Dia limpo = dia com pelo menos um registro e nenhum com `used === true`; soma 1 no `streak` e 1 no `progresso`.
- A cada `DIAS_PARA_ESCUDO` (7) dias limpos ganha 1 escudo, máximo 1 guardado. Com o escudo cheio o `progresso` congela em 7 em vez de transbordar — senão gastar o escudo devolveria outro na hora.
- Dia com uso registrado, tendo escudo e `streak > 0`: gasta o escudo, o `streak` **ainda soma 1** e o `progresso` volta a zero (esse dia não conta pros próximos 7). O dia entra em `diasProtegidos`.
- Dia sem registro nenhum, ou dia com uso sem escudo: zera `streak`, `escudos` e `progresso` — escudo não cobre esquecimento e não sobrevive à quebra da sequência.

**O escudo não é dado persistido.** É derivado dos registros a cada leitura, o que torna impossível ele ficar dessincronizado: editar ou apagar um registro antigo recalcula tudo. A versão anterior guardava estado incremental (`streakShield` no Firestore) e ficava permanentemente errada depois de qualquer inconsistência.

Dia protegido conta **só para o streak**. Para XP (`utils/xp.js`), missões, gráficos e economia ele continua sendo dia de uso.

## Testes desta camada

`__tests__/utils/storage.test.js` cobre as ramificações que este documento descreve: convidado x conta,
online x offline, espelho x servidor, e as travas (`podeEscreverDerivado`, janela de dias do registro,
migração e exclusão exigindo rede). Ver [deployment.md](deployment.md) para como o arquivo é montado
e as duas armadilhas de sincronia que ele precisa contornar.

Ao mexer em `storage.js`, rode `npm test` — é a camada que quebra em silêncio, porque o caminho
offline só aparece em condição que não dá pra reproduzir à mão de forma confiável.
