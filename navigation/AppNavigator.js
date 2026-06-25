// src/navigation/AppNavigator.js
import React from 'react';
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
import { SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0.5,
          borderTopColor: colors.tabBorder,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
          ...SHADOW.small,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home: focused ? 'home' : 'home-outline',
            Register: focused ? 'add-circle' : 'add-circle-outline',
            History: focused ? 'bar-chart' : 'bar-chart-outline',
            Achievements: focused ? 'trophy' : 'trophy-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Início' }} />
      <Tab.Screen name="Register" component={RegisterScreen} options={{ tabBarLabel: 'Registrar' }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ tabBarLabel: 'Histórico' }} />
      <Tab.Screen name="Achievements" component={AchievementsScreen} options={{ tabBarLabel: 'Conquistas' }} />
    </Tab.Navigator>
  );
}

// Stack exibida quando existe um usuário autenticado.
// Repare que NÃO existe nenhuma tela de Login aqui: o usuário só sai
// dessa stack quando o Firebase emitir user = null (logout), o que faz
// o AppNavigator trocar automaticamente para a AuthStack abaixo.
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={HomeTabs} />
      <Stack.Screen name="Device" component={DeviceScreen} />
    </Stack.Navigator>
  );
}

// Stack exibida quando NÃO existe usuário autenticado.
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function LoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export default function AppNavigator() {
  // "user" reflete o estado atual do Firebase Authentication.
  // "isGuest" reflete a escolha de "continuar sem conta".
  // "initializing" é true só durante a checagem inicial (abertura do app).
  const { user, isGuest, initializing } = useAuth();

  // Enquanto o Firebase ainda não respondeu se há sessão ativa, mostramos
  // um loading em vez de decidir prematuramente entre Login e Main.
  if (initializing) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      {/*
        A troca entre MainStack e AuthStack acontece automaticamente
        sempre que "user" ou "isGuest" mudam (login, logout ou escolha de
        modo convidado), pois isso re-renderiza o AppNavigator com uma
        árvore de navegação diferente.
        Não usamos navigation.replace('Main') em lugar nenhum: o próprio
        Firebase (via onAuthStateChanged) e o AuthContext (modo convidado)
        é quem controla isso.
      */}
      {user || isGuest ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}