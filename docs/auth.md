# Autenticação

Firebase Authentication. Três formas de entrar: e-mail/senha, Google, ou "modo convidado" (sem conta).

## AuthContext (`context/AuthContext.js`)

Expõe `{ usuario, ehConvidado, telaDeAuth, inicializando, migrando, iniciarMigracao, concluirMigracao, continuarSemConta, sair }`.

- `usuario`: objeto do Firebase (`onAuthStateChanged`) ou `null`.
- `ehConvidado`: flag lida/gravada em `AsyncStorage` (`@vapefree_guest_mode`), independente do Firebase.
- `inicializando`: `true` só durante a checagem inicial do Firebase ao abrir o app — usado por `AppNavigator` para mostrar loading em vez de decidir Login vs Main prematuramente.
- `migrando` / `iniciarMigracao()` / `concluirMigracao()`: trava que segura a MainStack durante a migração de dados de convidado — ver a seção abaixo.
- Login real sempre zera `ehConvidado` (não faz sentido estar logado E convidado).
- `sair(proximaTelaDeAuth)` serve tanto para sair de conta real quanto para sair do modo convidado; `proximaTelaDeAuth` decide se o usuário cai em `Login` ou `SignUp` ao voltar pra AuthStack (usado pelo botão "Cadastrar" na tela de Perfil em modo convidado).

Nenhuma senha é armazenada pelo app — persistência de sessão é 100% do SDK do Firebase (`getReactNativePersistence(AsyncStorage)` no native).

## Modo convidado

Ativado por `continuarSemConta()` (botão "Continuar sem conta" no `LoginScreen`). Dados ficam só no `AsyncStorage` local (ver [database.md](database.md)). Não requer nenhuma chamada ao Firebase.

## Login com e-mail/senha

`LoginScreen.js` → `signInWithEmailAndPassword`. Trata `auth/user-not-found`, `auth/wrong-password`, `auth/invalid-credential`, `auth/invalid-email` como "e-mail ou senha incorretos"; qualquer outro erro cai em mensagem genérica.

## Recuperação de senha

"Esqueceu a senha?" no `LoginScreen.js` → `sendPasswordResetEmail(auth, email)`, usando o e-mail já digitado no campo (se vazio, pede pra preencher). O fluxo de troca acontece fora do app, na página hospedada pelo Firebase.

`auth/user-not-found` mostra **a mesma** mensagem do sucesso ("se existir uma conta com X...") de propósito — evita usar a tela como oráculo de quais e-mails têm conta. `auth/invalid-email` e `auth/too-many-requests` têm mensagem própria; o resto cai em genérica. Estado `enviandoReset` desabilita o link durante o envio.

## Cadastro

`SignUpScreen.js` → `createUserWithEmailAndPassword` + `updateProfile(displayName)` + `salvarPerfilDaConta(uid, { nome, email })` (`utils/storage.js`), que grava `{ nome, displayName, email }` no doc `users/{uid}` pela fila offline — a tela não fala com o Firestore direto. Falha aí não bloqueia o cadastro: a conta já existe e o perfil sobe quando voltar a rede. Validações client-side: e-mail via regex simples, senha mínimo 8 caracteres contendo pelo menos uma letra e um número (`validarSenhaForte`). Trata `auth/email-already-in-use`, `auth/invalid-email`, `auth/weak-password`.

## Login com Google

Via `expo-auth-session/providers/google` (`Google.useAuthRequest`) em `LoginScreen.js`. Um client ID por plataforma, nas constantes `CLIENT_ID_WEB` / `CLIENT_ID_ANDROID` / `CLIENT_ID_IOS` no topo do arquivo — todos do projeto `vapefree-pi` no Google Cloud. O de web é o que o Firebase criou sozinho ao habilitar o provedor Google; os de Android/iOS são criados à mão (Android precisa de package `com.vapefree.app` + SHA-1 do keystore, um client por SHA-1; iOS precisa do bundle ID).

Fluxo: `promptAsync()` abre o browser (`expo-web-browser`, com `WebBrowser.maybeCompleteAuthSession()` chamado no topo do arquivo) → resposta tratada em `useEffect` que escuta `response` → monta `GoogleAuthProvider.credential(idToken, accessToken)` → `signInWithCredential` → `salvarPerfilDaConta` (nome/e-mail vêm da conta Google; quem entra por aqui não passa pelo `SignUpScreen`, e falha ao salvar não desfaz o login).

Em nativo o provider usa `responseType: code` + PKCE e faz o troca-código sozinho, devolvendo `id_token` em `response.authentication.idToken`. No web vem direto.

### Duas pegadinhas que já quebraram esse fluxo

1. **Não passe `redirectUri` pro `useAuthRequest`.** Só quando ele é `undefined` o provider monta `com.vapefree.app:/oauthredirect` (o `applicationId`), que é o único formato aceito por OAuth client de Android/iOS. Passar `makeRedirectUri({ scheme: 'vapefree' })` dá `redirect_uri_mismatch`.
2. **`app.json` declara dois schemes**: `["vapefree", "com.vapefree.app"]`. O segundo existe só pra receber esse redirect — `expo-auth-session` não tem config plugin que registre isso sozinho, e sem o intent-filter o browser redireciona pra um scheme que ninguém escuta e o app fica travado esperando.

