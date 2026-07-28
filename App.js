// App.js
import 'react-native-reanimated';
import React from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold } from '@expo-google-fonts/poppins';
import AppNavigator from './navigation/AppNavigator';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { configurarHandlerDeNotificacoes } from './utils/notifications';
import './services/firebase';

LogBox.ignoreLogs([
    'expo-notifications: Android Push notifications (remote notifications)',
]);

configurarHandlerDeNotificacoes();

function AppContent() {
    return (
        <SafeAreaProvider>
            {/* header é sempre verde (cores.primary) nos dois temas, então ícones claros sempre */}
            <StatusBar style="light" />
            <ConnectionProvider>
                <ToastProvider>
                    <AppNavigator />
                </ToastProvider>
            </ConnectionProvider>
        </SafeAreaProvider>
    );
}

export default function App() {
    const [fontesCarregadas] = useFonts({
        Poppins_400Regular,
        Poppins_500Medium,
        Poppins_600SemiBold,
        Poppins_700Bold,
        Poppins_800ExtraBold,
    });

    if (!fontesCarregadas) {
        return null;
    }

    return (
        <AuthProvider>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </AuthProvider>
    );
}