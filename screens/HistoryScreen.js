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
import ScreenHeader from '../components/ScreenHeader';
import AnimatedScreenContent from '../components/AnimatedScreenContent';
import { computeTabTransition } from '../utils/tabTransition';
import { useFocusEffect } from '@react-navigation/native';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '@miblanchard/react-native-slider';
import {
    getRecords,
    updateRecord,
    deleteRecord,
    getDevice,
    recalcEconomy,
    getEconomy,
} from '../utils/storage';
import { RADIUS, SHADOW, TRIGGERS, HELPS } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;

const FILTERS = [
    { id: 'day', label: 'Dia', days: 7 },
    { id: 'week', label: 'Semana', days: 28 },
    { id: 'month', label: 'Mês', days: 90 },
];

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function parseLocalDate(dateStr) {
    return new Date(`${dateStr}T12:00:00`);
}

function formatDayLabel(dateStr) {
    const date = parseLocalDate(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function startOfWeekKey(dateStr) {
    const date = parseLocalDate(dateStr);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfMonthKey(dateStr) {
    const date = parseLocalDate(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatWeekLabel(dateStr) {
    const date = parseLocalDate(dateStr);
    return `Sem ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthKeyLabel(monthKey) {
    const [year, month] = monthKey.split('-');
    return `${MONTHS[Number(month) - 1]} ${year}`;
}

function compareDateKeys(a, b) {
    return a.localeCompare(b);
}

function groupRecordsBy(records, getKey) {
    return records.reduce((groups, record) => {
        const key = getKey(record.date);
        if (!groups[key]) groups[key] = 0;
        groups[key] += record.puffs || 0;
        return groups;
    }, {});
}

export default function HistoryScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const { user } = useAuth();
    const [records, setRecords] = useState([]);
    const [filter, setFilter] = useState('day');
    const [editingRecord, setEditingRecord] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [transition, setTransition] = useState({ type: 'fade', direction: 'right' });

    const uid = user?.uid ?? null;

    const load = async (activeUid = uid) => {
        const r = await getRecords(activeUid);
        setRecords(r);
    };

    useFocusEffect(useCallback(() => { load(uid); }, [uid]));
    useFocusEffect(useCallback(() => { setTransition(computeTabTransition('History')); }, []));

    const getGroupedData = () => {
        if (filter === 'day') {
            const groupedDays = groupRecordsBy(records, (dateStr) => dateStr);
            const chartDates = Object.keys(groupedDays).sort(compareDateKeys).slice(-7);
            return {
                labels: chartDates.map(formatDayLabel),
                data: chartDates.map((dateKey) => groupedDays[dateKey]),
            };
        }
        if (filter === 'week') {
            const weekGroups = groupRecordsBy(records, startOfWeekKey);
            const sortedWeeks = Object.keys(weekGroups).sort(compareDateKeys).slice(-8);
            return {
                labels: sortedWeeks.map(formatWeekLabel),
                data: sortedWeeks.map((weekKey) => weekGroups[weekKey]),
            };
        }
        if (filter === 'month') {
            const monthGroups = groupRecordsBy(records, startOfMonthKey);
            const sortedMonths = Object.keys(monthGroups).sort(compareDateKeys).slice(-12);
            return { labels: sortedMonths.map(formatMonthKeyLabel), data: sortedMonths.map((m) => monthGroups[m]) };
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
        const [allRecs, device, economy] = await Promise.all([getRecords(uid), getDevice(uid), getEconomy(uid)]);
        await recalcEconomy(allRecs, device);
        setRecords(allRecs);
        setEditingRecord(null);
    };

    const handleDelete = async () => {
        if (!deleteConfirmId) return;
        try {
            await deleteRecord(deleteConfirmId);
            const [allRecs, device] = await Promise.all([getRecords(uid), getDevice(uid)]);
            await recalcEconomy(allRecs, device);
            setRecords(allRecs);
        } catch (e) { }
        setDeleteConfirmId(null);
    };

    return (
        <AnimatedScreenContent type={transition.type} direction={transition.direction} backgroundColor={colors.background}>
        <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                title="Histórico"
                subtitle="Sua evolução ao longo do tempo"
                colors={colors}
                isDark={isDark}
                toggleTheme={toggleTheme}
                onProfilePress={() => navigation.navigate('Profile')}
            />

            <View style={styles.filtersRow}>
                {FILTERS.map((f) => (
                    <TouchableOpacity
                        key={f.id}
                        style={[
                            styles.filterBtn,
                            { borderColor: colors.border, backgroundColor: colors.card },
                            filter === f.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                        ]}
                        onPress={() => setFilter(f.id)}
                    >
                        <Text style={[styles.filterBtnText, { color: colors.textSecondary }, filter === f.id && { color: colors.primaryDark }]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Seu gráfico</Text>
                        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                            {filter === 'day' ? 'Mostra os últimos 7 dias com registro' : filter === 'week' ? 'Mostra as últimas 8 semanas com registro' : 'Mostra os últimos 12 meses com registro'}
                        </Text>
                    </View>
                </View>

                {chartData.length > 0 ? (
                    <BarChart
                        data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
                        width={CHART_WIDTH}
                        height={180}
                        fromZero
                        showValuesOnTopOfBars
                        segments={Math.max(1, Math.min(4, Math.max(...chartData)))}
                        chartConfig={{
                            backgroundColor: colors.card,
                            backgroundGradientFrom: colors.card,
                            backgroundGradientTo: colors.card,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                            labelColor: () => colors.textSecondary,
                            propsForBackgroundLines: { stroke: colors.borderLight },
                            barPercentage: 0.65,
                            fillShadowGradient: colors.primary,
                            fillShadowGradientOpacity: 1,
                            formatYLabel: (v) => `${Math.round(Number(v))}`,
                        }}
                        style={styles.chart}
                    />
                ) : (
                    <View style={styles.emptyChartWrap}>
                        <Ionicons name="bar-chart-outline" size={28} color={colors.border} />
                        <Text style={[styles.emptyChart, { color: colors.textMuted }]}>Nada registrado nesse período ainda.</Text>
                    </View>
                )}
                {!records.length ? (
                    <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Que tal registrar agora? 😊</Text>
                ) : null}
            </View>

            {records.length > 0 ? (
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
                                    {intensityIcon(rec.intensity)} Vontade: {rec.intensity}/10
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
            ) : null}

            <View style={{ height: 24 }} />

            {/* Delete Confirm Modal */}
            <Modal visible={deleteConfirmId !== null} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
                <TouchableWithoutFeedback onPress={() => setDeleteConfirmId(null)}>
                    <View style={styles.confirmOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.confirmModal, { backgroundColor: colors.card }]}>
                                <Text style={[styles.confirmTitle, { color: colors.text }]}>Apagar registro?</Text>
                                <Text style={[styles.confirmText, { color: colors.textSecondary }]}>Isso não pode ser desfeito.</Text>
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
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Editar registro</Text>
                            <TouchableOpacity onPress={() => setEditingRecord(null)}>
                                <Ionicons name="close" size={24} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {editingRecord && (
                            <ScrollView style={styles.modalBody}>
                                <Text style={[styles.fieldLabel, { color: colors.text }]}>Você usou o vape?</Text>
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
                                        <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantas puxadas?</Text>
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

                                <Text style={[styles.fieldLabel, { color: colors.text }]}>Vontade: {editingRecord.intensity}/10</Text>
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
                                        <Text style={[styles.fieldLabel, { color: colors.text }]}>O que te deu vontade?</Text>
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
                                    <Text style={styles.saveBtnText}>Salvar</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </ScrollView>
        </AnimatedScreenContent>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    filtersRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 },
    filterBtn: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center' },
    filterBtnText: { fontSize: 12, fontWeight: '600' },
    card: { borderRadius: RADIUS.lg, padding: 16, marginHorizontal: 16, marginTop: 14 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 },
    cardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
    cardSubtitle: { fontSize: 12, marginTop: 4 },
    chart: { borderRadius: RADIUS.md },
    emptyChartWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
    emptyChart: { fontSize: 13, textAlign: 'center', paddingTop: 10 },
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
