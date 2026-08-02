import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen from '../screens/HomeScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HistoryScreen from '../screens/HistoryScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import DeviceScreen from '../screens/DeviceScreen';
import GoalScreen from '../screens/GoalScreen';
import Profile from '../screens/Profile';
import SettingsScreen from '../screens/SettingsScreen';
import AccountScreen from '../screens/AccountScreen';
import CrisisScreen from '../screens/CrisisScreen';
import CrisisHistoryScreen from '../screens/CrisisHistoryScreen';
import MissionsScreen from '../screens/MissionsScreen';
import BreathingScreen from '../screens/BreathingScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import OfflineBanner from '../components/OfflineBanner';
import { onboardingFoiConcluido } from '../utils/storage';
import { SOMBRA } from '../utils/theme';
import { usarTema } from '../context/ThemeContext';
import { usarAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeTabs() {
    const { cores } = usarTema();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                animation: 'none',
                tabBarStyle: {
                    backgroundColor: cores.tabBar,
                    borderTopWidth: 0.5,
                    borderTopColor: cores.tabBorder,
                    height: 72,
                    paddingBottom: 12,
                    paddingTop: 8,
                    ...SOMBRA.pequena,
                },
                tabBarActiveTintColor: cores.primary,
                tabBarInactiveTintColor: cores.textMuted,
                tabBarLabelStyle: { fontSize: 11, fontFamily: 'Poppins_600SemiBold' },
                tabBarIcon: ({ focused, color, size }) => {
                    const icones = {
                        Home: focused ? 'home' : 'home-outline',
                        Register: focused ? 'add-circle' : 'add-circle-outline',
                        History: focused ? 'bar-chart' : 'bar-chart-outline',
                        Achievements: focused ? 'trophy' : 'trophy-outline',
                    };
                    return <Ionicons name={icones[route.name]} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Início' }} />
            <Tab.Screen
                name="Register"
                component={RegisterScreen}
                options={{ tabBarLabel: 'Registrar' }}
            />
            <Tab.Screen
                name="History"
                component={HistoryScreen}
                options={{ tabBarLabel: 'Histórico' }}
            />
            <Tab.Screen
                name="Achievements"
                component={AchievementsScreen}
                options={{ tabBarLabel: 'Conquistas' }}
            />
        </Tab.Navigator>
    );
}

// Stack exibida quando existe um usuário autenticado.
// Repare que NÃO existe nenhuma tela de Login aqui: o usuário só sai
// dessa stack quando o Firebase emitir usuario = null (logout), o que faz
// o AppNavigator trocar automaticamente para a AuthStack abaixo.
function MainStack() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
            <Stack.Screen name="Main" component={HomeTabs} />
            <Stack.Screen name="Device" component={DeviceScreen} />
            <Stack.Screen name="Goal" component={GoalScreen} />
            <Stack.Screen name="Profile" component={Profile} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
            <Stack.Screen name="Crisis" component={CrisisScreen} />
            <Stack.Screen name="CrisisHistory" component={CrisisHistoryScreen} />
            <Stack.Screen name="Missions" component={MissionsScreen} />
            <Stack.Screen name="Breathing" component={BreathingScreen} />
            {/* Mesma tela do tutorial de boas-vindas, aqui como rota normal: é o
          "ver o tutorial de novo" das Configurações. Sem `aoConcluir`, ela
          volta pela navegação. */}
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Navigator>
    );
}

// Stack exibida quando NÃO existe usuário autenticado.
function AuthStack({ rotaInicial = 'Login' }) {
    // Login/SignUp são desenhadas com paleta clara fixa (CORES local em cada
    // tela), então o tema global vira claro enquanto essa stack existe. Isso
    // também deixa o toast e o ConfirmModal claros, que ficam fora da navegação.
    const { forcarTemaClaro } = usarTema();
    useEffect(() => {
        forcarTemaClaro(true);
        return () => forcarTemaClaro(false);
    }, [forcarTemaClaro]);

    return (
        <Stack.Navigator
            screenOptions={{ headerShown: false, animation: 'none' }}
            initialRouteName={rotaInicial}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
        </Stack.Navigator>
    );
}

function LoadingScreen() {
    const { cores } = usarTema();
    return (
        <View
            style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cores.background,
            }}
        >
            <ActivityIndicator size="large" color={cores.primary} />
        </View>
    );
}

export default function AppNavigator() {
    // "usuario" reflete o estado atual do Firebase Authentication.
    // "ehConvidado" reflete a escolha de "continuar sem conta".
    // "inicializando" é true só durante a checagem inicial (abertura do app).
    // "migrando" é true entre o signIn e o fim da importação/descarte dos dados
    // de convidado.
    const { usuario, ehConvidado, telaDeAuth, inicializando, migrando } = usarAuth();

    // "mostrarOnboarding" é null até a flag ser lida do AsyncStorage — assim o
    // tutorial não pisca na tela de quem já passou por ele.
    const [mostrarOnboarding, setMostrarOnboarding] = useState(null);

    useEffect(() => {
        let montado = true;
        onboardingFoiConcluido()
            .then((concluido) => {
                if (montado) setMostrarOnboarding(!concluido);
            })
            .catch(() => {
                if (montado) setMostrarOnboarding(false);
            });
        return () => {
            montado = false;
        };
    }, []);

    // Enquanto o Firebase ainda não respondeu se há sessão ativa (ou a flag do
    // tutorial ainda não foi lida), mostramos um loading em vez de decidir
    // prematuramente entre Onboarding, Login e Main.
    if (inicializando || mostrarOnboarding === null) {
        return <LoadingScreen />;
    }

    const estaDentro = usuario || ehConvidado;

    // O Firebase já confirmou o login, mas os dados de convidado ainda estão
    // sendo importados/descartados. Montar a MainStack agora faria a HomeScreen
    // carregar (e gravar gamificação derivada) em cima de um histórico que a
    // migração ainda está subindo. Segura tudo num loading até terminar.
    if (estaDentro && migrando) {
        return <LoadingScreen />;
    }

    // O tutorial vem DEPOIS da decisão de login: só aparece pra quem já entrou
    // (conta ou convidado). É o que permite ele terminar pedindo o aparelho —
    // aí o dado já vai pro lugar certo (conta ou AsyncStorage do convidado).
    if (estaDentro && mostrarOnboarding) {
        return (
            <View style={{ flex: 1 }}>
                <OfflineBanner />
                <OnboardingScreen aoConcluir={() => setMostrarOnboarding(false)} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            {/* Faixa de "sem internet". Fica fora do NavigationContainer pra
          aparecer igual em qualquer tela, sem mexer em cada ScreenHeader. */}
            <OfflineBanner />
            <NavigationContainer>
                {/*
        A troca entre MainStack e AuthStack acontece automaticamente
        sempre que "usuario" ou "ehConvidado" mudam (login, logout ou escolha de
        modo convidado), pois isso re-renderiza o AppNavigator com uma
        árvore de navegação diferente.
        Não usamos navigation.replace('Main') em lugar nenhum: o próprio
        Firebase (via onAuthStateChanged) e o AuthContext (modo convidado)
        é quem controla isso.
      */}
                {estaDentro ? <MainStack /> : <AuthStack rotaInicial={telaDeAuth} />}
            </NavigationContainer>
        </View>
    );
}
