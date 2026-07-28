# Componentes e padrões de UI

`components/` tem poucos componentes compartilhados hoje — a maioria da UI é escrita direto em cada `screens/*.js` (não há biblioteca de design system própria além do que está descrito aqui).

## `ScreenHeader` (`components/ScreenHeader.js`)

Cabeçalho colorido (`cores.primary`) usado no topo de toda tela. Props: `titulo`, `subtitulo`, `cores`, `aoPressionarPerfil`, `aoPressionarVoltar`, `aoPressionarConfiguracoes`, `mostrarPerfil` (default `true`), `mostrarConfiguracoes` (default `false`). Não existe mais toggle de tema no header — modo escuro só se altera dentro de `SettingsScreen` (`Switch` + `alternarTema` de `usarTema()`).

- Sem `aoPressionarVoltar` → mostra espaço vazio à esquerda (tabs de nível raiz: Home, Register, History, Achievements).
- Com `aoPressionarVoltar` → mostra seta de voltar (telas de stack: Device, Profile, Crisis, Breathing, Missions, Settings).
- Praticamente toda tela passa `mostrarConfiguracoes` + `aoPressionarConfiguracoes={() => navigation.navigate('Settings')}`. Exceções: `SettingsScreen` e `Profile`, que usam `mostrarPerfil={false}` sem `mostrarConfiguracoes` (não faz sentido abrir configurações a partir de configurações, nem a partir do perfil que já é acessado via configurações).

Toda tela nova deve renderizar `<ScreenHeader>` como primeiro filho do `ScrollView`, passando `cores` de `usarTema()` e `mostrarConfiguracoes`/`aoPressionarConfiguracoes` apontando para `Settings`.

## `GuestDataChoiceModal` (`components/GuestDataChoiceModal.js`)

Modal genérico de 3 botões (Importar / Descartar / Cancelar) usado só no fluxo de login/cadastro quando existem dados de convidado a resolver. Props: `visivel`, `titulo`, `mensagem`, `rotuloImportar`, `rotuloDescartar`, `rotuloCancelar` (default `'Cancelar'`), `aoImportar`, `aoDescartar`, `aoCancelar`. Ver uso em [auth.md](auth.md).

Nota: usa paleta de cores própria hardcoded (`#2F6FED` etc.), não vem de `usarTema()` — é intencionalmente neutro/fora do tema claro-escuro do resto do app.

## `InsightsCard` (`components/InsightsCard.js`)

Card "Seus padrões" da tela de Histórico, renderizado entre o gráfico e a lista de registros. Props: `registros`, `sessoesDeCrise` (default `[]`), `cores`.

Componente de apresentação puro — todo o cálculo vive em `calcularInsights` (`utils/insights.js`), que é função pura sobre a lista de registros. Três estados:

- Menos de `MIN_REGISTROS_PARA_INSIGHTS` (7) registros → card compacto "Registre por mais X dias para ver seus padrões."
- Registros suficientes e algum padrão qualificado → seção "Seus padrões" com até 4 linhas (emoji, título, detalhe).
- Registros suficientes mas nenhum padrão qualificado (ex.: só dias sem usar, sem gatilho marcado) → `return null`, nada renderiza.

Insights do modo crise (`calcularInsightsDeCrise`, ids com prefixo `crise_`) aparecem numa segunda seção, "No modo crise", e **não** dependem do mínimo de 7 registros — quem usou o modo crise já gerou dado próprio. Se só houver esses, o card mostra só essa seção.

Insight novo = função nova em `utils/insights.js` devolvendo `{ id, icone, titulo, detalhe }`, somada ao array de `calcularInsights`. O componente não precisa mudar.

Nenhum insight usa o campo `time` do registro: ele guarda a hora em que o formulário foi salvo, não a hora do uso (o registro pode ser retroativo).

## `CrisisOutcomeModal` (`components/CrisisOutcomeModal.js`)

Modal central usado só pela `CrisisScreen`, ao encerrar uma sessão de modo crise. Pergunta "E aí, como foi?" com três chips (Passou / Diminuiu / Acabei usando) + nota opcional. Props: `visivel`, `cores`, `aoEnviar(desfecho, nota)`, `aoPular`.

É um dos poucos casos legítimos de `Modal` em vez de `Alert` (escolha de dados + texto livre). A resposta vira o campo `outcome` da `CrisisSession` e alimenta `metodoDeCriseRecomendado` — sem ela, o app não tem como aprender qual método funciona pra aquele usuário. O texto de "Acabei usando" é deliberadamente sem julgamento.

## `MissionsCard` (`components/MissionsCard.js`)

Card da `HomeScreen` com as missões **diárias** do dia. Props: `missoes` (já calculadas pela tela via `verificarMissoes`), `cores`, `aoPressionar` (navega para `Missions`). É só apresentação — não lê storage nem decide conclusão. Ver [missions.md](missions.md).

## `OfflineBanner` (`components/OfflineBanner.js`)

Faixa fina no topo, sem props, montada uma única vez em `navigation/AppNavigator.js` acima do `NavigationContainer` — não replique por tela nem mexa no `ScreenHeader`. Lê `usarConexao()` (`context/ConnectionContext.js`) e só aparece quando está offline **e** tem usuário logado (convidado é sempre local, nunca tem pendência). Texto muda conforme `pendentes`: "Sem internet — N alterações vão sincronizar depois" ou, com a fila zerada, "Sem internet — seus dados estão salvos no aparelho". Ver [database.md](database.md).

## `Toast` (`components/Toast.js`) + `ToastProvider` (`context/ToastContext.js`)

Popup pequeno no topo da tela. Carrega todo feedback efêmero do app — XP/missão, validação, erro, sucesso —, não só XP (o nome `XpToast`/`usarToastDeXp` era da primeira versão e foi renomeado). Não use o componente direto: chame `usarToast()` e enfileire.

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
- **Chips multi-seleção** (gatilhos, ajudas): `RAIO.full`, mesmo padrão de cor do toggle, usado com arrays `GATILHOS`/`AJUDAS` de `utils/theme.js`.
- **Contador +/-**: par de botões circulares (`width/height: 44`, `borderRadius: 22`) em volta de um número grande central — usado para "quantidade de puxadas".
- **Toast de sucesso**: `Animated.Value` iniciado em 0, sequência `timing(1) → delay(2000) → timing(0)`, guardado em `useRef`/`useState`. Ver `DeviceScreen.js`/`RegisterScreen.js`.
- **Modal bottom-sheet** (edição, seletor de data): `Modal transparent animationType="slide"`, overlay `rgba(0,0,0,0.5)` + `justifyContent: 'flex-end'`, conteúdo com `borderTopLeftRadius/borderTopRightRadius: RAIO.xl`.
- **Modal de confirmação central** (excluir registro): mesmo overlay, mas `justifyContent: 'center'`, card com `width: '80%', maxWidth: 300`.
- **Faixa de status dentro de card**: row com ícone Ionicons + texto, `padding: 10`, `RAIO.md`, `borderWidth: 1`, fundo suave e borda na cor do estado. Duas na `HomeScreen`, no card "Como você foi hoje?": `shieldRow` (escudo do streak, tons de `primary`) e `excessRow` (uso acima da meta do aparelho, `cores.danger` com fundo `cores.danger + '22'` — mesmo truque de opacidade do `ConfirmModal`). O `excessRow` só aparece quando `excessoDoDia(registrosDeHoje, aparelho)` (`utils/records.js`) devolve `puxadasAMais > 0`; sem aparelho cadastrado, nunca aparece.
