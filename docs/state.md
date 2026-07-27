# Gerenciamento de estado

Sem Redux/Zustand/Recoil/Jotai. Dois níveis:

## Global — React Context API

- **`AuthContext`** (`context/AuthContext.js`): sessão do usuário (`usuario`, `ehConvidado`, `inicializando`, `telaDeAuth`) + `continuarSemConta`/`sair`. Detalhe em [auth.md](auth.md).
- **`ThemeContext`** (`context/ThemeContext.js`): `estaEscuro`, `alternarTema`, `cores`. Detalhe em [styling.md](styling.md).
- **`XpToastContext`** (`context/XpToastContext.js`): fila global dos toasts de XP e dos avisos de falha ao salvar (`mostrarRecompensas`, `mostrarXp`, `mostrarGanhoDeXp`, `mostrarErro`). Não guarda dado de domínio — só a fila de exibição. Fica dentro do `SafeAreaProvider`, envolvendo o `AppNavigator`. Detalhe em [components.md](components.md).

Ambos seguem o mesmo formato: `createContext` com valor default tipado por exemplo, `XProvider` com `useState`/`useEffect`, hook `useX()` que só faz `useContext`. Se precisar de um terceiro contexto global, siga esse mesmo molde — não introduza uma lib de state management nova sem alinhar com o usuário antes.

## Local — `useState` por tela

Cada tela guarda seus próprios dados carregados (`registros`, `aparelho`, `economia`, etc.) em `useState`, recarregados com `useFocusEffect(useCallback(load, [deps]))` toda vez que a tela ganha foco — não com `useEffect` simples, porque senão o dado fica desatualizado ao voltar de outra tela (ex.: usuário registra um dia em `RegisterScreen`, volta pra `HomeScreen`, precisa ver o número atualizado sem re-montar o app).

Não existe cache compartilhado entre telas: cada tela relê `utils/storage.js` de forma independente ao ganhar foco. Isso é intencional (simplicidade > performance neste tamanho de app) — não adicione um cache global sem necessidade concreta.

## Formulários

Sem lib de formulário (`react-hook-form`, `formik`). Cada campo é um `useState` isolado; validação é manual dentro do handler de submit (`Alert.alert` nos erros). Siga esse padrão para formulários novos.
