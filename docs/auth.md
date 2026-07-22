# Autenticação

Firebase Authentication. Três formas de entrar: e-mail/senha, Google, ou "modo convidado" (sem conta).

## AuthContext (`context/AuthContext.js`)

Expõe `{ user, ehConvidado, telaDeAuth, inicializando, continuarSemConta, logout }`.

- `usuario`: objeto do Firebase (`onAuthStateChanged`) ou `null`.
- `ehConvidado`: flag lida/gravada em `AsyncStorage` (`@vapefree_guest_mode`), independente do Firebase.
- `inicializando`: `true` só durante a checagem inicial do Firebase ao abrir o app — usado por `AppNavigator` para mostrar loading em vez de decidir Login vs Main prematuramente.
- Login real sempre zera `ehConvidado` (não faz sentido estar logado E convidado).
- `sair(proximaTelaDeAuth)` serve tanto para sair de conta real quanto para sair do modo convidado; `proximaTelaDeAuth` decide se o usuário cai em `Login` ou `SignUp` ao voltar pra AuthStack (usado pelo botão "Cadastrar" na tela de Perfil em modo convidado).

Nenhuma senha é armazenada pelo app — persistência de sessão é 100% do SDK do Firebase (`getReactNativePersistence(AsyncStorage)` no native).

## Modo convidado

Ativado por `continuarSemConta()` (botão "Continuar sem conta" no `LoginScreen`). Dados ficam só no `AsyncStorage` local (ver [database.md](database.md)). Não requer nenhuma chamada ao Firebase.

## Login com e-mail/senha

`LoginScreen.js` → `signInWithEmailAndPassword`. Trata `auth/user-not-found`, `auth/wrong-password`, `auth/invalid-credential`, `auth/invalid-email` como "e-mail ou senha incorretos"; qualquer outro erro cai em mensagem genérica.

## Cadastro

`SignUpScreen.js` → `createUserWithEmailAndPassword` + `updateProfile(displayName)` + grava doc `users/{uid}` no Firestore com `{ nome, displayName, email }`. Validações client-side: e-mail via regex simples, senha mínimo 8 caracteres (`validarSenhaForte`). Trata `auth/email-already-in-use`, `auth/invalid-email`, `auth/weak-password`.

## Login com Google

Via `expo-auth-session/providers/google` (`Google.useAuthRequest`) em `LoginScreen.js`. **`androidClientId` ainda está com placeholder (`'COLOQUE_AQUI_O_ANDROID_CLIENT_ID.apps.googleusercontent.com'`)** — login Google funciona no fluxo web/Expo Go via `webClientId`, mas não está configurado para build Android nativo. Ao mexer nisso, checar se o placeholder já foi preenchido antes de assumir que está quebrado.

Fluxo: `promptAsync()` abre o browser (`expo-web-browser`, com `WebBrowser.maybeCompleteAuthSession()` chamado no topo do arquivo) → resposta tratada em `useEffect` que escuta `response` → monta `GoogleAuthProvider.credential(idToken, accessToken)` → `signInWithCredential`.

## Migração de dados de convidado → conta

Ao fazer login/cadastro (e-mail ou Google), se existirem dados locais de convidado (`temDadosLocaisDoConvidado()`), o app pergunta via `GuestDataChoiceModal` (ver [components.md](components.md)) antes de autenticar:

- **Importar**: `migrarDadosDoConvidadoParaConta(uid)` — copia records/device/economy/achievements do `AsyncStorage` para o Firestore, depois `limparDadosLocaisDoConvidado()`.
- **Descartar**: `limparDadosLocaisDoConvidado()`, mantém os dados que já existirem na conta.
- **Cancelar**: aborta o login inteiro, nada acontece.

A pergunta acontece **antes** de `signInWithEmailAndPassword`/`promptAsync`, resolvida via `Promise` armazenada em `useRef` (`guestChoiceResolverRef`) — só depois de resolvida o login prossegue. Mesmo padrão duplicado em `LoginScreen.js` e `SignUpScreen.js` (não está extraído em hook compartilhado).

## Notificações e sessão

`AuthContext` agenda/cancela notificações motivacionais conforme `usuario`/`ehConvidado` mudam — ver [notifications.md](notifications.md).
