// src/utils/alert.js
// Mantém a assinatura de Alert.alert do React Native de propósito: é um
// drop-in do componente nativo, só que funcionando também na web.
import { Alert, Platform } from 'react-native';

function mostrarAlerta(titulo, mensagem, botoes) {
    if (Platform.OS !== 'web') {
        Alert.alert(titulo, mensagem, botoes);
        return;
    }

    const texto = mensagem ? `${titulo}\n\n${mensagem}` : titulo;

    if (!botoes || botoes.length <= 1) {
        window.alert(texto);
        botoes?.[0]?.onPress?.();
        return;
    }

    const botaoCancelar = botoes.find((b) => b.style === 'cancel');
    const botaoConfirmar = botoes.find((b) => b !== botaoCancelar) || botoes[botoes.length - 1];

    if (window.confirm(texto)) {
        botaoConfirmar?.onPress?.();
    } else {
        botaoCancelar?.onPress?.();
    }
}

export default { alert: mostrarAlerta };
