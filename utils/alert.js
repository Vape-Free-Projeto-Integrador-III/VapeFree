// src/utils/alert.js
import { Alert, Platform } from 'react-native';

function showAlert(title, message, buttons) {
    if (Platform.OS !== 'web') {
        Alert.alert(title, message, buttons);
        return;
    }

    const text = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length <= 1) {
        window.alert(text);
        buttons?.[0]?.onPress?.();
        return;
    }

    const cancelButton = buttons.find((b) => b.style === 'cancel');
    const confirmButton = buttons.find((b) => b !== cancelButton) || buttons[buttons.length - 1];

    if (window.confirm(text)) {
        confirmButton?.onPress?.();
    } else {
        cancelButton?.onPress?.();
    }
}

export default { alert: showAlert };
