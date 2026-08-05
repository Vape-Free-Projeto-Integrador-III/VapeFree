# Componentes e padrões de UI

`components/` tem poucos componentes compartilhados hoje — a maioria da UI é escrita direto em cada `screens/*.js` (não há biblioteca de design system própria além do que está descrito aqui).

## `ScreenHeader` (`components/ScreenHeader.js`)

Cabeçalho colorido (`cores.primary`) usado no topo de toda tela. Props: `titulo`, `subtitulo`, `cores`, `aoPressionarVoltar`, `aoPressionarConfiguracoes`, `mostrarConfiguracoes` (default `false`). Não existe mais toggle de tema no header — modo escuro só se altera dentro de `SettingsScreen` (`Switch` + `alternarTema` de `usarTema()`).

- Sem `aoPressionarVoltar` → mostra espaço vazio à esquerda (tabs de nível raiz: Home, Register, History, Achievements).
- Com `aoPressionarVoltar` → mostra seta de voltar (telas de stack: Device, Profile, Crisis, Breathing, Missions, Settings).
- Praticamente toda tela passa `mostrarConfiguracoes` + `aoPressionarConfiguracoes={() => navigation.navigate('Settings')}`. Exceções: `SettingsScreen` e `Profile`, que omitem a prop (não faz sentido abrir configurações a partir de configurações, nem a partir do perfil que já é acessado via configurações) — o canto direito vira um espaçador vazio, que mantém o título alinhado.

Toda tela nova deve renderizar `<ScreenHeader>` como primeiro filho do `ScrollView`, passando `cores` de `usarTema()` e `mostrarConfiguracoes`/`aoPressionarConfiguracoes` apontando para `Settings`.

Espaço do topo é `useSafeAreaInsets().top + 12` (não é valor fixo — respeita notch/status bar alta). Quando o `OfflineBanner` está visível ele já consumiu o inset acima do header, então o header cai pra `12` puro; a condição vem do hook `usarFaixaDeTopoVisivel()` do próprio `OfflineBanner`, sem prop.

## `GradeDeCards` (`components/GradeDeCards.js`)

Distribui os filhos em N colunas para telas largas (web/tablet). Props: `colunas` (default `1`), `espacamento` (default `0`), `children`.

- Com `colunas <= 1` devolve os filhos crus, sem nenhuma `View` extra — no celular o layout fica idêntico ao de antes.
- Com `colunas >= 2` monta uma row de `View`s `flex: 1`. Cada card, na ordem original, entra na **coluna mais curta** no momento (empate → coluna da esquerda): a coluna 1 recebe registro 1, 2 e 3 enquanto for a mais baixa, e só então o 4 cai na coluna 2. Cada coluna empilha sozinha (masonry), então card alto de um lado não abre buraco do outro.
- Pra saber quem é a coluna mais curta o componente mede cada card com `onLayout` e guarda a altura num state chaveado pela `key` que o `React.Children.toArray` garante (chave e não índice: filtrar a lista não embaralha as medidas). Antes da primeira medição todo card vale `ALTURA_PADRAO`, então o primeiro frame cai em round-robin e reorganiza sozinho — sem flash de tudo empilhado numa coluna só.
- `toArray` achata array de filhos, então um `.map()` inteiro conta como vários itens na distribuição, não como bloco único. É o que faz o gráfico, o `InsightsCard` e os registros do Histórico compartilharem a mesma grade — duas grades seguidas deixariam um vão do tamanho do card mais alto da primeira.
- `espacamento` vira `columnGap`. Use `0` quando os cards já têm `marginHorizontal: 16` (Home, Histórico, Crises — as margens formam o vão); use `12` quando o vão lateral vem de `paddingHorizontal` na section e o card não tem margem própria (Missões, Conquistas).

Quem decide o número de colunas é `usarLayoutResponsivo()` (`utils/responsivo.js`) — ver [styling.md](styling.md).

