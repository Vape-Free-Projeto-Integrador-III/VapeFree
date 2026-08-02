# Autenticação

Firebase Authentication. Três formas de entrar: e-mail/senha, Google, ou "modo convidado" (sem conta).

## AuthContext (`context/AuthContext.js`)

Expõe `{ usuario, ehConvidado, telaDeAuth, inicializando, migrando, iniciarMigracao, concluirMigracao, pedirEscolhaDeDadosDeConvidado, atualizarUsuario, continuarSemConta, sair }`.

- `usuario`: objeto do Firebase (`onAuthStateChanged`) ou `null`.
- `ehConvidado`: flag lida/gravada em `AsyncStorage` (`@vapefree_guest_mode`), independente do Firebase.
- `inicializando`: `true` só durante a checagem inicial do Firebase ao abrir o app — usado por `AppNavigator` para mostrar loading em vez de decidir Login vs Main prematuramente.
- `migrando` / `iniciarMigracao()` / `concluirMigracao()`: trava que segura a MainStack durante a migração de dados de convidado — ver a seção abaixo.
- `pedirEscolhaDeDadosDeConvidado(config)`: abre o `GuestDataChoiceModal` (renderizado pelo próprio `AuthProvider`) e devolve `Promise<'import' | 'discard' | 'skip'>` — ver a seção de migração.
- `atualizarUsuario()`: `auth.currentUser.reload()` + `setUsuario` com um clone (mesmo prototype, identidade nova). Existe porque `updateProfile`/`updateEmail` **não** disparam o `onAuthStateChanged` — sem chamar isso o `usuario` do context fica com o `displayName` antigo até o app ser reaberto. Quem muda campo do Auth pela tela (`AccountScreen`, ao salvar o nome) é obrigado a chamar.
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

Quando `response.type` não é `success`, `dismiss` (usuário fechou o browser) não mostra alerta; `error` mostra. A pergunta sobre dados de convidado não é feita aqui — ela vem depois do `signInWithCredential` (ver a seção abaixo).

## Migração de dados de convidado → conta

No **login** (e-mail ou Google), a pergunta é feita **depois** do signIn, por `tratarDadosDeConvidado(uid, nomeDaConta)` no `LoginScreen`: só com o usuário autenticado dá pra chamar `contaTemDados()` e saber se a conta de destino já tem progresso — e isso muda o texto, porque importar **sobrepõe** o que está na conta (`migrarDadosDoConvidadoParaConta` usa `substituirDocsDaColecao`). Perguntar antes de logar era o que fazia o app oferecer "Começar do zero" pra uma conta cheia de dados.

Só roda se `temDadosLocaisDoConvidado()`. Os rótulos saem de `contaTemDados()`, que devolve `{ ok, temDados }`:

- `ok: false` (offline, fila pendente ou leitura que falhou/estourou o `comTempoLimite`) → **não pergunta nada**: só um `Alert` de "Não deu pra conferir sua conta" e os dados de convidado ficam intactos pro próximo login. Perguntar sem confirmação do servidor é o que apagava histórico: espelho vazio de aparelho novo + leitura falha viravam "conta vazia", o usuário escolhia importar e a sobreposição levava a nuvem junto;
- `temDados: false` → "Usar meus dados" / "Começar do zero";
- `temDados: true` → "Usar os do convidado" / "Manter os da conta", com o aviso de que a importação substitui o que está lá.

E a escolha vira:

- **`'import'`**: `migrarDadosDoConvidadoParaConta(uid)` — sobe records/device/economy/achievements/missões/crises do `AsyncStorage` pro Firestore, depois `limparDadosLocaisDoConvidado()`. Exige rede; falhando, avisa e mantém o local intacto.
- **`'discard'`**: `limparDadosLocaisDoConvidado()`, fica valendo o que já existe na conta.
- **`'skip'`** (botão "Decido depois"): nada é apagado nem sobreposto; os dados de convidado seguem no aparelho e a pergunta volta no próximo login.

O `GuestDataChoiceModal` (ver [components.md](components.md)) é renderizado pelo **`AuthProvider`**, não pela tela: com `migrando` ligado o `AppNavigator` já trocou a AuthStack por um `LoadingScreen`, então um modal do `LoginScreen` sumiria no meio da pergunta. O `AuthProvider` fica montado o app inteiro. A `Promise` é resolvida pelo `resolverEscolhaRef`; se o usuário virar `null` (logout no meio), o `onAuthStateChanged` resolve `'skip'` pra não deixar o `await` pendurado.

