// src/components/CrisisOutcomeModal.js
//
// Fecha o ciclo do modo crise: pergunta como foi depois que o usuário
// encerra a sessão. A resposta alimenta recommendedCrisisMethod
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
import { RADIUS, SHADOW } from '../utils/theme';

// Sem julgamento no "usei" — o app não pune, só registra.
const OUTCOMES = [
  { id: 'passou', label: 'Passou', emoji: '💚' },
  { id: 'diminuiu', label: 'Diminuiu', emoji: '🙂' },
  { id: 'usei', label: 'Acabei usando', emoji: '😔' },
];

export default function CrisisOutcomeModal({ visible, colors, onSubmit, onSkip }) {
  const [outcome, setOutcome] = useState(null);
  const [note, setNote] = useState('');

  function finish(chosenOutcome) {
    const trimmed = note.trim();
    setOutcome(null);
    setNote('');
    onSubmit(chosenOutcome, trimmed || null);
  }

  function skip() {
    setOutcome(null);
    setNote('');
    onSkip();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={skip}>
      <TouchableWithoutFeedback onPress={skip}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.sheet, { backgroundColor: colors.modalBg }, SHADOW.medium]}>
              <Text style={[styles.title, { color: colors.text }]}>E aí, como foi?</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Não tem resposta errada. Isso me ajuda a te ajudar melhor na próxima.
              </Text>

              <View style={styles.chips}>
                {OUTCOMES.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      outcome === o.id && { borderColor: colors.primary, backgroundColor: colors.primary },
                    ]}
                    onPress={() => setOutcome(o.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: colors.textSecondary },
                        outcome === o.id && { color: '#fff' },
                      ]}
                    >
                      {o.emoji} {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[
                  styles.input,
                  { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text },
                ]}
                placeholder="Quer contar o que sentiu? (opcional)"
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: outcome ? colors.primary : colors.border },
                ]}
                disabled={!outcome}
                onPress={() => finish(outcome)}
              >
                <Text style={styles.saveBtnText}>Salvar</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.skipBtn} onPress={skip}>
                <Text style={[styles.skipText, { color: colors.textMuted }]}>Agora não</Text>
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
  sheet: { borderRadius: RADIUS.lg, padding: 20 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { borderWidth: 1.5, borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 14,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 13, fontWeight: '600' },
});
