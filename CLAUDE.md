# VapeFree

App React Native (Expo) que ajuda usuário a largar cigarro eletrônico: registro diário de uso, cálculo de economia, conquistas e notificações motivacionais.

Detalhes por assunto ficam em `docs/`. Este arquivo só traz regras permanentes e visão geral — não duplique aqui o conteúdo de `docs/`.

## Stack

- **Expo SDK 54** (`~54.0.35`), React 19.1.0, React Native 0.81.5, `newArchEnabled`.
- **JavaScript puro** — sem TypeScript (`.js` em todo o projeto, sem `tsconfig.json`).
- **React Navigation** (`bottom-tabs` + `native-stack`) — sem Expo Router.
- **Firebase** (`firebase` JS SDK v12): Auth + Firestore. Sem backend próprio.
- **AsyncStorage** para modo convidado (sem conta) e preferências locais (tema, flag de convidado).
- **StyleSheet.create** do React Native para estilos — sem NativeWind/Tailwind, sem styled-components.
- `react-native-chart-kit` (gráficos), `@miblanchard/react-native-slider` (sliders), `@expo/vector-icons` (ícones Ionicons).
- `react-native-view-shot` + `expo-sharing` — só no compartilhamento de conquista (`components/AchievementCelebration.js`).
- `react-native-paper` está no `package.json` mas **não é usado em nenhum lugar do código** — não assuma que está configurado/wired.
- Sem ESLint, Prettier, Jest, `babel.config.js`, `metro.config.js` ou `eas.json` no repo — projeto roda só com os defaults do Expo.

Ver `docs/architecture.md` para como as camadas se conectam.

## Estrutura de pastas

```
App.js              # root component: providers (Auth, Theme) + AppNavigator
index.js            # registerRootComponent (entry point Expo)
navigation/          # AppNavigator.js — toda a árvore de navegação
screens/             # uma tela por arquivo, PascalCase
components/          # componentes reutilizáveis entre telas
context/             # AuthContext, ThemeContext (React Context API)
services/            # firebase.native.js / firebase.web.js
utils/               # storage.js (dados), achievements.js, notifications.js, theme.js
assets/              # ícones/splash do app.json
docs/                # documentação detalhada por assunto (este índice)
coisasParaFazer.txt  # backlog/roadmap do projeto — ver antes de propor features novas
```

Não existe pasta `src/` — tudo fica na raiz. Vários arquivos começam com comentário `// src/...` (resquício de uma estrutura antiga); ignore esse comentário, o caminho real é a partir da raiz.

## Convenções obrigatórias

- **Imports relativos sempre.** Não existe alias configurado (nem `babel-module-resolver`, nem `tsconfig paths`). Não introduza aliases sem discutir primeiro — quebraria consistência com todo o código existente.
- **Toda leitura/escrita de dados passa por `utils/storage.js`.** Telas nunca chamam `AsyncStorage` ou `firestore` diretamente (exceção: telas de auth, que chamam `firebase/auth` diretamente — ver `docs/auth.md`). Isso é o que permite o app funcionar igual para convidado e usuário logado.
- **Cores/tema vêm de `usarTema().cores`**, nunca do `CORES` estático exportado por `utils/theme.js` (esse export é resquício do tema antigo, anterior ao dark mode, e não reage a `estaEscuro`). `RAIO`, `SOMBRA`, `DICAS`, `GATILHOS`, `AJUDAS`, `MENSAGENS_MOTIVACIONAIS` de `utils/theme.js` continuam válidos e são estáticos por natureza.
- **Toda tela usa `<ScreenHeader>`** (`components/ScreenHeader.js`) no topo, dentro de um `ScrollView` com `backgroundColor: cores.background`. Ver `docs/components.md`.
- **`Alert` sempre de `utils/alert.js`, nunca de `react-native`.** `Alert.alert` nativo não funciona no web; o wrapper cobre native e web com a mesma assinatura. Ver `docs/components.md`.
- **Todo o código em português.** Nomes de função, variável, parâmetro, handler e prop são em português, sem acento no identificador (`salvar`, `registros`, `aoPressionar`, `estaEscuro`). Continuam em inglês só: campos de dado persistido no Firestore/AsyncStorage (`date`, `puffs`, `used`, `totalPuffs`, `unlockedAt`, `missionId`, ...), chaves `@vapefree_*`, tokens de cor (`cores.primary`), route names da navegação, nomes de componente/arquivo e APIs de bibliotecas.
- **Sem TypeScript.** Não crie arquivos `.ts`/`.tsx` nem adicione `tsconfig.json` sem alinhar com o usuário antes.
- **Sem Expo Router.** Novas telas entram como `Stack.Screen`/`Tab.Screen` em `navigation/AppNavigator.js`, não como arquivos em `app/`.
- Registro (`Record`) tem `id` gerado com `Date.now()` — ao criar novo registro, siga o mesmo padrão (não use UUID nem index de array).

