# Estilo / Tema

`StyleSheet.create` do React Native puro. **Sem NativeWind, sem Tailwind, sem styled-components.** Cada arquivo de tela/componente termina com seu próprio `const styles = StyleSheet.create({...})`; cores dinâmicas (que mudam com o tema) são passadas inline via array de estilo: `[styles.card, { backgroundColor: cores.card }, SOMBRA.medium]`.

## Duas fontes de valores de tema — não confundir

1. **`context/ThemeContext.js`** — `CORES_CLARAS`/`CORES_ESCURAS`, expostos como `cores` via `usarTema()`. **Esta é a fonte correta para qualquer cor usada em JSX** (reage a dark mode).
2. **`utils/theme.js`** — exporta `CORES` (paleta estática, só modo claro), além de `RAIO`, `SOMBRA`, `DICAS`, `GATILHOS`, `AJUDAS`, `MENSAGENS_MOTIVACIONAIS`. **`CORES` daqui é legado**, de antes do dark mode existir — não é usado por nenhuma tela hoje para cor visível. Ao escrever código novo, use `RAIO`/`SOMBRA`/`DICAS`/`GATILHOS`/`AJUDAS`/`MENSAGENS_MOTIVACIONAIS` deste arquivo normalmente, mas cores sempre de `usarTema().cores`.

## Paleta (chaves de `cores`)

`primary`, `primaryLight`, `primaryMid`, `primaryDark`, `background`, `white`, `card`, `text`, `textSecondary`, `textMuted`, `border`, `borderLight`, `danger`, `warning`, `cardShadow`, `tabBar`, `tabBorder`, `inputBg`, `modalBg`. Mesma estrutura de chaves nas duas paletas (claro/escuro) — ao adicionar uma chave nova, adicione nas duas (`CORES_CLARAS` e `CORES_ESCURAS`) em `ThemeContext.js`.

Cor de marca: verde (`#4CAF50` claro / `#66BB6A` escuro). Telas de auth (`LoginScreen`, `SignUpScreen`) usam uma paleta **própria e fixa** (`CORES` local no topo do arquivo, tom azul `#4990E2`), não `usarTema()` — é intencional, a tela de auth roda antes de qualquer contexto de usuário fazer sentido, e o design dessas telas é deliberadamente diferente do resto do app.

## Dark mode

`ThemeContext` guarda `estaEscuro` em `AsyncStorage` (`@vapefree_dark_mode`), alternado pelo botão sol/lua no `ScreenHeader`. Aplica-se a todo o app **exceto** telas de auth (Login/SignUp, que são sempre claras).

O "exceto" é implementado por `forcarTemaClaro(bool)`, exposto pelo `ThemeContext`: o `AuthStack` (`navigation/AppNavigator.js`) chama `forcarTemaClaro(true)` no mount e `false` no unmount. Enquanto ligado, `cores` e o `estaEscuro` devolvido por `usarTema()` são os claros — a preferência salva não é tocada, então sair da stack de auth volta ao escuro. Precisa ser global (e não um provider só em volta da tela) porque o `Toast` e o `ConfirmModal` são renderizados pelo `ToastProvider`, que fica **acima** do `NavigationContainer`; sem isso eles apareceriam escuros por cima da tela de login branca.

### StatusBar

`App.js` fixa `<StatusBar style="light" />` (o `ScreenHeader` é `cores.primary`, verde nos dois temas). `LoginScreen` e `SignUpScreen` têm fundo branco fixo e renderizam o próprio `<StatusBar style="dark" />` — no `expo-status-bar` o componente montado por último vence.

## Espaçamento e forma

`RAIO` (`sm:8, md:12, lg:16, xl:20, full:999`) e `SOMBRA` (`small`, `medium` — `shadowColor/Offset/Opacity/Radius` + `elevation`) de `utils/theme.js`, usados em quase todo `View` com fundo (cards, botões, chips, modais). Não crie novo raio/sombra ad-hoc sem checar se um desses já serve.
