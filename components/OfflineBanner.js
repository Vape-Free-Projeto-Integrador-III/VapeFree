// components/OfflineBanner.js
// Faixa fina no topo avisando que o app está sem internet e quantas
// alterações ainda vão subir. Aparece só pra usuário logado (convidado é
// sempre local). Estado vem de context/ConnectionContext.js.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usarTema } from '../context/ThemeContext';
import { usarConexao } from '../context/ConnectionContext';
import { usarAuth } from '../context/AuthContext';

export default function OfflineBanner() {
  const { cores } = usarTema();
  const { online, pendentes } = usarConexao();
  const { usuario } = usarAuth();
  const insets = useSafeAreaInsets();

  if (online || !usuario) return null;

  const texto =
    pendentes > 0
      ? `Sem internet — ${pendentes} ${pendentes === 1 ? 'alteração vai' : 'alterações vão'} sincronizar depois`
      : 'Sem internet — seus dados estão salvos no aparelho';

  return (
    <View
      style={[
        styles.faixa,
        { backgroundColor: cores.card, borderBottomColor: cores.border, paddingTop: insets.top + 6 },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={15} color={cores.textSecondary} />
      <Text style={[styles.texto, { color: cores.textSecondary }]} numberOfLines={1}>
        {texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texto: { fontSize: 12, fontFamily: 'Poppins_600SemiBold' },
});
