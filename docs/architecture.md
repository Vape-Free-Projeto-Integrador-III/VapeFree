# Arquitetura

## Camadas

```
screens/          → UI + orquestração (chama utils/, context/)
components/        → UI reutilizável, sem lógica de dados própria
context/            → estado global (auth, tema, conexão)
utils/storage.js    → única porta de entrada para dados (decide AsyncStorage vs Firestore)
utils/offline.js    → espelho local + fila de sincronização do modo conta (só storage.js usa)
services/firebase.*  → inicialização do SDK Firebase
```

Ao lado de `utils/storage.js` existem os **módulos puros de derivação** — `utils/achievements.js` (quais conquistas o histórico desbloqueia), `utils/insights.js` (quais padrões o histórico revela), `utils/records.js` (contas derivadas do aparelho) e `utils/meta.js` (a rampa da meta de redução). Eles não leem nem escrevem nada: recebem `registros`/`meta`/`aparelho` já carregados e devolvem o resultado calculado. Lógica nova que só transforma registros em informação deve entrar nesse formato, não dentro da tela.

Uma regra vale pra toda a árvore: **a meta que aparece pro usuário sai de `metaEfetiva(meta, aparelho, data)`** (`utils/meta.js`), que devolve a meta declarada pelo usuário e só cai em `metaDiaria(aparelho)` quando ela não existe. Chamar `metaDiaria` direto numa tela ou numa missão quebraria o "meta do usuário ganha da do aparelho" em um lugar só, que é exatamente o tipo de divergência que essa camada existe pra evitar.

Da mesma forma, **nenhuma tela sabe se está online.** `utils/offline.js` guarda um espelho local do Firestore e uma fila de escritas pendentes; `storage.js` usa isso por baixo, então uma tela offline lê e escreve exatamente como online. A única exceção é a migração convidado→conta, que exige rede. Ver [database.md](database.md). O `ConnectionContext` existe só pra UI (banner de "sem internet") — não é por onde os dados passam.

Regra central: **nenhuma tela sabe se o usuário é convidado ou logado.** Toda função de `utils/storage.js` (`obterRegistros`, `salvarAparelho`, etc.) decide isso internamente olhando `auth.currentUser`. Isso é o que torna o app "isomórfico" entre os dois modos sem duplicar telas. Detalhe do modelo de dados em [database.md](database.md).

## Entry point e providers

`index.js` → `registerRootComponent(App)` → `App.js`:

```
<AuthProvider>
  <ThemeProvider>
    <AppContent> (SafeAreaProvider + StatusBar)
      <ConnectionProvider>
        <ToastProvider>
          <AppNavigator>
```

`AuthProvider` fica fora de `ThemeProvider` porque nada em Theme depende de Auth, mas telas dependem dos dois. `ConnectionProvider` fica dentro dos dois porque precisa do `uid` (só sincroniza usuário logado) e o banner usa as cores do tema.

## Split nativo/web do Firebase

`services/firebase.js` não existe como arquivo — existem `firebase.native.js` e `firebase.web.js`. O Metro bundler resolve automaticamente pela extensão de plataforma quando o código importa `'../services/firebase'`. Native usa `initializeAuth` com `getReactNativePersistence(AsyncStorage)`; web usa `getAuth` (persistência padrão do browser). Ambos exportam `auth`, `db`, `default app`. Se precisar adicionar um export novo, replique nos dois arquivos.

## Decisões técnicas fixas

| Decisão | Por quê |
|---|---|
| Sem TypeScript | Projeto começou em JS puro, nunca migrou. Não converta arquivos isoladamente. |
| Sem Expo Router | Navegação já estruturada com React Navigation clássico (`navigation/AppNavigator.js`). |
| Sem NativeWind | Estilo via `StyleSheet.create` + cores injetadas de `usarTema()`. |
| Sem Redux/Zustand | Estado global é só Auth + Theme via Context; resto é local por tela. Ver [state.md](state.md). |

## Inconsistências conhecidas (não corrigir sem pedir)

- `HistoryScreen.js` chama `obterRegistros(uid)`, `obterAparelho(uid)`, `obterEconomia(uid)` passando `uid` como argumento, mas essas funções em `utils/storage.js` não recebem parâmetro (usam `auth.currentUser` internamente). O argumento é ignorado silenciosamente — não é um bug ativo, mas é morto/confuso.
- Existe bug catalogado em `coisasParaFazer.txt`: histórico não atualiza a Home corretamente após importar dados de convidado.
- Backlog completo de features/bugs planejados está em `coisasParaFazer.txt` na raiz — consulte antes de sugerir novas funcionalidades para não duplicar planejamento já feito pelo usuário.