## `GuestDataChoiceModal` (`components/GuestDataChoiceModal.js`)

Modal genérico de 3 botões (Importar / Descartar / Cancelar) usado só no fluxo de login/cadastro quando existem dados de convidado a resolver. Props: `visivel`, `titulo`, `mensagem`, `rotuloImportar`, `rotuloDescartar`, `rotuloCancelar` (default `'Cancelar'`), `aoImportar`, `aoDescartar`, `aoCancelar`. Ver uso em [auth.md](auth.md).

No login quem renderiza é o **`AuthProvider`** (via `pedirEscolhaDeDadosDeConvidado`), não a tela: a pergunta acontece depois do signIn, quando a AuthStack já saiu de cena. O `SignUpScreen` tem instância própria, porque lá a pergunta é antes do cadastro.

Nota: usa paleta de cores própria hardcoded (`#2F6FED` etc.), não vem de `usarTema()` — é intencionalmente neutro/fora do tema claro-escuro do resto do app.

## `InsightsCard` (`components/InsightsCard.js`)

Card "Seus padrões" da tela de Histórico, renderizado entre o gráfico e a lista de registros. Props: `registros`, `sessoesDeCrise` (default `[]`), `cores`, `aoVerCrises` (opcional).

Recebe sempre a lista **completa** de registros, nunca o recorte filtrado da tela — derivar "seu gatilho mais comum" de uma lista já filtrada por gatilho seria circular.

Componente de apresentação puro — todo o cálculo vive em `calcularInsights` (`utils/insights.js`), que é função pura sobre a lista de registros. Três estados:

- Menos de `MIN_REGISTROS_PARA_INSIGHTS` (7) registros → card compacto "Registre por mais X dias para ver seus padrões."
- Registros suficientes e algum padrão qualificado → seção "Seus padrões" com até 4 linhas (emoji, título, detalhe).
- Registros suficientes mas nenhum padrão qualificado (ex.: só dias sem usar, sem gatilho marcado) → `return null`, nada renderiza.

Insights do modo crise (`calcularInsightsDeCrise`, ids com prefixo `crise_`) aparecem numa segunda seção, "No modo crise", e **não** dependem do mínimo de 7 registros — quem usou o modo crise já gerou dado próprio. Se só houver esses, o card mostra só essa seção.

Insight novo = função nova em `utils/insights.js` devolvendo `{ id, icone, titulo, detalhe }`, somada ao array de `calcularInsights`. O componente não precisa mudar.

Nenhum insight usa o campo `time` do registro: ele guarda a hora em que o formulário foi salvo, não a hora do uso (o registro pode ser retroativo).

Com `aoVerCrises` e pelo menos uma sessão de crise salva, o card ganha no rodapé o atalho "Ver todas as crises (N)" pra `CrisisHistoryScreen`. Esse atalho conta como conteúdo: com sessão salva mas nenhum insight qualificado ainda (uma crise só), o card renderiza mesmo assim, com a linha "Registre por mais X dias" em cima.

## `CalendarioMensal` (`components/CalendarioMensal.js`)

Grade mensal de 7 colunas (semana começando na segunda), apresentação pura. Props: `ano`, `mes` (0-11), `cores`, `aoMudarMes({ ano, mes })`, `bloquearAvanco`, `bloquearVolta`, `maximo` / `minimo` (datas `YYYY-MM-DD` — dias fora do intervalo ficam apagados e sem toque), `estiloDoDia(dataStr) => { fundo, corDoTexto, borda }`, `aoTocarDia(dataStr)` (opcional — sem ele as células não são tocáveis).

O componente **não sabe o que as cores significam**: quem decide é o `estiloDoDia` de quem usa. Dois usos hoje:

