// App.js
import 'react-native-reanimated';
import React from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import { ThemeProvider, usarTema } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { XpToastProvider } from './context/XpToastContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { configurarHandlerDeNotificacoes } from './utils/notifications';
import './services/firebase';

LogBox.ignoreLogs([
    'expo-notifications: Android Push notifications (remote notifications)',
]);

configurarHandlerDeNotificacoes();

function AppContent() {
    const { estaEscuro } = usarTema();
    return (
        <SafeAreaProvider>
            <StatusBar style={estaEscuro ? 'light' : 'light'} />
            <ConnectionProvider>
                <XpToastProvider>
                    <AppNavigator />
                </XpToastProvider>
            </ConnectionProvider>
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