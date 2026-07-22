# Navegação

React Navigation clássico (`@react-navigation/native` + `bottom-tabs` + `native-stack`). Sem Expo Router. Tudo definido em `navigation/AppNavigator.js`.

## Árvore

```
AppNavigator
├─ initializing=true        → LoadingScreen (spinner)
├─ user || isGuest           → MainStack (Stack.Navigator, headerShown: false)
│    ├─ Main   → HomeTabs (Tab.Navigator)
│    │    ├─ Home          (HomeScreen)         label "Início"
│    │    ├─ Register      (RegisterScreen)     label "Registrar"
│    │    ├─ History       (HistoryScreen)      label "Histórico"
│    │    └─ Achievements  (AchievementsScreen)  label "Conquistas"
│    ├─ Device    (DeviceScreen)
│    ├─ Profile   (Profile)
│    ├─ Crisis    (CrisisScreen)     modo crise, a partir do card da Home
│    ├─ Missions  (MissionsScreen)   missões diárias/semanais, a partir do card da Home
│    └─ Breathing (BreathingScreen)  respiração guiada
└─ else                      → AuthStack (Stack.Navigator, headerShown: false)
     ├─ Login  (LoginScreen)
     └─ SignUp (SignUpScreen)
```

A troca `MainStack` ↔ `AuthStack` é automática: acontece porque `user`/`isGuest` (de `useAuth()`) mudam e re-renderizam `AppNavigator` com uma árvore diferente. **Nunca use `navigation.replace('Main')` ou similar** para forçar essa troca — quem decide é sempre o `AuthContext` (via `onAuthStateChanged` do Firebase ou `continueAsGuest`/`logout`). Ver [auth.md](auth.md).

`AuthStack` aceita `initialRouteName` (vindo de `authScreen` no `AuthContext`) para poder abrir direto em `SignUp` quando o usuário clica "Cadastrar" na tela de Perfil em modo convidado.

## Params entre telas

Só o par `Crisis` ↔ `Breathing` usa `route.params`:

- `Crisis` → `navigate('Breathing', { fromCrisis: true })`.
- `Breathing` → `navigate('Crisis', { completedMethod: 'respiracao', durationSec, completed })` ao terminar ou parar. Como `Crisis` já está na stack, isso volta pra ela com os params novos, e ela abre o modal de "como foi?". A `CrisisScreen` limpa esses params com `navigation.setParams({ completedMethod: undefined, ... })` logo que os consome — senão reabriria o modal a cada foco.

O resto da navegação é `navigation.navigate('NomeDaRota')` sem payload. `Device` e `Profile` são acessíveis a partir de qualquer tab via `onProfilePress`/botões dedicados (não fazem parte das tabs, ficam como telas de stack "por cima").

## Ícones das tabs

`Ionicons`, par outline/filled por `focused`, mapeado em `icons = { Home, Register, History, Achievements }` dentro de `tabBarIcon`. Ao adicionar uma tab nova, adicionar a entrada correspondente nesse mapa (não há fallback — nome ausente quebra o ícone).
