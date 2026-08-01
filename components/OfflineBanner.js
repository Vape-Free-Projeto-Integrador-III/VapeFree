// components/OfflineBanner.js
// Faixa fina no topo. Dois avisos, nessa ordem de prioridade:
//   1. falhas   -> alterações que a fila desistiu de enviar (vermelho, some
//                  só quando o usuário toca e confirma que viu)
//   2. offline  -> sem internet, quantas alterações vão subir depois
// Aparece só pra usuário logado (convidado é sempre local). Estado vem de
// context/ConnectionContext.js.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usarTema } from '../context/ThemeContext';
import { usarConexao } from '../context/ConnectionContext';
import { usarAuth } from '../context/AuthContext';
import Alert from '../utils/alert';

// Altura da faixa sem contar o inset do topo. Fica exportada porque o Toast
// (components/Toast.js) precisa se deslocar pra baixo quando a faixa aparece,
// senão os dois se sobrepõem no topo da tela.
export const ALTURA_DA_FAIXA_OFFLINE = 30;

// Condição única de "tem faixa ocupando o topo da tela". Toast e ScreenHeader
// se posicionam por ela — duplicar a regra faria os três divergirem.
export function usarFaixaDeTopoVisivel() {
  const { online, falhas } = usarConexao();
  const { usuario } = usarAuth();
  return !!usuario && (!online || falhas > 0);
}

export default function OfflineBanner() {
  const { cores } = usarTema();
  const { online, pendentes, falhas, descartarFalhas } = usarConexao();
  const { usuario } = usarAuth();
  const insets = useSafeAreaInsets();

  if (!usuario || (online && falhas === 0)) return null;

  const temFalhas = falhas > 0;

  const texto = temFalhas
    ? `${falhas} ${falhas === 1 ? 'alteração não foi salva' : 'alterações não foram salvas'} na sua conta — toque pra ver`
    : pendentes > 0
      ? `Sem internet — ${pendentes} ${pendentes === 1 ? 'alteração vai' : 'alterações vão'} sincronizar depois`
      : 'Sem internet — seus dados estão salvos no aparelho';

  const aoPressionar = () => {
    Alert.alert(
      'Alterações não sincronizadas',
      `${falhas} ${falhas === 1 ? 'alteração feita neste aparelho não conseguiu' : 'alterações feitas neste aparelho não conseguiram'} subir pra sua conta e ${falhas === 1 ? 'foi descartada' : 'foram descartadas'} depois de várias tentativas. ${falhas === 1 ? 'Ela continua' : 'Elas continuam'} valendo aqui, mas pode não aparecer em outro aparelho — vale conferir seus registros.`,
      [
        { text: 'Fechar', style: 'cancel' },
        { text: 'Entendi', onPress: () => descartarFalhas() },
      ]
    );
  };

  const conteudo = (
    <>
      <Ionicons
        name={temFalhas ? 'warning-outline' : 'cloud-offline-outline'}
        size={15}
        color={temFalhas ? '#fff' : cores.textSecondary}
      />
      <Text
        style={[styles.texto, { color: temFalhas ? '#fff' : cores.textSecondary }]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </>
  );

  const estilo = [
    styles.faixa,
    {
      backgroundColor: temFalhas ? cores.danger : cores.card,
      borderBottomColor: temFalhas ? cores.danger : cores.border,
      paddingTop: insets.top,
      height: insets.top + ALTURA_DA_FAIXA_OFFLINE,
    },
  ];

  if (!temFalhas) return <View style={estilo}>{conteudo}</View>;

  return (
    <TouchableOpacity style={estilo} onPress={aoPressionar} activeOpacity={0.8}>
      {conteudo}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texto: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
