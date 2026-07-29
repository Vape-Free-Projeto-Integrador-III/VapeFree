# Deployment / Build

## Scripts (`package.json`)

- `npm start` → `expo start` (Metro, Expo Go / dev client)
- `npm run android` → `expo run:android` (build nativo local)
- `npm run ios` → `expo run:ios` (build nativo local)
- `npm run web` → `expo start --web`

Sem `npm test`, sem `npm run lint`, sem `npm run build`.

## O que NÃO existe hoje neste repo

- **`eas.json`** — sem configuração de EAS Build/Submit. Build de release ainda seria manual/local.
- **`.github/`** — sem CI configurado.
- **`babel.config.js` / `metro.config.js`** — projeto roda só com os defaults do Expo SDK 54.
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

`com.vapefree.app` é novo — o OAuth do Google no Android precisa de um client registrado com esse
package + SHA-1 do keystore. Hoje `screens/LoginScreen.js` ainda tem o placeholder
`COLOQUE_AQUI_O_ANDROID_CLIENT_ID`, ou seja, login Google no Android já não funcionava antes disso.
Firebase é usado via JS SDK com config hardcoded (`services/firebase.native.js`), sem
`google-services.json` — o package não afeta Auth/Firestore.

Depois de mexer nos identificadores, rodar `npx expo prebuild --clean` para regenerar `android/`
(o `applicationId`/`namespace` do `build.gradle` vêm daí).

## Assets versionados que merecem atenção

- `debug.keystore` na raiz do repo **não** está versionado (`.gitignore` cobre `debug.keystore` e `/android`). É sobra local; o build usa `android/app/debug.keystore`, gerado pelo prebuild.
