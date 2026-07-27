// src/utils/alert.js
// Mantém a assinatura de Alert.alert do React Native de propósito: é um
// drop-in do componente nativo, só que renderizando o UI do próprio app.
//
//   1 botão (ou nenhum) -> toast no topo (components/XpToast.js)
//   2+ botões           -> modal de confirmação (components/ConfirmModal.js)
//
// Quem desenha é o XpToastProvider, que se registra aqui via
// registrarManipuladorDeAlerta. Enquanto ninguém tiver registrado (alerta
// disparado antes do provider montar), cai no alerta do sistema.
import { Alert, Platform } from 'react-native';

let manipulador = null;

export function registrarManipuladorDeAlerta(novo) {
    manipulador = novo;
}

// Heurística por título: é o único jeito de escolher a cor do toast sem mudar
// a assinatura do Alert.alert. Títulos novos caem em 'aviso' (laranja).
function varianteDoTitulo(titulo = '') {
    if (titulo.startsWith('Erro')) return 'erro';
    if (titulo.startsWith('Pront')) return 'sucesso'; // 'Pronto', 'Prontinho'
    return 'aviso';
}

function mostrarAlertaDoSistema(titulo, mensagem, botoes) {
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

function mostrarAlerta(titulo, mensagem, botoes) {
    if (!manipulador) {
        mostrarAlertaDoSistema(titulo, mensagem, botoes);
        return;
    }

    if (botoes && botoes.length >= 2) {
        manipulador.confirmar({ titulo, mensagem, botoes });
        return;
    }

    manipulador.mostrarAviso(titulo, mensagem, varianteDoTitulo(titulo));
    // O toast não tem botão: o onPress do único botão (quando existe) roda
    // junto, porque nele o "OK" nunca é uma escolha, só um "e aí segue".
    botoes?.[0]?.onPress?.();
}

export default { alert: mostrarAlerta };