- **`HomeScreen`** — heatmap "Seu mês": verde = dia limpo, claro = dentro do limite, vermelho = acima, cinza = sem registro. Sem toque nos dias.
- **`HistoryScreen`** — seleção do intervalo do filtro "Período": 1º toque define o início, 2º o fim (inverte se for anterior), o 3º recomeça.
- **`GoalScreen`** — escolha da data final da meta de redução (`minimo` = amanhã, `bloquearVolta` no mês da data mínima). O toque converte a data em prazo: `prazo = diferencaEmDias(inicio, data)` — o prazo em dias continua sendo a fonte única do formulário, os chips 30/60/90 são só atalhos.

Toda a matemática de data mora em `utils/calendario.js` (`gradeDoMes`, `estadoDoDia`, `resumoDoMes`, `datasNoIntervalo`, `diasNoIntervalo`, `estaNoIntervalo`), funções puras no mesmo estilo de `utils/records.js`. `estadoDoDia` recebe a meta do dia já resolvida — quem chama `metaEfetiva(meta, aparelho, data)` é a tela, nunca `metaDiaria()` direto.

## `CrisisOutcomeModal` (`components/CrisisOutcomeModal.js`)

Modal central usado ao encerrar uma sessão de modo crise (`CrisisScreen`) e ao editar uma sessão já salva (`CrisisHistoryScreen`). Pergunta "E aí, como foi?" com três chips (Passou / Diminuiu / Acabei usando) + nota opcional. Props: `visivel`, `cores`, `aoEnviar(desfecho, nota)`, `aoPular` e, para o modo edição, `valorInicial` (`{ outcome, note }` da sessão), `titulo`, `subtitulo`, `rotuloDeSalvar`, `rotuloDePular`. `valorInicial` é reaplicado toda vez que o modal abre — senão a edição mostraria o que sobrou da sessão anterior.

Os três desfechos vêm de `DESFECHOS_DE_CRISE` (`utils/insights.js`), fonte única compartilhada com a `CrisisHistoryScreen`, que exibe o mesmo rótulo/emoji no badge de cada sessão.

É um dos poucos casos legítimos de `Modal` em vez de `Alert` (escolha de dados + texto livre). A resposta vira o campo `outcome` da `CrisisSession` e alimenta `metodoDeCriseRecomendado` — sem ela, o app não tem como aprender qual método funciona pra aquele usuário. O texto de "Acabei usando" é deliberadamente sem julgamento.

## `HealthMilestonesCard` (`components/HealthMilestonesCard.js`)

Card "Sua saúde" da `HomeScreen`, entre o card do dia e o calendário do mês. Props: `registros` (lista completa), `cores`. Apresentação pura — todo o cálculo vive em `calcularMarcosDeSaude` (`utils/saude.js`).

Mostra o último marco atingido (título + benefício), o próximo marco com barra de progresso e contagem regressiva, e a lista completa dos 12 marcos (20 min → 1 ano) num bloco que abre/fecha no toque. Sem registro nenhum (`pronto: false`) o card não renderiza.

O relógio **não é o streak**: streak soma dia protegido por escudo, e dia protegido teve uso — recuperação do corpo não tem escudo. O tempo limpo conta da meia-noite do dia seguinte ao último dia com `used: true` (o app não guarda a hora da puxada, então esse é o piso conservador) e dia sem registro não zera nada. Marco novo = entrada nova em `MARCOS_DE_SAUDE`, em ordem crescente de `minutos`; o componente não muda.

## `MissionsCard` (`components/MissionsCard.js`)

Card da `AchievementsScreen` com as missões **diárias** do dia. Props: `missoes` (já calculadas pela tela via `verificarMissoes`), `cores`, `aoPressionar` (navega para `Missions`). É só apresentação — não lê storage nem decide conclusão. Ver [missions.md](missions.md).

## `OfflineBanner` (`components/OfflineBanner.js`)

Faixa fina no topo, sem props, montada uma única vez em `navigation/AppNavigator.js` acima do `NavigationContainer` — não replique por tela nem mexa no `ScreenHeader`. Lê `usarConexao()` (`context/ConnectionContext.js`) e só aparece pra usuário logado (convidado é sempre local, nunca tem pendência). Três estados, nessa prioridade:

