//
// Card "Seus padrões" da tela de Histórico. Componente de apresentação puro:
// recebe os registros já carregados e só formata o resultado de
// calcularInsights (utils/insights.js).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RAIO, SOMBRA } from '../utils/theme';
import { calcularInsights } from '../utils/insights';

export default function InsightsCard({ registros, sessoesDeCrise = [], cores, aoVerCrises }) {
  const { pronto, faltam, itens } = calcularInsights(registros, sessoesDeCrise);
  // Com sessão salva mas ainda sem insight (1 crise só), o card existe só pra
  // dar acesso à lista — por isso o atalho conta como conteúdo.
  const mostrarAtalhoDeCrises = !!aoVerCrises && sessoesDeCrise.length > 0;

  if (!pronto && !mostrarAtalhoDeCrises) {
    return (
      <View style={[styles.card, styles.waitingCard, { backgroundColor: cores.card }, SOMBRA.pequena]}>
        <Ionicons name="bulb-outline" size={18} color={cores.textMuted} />
        <Text style={[styles.waitingText, { color: cores.textMuted }]}>
          Registre por mais {faltam} {faltam === 1 ? 'dia' : 'dias'} para ver seus padrões.
        </Text>
      </View>
    );
  }

  if (itens.length === 0 && !mostrarAtalhoDeCrises) return null;

  // Insights do modo crise (id com prefixo "crise_") ganham seção própria —
  // falam de outro momento (a fissura), não do padrão de uso.
  const itensDePadrao = itens.filter((item) => !item.id.startsWith('crise'));
  const itensDeCrise = itens.filter((item) => item.id.startsWith('crise'));

  const renderizarLinha = (item, indice) => (
    <View
      key={item.id}
      style={[styles.row, indice > 0 && { borderTopWidth: 1, borderTopColor: cores.borderLight }]}
    >
      <Text style={styles.rowIcon}>{item.icone}</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: cores.text }]}>{item.titulo}</Text>
        <Text style={[styles.rowDetail, { color: cores.textSecondary }]}>{item.detalhe}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: cores.card }, SOMBRA.media]}>
      {!pronto ? (
        <View style={styles.waitingRow}>
          <Ionicons name="bulb-outline" size={18} color={cores.textMuted} />
          <Text style={[styles.waitingText, { color: cores.textMuted }]}>
            Registre por mais {faltam} {faltam === 1 ? 'dia' : 'dias'} para ver seus padrões.
          </Text>
        </View>
      ) : null}

      {itensDePadrao.length > 0 ? (
        <>
          <Text style={[styles.cardTitle, { color: cores.textMuted }]}>Seus padrões</Text>
          {itensDePadrao.map(renderizarLinha)}
        </>
      ) : null}

      {itensDeCrise.length > 0 ? (
        <>
          <Text
            style={[
              styles.cardTitle,
              { color: cores.textMuted },
              itensDePadrao.length > 0 && styles.sectionSpacing,
            ]}
          >
            No modo crise
          </Text>
          {itensDeCrise.map(renderizarLinha)}
        </>
      ) : null}

      {mostrarAtalhoDeCrises ? (
        <TouchableOpacity
          style={[styles.linkRow, { borderTopColor: cores.borderLight }]}
          onPress={aoVerCrises}
        >
          <Text style={[styles.linkText, { color: cores.primaryDark }]}>
            Ver todas as crises ({sessoesDeCrise.length})
          </Text>
          <Ionicons name="chevron-forward" size={16} color={cores.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RAIO.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
  waitingCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  waitingText: { fontSize: 12, fontFamily: 'Poppins_400Regular', flex: 1 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
  },
  linkText: { fontSize: 13, fontFamily: 'Poppins_600SemiBold' },
  cardTitle: { fontSize: 12, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionSpacing: { marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  rowIcon: { fontSize: 18, fontFamily: 'Poppins_400Regular', lineHeight: 22 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
  rowDetail: { fontSize: 12, fontFamily: 'Poppins_400Regular', marginTop: 3 },
});
