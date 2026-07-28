# Navegação

React Navigation clássico (`@react-navigation/native` + `bottom-tabs` + `native-stack`). Sem Expo Router. Tudo definido em `navigation/AppNavigator.js`.

## Árvore

```
AppNavigator
├─ inicializando=true        → LoadingScreen (spinner)
├─ (user || ehConvidado) && tutorial não concluído → OnboardingScreen (tela solta, fora de qualquer navigator)
├─ user || ehConvidado           → MainStack (Stack.Navigator, headerShown: false)
│    ├─ Main   → HomeTabs (Tab.Navigator)
│    │    ├─ Home          (HomeScreen)         label "Início"
│    │    ├─ Register      (RegisterScreen)     label "Registrar"
│    │    ├─ History       (HistoryScreen)      label "Histórico"
│    │    └─ Achievements  (AchievementsScreen)  label "Conquistas"
│    ├─ Device    (DeviceScreen)
│    ├─ Goal      (GoalScreen)      meta de redução, a partir da Home ou das Configurações
│    ├─ Profile   (Profile)
│    ├─ Settings  (SettingsScreen)
│    ├─ Account   (AccountScreen)    nome/e-mail/senha e exclusão de conta (só logado)
│    ├─ Crisis    (CrisisScreen)     modo crise, a partir do card da Home
│    ├─ CrisisHistory (CrisisHistoryScreen) lista das sessões de crise, a partir do InsightsCard no Histórico
│    ├─ Missions  (MissionsScreen)   missões diárias/semanais, a partir do card da Home
│    ├─ Breathing (BreathingScreen)  respiração guiada
│    └─ Onboarding (OnboardingScreen) "ver o tutorial de novo", a partir das Configurações
└─ else                      → AuthStack (Stack.Navigator, headerShown: false)
     ├─ Login  (LoginScreen)
     └─ SignUp (SignUpScreen)
```

A troca `MainStack` ↔ `AuthStack` é automática: acontece porque `usuario`/`ehConvidado` (de `usarAuth()`) mudam e re-renderizam `AppNavigator` com uma árvore diferente. **Nunca use `navigation.replace('Main')` ou similar** para forçar essa troca — quem decide é sempre o `AuthContext` (via `onAuthStateChanged` do Firebase ou `continuarSemConta`/`sair`). Ver [auth.md](auth.md).

`OnboardingScreen` (`screens/OnboardingScreen.js`) aparece de duas formas. Na primeira abertura ela vem **depois** da decisão de login (logar, cadastrar ou entrar como convidado), sem `Stack.Screen`: `AppNavigator` a renderiza direto, passando `aoConcluir`. Essa ordem é o que permite o tutorial terminar gravando dado do usuário — com sessão já resolvida, `salvarAparelho()` sabe se escreve na conta ou no AsyncStorage do convidado. A mesma tela também é a rota `Onboarding` da `MainStack`, usada pelo "ver o tutorial de novo" das Configurações — aí ela não recebe `aoConcluir` e o fim do tutorial cai em `navigation.goBack()`. Antes de navegar, a `SettingsScreen` chama `reiniciarOnboarding()` (apaga a flag), pra quem fechar o app no meio do tutorial ainda vê-lo na próxima abertura; concluir grava a flag de novo. São 5 passos horizontais (`FlatList` com `pagingEnabled`), com botão "Pular". Ao concluir/pular, grava a flag `@vapefree_onboarding` via `concluirOnboarding()` e o estado local em `AppNavigator` cai pra `false`, revelando a `MainStack`. A flag é lida uma vez na montagem — enquanto isso o app mostra o `LoadingScreen`, pra o tutorial não piscar pra quem já passou por ele.

**Passos de formulário (6 e 7).** No fluxo inicial (com `aoConcluir`) entram dois passos a mais, cada um condicionado ao seu dado:

- **6 — aparelho**, só se `obterAparelho()` devolver `null`: nome, preço, total de puxadas, dias de duração — mesmos campos e validação da `DeviceScreen`, com prévia de custo por puxada/meta diária. "Salvar meu dispositivo" chama `salvarAparelho()` + `recalcularEconomia()` (sem `sincronizarGamificacao()`: no dia 1 não existe registro) e avança.
- **7 — meta**, só se `obterMeta()` não devolver meta válida: quantas puxadas por dia hoje, quantas quer chegar e prazo em chips (30/60/90 dias), com prévia da meta de hoje. O ponto de partida já vem preenchido com o consumo declarado no passo do aparelho. "Definir minha meta" chama `salvarMeta()` e conclui.

Nos dois, falha de escrita mostra `mostrarErro` do `usarToast()` e mantém o usuário no passo; "Fazer isso depois" segue sem salvar. Quem veio das Configurações **nunca** vê nenhum dos dois, nem quem já tem o dado cadastrado. Enquanto essas checagens não respondem, a tela mostra um spinner — a lista de passos não pode mudar de tamanho no meio do tutorial.

`AuthStack` aceita `initialRouteName` (vindo de `telaDeAuth` no `AuthContext`) para poder abrir direto em `SignUp` quando o usuário clica "Cadastrar" na tela de Perfil em modo convidado.

## Params entre telas

Só o par `Crisis` ↔ `Breathing` usa `route.params`:

- `Crisis` → `navigate('Breathing', { fromCrisis: true })`.
- `Breathing` → `navigate('Crisis', { completedMethod: 'respiracao', durationSec, completed })` ao terminar ou parar. Como `Crisis` já está na stack, isso volta pra ela com os params novos, e ela abre o modal de "como foi?". A `CrisisScreen` limpa esses params com `navigation.setParams({ completedMethod: undefined, ... })` logo que os consome — senão reabriria o modal a cada foco.

## Saída interceptada (Crisis)

`CrisisScreen` bloqueia a saída com `navigation.addListener('beforeRemove')`: gesto de swipe e back de hardware dão `e.preventDefault()` e abrem o modal de desfecho, igual ao voltar do `ScreenHeader`. As saídas legítimas (`pular`, e o `goBack` depois de salvar a sessão) marcam um `saindoRef` antes do `goBack` pro listener deixar passar. Se o modal já está aberto (`pendente !== null`), o back só é engolido — não reabre nada.

`CrisisHistory` é só leitura e não interfere nesse fluxo: é aberta pelo atalho "Ver todas as crises" do `InsightsCard` (tela de Histórico) e sai por `goBack()`. Do estado vazio dela dá pra ir direto pro `Crisis`.

O resto da navegação é `navigation.navigate('NomeDaRota')` sem payload. `Device` e `Profile` são acessíveis a partir de qualquer tab via `aoPressionarPerfil`/botões dedicados (não fazem parte das tabs, ficam como telas de stack "por cima").

## Ícones das tabs

`Ionicons`, par outline/filled por `focused`, mapeado em `icons = { Home, Register, History, Achievements }` dentro de `tabBarIcon`. Ao adicionar uma tab nova, adicionar a entrada correspondente nesse mapa (não há fallback — nome ausente quebra o ícone).
