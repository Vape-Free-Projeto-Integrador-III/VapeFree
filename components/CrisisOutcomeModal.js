//
// Fecha o ciclo do modo crise: pergunta como foi depois que o usuário
// encerra a sessão. A resposta alimenta metodoDeCriseRecomendado
// (utils/insights.js), que na próxima crise sugere o método que já
// funcionou pra ele.
//
// Modal customizado (e não Alert) porque tem escolha de dados + texto livre.

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { RAIO, SOMBRA } from '../utils/theme';

// Sem julgamento no "usei" — o app não pune, só registra.
const DESFECHOS = [
  { id: 'passou', rotulo: 'Passou', emoji: '💚' },
  { id: 'diminuiu', rotulo: 'Diminuiu', emoji: '🙂' },
  { id: 'usei', rotulo: 'Acabei usando', emoji: '😔' },
];

export default function CrisisOutcomeModal({ visivel, cores, aoEnviar, aoPular }) {
  const [desfecho, setDesfecho] = useState(null);
  const [nota, setNota] = useState('');

  function finalizar(desfechoEscolhido) {
    const notaLimpa = nota.trim();
    setDesfecho(null);
    setNota('');
    aoEnviar(desfechoEscolhido, notaLimpa || null);
  }

  function pular() {
    setDesfecho(null);
    setNota('');
    aoPular();
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={pular}>
      <TouchableWithoutFeedback onPress={pular}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: cores.modalBg }, SOMBRA.media]}>
              <Text style={[styles.title, { color: cores.text }]}>E aí, como foi?</Text>
              <Text style={[styles.subtitle, { color: cores.textSecondary }]}>
                Não tem resposta errada. Isso me ajuda a te ajudar melhor na próxima.
              </Text>

              <View style={styles.chips}>
                {DESFECHOS.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[
                      styles.chip,
                      { borderColor: cores.border, backgroundColor: cores.card },
                      desfecho === d.id && { borderColor: cores.primary, backgroundColor: cores.primary },
                    ]}
                    onPress={() => setDesfecho(d.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: cores.textSecondary },
                        desfecho === d.id && { color: '#fff' },
                      ]}
                    >
                      {d.emoji} {d.rotulo}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.input,
                  { borderColor: cores.border, backgroundColor: cores.inputBg, color: cores.text },
                ]}
                placeholder="Quer contar o que sentiu? (opcional)"
                placeholderTextColor={cores.textMuted}
                value={nota}
                onChangeText={setNota}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: desfecho ? cores.primary : cores.border },
                ]}
                disabled={!desfecho}
                onPress={() => finalizar(desfecho)}
              >
                <Text style={styles.saveBtnText}>Salvar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.skipBtn} onPress={pular}>
                <Text style={[styles.skipText, { color: cores.textMuted }]}>Agora não</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: { borderRadius: RAIO.lg, padding: 20 },
  title: { fontSize: 20, fontFamily: 'Poppins_800ExtraBold' },
  subtitle: { fontSize: 13, fontFamily: 'Poppins_400Regular', marginTop: 6, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { borderWidth: 1.5, borderRadius: RAIO.full, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  input: {
    borderWidth: 1.5,
    borderRadius: RAIO.md,
    padding: 12,
    marginTop: 14,
    fontSize: 14, fontFamily: 'Poppins_400Regular',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: RAIO.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Poppins_700Bold' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
});
