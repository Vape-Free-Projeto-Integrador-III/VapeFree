// src/components/InsightsCard.js
//
// Card "Seus padrões" da tela de Histórico. Componente de apresentação puro:
// recebe os registros já carregados e só formata o resultado de
// computeInsights (utils/insights.js).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SHADOW } from '../utils/theme';
import { computeInsights } from '../utils/insights';

export default function InsightsCard({ records, colors }) {
  const { ready, missing, items } = computeInsights(records);

  if (!ready) {
    return (
      <View style={[styles.card, styles.waitingCard, { backgroundColor: colors.card }, SHADOW.small]}>
        <Ionicons name="bulb-outline" size={18} color={colors.textMuted} />
        <Text style={[styles.waitingText, { color: colors.textMuted }]}>
          Registre por mais {missing} {missing === 1 ? 'dia' : 'dias'} para ver seus padrões.
        </Text>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
      <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Seus padrões</Text>
      {items.map((item, index) => (
        <View
          key={item.id}
          style={[
            styles.row,
            index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
          ]}
        >
          <Text style={styles.rowIcon}>{item.icon}</Text>
          <View style={styles.rowBody}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>{item.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
  waitingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  waitingText: { fontSize: 12, flex: 1 },
  cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  rowIcon: { fontSize: 18, lineHeight: 22 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowDetail: { fontSize: 12, marginTop: 3 },
});