Quando `response.type` não é `success`, o `useEffect` reseta `escolhaConvidadoGooglePendenteRef` para `'skip'` — senão a escolha sobre dados de convidado ficaria pendurada e seria aplicada, sem perguntar, no próximo login que desse certo. `dismiss` (usuário fechou o browser) não mostra alerta; `error` mostra.

## Migração de dados de convidado → conta

Ao fazer login/cadastro (e-mail ou Google), se existirem dados locais de convidado (`temDadosLocaisDoConvidado()`), o app pergunta via `GuestDataChoiceModal` (ver [components.md](components.md)) antes de autenticar:

- **Importar**: `migrarDadosDoConvidadoParaConta(uid)` — copia records/device/economy/achievements do `AsyncStorage` para o Firestore, depois `limparDadosLocaisDoConvidado()`.
- **Descartar**: `limparDadosLocaisDoConvidado()`, mantém os dados que já existirem na conta.
- **Cancelar**: aborta o login inteiro, nada acontece.

A pergunta acontece **antes** de `signInWithEmailAndPassword`/`promptAsync`, resolvida via `Promise` armazenada em `useRef` (`guestChoiceResolverRef`) — só depois de resolvida o login prossegue. Mesmo padrão duplicado em `LoginScreen.js` e `SignUpScreen.js` (não está extraído em hook compartilhado).

### A trava `migrando`

O `onAuthStateChanged` dispara **no meio** do fluxo: o signIn resolve, o `AuthContext` já publica `usuario`, e a `MainStack` montaria enquanto `migrarDadosDoConvidadoParaConta` ainda está subindo o histórico. A `HomeScreen` rodaria `carregar()` em paralelo — `registrarAberturaDoApp` + `sincronizarGamificacao` gravariam XP/economia/aberturas derivados de um histórico ainda vazio, sobrescrevendo o que a migração acabou de subir (ou vice-versa).

Por isso as três telas de auth chamam `iniciarMigracao()` **antes** do signIn/createUser e `concluirMigracao()` no `finally`. Enquanto `migrando` é `true` e já existe usuário, o `AppNavigator` mostra `LoadingScreen` em vez de montar a `MainStack`.

Regras ao mexer nisso:

- `iniciarMigracao()` vem antes da chamada de auth, nunca depois — é ela que dispara o listener.
- `concluirMigracao()` sempre em `finally`; esquecer trava o app no loading para sempre.
- Rede de segurança: o `onAuthStateChanged` zera `migrando` quando o usuário vira `null`.

## Gerenciar a conta (`screens/AccountScreen.js`)

Aberta pelas Configurações, só pra usuário logado (convidado não vê o atalho). Como as telas de auth, fala com `firebase/auth` direto — nome/e-mail/senha são estado do Auth, não dado de domínio.

- **Nome**: `updateProfile(displayName)` + `salvarPerfilDaConta(uid, { nome, email })`. Não exige senha.
- **E-mail**: `verifyBeforeUpdateEmail`, não `updateEmail` — com a proteção contra enumeração de e-mail ligada no projeto, `updateEmail` é rejeitado. O e-mail só troca depois que o usuário clica no link enviado pro endereço novo, então o doc `users/{uid}` **não** é atualizado nesse momento. Depois de enviar o link, a tela devolve o campo pro e-mail atual e guarda o novo em `emailPendente`, que vira um aviso persistente de "troca pendente" no card — sem isso o campo mostrava um e-mail que a conta ainda não tem. O aviso some sozinho quando `usuario.email` passa a ser o pendente (o usuário clicou no link).
- **Senha**: `updatePassword`, com a mesma `validarSenhaForte` do cadastro (8+ caracteres, letra e número).
- **Excluir conta**: `apagarContaNoBanco(uid)` **antes** de `deleteUser`. A ordem importa: depois do `deleteUser` ninguém mais tem permissão de escrever em `users/{uid}`, e os dados ficariam órfãos. Se a limpeza falhar (sem rede), a conta não é excluída e a tela avisa.

Trocar e-mail, trocar senha e excluir conta exigem login recente no Firebase. A tela pede a **senha atual** e refaz a autenticação com `reauthenticateWithCredential(EmailAuthProvider.credential(...))` antes de cada uma. Tudo isso passa por `executarOperacaoSensivel(chave, operacao)`, que existe por dois motivos:

- **Trava de duplo toque** (`emAndamentoRef`): `ocupado` é state, então entre o toque e o re-render o botão ainda aceita um segundo toque. Na troca de senha isso dava um falso "senha atual incorreta" — a segunda chamada reautenticava com a senha que a primeira acabara de trocar.
- **Fases separadas**: só erro do `reauthenticateWithCredential` vira "senha atual incorreta" (`mensagemDoErro(erro, true)`). Erro de credencial vindo depois da operação já concluída fala em sessão expirada, não em senha errada. Quem entrou com Google não tem provedor `password`: nesse caso a tela esconde os formulários de e-mail/senha (são gerenciados pelo Google), tenta a exclusão sem reautenticar e, se vier `auth/requires-recent-login`, pede pra sair e entrar de novo.

## Notificações e sessão

`AuthContext` agenda/cancela notificações motivacionais conforme `usuario`/`ehConvidado` mudam — ver [notifications.md](notifications.md).
