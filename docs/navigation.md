# Navegação

React Navigation clássico (`@react-navigation/native` + `bottom-tabs` + `native-stack`). Sem Expo Router. Tudo definido em `navigation/AppNavigator.js`.

## Árvore

```
AppNavigator
├─ inicializando=true        → LoadingScreen (spinner)
├─ tutorial não concluído    → OnboardingScreen (tela solta, fora de qualquer navigator)
├─ user || ehConvidado           → MainStack (Stack.Navigator, headerShown: false)
│    ├─ Main   → HomeTabs (Tab.Navigator)
│    │    ├─ Home          (HomeScreen)         label "Início"
│    │    ├─ Register      (RegisterScreen)     label "Registrar"
│    │    ├─ History       (HistoryScreen)      label "Histórico"
│    │    └─ Achievements  (AchievementsScreen)  label "Conquistas"
│    ├─ Device    (DeviceScreen)
│    ├─ Profile   (Profile)
│    ├─ Settings  (SettingsScreen)
│    ├─ Account   (AccountScreen)    nome/e-mail/senha e exclusão de conta (só logado)
│    ├─ Crisis    (CrisisScreen)     modo crise, a partir do card da Home
│    ├─ Missions  (MissionsScreen)   missões diárias/semanais, a partir do card da Home
│    ├─ Breathing (BreathingScreen)  respiração guiada
│    └─ Onboarding (OnboardingScreen) "ver o tutorial de novo", a partir das Configurações
└─ else                      → AuthStack (Stack.Navigator, headerShown: false)
     ├─ Login  (LoginScreen)
     └─ SignUp (SignUpScreen)
```

A troca `MainStack` ↔ `AuthStack` é automática: acontece porque `usuario`/`ehConvidado` (de `usarAuth()`) mudam e re-renderizam `AppNavigator` com uma árvore diferente. **Nunca use `navigation.replace('Main')` ou similar** para forçar essa troca — quem decide é sempre o `AuthContext` (via `onAuthStateChanged` do Firebase ou `continuarSemConta`/`sair`). Ver [auth.md](auth.md).

`OnboardingScreen` (`screens/OnboardingScreen.js`) aparece de duas formas. Na primeira abertura ela vem **antes** da decisão de login, sem `Stack.Screen`: `AppNavigator` a renderiza direto, passando `aoConcluir`. A mesma tela também é a rota `Onboarding` da `MainStack`, usada pelo "ver o tutorial de novo" das Configurações — aí ela não recebe `aoConcluir` e o fim do tutorial cai em `navigation.goBack()`. Antes de navegar, a `SettingsScreen` chama `reiniciarOnboarding()` (apaga a flag), pra quem fechar o app no meio do tutorial ainda vê-lo na próxima abertura; concluir grava a flag de novo. São 5 passos horizontais (`FlatList` com `pagingEnabled`), com botão "Pular". Ao concluir/pular, grava a flag `@vapefree_onboarding` via `concluirOnboarding()` e o estado local em `AppNavigator` cai pra `false`, revelando `AuthStack`/`MainStack`. A flag é lida uma vez na montagem — enquanto isso o app mostra o `LoadingScreen`, pra o tutorial não piscar pra quem já passou por ele.

`AuthStack` aceita `initialRouteName` (vindo de `telaDeAuth` no `AuthContext`) para poder abrir direto em `SignUp` quando o usuário clica "Cadastrar" na tela de Perfil em modo convidado.

## Params entre telas

Só o par `Crisis` ↔ `Breathing` usa `route.params`:

- `Crisis` → `navigate('Breathing', { fromCrisis: true })`.
- `Breathing` → `navigate('Crisis', { completedMethod: 'respiracao', durationSec, completed })` ao terminar ou parar. Como `Crisis` já está na stack, isso volta pra ela com os params novos, e ela abre o modal de "como foi?". A `CrisisScreen` limpa esses params com `navigation.setParams({ completedMethod: undefined, ... })` logo que os consome — senão reabriria o modal a cada foco.

## Saída interceptada (Crisis)

`CrisisScreen` bloqueia a saída com `navigation.addListener('beforeRemove')`: gesto de swipe e back de hardware dão `e.preventDefault()` e abrem o modal de desfecho, igual ao voltar do `ScreenHeader`. As saídas legítimas (`pular`, e o `goBack` depois de salvar a sessão) marcam um `saindoRef` antes do `goBack` pro listener deixar passar. Se o modal já está aberto (`pendente !== null`), o back só é engolido — não reabre nada.

O resto da navegação é `navigation.navigate('NomeDaRota')` sem payload. `Device` e `Profile` são acessíveis a partir de qualquer tab via `aoPressionarPerfil`/botões dedicados (não fazem parte das tabs, ficam como telas de stack "por cima").

## Ícones das tabs

`Ionicons`, par outline/filled por `focused`, mapeado em `icons = { Home, Register, History, Achievements }` dentro de `tabBarIcon`. Ao adicionar uma tab nova, adicionar a entrada correspondente nesse mapa (não há fallback — nome ausente quebra o ícone).
