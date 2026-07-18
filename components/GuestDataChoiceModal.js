import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function GuestDataChoiceModal({
  visible,
  title,
  message,
  importLabel,
  discardLabel,
  cancelLabel = 'Cancelar',
  onImport,
  onDiscard,
  onCancel,
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="cloud-outline" size={22} color="#2F6FED" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.discardButton]}
              onPress={onDiscard}
            >
              <Text style={styles.discardText}>{discardLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.importButton]} onPress={onImport}>
              <Text style={styles.importText}>{importLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 17, 30, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#fff',
    padding: 20,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EAF1FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E2A3A',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: '#55606D',
    marginBottom: 18,
  },
  actions: {
    gap: 10,
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: '#F2F4F7',
  },
  discardButton: {
    backgroundColor: '#FFF1F2',
  },
  importButton: {
    backgroundColor: '#2F6FED',
  },
  cancelText: {
    color: '#22384B',
    fontSize: 15,
    fontWeight: '700',
  },
  discardText: {
    color: '#C62828',
    fontSize: 15,
    fontWeight: '700',
  },
  importText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});