O **cadastro** (`SignUpScreen.js`) continua perguntando **antes** do `createUserWithEmailAndPassword`, com modal próprio: conta recém-criada é sempre vazia, então não há o que sobrepor.

### A trava `migrando`

O `onAuthStateChanged` dispara **no meio** do fluxo: o signIn resolve, o `AuthContext` já publica `usuario`, e a `MainStack` montaria enquanto `migrarDadosDoConvidadoParaConta` ainda está subindo o histórico. A `HomeScreen` rodaria `carregar()` em paralelo — `registrarAberturaDoApp` + `sincronizarGamificacao` gravariam XP/economia/aberturas derivados de um histórico ainda vazio, sobrescrevendo o que a migração acabou de subir (ou vice-versa).

Por isso as três telas de auth chamam `iniciarMigracao()` **antes** do signIn/createUser e `concluirMigracao()` no `finally`. Enquanto `migrando` é `true` e já existe usuário, o `AppNavigator` mostra `LoadingScreen` em vez de montar a `MainStack`.

Regras ao mexer nisso:

- `iniciarMigracao()` vem antes da chamada de auth, nunca depois — é ela que dispara o listener.
- `concluirMigracao()` sempre em `finally`; esquecer trava o app no loading para sempre.
- Rede de segurança: o `onAuthStateChanged` zera `migrando` quando o usuário vira `null`.

## Gerenciar a conta (`screens/AccountScreen.js`)

Aberta pelas Configurações, só pra usuário logado (convidado não vê o atalho). Como as telas de auth, fala com `firebase/auth` direto — nome/e-mail/senha são estado do Auth, não dado de domínio.

- **Nome**: `updateProfile(displayName)` + `salvarPerfilDaConta(uid, { nome, email })` + `atualizarUsuario()` do `AuthContext`. Não exige senha. O `atualizarUsuario()` não é opcional: `updateProfile` não dispara o `onAuthStateChanged`, então sem ele a Profile continuava mostrando o nome antigo e o guard "esse já é o seu nome atual" nunca batia.
- **E-mail**: `verifyBeforeUpdateEmail`, não `updateEmail` — com a proteção contra enumeração de e-mail ligada no projeto, `updateEmail` é rejeitado. O e-mail só troca depois que o usuário clica no link enviado pro endereço novo, então o doc `users/{uid}` **não** é atualizado nesse momento. Depois de enviar o link, a tela devolve o campo pro e-mail atual e guarda o novo em `emailPendente`, que vira um aviso persistente de "troca pendente" no card — sem isso o campo mostrava um e-mail que a conta ainda não tem. O aviso some sozinho quando `usuario.email` passa a ser o pendente (o usuário clicou no link).
- **Senha**: `updatePassword`, com a mesma `validarSenhaForte` do cadastro (8+ caracteres, letra e número).
- **Excluir conta**: `apagarContaNoBanco(uid)` **antes** de `deleteUser`. A ordem importa: depois do `deleteUser` ninguém mais tem permissão de escrever em `users/{uid}`, e os dados ficariam órfãos. Se a limpeza falhar (sem rede), a conta não é excluída e a tela avisa.

Trocar e-mail, trocar senha e excluir conta exigem login recente no Firebase. A tela pede a **senha atual** e refaz a autenticação com `reauthenticateWithCredential(EmailAuthProvider.credential(...))` antes de cada uma. Tudo isso passa por `executarOperacaoSensivel(chave, operacao)`, que existe por dois motivos:

- **Trava de duplo toque** (`emAndamentoRef`): `ocupado` é state, então entre o toque e o re-render o botão ainda aceita um segundo toque. Na troca de senha isso dava um falso "senha atual incorreta" — a segunda chamada reautenticava com a senha que a primeira acabara de trocar.
- **Fases separadas**: só erro do `reauthenticateWithCredential` vira "senha atual incorreta" (`mensagemDoErro(erro, true)`). Erro de credencial vindo depois da operação já concluída fala em sessão expirada, não em senha errada. Quem entrou com Google não tem provedor `password`: nesse caso a tela esconde os formulários de e-mail/senha (são gerenciados pelo Google), tenta a exclusão sem reautenticar e, se vier `auth/requires-recent-login`, pede pra sair e entrar de novo.

## Notificações e sessão

`AuthContext` agenda/cancela notificações motivacionais conforme `usuario`/`ehConvidado` mudam — ver [notifications.md](notifications.md).
