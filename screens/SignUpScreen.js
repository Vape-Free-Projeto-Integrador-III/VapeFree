import React, { useState } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Text,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

/*COPIADO DIRETO DO ARQUIVO LOGINSCREEN.JS*/
const COLORS = {
    background: '#FFFFFF',
    iconCircleBg: '#98FE98',
    iconCheck: '#4A9BB6',
    darkNavy: '#22384B',
    titleText: '#22384B',
    subtitleText: '#6F747B',
    labelText: '#22384B',
    inputBg: '#F7F8FA',
    inputBorder: '#E1E1E1',
    placeholderText: '#989FA6',
    inputIconColor: '#646B73',
    inputText: '#22384B',
    checkboxBorder: '#757575',
    checkboxCheckedBg: '#4990E2',
    rememberText: '#22384B',
    linkBlue: '#6684A7',
    buttonBg: '#4990E2',
    buttonText: '#FFFFFF',
    dividerLine: '#E1E1E1',
    dividerText: '#6F7378',
    googleBorder: '#E0E0E0',
    googleText: '#22384B',
    footerText: '#6F747B',
};
/**/

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

        <View style={styles.content}>
            <View style={styles.iconCircle}>
                <Ionicons name="checkmark-circle-outline" size={32} color={COLORS.iconCheck} />
            </View>

            <Text style={styles.title}>Respire Livre</Text>

            <View>{/*Inicio view Nome*/}
                <Text>Nome Completo</Text>
                <TextInput
                    placeholder="Seu nome"
                />
            </View>{/*Fim view Nome*/}

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
        </View >
    );
}

const styles = StyleSheet.create({
    iconCircle: {
        marginTop: 40,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.iconCircleBg,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        marginBottom: 18,
    },

    content: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        paddingHorizontal: 28,
    },

    title: {
        fontSize: 27,
        fontWeight: 'bold',
        textAlign: 'center'
    },

});
