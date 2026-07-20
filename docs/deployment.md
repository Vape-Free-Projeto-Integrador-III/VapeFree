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

- `name`: "Vape Free", `slug`: "Projeto Integrador III", `scheme`: "vapefree" (usado no redirect URI do login Google, ver [auth.md](auth.md)).
- `ios.bundleIdentifier`: `com.googleauth.ios`.
- Sem `android.package` definido — necessário antes de gerar build Android de produção.
- Plugins: `expo-web-browser`, `expo-notifications` (ícone/cor de notificação).

## Assets versionados que merecem atenção

- `debug.keystore` está commitado na raiz do repo — chave de assinatura debug do Android. Baixo risco (é só debug, não release), mas vale saber que está versionado antes de decidir gerar uma nova.
