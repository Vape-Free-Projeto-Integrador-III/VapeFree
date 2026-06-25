// services/firebase.native.js

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

export const auth =
    initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });

export const db = getFirestore(app);

export default app;