## Padrões de código

- Componente de tela: `export default function NomeScreen({ navigation }) { ... }`, hooks primeiro, depois handlers, depois JSX, `StyleSheet.create` no fim do arquivo.
- Dado de tela recarrega com `useFocusEffect(useCallback(() => { load(); }, [...]))`, não `useEffect` puro — evita dado desatualizado ao voltar de outra tela.
- Confirmações/formulários simples usam `Alert.alert` (nativo) — só use `Modal` customizado quando o design realmente precisa (edição, date picker, escolha de dados de convidado).
- Erros de operação assíncrona geralmente viram `catch { return false/[] }` silencioso na camada `utils/`, sem propagar exceção — é assim hoje em todo o storage.js (não é ideal, mas é o padrão atual; ver `coisasParaFazer.txt` para plano de melhorar isso).

## Fluxo de desenvolvimento

- Instalar: `npm install`. Rodar: `npm start` (Metro), `npm run android`, `npm run ios`, `npm run web`.
- Sem lint/test configurados — não existe `npm run lint` nem `npm test` para rodar antes de commit.
- Sem CI configurado (`.github/` não existe) e sem `eas.json` — build/deploy ainda é manual. Ver `docs/deployment.md`.
- Antes de propor uma feature nova, olhe `coisasParaFazer.txt` — é o backlog vivo do projeto, mantido pelo usuário.

## Instruções para futuras implementações

1. Nova tela: criar em `screens/`, registrar em `navigation/AppNavigator.js`, usar `ScreenHeader`, ler cores via `usarTema()`.
2. Novo dado persistido: adicionar par de funções em `utils/storage.js` seguindo o padrão `if (uid) { Firestore } else { AsyncStorage }` — nunca ramificar essa lógica dentro da tela.
3. Nova conquista: adicionar entrada em `CONQUISTAS` (`utils/achievements.js`) com `condicao(registros, economia, missoesConcluidas, contexto)` pura — `contexto` é `{ sessoesDeCrise, diasDeAbertura }`, montado por `verificarEDesbloquearConquistas`.
3.1. Nova missão: adicionar entrada em `MISSOES` (`utils/missions.js`) com `progresso(ctx)` pura devolvendo `{ atual, alvo }` — ver `docs/missions.md`. Não renomeie o `id` de uma missão existente (faz parte da chave do que já foi salvo).
4. Novo texto motivacional/trigger/ajuda: adicionar ao array correspondente em `utils/theme.js` (`DICAS`, `GATILHOS`, `AJUDAS`, `MENSAGENS_MOTIVACIONAIS`).
5. Ao mexer em auth, ler `docs/auth.md` primeiro — fluxo de migração de dados de convidado é sensível a ordem de chamadas.
6. Atualize o arquivo de `docs/` correspondente quando mudar algo daquele domínio. Não reescreva este `CLAUDE.md` nem os demais docs inteiros — edite só o que mudou.

## Docs

- [architecture.md](docs/architecture.md) — camadas, fluxo de dados, decisões técnicas
- [auth.md](docs/auth.md) — Firebase Auth, modo convidado, login Google, migração de dados
- [database.md](docs/database.md) — modelo de dados, Firestore vs AsyncStorage
- [api.md](docs/api.md) — integrações externas (só Firebase)
- [missions.md](docs/missions.md) — missões diárias/semanais, XP e toast de recompensa
- [navigation.md](docs/navigation.md) — árvore de navegação, telas
- [components.md](docs/components.md) — componentes reutilizáveis, padrões de UI
- [state.md](docs/state.md) — Context API, estado local
- [styling.md](docs/styling.md) — tema, cores, dark mode
- [notifications.md](docs/notifications.md) — notificações locais agendadas
- [deployment.md](docs/deployment.md) — scripts, build, o que falta configurar