1. **`falhas > 0`** — faixa vermelha (`cores.danger`), ícone de alerta, aparece **mesmo online**: "N alterações não foram salvas na sua conta — toque pra ver". Tocar abre um `Alert` explicando que o dado continua valendo neste aparelho mas pode não estar em outro; "Entendi" chama `descartarFalhas()` e some. É o aviso de mutação que a fila desistiu de enviar — antes isso sumia só com um `console.log`.
2. **offline** — faixa neutra, texto conforme `pendentes`: "Sem internet — N alterações vão sincronizar depois" ou, com a fila zerada, "Sem internet — seus dados estão salvos no aparelho".
3. **`dadosIncompletos` estando online** — faixa neutra, ícone de recarregar: "Não deu pra carregar seus dados — toque pra tentar de novo". Tocar chama `recarregarDados()` (que é `precarregarEspelho()`), e a faixa some sozinha quando uma leitura do servidor passa. É o caso da leitura remota que falhou sem espelho pra servir de reserva: sem ele o app só aparecia zerado, como se o histórico tivesse sumido. Offline esse aviso não aparece — a faixa de "sem internet" já explica.

Ver [database.md](database.md).

Altura fixa: `insets.top + ALTURA_DA_FAIXA_OFFLINE` (30), constante exportada pelo próprio arquivo porque o `Toast` a soma no seu `top` quando a faixa está visível. Se mudar o layout da faixa, ajuste a constante junto. A condição de "tem faixa no topo" mora só aqui, no hook exportado `usarFaixaDeTopoVisivel()` — `Toast` e `ScreenHeader` importam esse hook em vez de recalcular `!online && usuario`.

## `ErrorBoundary` (`components/ErrorBoundary.js`)

Class component (é o único jeito: `getDerivedStateFromError`/`componentDidCatch` não têm versão em hook). Sem ele, qualquer exceção no render derrubava a árvore inteira — tela branca, sem log e sem saída. Captura, loga (`console.error` com o `componentStack`), chama a prop opcional `aoCapturar(erro, info)` e mostra uma tela de erro com botão **Tentar de novo**, que limpa o estado e remonta os filhos.

Montado duas vezes em `App.js`, de propósito:

1. **interno** — em volta do `<AppNavigator />`, dentro dos providers: crash de tela remonta só a navegação, mantendo tema, auth e fila offline vivos.
2. **externo** — em volta de `AuthProvider`/`ThemeProvider`: cobre o que o interno não alcança (crash do próprio provider).

Usa uma paleta fixa própria em vez de `usarTema()` (mesma exceção das telas de auth): o erro capturado pode ter vindo do `ThemeProvider`, e um fallback que dependesse do tema quebraria de novo ao tentar se desenhar. O detalhe técnico do erro só aparece com `__DEV__`.

Testes em `__tests__/components/ErrorBoundary.test.js`. Nota de teste: o `render`/`rerender`/`fireEvent` do `@testing-library/react-native` é assíncrono nesta versão — sem `await` o resultado vem vazio ("`render` function has not been called").

## `Toast` (`components/Toast.js`) + `ToastProvider` (`context/ToastContext.js`)

Popup pequeno no topo da tela. Carrega todo feedback efêmero do app — XP/missão, validação, erro, sucesso —, não só XP (o nome `XpToast`/`usarToastDeXp` era da primeira versão e foi renomeado). Não use o componente direto: chame `usarToast()` e enfileire. Posição: `insets.top + 8`, mais `ALTURA_DA_FAIXA_OFFLINE` quando o `OfflineBanner` está na tela (via `usarFaixaDeTopoVisivel()`), pra não cobrir a faixa.

