# APIs externas

O app não tem backend próprio. A única integração externa é o **Firebase** (Auth + Firestore), consumido diretamente pelo client SDK (`firebase` npm package) — sem camada REST/GraphQL intermediária.

- Inicialização: `services/firebase.native.js` / `services/firebase.web.js` — ver [architecture.md](architecture.md#split-nativoweb-do-firebase).
- Auth (login, cadastro, Google): [auth.md](auth.md).
- Firestore (schema, leitura/escrita): [database.md](database.md).

Config do Firebase (`apiKey`, `projectId`, etc.) está hardcoded nos dois arquivos de `services/` — são chaves de client Firebase (não secretas por design, protegidas por regras de segurança do Firestore, não pela chave em si). As regras de segurança do Firestore não estão neste repositório.

Login Google usa `expo-auth-session` + `expo-web-browser` para o fluxo OAuth (detalhe em [auth.md](auth.md)) — não é uma API própria, é o fluxo padrão do Google/Expo.

Nenhuma outra API de terceiros (pagamento, analytics, push remoto) está integrada hoje.
