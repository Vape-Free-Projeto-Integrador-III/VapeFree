// services/firebase.native.js
//
// Esta versão é usada AUTOMATICAMENTE pelo Metro (bundler do Expo) sempre
// que o app roda em iOS ou Android, por causa do sufixo ".native.js".
// Não é necessário importar este arquivo com esse nome em nenhum lugar:
// basta importar '../services/firebase' normalmente que o Metro escolhe
// este arquivo nas plataformas nativas e o firebase.web.js na web.

// COPIADO DIRETO DO TERMINAL DO FIREBASE (config)
// Import the functions you need from the SDKs you need
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {

    apiKey:
        'AIzaSyCI-3KUHcszmd8NnBCUGKH64gdtQAMc3iQ',

    authDomain:
        'vapefree-pi.firebaseapp.com',

    projectId:
        'vapefree-pi',

    storageBucket:
        'vapefree-pi.firebasestorage.app',

    messagingSenderId:
        '445859118404',

    appId:
        '1:445859118404:web:7e9be5456eb117a3732b11'

};

const app =
    initializeApp(firebaseConfig);

// IMPORTANTE: usamos initializeAuth + getReactNativePersistence (AsyncStorage)
// em vez de getAuth(app) puro. Isso NÃO salva senha nem dados sensíveis:
// o AsyncStorage aqui é usado internamente pelo próprio SDK do Firebase
// apenas para persistir o token de sessão (gerenciamento nativo do
// Firebase Authentication), permitindo que o usuário continue logado
// mesmo após fechar e reabrir o aplicativo.
export const auth =
    initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });

// Cloud Firestore: usado para salvar os dados do app (registros, dispositivo,
// economia, conquistas) atrelados à conta do usuário (uid), na nuvem.
export const db = getFirestore(app);

export default app;