- `mostrarRecompensas({ conquistas, missoes, ganho, icone, titulo })` — um toast por conquista/missão nova, mais um genérico com o XP que sobrou (registro, dia limpo, streak). `icone`/`titulo` personalizam só esse genérico: a `RegisterScreen` usa "🚭 Dia sem cigarro eletrônico!" quando `used === false` e "📝 Registro feito, sem culpa" quando o usuário usou.
- `mostrarXp({ icone, titulo, xp })` / `mostrarGanhoDeXp(xp)` para casos avulsos.
- `mostrarAviso(titulo, subtitulo, variante)` — toast de texto puro, sem "+N XP" e com duração maior (`DURACAO_DO_TOAST_LONGO`, 3500ms contra 2200ms). Variantes: `'aviso'` (borda `cores.warning`, ⚠️ — padrão), `'erro'` (`cores.danger`, ❌), `'sucesso'` (`cores.primary`, ✅).
- `mostrarErro(titulo, subtitulo)` — atalho para `mostrarAviso(..., 'erro')`. É o feedback padrão de falha ao salvar — ver o contrato `{ ok, motivo }` em [database.md](database.md).
- `confirmar({ titulo, mensagem, botoes })` — monta o `ConfirmModal` (abaixo). Uma confirmação por vez, sem fila.

O provider mostra um toast por vez, na ordem da fila, e fica montado em `App.js` dentro do `SafeAreaProvider`. O `Animated.View` é `pointerEvents="none"`, então nunca bloqueia toque. **Quem calcula o quanto foi ganho é `atualizarXp` (campo `ganho`)** — não incremente XP na mão para alimentar o toast.

`mostrarXp` ignora toast com `xp <= 0` (contrato antigo de quem já usava); `mostrarAviso`/`mostrarErro` entram direto na fila, sem esse guard.

## `Alert` (`utils/alert.js`) + `ConfirmModal` (`components/ConfirmModal.js`)

**Continua sendo `import Alert from '../utils/alert'`, com a assinatura idêntica à do React Native (`Alert.alert(titulo, mensagem, botoes)`)** — mas não mostra mais o alerta do sistema. O `ToastProvider` se registra no bridge do módulo (`registrarManipuladorDeAlerta`) e o alerta vira UI do app:

- **0 ou 1 botão** → toast (`mostrarAviso`). A variante sai de uma heurística pelo título: começa com `'Erro'` → erro, `'Pront'` (Pronto/Prontinho) → sucesso, resto → aviso. O `onPress` do botão único roda junto com o toast (não há "OK" pra tocar).
- **2+ botões** → `ConfirmModal`, no visual do `GuestDataChoiceModal` mas temado por `usarTema()`. Recebe o array de botões cru do `Alert`: `style: 'cancel'` vira botão neutro no topo, `style: 'destructive'` vira vermelho, o resto vira o botão principal (verde) embaixo. Backdrop e botão físico de voltar disparam o botão `cancel`. Diferente do web antigo, 3+ botões agora aparecem todos.

O caminho antigo (`Alert.alert` nativo / `window.alert`+`window.confirm`) fica no arquivo só como fallback pra alerta disparado antes do provider montar.

Regra prática: informação/validação/erro → deixe como `Alert.alert` de um botão (ou chame `mostrarAviso` direto em tela nova); escolha do usuário → `Alert.alert` com botões. `Modal` próprio só quando precisa de input/escolha de dados (ver `CrisisOutcomeModal`, `GuestDataChoiceModal`).

## `AchievementCelebration` (`components/AchievementCelebration.js`) + `AchievementShareCard`

Modal de conquista desbloqueada (emoji com pulso, confete, haptic). Quem monta é o `ToastProvider`, uma conquista por vez: props `conquista` e `aoFechar`.

Botões: "Arrasou!" (fecha, avança a fila) e, abaixo, "Compartilhar 📤" — gera um PNG do `AchievementShareCard` com `captureRef` (`react-native-view-shot`) e abre o menu do sistema com `Sharing.shareAsync` (`expo-sharing`). Detalhes:

