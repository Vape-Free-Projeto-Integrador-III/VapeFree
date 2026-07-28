# Estilo / Tema

`StyleSheet.create` do React Native puro. **Sem NativeWind, sem Tailwind, sem styled-components.** Cada arquivo de tela/componente termina com seu próprio `const styles = StyleSheet.create({...})`; cores dinâmicas (que mudam com o tema) são passadas inline via array de estilo: `[styles.card, { backgroundColor: cores.card }, SOMBRA.medium]`.

## Duas fontes de valores de tema — não confundir

1. **`context/ThemeContext.js`** — `CORES_CLARAS`/`CORES_ESCURAS`, expostos como `cores` via `usarTema()`. **Esta é a fonte correta para qualquer cor usada em JSX** (reage a dark mode).
2. **`utils/theme.js`** — exporta `RAIO`, `SOMBRA`, `DICAS`, `GATILHOS`, `AJUDAS`, `MENSAGENS_MOTIVACIONAIS` (valores estáticos por natureza). **Não exporta cor nenhuma** — cor sempre de `usarTema().cores`.

## Paleta (chaves de `cores`)

`primary`, `primaryLight`, `primaryMid`, `primaryDark`, `background`, `white`, `card`, `text`, `textSecondary`, `textMuted`, `border`, `borderLight`, `danger`, `warning`, `cardShadow`, `tabBar`, `tabBorder`, `inputBg`, `modalBg`. Mesma estrutura de chaves nas duas paletas (claro/escuro) — ao adicionar uma chave nova, adicione nas duas (`CORES_CLARAS` e `CORES_ESCURAS`) em `ThemeContext.js`.

Cor de marca: verde (`#4CAF50` claro / `#66BB6A` escuro). Telas de auth (`LoginScreen`, `SignUpScreen`) usam uma paleta **própria e fixa** (`CORES` local no topo do arquivo, tom azul `#4990E2`), não `usarTema()` — é intencional, a tela de auth roda antes de qualquer contexto de usuário fazer sentido, e o design dessas telas é deliberadamente diferente do resto do app.

## Dark mode

`ThemeContext` guarda `estaEscuro` em `AsyncStorage` (`@vapefree_dark_mode`), alternado pelo botão sol/lua no `ScreenHeader`. O state começa em `null` (flag ainda não lida) e o provider **não renderiza os filhos** nesse intervalo — assumir "claro" fazia quem usa dark mode ver um flash branco a cada abertura. Mesmo padrão do `mostrarOnboarding` em `AppNavigator.js`. Aplica-se a todo o app **exceto** telas de auth (Login/SignUp, que são sempre claras).

O "exceto" é implementado por `forcarTemaClaro(bool)`, exposto pelo `ThemeContext`: o `AuthStack` (`navigation/AppNavigator.js`) chama `forcarTemaClaro(true)` no mount e `false` no unmount. Enquanto ligado, `cores` e o `estaEscuro` devolvido por `usarTema()` são os claros — a preferência salva não é tocada, então sair da stack de auth volta ao escuro. Precisa ser global (e não um provider só em volta da tela) porque o `Toast` e o `ConfirmModal` são renderizados pelo `ToastProvider`, que fica **acima** do `NavigationContainer`; sem isso eles apareceriam escuros por cima da tela de login branca.

### Componentes nativos (teclado, alerts, date picker)

Esses não leem `cores` — seguem o `userInterfaceStyle` do sistema. `app.json` está em `"automatic"` (era `"light"`, que travava tudo em claro no iOS mesmo com dark mode ligado); como o tema do app é uma escolha manual e não a do sistema, o `ThemeProvider` sobrescreve o valor em runtime com `Appearance.setColorScheme(escuroEfetivo ? 'dark' : 'light')`. Ou seja: nativo segue o toggle do app, não o sistema. `setColorScheme` só tem efeito com `userInterfaceStyle: "automatic"` — não volte esse campo para `"light"`. A chamada é guardada por `typeof Appearance.setColorScheme !== 'function'`: o `Appearance` do `react-native-web` só tem `getColorScheme`/`addChangeListener`, e chamar direto quebrava o provider no web (tela branca).

### StatusBar

`App.js` fixa `<StatusBar style="light" />` (o `ScreenHeader` é `cores.primary`, verde nos dois temas). `LoginScreen` e `SignUpScreen` têm fundo branco fixo e renderizam o próprio `<StatusBar style="dark" />` — no `expo-status-bar` o componente montado por último vence.

## Layout responsivo (web)

`utils/responsivo.js` — `usarLayoutResponsivo()` devolve `{ largura, colunas, ehLargo }` a partir de `useWindowDimensions()` (e **não** `Dimensions.get('window')` lido no topo do módulo, que congela a largura na primeira carga e ignora resize da janela do navegador). Acima de `QUEBRA_DUAS_COLUNAS` (900) `colunas` vira 2; abaixo disso, 1 — celular não muda em nada.

Duas peças, aplicadas hoje em `HomeScreen`, `HistoryScreen`, `MissionsScreen`, `AchievementsScreen` e `CrisisHistoryScreen`:

1. `estiloDoConteudo` (`width: '100%'`, `maxWidth: LARGURA_MAXIMA` = 1000, `alignSelf: 'center'`) numa `View` que envolve tudo **depois** do `ScreenHeader`. O header fica de fora de propósito: tem fundo `cores.primary` e precisa ir de ponta a ponta; limitado a 1000px viraria uma faixa verde flutuando.
2. `<GradeDeCards colunas={colunas}>` em volta dos cards — ver [components.md](components.md).

Gráfico (`react-native-chart-kit`) exige `width` numérico: com 2 colunas não dá pra derivar da janela, então as duas telas com gráfico medem o card com `onLayout` e guardam em state (`larguraDoCardDoGrafico`), renderizando o chart só depois da primeira medição (`> 0` — largura 0 quebra a lib). Tela nova com gráfico deve seguir o mesmo caminho, nunca `Dimensions.get('window').width - 64`.

## Espaçamento e forma

`RAIO` (`sm:8, md:12, lg:16, xl:20, full:999`) e `SOMBRA` (`small`, `medium` — `shadowColor/Offset/Opacity/Radius` + `elevation`) de `utils/theme.js`, usados em quase todo `View` com fundo (cards, botões, chips, modais). Não crie novo raio/sombra ad-hoc sem checar se um desses já serve.
