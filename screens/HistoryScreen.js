// src/screens/HistoryScreen.js
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import {Slider} from '@miblanchard/react-native-slider';
import {
  getRecords,
  updateRecord,
  deleteRecord,
  getDevice,
  recalcEconomy,
  getEconomy,
  getLastNDays,
  getLastNWeeks,
  getLastNMonths,
  getWeekLabel,
  getMonthLabel,
} from '../utils/storage';
import { RADIUS, SHADOW, TRIGGERS, HELPS } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;

const FILTERS = [
  { id: 'day', label: 'Por Dia', days: 7 },
  { id: 'week', label: 'Por Semana', days: 28 },
  { id: 'month', label: 'Por Mês', days: 90 },
];

export default function HistoryScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const [records, setRecords] = useState([]);
  const [filter, setFilter] = useState('day');
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const load = async () => {
    const r = await getRecords();
    setRecords(r);
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const getDatesForFilter = (filterId) => {
    const f = FILTERS.find((f) => f.id === filterId);
    if (filterId === 'day') return getLastNDays(f.days);
    if (filterId === 'week') return getLastNWeeks(Math.ceil(f.days / 7));
    if (filterId === 'month') return getLastNMonths(Math.ceil(f.days / 30));
    return getLastNDays(7);
  };

  const dates = getDatesForFilter(filter);

  const getGroupedData = () => {
    if (filter === 'day') {
      const chartDates = dates.slice(-10);
      return {
        labels: chartDates.map((d) => d.slice(5)),
        data: chartDates.map((d) => records.filter((r) => r.date === d).reduce((a, r) => a + (r.puffs || 0), 0)),
      };
    }
    if (filter === 'week') {
      const weekGroups = {};
      records.forEach((r) => {
        const d = new Date(r.date + 'T00:00:00');
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const weekKey = monday.toISOString().slice(0, 10);
        if (!weekGroups[weekKey]) weekGroups[weekKey] = 0;
        weekGroups[weekKey] += r.puffs || 0;
      });
      const sortedWeeks = Object.keys(weekGroups).sort().slice(-10);
      return { labels: sortedWeeks.map(getWeekLabel), data: sortedWeeks.map((w) => weekGroups[w]) };
    }
    if (filter === 'month') {
      const monthGroups = {};
      records.forEach((r) => {
        const d = new Date(r.date + 'T00:00:00');
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthGroups[monthKey]) monthGroups[monthKey] = 0;
        monthGroups[monthKey] += r.puffs || 0;
      });
      const sortedMonths = Object.keys(monthGroups).sort().slice(-10);
      return { labels: sortedMonths.map(getMonthLabel), data: sortedMonths.map((m) => monthGroups[m]) };
    }
    return { labels: [], data: [] };
  };

  const { labels: chartLabels, data: chartData } = getGroupedData();
  const allRecords = [...records].sort((a, b) => b.id - a.id);

  const devLabel = (t) => (t === 'desc' ? 'Descartável' : 'Recarregável');
  const intensityIcon = (n) => { if (n <= 3) return '🟢'; if (n <= 6) return '🟡'; return '🔴'; };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    await updateRecord(editingRecord);
    const [allRecs, device, economy] = await Promise.all([getRecords(), getDevice(), getEconomy()]);
    await recalcEconomy(allRecs, device);
    setRecords(allRecs);
    setEditingRecord(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteRecord(deleteConfirmId);
      const [allRecs, device] = await Promise.all([getRecords(), getDevice()]);
      await recalcEconomy(allRecs, device);
      setRecords(allRecs);
    } catch (e) {}
    setDeleteConfirmId(null);
  };

  return (
    <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View>
          <Text style={styles.headerTitle}>Histórico</Text>
          <Text style={styles.headerSub}>Seu progresso ao longo do tempo</Text>
        </View>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn}>
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterBtn, { borderColor: colors.border, backgroundColor: colors.card }, filter === f.id && { borderColor: colors.primary, backgroundColor: colors.primary }]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterBtnText, { color: colors.textSecondary }, filter === f.id && { color: '#fff' }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart Card */}
      <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
        <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Puxadas por período</Text>
        {chartData.length > 0 && chartData.some((v) => v > 0) ? (
          <BarChart
            data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
            width={CHART_WIDTH}
            height={160}
            fromZero
            showValuesOnTopOfBars
            chartConfig={{
              backgroundColor: colors.card,
              backgroundGradientFrom: colors.card,
              backgroundGradientTo: colors.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
              labelColor: () => colors.textSecondary,
              propsForBackgroundLines: { stroke: colors.borderLight },
              barPercentage: 0.65,
            }}
            style={styles.chart}
          />
        ) : (
          <Text style={[styles.emptyChart, { color: colors.textMuted }]}>Nenhum dado para mostrar.</Text>
        )}
      </View>

      {/* Records List */}
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: colors.text }]}>Todos os Registros</Text>
        <Text style={[styles.listCount, { color: colors.textMuted }]}>{allRecords.length} registro(s)</Text>
      </View>

      {allRecords.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Nenhum registro ainda.</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Que tal registrar agora? 😊</Text>
        </View>
      ) : (
        allRecords.map((rec) => (
          <View key={rec.id} style={[styles.histItem, { backgroundColor: colors.card }, SHADOW.small]}>
            <View style={styles.histTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.histDate, { color: colors.text }]}>{rec.date}</Text>
                <Text style={[styles.histDev, { color: colors.textMuted }]}>{devLabel(rec.devType)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {rec.used ? (
                  <Text style={[styles.histPuffs, { color: colors.text }]}>{rec.puffs} puxadas</Text>
                ) : (
                  <Text style={[styles.histNone, { color: colors.primary }]}>Não usou ✓</Text>
                )}
                <Text style={[styles.histIntensity, { color: colors.textMuted }]}>
                  {intensityIcon(rec.intensity)} Intensidade: {rec.intensity}/10
                </Text>
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditingRecord({ ...rec })}>
                  <Ionicons name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteConfirmId(rec.id)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
            {(rec.triggers?.length > 0 || rec.helps?.length > 0) && (
              <View style={styles.histTags}>
                {[...(rec.triggers || []), ...(rec.helps || [])].map((tag, i) => (
                  <View key={i} style={[styles.histTag, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.histTagText, { color: colors.primaryDark }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))
      )}

      <View style={{ height: 24 }} />

      {/* Delete Confirm Modal */}
      <Modal visible={deleteConfirmId !== null} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <TouchableWithoutFeedback onPress={() => setDeleteConfirmId(null)}>
          <View style={styles.confirmOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.confirmModal, { backgroundColor: colors.card }]}>
                <Text style={[styles.confirmTitle, { color: colors.text }]}>Confirmar exclusão</Text>
                <Text style={[styles.confirmText, { color: colors.textSecondary }]}>Deseja apagar este registro?</Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity style={[styles.confirmCancelBtn, { backgroundColor: colors.borderLight }]} onPress={() => setDeleteConfirmId(null)}>
                    <Text style={[styles.confirmCancelText, { color: colors.textSecondary }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.confirmDeleteBtn, { backgroundColor: colors.danger }]} onPress={handleDelete}>
                    <Text style={styles.confirmDeleteText}>Apagar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={editingRecord !== null} transparent animationType="slide" onRequestClose={() => setEditingRecord(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Editar Registro</Text>
              <TouchableOpacity onPress={() => setEditingRecord(null)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {editingRecord && (
              <ScrollView style={styles.modalBody}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Usou cigarro eletrônico?</Text>
                <View style={styles.toggleRow}>
                  {[{ val: true, label: 'Sim' }, { val: false, label: 'Não' }].map(({ val, label }) => (
                    <TouchableOpacity
                      key={label}
                      style={[styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.card }, editingRecord.used === val && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                      onPress={() => setEditingRecord({ ...editingRecord, used: val })}
                    >
                      <Text style={[styles.toggleBtnText, { color: colors.textSecondary }, editingRecord.used === val && { color: '#fff' }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editingRecord.used && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantidade de puxadas</Text>
                    <View style={styles.counterRow}>
                      <TouchableOpacity
                        style={[styles.counterBtn, { borderColor: colors.primary, backgroundColor: colors.card }]}
                        onPress={() => setEditingRecord({ ...editingRecord, puffs: Math.max(0, editingRecord.puffs - 1) })}
                      >
                        <Text style={[styles.counterBtnText, { color: colors.primary }]}>−</Text>
                      </TouchableOpacity>
                      <Text style={[styles.counterVal, { color: colors.text }]}>{editingRecord.puffs}</Text>
                      <TouchableOpacity
                        style={[styles.counterBtn, { borderColor: colors.primary, backgroundColor: colors.card }]}
                        onPress={() => setEditingRecord({ ...editingRecord, puffs: editingRecord.puffs + 1 })}
                      >
                        <Text style={[styles.counterBtnText, { color: colors.primary }]}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <Text style={[styles.fieldLabel, { color: colors.text }]}>Intensidade: {editingRecord.intensity}/10</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={10}
                  step={1}
                  value={editingRecord.intensity}
                  onValueChange={(val) => setEditingRecord({ ...editingRecord, intensity: val })}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />

                {editingRecord.used && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>Gatilhos</Text>
                    <View style={styles.chips}>
                      {TRIGGERS.filter((t) => t.id !== 'outro').map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }, (editingRecord.triggers || []).includes(t.label) && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                          onPress={() => {
                            const current = editingRecord.triggers || [];
                            setEditingRecord({ ...editingRecord, triggers: current.includes(t.label) ? current.filter((tr) => tr !== t.label) : [...current, t.label] });
                          }}
                        >
                          <Text style={[styles.chipText, { color: colors.textSecondary }, (editingRecord.triggers || []).includes(t.label) && { color: '#fff' }]}>
                            {t.emoji} {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {!editingRecord.used && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>O que te ajudou a não usar?</Text>
                    <View style={styles.chips}>
                      {HELPS.filter((h) => h.id !== 'outro').map((h) => (
                        <TouchableOpacity
                          key={h.id}
                          style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }, (editingRecord.helps || []).includes(h.label) && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                          onPress={() => {
                            const current = editingRecord.helps || [];
                            setEditingRecord({ ...editingRecord, helps: current.includes(h.label) ? current.filter((hp) => hp !== h.label) : [...current, h.label] });
                          }}
                        >
                          <Text style={[styles.chipText, { color: colors.textSecondary }, (editingRecord.helps || []).includes(h.label) && { color: '#fff' }]}>
                            {h.emoji} {h.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Salvar Alterações</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingBottom: 24 },
  header: {
    padding: 24,
    paddingTop: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center' },
  filterBtnText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: RADIUS.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
  cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  chart: { borderRadius: RADIUS.md },
  emptyChart: { fontSize: 13, textAlign: 'center', padding: 20 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 20 },
  listTitle: { fontSize: 16, fontWeight: '700' },
  listCount: { fontSize: 12 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptySubtitle: { fontSize: 13, marginTop: 4 },
  histItem: { borderRadius: RADIUS.md, padding: 14, marginHorizontal: 16, marginTop: 10 },
  histTop: { flexDirection: 'row', alignItems: 'flex-start' },
  histDate: { fontSize: 13, fontWeight: '700' },
  histDev: { fontSize: 11, marginTop: 2 },
  histPuffs: { fontSize: 14, fontWeight: '800' },
  histNone: { fontSize: 14, fontWeight: '800' },
  histIntensity: { fontSize: 11, marginTop: 2 },
  actionButtons: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  editBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  histTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  histTag: { borderRadius: RADIUS.full, paddingVertical: 3, paddingHorizontal: 10 },
  histTagText: { fontSize: 11, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 6 },
  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center' },
  toggleBtnText: { fontSize: 14, fontWeight: '600' },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 18 },
  counterBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { fontSize: 24, fontWeight: '700' },
  counterVal: { fontSize: 40, fontWeight: '800', minWidth: 60, textAlign: 'center' },
  slider: { width: '100%', height: 40, marginBottom: 16 },
  saveBtn: { borderRadius: RADIUS.md, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: RADIUS.full, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '500' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  confirmModal: { borderRadius: RADIUS.lg, padding: 20, width: '80%', maxWidth: 300 },
  confirmTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  confirmText: { fontSize: 14, marginBottom: 20, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 12 },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RADIUS.md },
  confirmCancelText: { fontSize: 14, fontWeight: '600' },
  confirmDeleteBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RADIUS.md },
  confirmDeleteText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