- O botão só aparece se `Sharing.isAvailableAsync()` for `true` (no web é `false`).
- `AchievementShareCard` é renderizado fora da tela (`top: -10000`, `pointerEvents="none"`) dentro do próprio modal — precisa estar montado com layout real pra ser capturado, e o wrapper tem `collapsable={false}` (sem isso o Android descarta a View e a captura falha).
- As cores do card compartilhado são **fixas** (verde da marca, texto branco), não vêm de `usarTema()`: a imagem sai do app e deve ter sempre a mesma cara.
- O streak que aparece no card vem de `obterRegistros` + `calcularStreak` dentro do modal, não por prop (o provider só conhece a conquista).
- Falha de captura/compartilhamento é silenciosa — o modal continua aberto.

Ambas as libs são nativas: depois de instalar, precisa rebuildar (`npm run android` / `npm run ios`), não basta recarregar o Metro.

## Padrões de UI repetidos entre telas (não componentizados)

Esses padrões existem em várias telas com estilo copiado, não como componente — ao criar tela nova, replique o padrão em vez de inventar um novo:

- **Card**: `View` com `borderRadius: RAIO.lg`, `backgroundColor: cores.card`, `SOMBRA.medium`, `marginHorizontal: 16`.
- **Toggle de 2 opções** (ex: Descartável/Recarregável, Sim/Não): row de dois `TouchableOpacity` com `borderColor`/`backgroundColor: cores.primary` quando selecionado, texto branco quando ativo.
- **Chips multi-seleção** (gatilhos, ajudas): `RAIO.full`, mesmo padrão de cor do toggle, usado com arrays `GATILHOS`/`AJUDAS` de `utils/theme.js`. O **seletor de dispositivo** da `RegisterScreen` ("Qual dispositivo você usou?") usa o mesmo chip, mas de seleção única, alimentado por `dispositivosAtivos(dispositivos)` e já marcando `dispositivoPadrao(dispositivos)` (`utils/aparelhos.js`) — escolha manual no formulário ganha do padrão, mas formulário zerado volta a segui-lo — sem dispositivo cadastrado, o lugar dos chips vira um atalho pro `DeviceForm`.
- **Contador +/-**: par de botões circulares (`width/height: 44`, `borderRadius: 22`) em volta de um número grande central — usado para "quantidade de puxadas".
- **Toast de sucesso**: `Animated.Value` iniciado em 0, sequência `timing(1) → delay(2000) → timing(0)`, guardado em `useRef`/`useState`. Ver `DeviceFormScreen.js`/`RegisterScreen.js`.
- **Modal bottom-sheet** (edição, seletor de data): `Modal transparent animationType="slide"`, overlay `rgba(0,0,0,0.5)` + `justifyContent: 'flex-end'`, conteúdo com `borderTopLeftRadius/borderTopRightRadius: RAIO.xl`.
- **Modal de confirmação central** (excluir registro): mesmo overlay, mas `justifyContent: 'center'`, card com `width: '80%', maxWidth: 300`.
- **Barra de progresso**: não existe componente compartilhado — cada card monta a sua com dois `View` (`xpTrack` com `overflow: 'hidden'` + `xpFill` com `width: '{n}%'`). Usada no card de meta e no bloco da meta de dinheiro (`HomeScreen`), no card de XP (`AchievementsScreen`), e em `MissionsCard`/`HealthMilestonesCard`.
- **Faixa de status dentro de card**: row com ícone Ionicons + texto, `padding: 10`, `RAIO.md`, `borderWidth: 1`, fundo suave e borda na cor do estado. Duas na `HomeScreen`, no card "Como você foi hoje?": `shieldRow` (escudo do streak, tons de `primary`) e `excessRow` (uso acima da meta do aparelho, `cores.danger` com fundo `cores.danger + '22'` — mesmo truque de opacidade do `ConfirmModal`). O `excessRow` só aparece quando `excessoDoDia(registrosDeHoje, aparelho)` (`utils/records.js`) devolve `puxadasAMais > 0`; sem aparelho cadastrado, nunca aparece.
