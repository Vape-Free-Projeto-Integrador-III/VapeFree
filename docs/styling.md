# Estilo / Tema

`StyleSheet.create` do React Native puro. **Sem NativeWind, sem Tailwind, sem styled-components.** Cada arquivo de tela/componente termina com seu próprio `const styles = StyleSheet.create({...})`; cores dinâmicas (que mudam com o tema) são passadas inline via array de estilo: `[styles.card, { backgroundColor: colors.card }, SHADOW.medium]`.

## Duas fontes de valores de tema — não confundir

1. **`context/ThemeContext.js`** — `LIGHT_COLORS`/`DARK_COLORS`, expostos como `colors` via `useTheme()`. **Esta é a fonte correta para qualquer cor usada em JSX** (reage a dark mode).
2. **`utils/theme.js`** — exporta `COLORS` (paleta estática, só modo claro), além de `RADIUS`, `SHADOW`, `TIPS`, `TRIGGERS`, `HELPS`, `MOTIVATIONAL_MESSAGES`. **`COLORS` daqui é legado**, de antes do dark mode existir — não é usado por nenhuma tela hoje para cor visível. Ao escrever código novo, use `RADIUS`/`SHADOW`/`TIPS`/`TRIGGERS`/`HELPS`/`MOTIVATIONAL_MESSAGES` deste arquivo normalmente, mas cores sempre de `useTheme().colors`.

## Paleta (chaves de `colors`)

`primary`, `primaryLight`, `primaryMid`, `primaryDark`, `background`, `white`, `card`, `text`, `textSecondary`, `textMuted`, `border`, `borderLight`, `danger`, `warning`, `cardShadow`, `tabBar`, `tabBorder`, `inputBg`, `modalBg`. Mesma estrutura de chaves nas duas paletas (claro/escuro) — ao adicionar uma chave nova, adicione nas duas (`LIGHT_COLORS` e `DARK_COLORS`) em `ThemeContext.js`.

Cor de marca: verde (`#4CAF50` claro / `#66BB6A` escuro). Telas de auth (`LoginScreen`, `SignUpScreen`) usam uma paleta **própria e fixa** (`COLORS` local no topo do arquivo, tom azul `#4990E2`), não `useTheme()` — é intencional, a tela de auth roda antes de qualquer contexto de usuário fazer sentido, e o design dessas telas é deliberadamente diferente do resto do app.

## Dark mode

`ThemeContext` guarda `isDark` em `AsyncStorage` (`@vapefree_dark_mode`), alternado pelo botão sol/lua no `ScreenHeader`. Aplica-se a todo o app **exceto** telas de auth (Login/SignUp, que são sempre claras).

## Espaçamento e forma

`RADIUS` (`sm:8, md:12, lg:16, xl:20, full:999`) e `SHADOW` (`small`, `medium` — `shadowColor/Offset/Opacity/Radius` + `elevation`) de `utils/theme.js`, usados em quase todo `View` com fundo (cards, botões, chips, modais). Não crie novo raio/sombra ad-hoc sem checar se um desses já serve.
