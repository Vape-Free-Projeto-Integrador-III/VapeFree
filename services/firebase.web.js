// services/firebase.web.js
//
// Esta versão é usada AUTOMATICAMENTE pelo Metro/Webpack sempre que o app
// roda no navegador (ex.: "npx expo start --web"), por causa do sufixo
// ".web.js". O bundle web do firebase/auth NÃO possui
// getReactNativePersistence nem depende de AsyncStorage, então aqui usamos
// getAuth(app), que já vem configurado com persistência local do
// navegador (IndexedDB/localStorage) por padrão.

// COPIADO DIRETO DO TERMINAL DO FIREBASE (config)
// Import the functions you need from the SDKs you need
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

// getAuth(app) é a forma padrão de obter o Auth na build web do Firebase.
// Nenhuma senha ou dado sensível é armazenado: o navegador guarda apenas
// o token de sessão gerenciado internamente pelo próprio Firebase.
//
// OBS: getAuth(app), por padrão, já usa browserLocalPersistence no
// navegador (mantém a sessão entre fechamentos de aba). Não chamamos
// setPersistence() aqui de forma "solta" porque ela é assíncrona e,
// rodando em paralelo durante o import do módulo, pode atrasar o
// primeiro disparo do onAuthStateChanged em alguns bundlers — causando
// loading infinito na tela.
export const auth =
    getAuth(app);

// Cloud Firestore: usado para salvar os dados do app (registros, dispositivo,
// economia, conquistas) atrelados à conta do usuário (uid), na nuvem.
export const db = getFirestore(app);

export default app;