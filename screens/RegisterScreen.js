// src/screens/RegisterScreen.js
import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Modal,
    Animated,
} from 'react-native';
import Alert from '../utils/alert';
import { Slider } from '@miblanchard/react-native-slider';
import { Ionicons } from '@expo/vector-icons';
import {
    saveRecord,
    updateRecord,
    getRecords,
    getDevice,
    recalcEconomy,
    checkAndUnlockAchievements,
    checkAndCompleteMissions,
    getCrisisSessions,
    getMissions,
    refreshXp,
    getEconomy,
    todayString,
    syncStreakShield,
} from '../utils/storage';
import { scheduleMotivationalNotifications } from '../utils/notifications';
import { scheduleStreakWarningNotification } from '../utils/notifications';
import {
    RADIUS, SHADOW,
    TRIGGERS, HELPS, MOTIVATIONAL_MESSAGES,
} from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useXpToast } from '../context/XpToastContext';
import ScreenHeader from '../components/ScreenHeader';

function formatSelectedDateLabel(dateStr) {
    if (dateStr === todayString()) return 'hoje';
    const [year, month, day] = dateStr.split('-');
    return `no dia ${day}/${month}/${year}`;
}

export default function RegisterScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const { showRewards } = useXpToast();
    const [devType, setDevType] = useState('desc');
    const [used, setUsed] = useState(null);
    const [puffs, setPuffs] = useState(0);
    const [triggers, setTriggers] = useState([]);
    const [triggerOutro, setTriggerOutro] = useState('');
    const [helps, setHelps] = useState([]);
    const [helpOutro, setHelpOutro] = useState('');
    const [intensity, setIntensity] = useState(5);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [selectedDate, setSelectedDate] = useState(todayString());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [existingRecord, setExistingRecord] = useState(null);

    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [pickerMonth, setPickerMonth] = useState(new Date().getMonth() + 1);
    const [pickerDay, setPickerDay] = useState(new Date().getDate());

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthValues = Array.from({ length: 12 }, (_, i) => i + 1);
    const daysInMonth = new Date(pickerYear, pickerMonth, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    React.useEffect(() => {
        const checkExistingRecord = async () => {
            const allRecords = await getRecords();
            const existing = allRecords.find((r) => r.date === selectedDate);
            setExistingRecord(existing || null);
        };
        checkExistingRecord();
    }, [selectedDate]);

    const fadeAnim = useRef(new Animated.Value(0)).current;

    const showSuccess = (msg) => {
        setSuccessMsg(msg);
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => resetForm());
    };

    const resetForm = () => {
        setUsed(null);
        setPuffs(0);
        setTriggers([]);
        setTriggerOutro('');
        setHelps([]);
        setHelpOutro('');
        setIntensity(5);
        setSuccessMsg('');
    };

    const toggleTrigger = (id) => {
        setTriggers((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
        );
    };

    const toggleHelp = (id) => {
        setHelps((prev) =>
            prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
        );
    };

    // Depois de gravar o registro: recalcula economia, concede conquistas e
    // missões, reagenda notificações e mostra os toasts de XP ganho.
    const grantRewards = async (usedVape) => {
        const [newRecords, device] = await Promise.all([getRecords(), getDevice()]);
        const economy = device ? await recalcEconomy(newRecords, device) : await getEconomy();
        const crisisSessions = await getCrisisSessions();

        // Registrar um dia com uso pode ser coberto pelo escudo — sincroniza
        // antes das conquistas pra elas verem o streak já protegido.
        await syncStreakShield(newRecords);

        const newMissions = await checkAndCompleteMissions(newRecords, economy, crisisSessions);
        const completedMissions = await getMissions();
        const newAchievements = await checkAndUnlockAchievements(newRecords, economy, completedMissions);
        const summary = await refreshXp(newRecords, null, completedMissions);

        await scheduleMotivationalNotifications().catch((err) =>
            console.log('Erro ao reagendar notificações motivadoras:', err)
        );
        await scheduleStreakWarningNotification().catch((err) =>
            console.log('Erro ao reagendar notificação de streak:', err)
        );

        showRewards({
            achievements: newAchievements,
            missions: newMissions,
            gained: summary.gained,
            icon: usedVape ? '📝' : '🚭',
            title: usedVape ? 'Registro feito, sem culpa' : 'Dia sem cigarro eletrônico!',
        });
    };

    const handleSave = async () => {
        if (used === null) {
            Alert.alert('Opa', `Você usou o vape ${formatSelectedDateLabel(selectedDate)}? Escolhe uma opção.`);
            return;
        }

        // Já existe registro nessa data: confirma antes de sobrescrever.
        const allRecords = await getRecords();
        const existing = allRecords.find((r) => r.date === selectedDate);
        if (existing) {
            setExistingRecord(existing);
            Alert.alert(
                'Dia já registrado',
                `Você já registrou ${formatSelectedDateLabel(selectedDate)}. Salvar de novo vai sobrescrever o registro anterior.`,
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Sobrescrever', style: 'destructive', onPress: () => performSave(existing) },
                ]
            );
            return;
        }

        performSave(null);
    };

    const performSave = async (existing) => {
        setSaving(true);
        try {
            const now = new Date();
            const triggerLabels = TRIGGERS.filter((t) => triggers.includes(t.id)).map((t) => t.label);
            if (triggers.includes('outro') && triggerOutro.trim()) {
                triggerLabels.push(triggerOutro.trim());
            }
            const helpLabels = HELPS.filter((h) => helps.includes(h.id)).map((h) => h.label);
            if (helps.includes('outro') && helpOutro.trim()) {
                helpLabels.push(helpOutro.trim());
            }

            if (existing) {
                const updatedRecord = {
                    ...existing,
                    devType,
                    used,
                    puffs: used ? puffs : 0,
                    triggers: triggerLabels,
                    helps: helpLabels,
                    intensity,
                    time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                };
                await updateRecord(updatedRecord);
                await grantRewards(used);
                setExistingRecord(updatedRecord);
            } else {
                const record = {
                    id: Date.now(),
                    date: selectedDate,
                    time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    devType,
                    used,
                    puffs: used ? puffs : 0,
                    triggers: triggerLabels,
                    helps: helpLabels,
                    intensity,
                };
                await saveRecord(record);
                await grantRewards(used);
                setExistingRecord(record);
            }

            const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
            showSuccess(msg);
        } catch (error) {
            Alert.alert('Erro', 'Não deu pra salvar o registro. Tenta de novo.');
        } finally {
            setSaving(false);
        }
    };

    const handleSelectDate = () => {
        const dateStr = `${pickerYear}-${String(pickerMonth).padStart(2, '0')}-${String(pickerDay).padStart(2, '0')}`;
        setSelectedDate(dateStr);
        setShowDatePicker(false);
    };

    const openDatePicker = () => {
        const [y, m, d] = selectedDate.split('-').map(Number);
        setPickerYear(y || new Date().getFullYear());
        setPickerMonth(m || new Date().getMonth() + 1);
        setPickerDay(d || new Date().getDate());
        setShowDatePicker(true);
    };

    const intensityColor = intensity <= 3 ? colors.primary : intensity <= 6 ? colors.warning : colors.danger;
    const selectedDateLabel = formatSelectedDateLabel(selectedDate);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
            style={[styles.scroll, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
        >
            <ScreenHeader
                title="Como foi seu dia?"
                subtitle={`Como foi ${selectedDateLabel}?`}
                colors={colors}
                showSettings
                onSettingsPress={() => navigation.navigate('Settings')}
            />

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                {/* Date Selector */}
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Data</Text>
                <TouchableOpacity
                    style={[styles.dateSelector, { borderColor: colors.border, backgroundColor: colors.card }]}
                    onPress={openDatePicker}
                >
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={[styles.dateSelectorText, { color: colors.text }]}>{selectedDate}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                </TouchableOpacity>

                <Modal
                    visible={showDatePicker}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowDatePicker(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={[styles.datePickerContainer, { backgroundColor: colors.modalBg }]}>
                            <View style={[styles.datePickerHeader, { borderBottomColor: colors.border }]}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={[styles.datePickerCancel, { color: colors.textMuted }]}>Cancelar</Text>
                                </TouchableOpacity>
                                <Text style={[styles.datePickerTitle, { color: colors.text }]}>Escolher data</Text>
                                <TouchableOpacity onPress={handleSelectDate}>
                                    <Text style={[styles.datePickerDone, { color: colors.primary }]}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.datePickerRow}>
                                {[
                                    { label: 'Dia', values: days, selected: pickerDay, onSelect: setPickerDay },
                                    { label: 'Mês', values: monthValues, selected: pickerMonth, onSelect: setPickerMonth, display: (m) => monthNames[m - 1] },
                                    { label: 'Ano', values: years, selected: pickerYear, onSelect: setPickerYear },
                                ].map(({ label, values, selected, onSelect, display }) => (
                                    <View key={label} style={styles.pickerColumn}>
                                        <Text style={[styles.pickerLabel, { color: colors.textMuted }]}>{label}</Text>
                                        <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                                            {values.map((v) => (
                                                <TouchableOpacity
                                                    key={v}
                                                    style={[styles.pickerItem, v === selected && { backgroundColor: colors.primaryLight }]}
                                                    onPress={() => onSelect(v)}
                                                >
                                                    <Text style={[styles.pickerItemText, { color: colors.text }, v === selected && { color: colors.primaryDark, fontWeight: '600' }]}>
                                                        {display ? display(v) : v}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Aviso de registro existente */}
                {existingRecord && (
                    <View style={[styles.warningBox, { backgroundColor: colors.card, borderColor: colors.warning }]}>
                        <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
                        <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                            Esse dia já tem registro ({existingRecord.used ? 'usou o vape' : 'não usou'}). Salvar vai sobrescrever.
                        </Text>
                    </View>
                )}

                {/* Device Type */}
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Qual dispositivo você usa</Text>
                <View style={styles.toggleRow}>
                    {['desc', 'rec'].map((val) => (
                        <TouchableOpacity
                            key={val}
                            style={[styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.card }, devType === val && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                            onPress={() => setDevType(val)}
                        >
                            <Text style={[styles.toggleBtnText, { color: colors.textSecondary }, devType === val && { color: '#fff' }]}>
                                {val === 'desc' ? 'Descartável' : 'Recarregável'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Used Today? */}
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Você usou o vape {selectedDateLabel}?</Text>
                <View style={styles.toggleRow}>
                    {[{ val: true, label: 'Sim' }, { val: false, label: 'Não' }].map(({ val, label }) => (
                        <TouchableOpacity
                            key={label}
                            style={[styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.card }, used === val && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                            onPress={() => setUsed(val)}
                        >
                            <Text style={[styles.toggleBtnText, { color: colors.textSecondary }, used === val && { color: '#fff' }]}>{label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* If used = true */}
                {used === true && (
                    <>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantas puxadas?</Text>
                        <View style={styles.counterRow}>
                            <TouchableOpacity
                                style={[styles.counterBtn, { borderColor: colors.primary, backgroundColor: colors.card }]}
                                onPress={() => setPuffs((p) => Math.max(0, p - 1))}
                            >
                                <Text style={[styles.counterBtnText, { color: colors.primary }]}>−</Text>
                            </TouchableOpacity>
                            <Text style={[styles.counterVal, { color: colors.text }]}>{puffs}</Text>
                            <TouchableOpacity
                                style={[styles.counterBtn, { borderColor: colors.primary, backgroundColor: colors.card }]}
                                onPress={() => setPuffs((p) => p + 1)}
                            >
                                <Text style={[styles.counterBtnText, { color: colors.primary }]}>+</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.fieldLabel, { color: colors.text }]}>O que te deu vontade?</Text>
                        <View style={styles.chips}>
                            {TRIGGERS.map((t) => (
                                <TouchableOpacity
                                    key={t.id}
                                    style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }, triggers.includes(t.id) && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                                    onPress={() => toggleTrigger(t.id)}
                                >
                                    <Text style={[styles.chipText, { color: colors.textSecondary }, triggers.includes(t.id) && { color: '#fff' }]}>
                                        {t.emoji} {t.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {triggers.includes('outro') && (
                            <TextInput
                                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                                placeholder="Conta o que rolou..."
                                placeholderTextColor={colors.textMuted}
                                value={triggerOutro}
                                onChangeText={setTriggerOutro}
                            />
                        )}
                    </>
                )}

                {/* If used = false */}
                {used === false && (
                    <>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>O que te ajudou a não usar?</Text>
                        <View style={styles.chips}>
                            {HELPS.map((h) => (
                                <TouchableOpacity
                                    key={h.id}
                                    style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }, helps.includes(h.id) && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                                    onPress={() => toggleHelp(h.id)}
                                >
                                    <Text style={[styles.chipText, { color: colors.textSecondary }, helps.includes(h.id) && { color: '#fff' }]}>
                                        {h.emoji} {h.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {helps.includes('outro') && (
                            <TextInput
                                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
                                placeholder="O que te ajudou?"
                                placeholderTextColor={colors.textMuted}
                                value={helpOutro}
                                onChangeText={setHelpOutro}
                            />
                        )}
                    </>
                )}

                {/* Intensity Slider */}
                {used !== null && (
                    <>
                        <Text style={[styles.fieldLabel, { color: colors.text }]}>Quanta vontade você sentiu?</Text>
                        <View style={styles.sliderWrap}>
                            <Text style={[styles.intensityVal, { color: intensityColor }]}>{Math.round(intensity)}</Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={0}
                                maximumValue={10}
                                step={1}
                                value={intensity}
                                onValueChange={(val) => setIntensity(val[0])}
                                minimumTrackTintColor={intensityColor}
                                maximumTrackTintColor={colors.border}
                                thumbTintColor={intensityColor}
                            />
                            <View style={styles.sliderLabels}>
                                <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>Nenhuma</Text>
                                <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>Moderada</Text>
                                <Text style={[styles.sliderLabel, { color: colors.textMuted }]}>Muito forte</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Save Button */}
                <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    <Ionicons name={saving ? 'hourglass-outline' : 'checkmark-circle-outline'} size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
                </TouchableOpacity>

                {/* Success Message */}
                {successMsg !== '' && (
                    <Animated.View style={[styles.successBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary, opacity: fadeAnim }]}>
                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                        <Text style={[styles.successText, { color: colors.primaryDark }]}>{successMsg}</Text>
                    </Animated.View>
                )}
            </View>

            <View style={{ height: 24 }} />
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: {
        borderRadius: RADIUS.lg,
        padding: 18,
        marginHorizontal: 16,
        marginTop: 16,
    },
    fieldLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10, marginTop: 6 },
    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    toggleBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: RADIUS.md,
        borderWidth: 1.5,
        alignItems: 'center',
    },
    toggleBtnText: { fontSize: 14, fontWeight: '600' },
    counterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        marginBottom: 18,
    },
    counterBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    counterBtnText: { fontSize: 24, fontWeight: '700', lineHeight: 28 },
    counterVal: { fontSize: 40, fontWeight: '800', minWidth: 60, textAlign: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: RADIUS.full,
        borderWidth: 1.5,
    },
    chipText: { fontSize: 13, fontWeight: '500' },
    input: {
        borderWidth: 1.5,
        borderRadius: RADIUS.md,
        padding: 12,
        fontSize: 14,
        marginBottom: 14,
    },
    sliderWrap: { marginBottom: 18 },
    slider: { width: '100%', height: 40 },
    intensityVal: { fontSize: 36, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabel: { fontSize: 10 },
    saveBtn: {
        borderRadius: RADIUS.md,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    successBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RADIUS.md,
        padding: 14,
        marginTop: 12,
    },
    successText: { fontSize: 14, fontWeight: '600', flex: 1 },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1.5,
        borderRadius: RADIUS.md,
        padding: 12,
        marginBottom: 16,
    },
    warningText: { fontSize: 13, fontWeight: '500', flex: 1 },
    dateSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: RADIUS.md,
        borderWidth: 1.5,
        marginBottom: 18,
    },
    dateSelectorText: { flex: 1, fontSize: 15, fontWeight: '600' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    datePickerContainer: {
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        paddingBottom: 30,
    },
    datePickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
    },
    datePickerTitle: { fontSize: 18, fontWeight: '700' },
    datePickerCancel: { fontSize: 16 },
    datePickerDone: { fontSize: 16, fontWeight: '600' },
    datePickerRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 10,
    },
    pickerColumn: { alignItems: 'center', width: 80 },
    pickerLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
    pickerScroll: { height: 150 },
    pickerItem: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.sm },
    pickerItemText: { fontSize: 16 },
});
