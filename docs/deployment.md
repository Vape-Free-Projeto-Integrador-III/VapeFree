# Deployment / Build

## Scripts (`package.json`)

- `npm start` → `expo start` (Metro, Expo Go / dev client)
- `npm run android` → `expo run:android` (build nativo local)
- `npm run ios` → `expo run:ios` (build nativo local)
- `npm run web` → `expo start --web`
- `npm test` → `jest` (preset `jest-expo` + `@testing-library/react-native`). `npm run test:watch` roda em modo watch.
- `npm run lint` → `eslint .` (flat config, `eslint-config-expo` + `eslint-config-prettier`)
- `npm run format` → `prettier --write` em `**/*.{js,json,md}`

Sem `npm run build`.

## Testes

Ficam em `__tests__/utils/<modulo>.test.js`, um arquivo por util. Cobrem as funções puras que
concentram a lógica de negócio (`datas`, `records`, `meta`, `xp`, `achievements`, `calendario`,
`missions`) mais `offline` e `storage` — estes dois são os únicos com mock (AsyncStorage, NetInfo,
`firebase/firestore` e `services/firebase`, com `jest.resetModules()` por caso porque os módulos
guardam estado próprio).

Em `storage.test.js` o `offline.js` roda de verdade — só as bordas são falsas. O que interessa
testar ali é a coordenação entre espelho e fila (convidado x conta, online x offline), não cada
arquivo isolado. O firestore falso guarda documentos num objeto indexado por caminho
(`users/uid1/records/123`), o que permite afirmar o que realmente subiu.

Duas armadilhas desse arquivo, ambas com helper próprio no topo dele:

- `escreverNaConta` dispara `sincronizar()` **sem await** de propósito. Isso deixa uma drenagem solta
  correndo junto com o teste — mexer em `mockOnline` no meio dela torna o resultado um sorteio.
  Encerre a drenagem (`aguardarDrenagemSolta`) antes de religar a rede.
- `estaOnline()` guarda a conexão em cache por 30s. Voltar a rede no meio do teste exige avançar o
  relógio além disso (`avancarRelogio(31000)`), senão o módulo continua achando que está offline.

### Testes de tela (`__tests__/screens/`)

Só existe um, e de propósito: `escrita-checa-ok.test.js`, que trava a regra de que **escrita iniciada
pelo usuário devolve `{ ok, motivo }` e a tela é obrigada a checar `ok` antes de dar sucesso/XP**
(`RegisterScreen`, `DeviceScreen`, `GoalScreen`). Quebrar isso não gera erro nenhum: a tela mostra
"salvo!" e concede XP por algo que nunca foi gravado — e nenhum teste de util pega, porque a checagem
mora dentro da tela.

Critério pra escrever um teste de tela novo: se ele afirma **o que a tela faz**, escreva; se afirma
**como a tela parece**, não. O segundo tipo fica vermelho a cada redesign sem nunca achar bug, e um
suite ruidoso perde a autoridade.

Notas de ferramenta (`@testing-library/react-native` v14):

- `render` e `fireEvent` são **assíncronos** — sempre `await`. Sem isso `screen` fica vazio e o erro
  que aparece é o enganoso "`render` function has not been called".
- As queries saem do `screen` importado, não do retorno de `render`.
- Os toasts de sucesso rodam `Animated.sequence` com delay de 2s; sem `jest.useFakeTimers()` o Jest
  reclama de worker que não encerrou.
- `@expo/vector-icons` é mockado: carregá-lo puxa `expo-font` → `expo-asset`, que não está instalado.
- `@miblanchard/react-native-slider` publica ESM não transpilado, por isso está no
  `transformIgnorePatterns` do bloco `jest` no `package.json`.

### Regras gerais

Regra dos testes: nenhum caso pode depender do dia atual — `dataDeHoje()` e `new Date()` sem argumento
estão fora. Data fixa hardcoded sempre; `montarContextoDeMissoes` aceita `hoje` injetado justamente
para isso.

Nada de `.github/` ainda: teste e lint rodam na mão, não são porta de commit.

## O que NÃO existe hoje neste repo

- **`eas.json`** — sem configuração de EAS Build/Submit. Build de release ainda seria manual/local.
- **`.github/`** — sem CI configurado.
- **`metro.config.js`** — projeto roda com os defaults do Expo SDK 54. `babel.config.js` existe, mas só declara `babel-preset-expo` (o mesmo default que o Metro já aplicava) — está lá porque o `babel-jest` precisa de um arquivo explícito.
- **Variáveis de ambiente** — config do Firebase está hardcoded em `services/firebase.native.js`/`.web.js`, não em `.env`. Ver [api.md](api.md) sobre por que isso é aceitável para Firebase client keys.

Antes de configurar EAS, CI ou variáveis de ambiente, alinhar com o usuário — não são decisões triviais de reverter depois de builds publicados.

## `app.json`

- `name`: "Vape Free", `slug`: "VapeFree", `scheme`: "vapefree" (usado no redirect URI do login Google, ver [auth.md](auth.md) — não mudar sem atualizar o OAuth client).
- Identificadores nativos: `ios.bundleIdentifier` e `android.package` são `com.vapefree.app` (até 07/2026 eram `com.googleauth.ios`, herdado do exemplo de login Google).
- Versão nativa vive no `app.json`: `version` "1.0.0", `android.versionCode` 1, `ios.buildNumber` "1". A pasta `android/` é gitignored e regenerada por `expo prebuild`, então `app.json` é a única fonte versionada — subir versão significa editar esses três campos.
- `android.adaptiveIcon`: `./assets/adaptive-icon.png` sobre `#4CAF50` (mesma cor do plugin de notificação).
- Plugins: `expo-web-browser`, `expo-notifications` (ícone/cor de notificação), `expo-font`.
- Não existe campo `notification` nem `android.permissions` no `app.json`, de propósito: `notification` é legado (o plugin `expo-notifications` já cobre ícone/cor) e `POST_NOTIFICATIONS`/`RECEIVE_BOOT_COMPLETED` entram pelo manifest da própria lib, mesclados no build. Declarar de novo é redundante.

## Trocar o package quebra registro externo

Os OAuth clients de Android/iOS do Google são amarrados ao `com.vapefree.app` (ver
[auth.md](auth.md)). Trocar o package de novo obriga a recriar os dois clients e atualizar as
constantes `CLIENT_ID_*` em `screens/LoginScreen.js`. O client Android também amarra o SHA-1: o
que está registrado hoje é o do keystore de **debug**; antes de publicar, criar um segundo client
Android com o SHA-1 do keystore de release (ou o do Play App Signing).

Firebase é usado via JS SDK com config hardcoded (`services/firebase.native.js`), sem
`google-services.json` — o package não afeta Auth/Firestore.

Depois de mexer nos identificadores, rodar `npx expo prebuild --clean` para regenerar `android/`
(o `applicationId`/`namespace` do `build.gradle` vêm daí).

## Assets versionados que merecem atenção

- `debug.keystore` na raiz do repo **não** está versionado (`.gitignore` cobre `debug.keystore` e `/android`). É sobra local; o build usa `android/app/debug.keystore`, gerado pelo prebuild.
