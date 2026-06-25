// App.js
import 'react-native-reanimated';
import React from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { configureNotificationHandler } from './utils/notifications';
import './services/firebase';

// O próprio expo-notifications imprime esse aviso automaticamente ao ser
// importado, quando roda dentro do Expo Go no Android (não é um erro do
// nosso código, e não afeta as notificações LOCAIS que usamos no app —
// só avisa que push remoto não funciona no Expo Go a partir do SDK 53).
// Silenciamos aqui só pra não assustar durante o desenvolvimento.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
]);

// Define como as notificações se comportam quando chegam com o app aberto
// (em primeiro plano). Precisa ser chamado uma única vez, fora de qualquer
// componente, assim que o app inicia.
configureNotificationHandler();

function AppContent() {
  const { isDark } = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'light'} />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}