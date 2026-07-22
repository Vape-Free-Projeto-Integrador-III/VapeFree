# Componentes e padrões de UI

`components/` tem poucos componentes compartilhados hoje — a maioria da UI é escrita direto em cada `screens/*.js` (não há biblioteca de design system própria além do que está descrito aqui).

## `ScreenHeader` (`components/ScreenHeader.js`)

Cabeçalho colorido (`colors.primary`) usado no topo de toda tela. Props: `title`, `subtitle`, `colors`, `isDark`, `toggleTheme`, `onProfilePress`, `onBackPress`, `showProfile` (default `true`), `showTheme` (default `true`).

- Sem `onBackPress` → mostra espaço vazio à esquerda (tabs de nível raiz: Home, Register, History, Achievements).
- Com `onBackPress` → mostra seta de voltar (telas de stack: Device, Profile).
- `showProfile={false}` na tela `Profile` (não faz sentido ter botão de perfil dentro do próprio perfil).

Toda tela nova deve renderizar `<ScreenHeader>` como primeiro filho do `ScrollView`, passando `colors`/`isDark`/`toggleTheme` de `useTheme()`.

## `GuestDataChoiceModal` (`components/GuestDataChoiceModal.js`)

Modal genérico de 3 botões (Importar / Descartar / Cancelar) usado só no fluxo de login/cadastro quando existem dados de convidado a resolver. Props: `visible`, `title`, `message`, `importLabel`, `discardLabel`, `cancelLabel` (default `'Cancelar'`), `onImport`, `onDiscard`, `onCancel`. Ver uso em [auth.md](auth.md).

Nota: usa paleta de cores própria hardcoded (`#2F6FED` etc.), não vem de `useTheme()` — é intencionalmente neutro/fora do tema claro-escuro do resto do app.

## `InsightsCard` (`components/InsightsCard.js`)

Card "Seus padrões" da tela de Histórico, renderizado entre o gráfico e a lista de registros. Props: `records`, `crisisSessions` (default `[]`), `colors`.

Componente de apresentação puro — todo o cálculo vive em `computeInsights` (`utils/insights.js`), que é função pura sobre a lista de registros. Três estados:

- Menos de `MIN_RECORDS_FOR_INSIGHTS` (7) registros → card compacto "Registre por mais X dias para ver seus padrões."
- Registros suficientes e algum padrão qualificado → seção "Seus padrões" com até 4 linhas (emoji, título, detalhe).
- Registros suficientes mas nenhum padrão qualificado (ex.: só dias sem usar, sem gatilho marcado) → `return null`, nada renderiza.

Insights do modo crise (`computeCrisisInsights`, ids com prefixo `crise_`) aparecem numa segunda seção, "No modo crise", e **não** dependem do mínimo de 7 registros — quem usou o modo crise já gerou dado próprio. Se só houver esses, o card mostra só essa seção.

Insight novo = função nova em `utils/insights.js` devolvendo `{ id, icon, title, detail }`, somada ao array de `computeInsights`. O componente não precisa mudar.

Nenhum insight usa o campo `time` do registro: ele guarda a hora em que o formulário foi salvo, não a hora do uso (o registro pode ser retroativo).

## `CrisisOutcomeModal` (`components/CrisisOutcomeModal.js`)

Modal central usado só pela `CrisisScreen`, ao encerrar uma sessão de modo crise. Pergunta "E aí, como foi?" com três chips (Passou / Diminuiu / Acabei usando) + nota opcional. Props: `visible`, `colors`, `onSubmit(outcome, note)`, `onSkip`.

É um dos poucos casos legítimos de `Modal` em vez de `Alert` (escolha de dados + texto livre). A resposta vira o campo `outcome` da `CrisisSession` e alimenta `recommendedCrisisMethod` — sem ela, o app não tem como aprender qual método funciona pra aquele usuário. O texto de "Acabei usando" é deliberadamente sem julgamento.

## `MissionsCard` (`components/MissionsCard.js`)

Card da `HomeScreen` com as missões **diárias** do dia. Props: `missions` (já calculadas pela tela via `checkMissions`), `colors`, `onPress` (navega para `Missions`). É só apresentação — não lê storage nem decide conclusão. Ver [missions.md](missions.md).

## `XpToast` (`components/XpToast.js`) + `XpToastProvider` (`context/XpToastContext.js`)

Popup pequeno no topo da tela ("Missão: X · +25 XP"). Não use direto: chame `useXpToast()` e enfileire.

- `showRewards({ achievements, missions, gained, icon, title })` — um toast por conquista/missão nova, mais um genérico com o XP que sobrou (registro, dia limpo, streak). `icon`/`title` personalizam só esse genérico: a `RegisterScreen` usa "🚭 Dia sem cigarro eletrônico!" quando `used === false` e "📝 Registro feito, sem culpa" quando o usuário usou.
- `showXp({ icon, title, xp })` / `showXpGain(xp)` para casos avulsos.

O provider mostra um toast por vez, na ordem da fila, e fica montado em `App.js` dentro do `SafeAreaProvider`. O `Animated.View` é `pointerEvents="none"`, então nunca bloqueia toque. **Quem calcula o quanto foi ganho é `refreshXp` (campo `gained`)** — não incremente XP na mão para alimentar o toast.

## Padrões de UI repetidos entre telas (não componentizados)

Esses padrões existem em várias telas com estilo copiado, não como componente — ao criar tela nova, replique o padrão em vez de inventar um novo:

- **Card**: `View` com `borderRadius: RADIUS.lg`, `backgroundColor: colors.card`, `SHADOW.medium`, `marginHorizontal: 16`.
- **Toggle de 2 opções** (ex: Descartável/Recarregável, Sim/Não): row de dois `TouchableOpacity` com `borderColor`/`backgroundColor: colors.primary` quando selecionado, texto branco quando ativo.
- **Chips multi-seleção** (gatilhos, ajudas): `RADIUS.full`, mesmo padrão de cor do toggle, usado com arrays `TRIGGERS`/`HELPS` de `utils/theme.js`.
- **Contador +/-**: par de botões circulares (`width/height: 44`, `borderRadius: 22`) em volta de um número grande central — usado para "quantidade de puxadas".
- **Toast de sucesso**: `Animated.Value` iniciado em 0, sequência `timing(1) → delay(2000) → timing(0)`, guardado em `useRef`/`useState`. Ver `DeviceScreen.js`/`RegisterScreen.js`.
- **Modal bottom-sheet** (edição, seletor de data): `Modal transparent animationType="slide"`, overlay `rgba(0,0,0,0.5)` + `justifyContent: 'flex-end'`, conteúdo com `borderTopLeftRadius/borderTopRightRadius: RADIUS.xl`.
- **Modal de confirmação central** (excluir registro): mesmo overlay, mas `justifyContent: 'center'`, card com `width: '80%', maxWidth: 300`.
