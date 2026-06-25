import React, { useState } from 'react';
import {
    View,
    TextInput,
    TouchableOpacity,
    Text,
    Alert
} from 'react-native';

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function SignUpScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');

    async function cadastrar() {
        try {
            await createUserWithEmailAndPassword(
                auth,
                email,
                senha
            );

            Alert.alert('Sucesso', 'Conta criada com sucesso!');

            navigation.goBack();
        } catch (error) {
            Alert.alert('Erro', error.message);
        }
    }

    return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
            <TextInput
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
            />

            <TextInput
                placeholder="Senha"
                secureTextEntry
                value={senha}
                onChangeText={setSenha}
            />

            <TouchableOpacity onPress={cadastrar}>
                <Text>Cadastrar</Text>
            </TouchableOpacity>
        </View>
    );
}