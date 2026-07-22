// src/screens/DeviceScreen.js
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Animated,
} from 'react-native';
import Alert from '../utils/alert';
import { Ionicons } from '@expo/vector-icons';
import { getDevice, saveDevice, getRecords, recalcEconomy } from '../utils/storage';
import { RADIUS, SHADOW } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

export default function DeviceScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const [name, setName] = useState('');
    const [type, setType] = useState('desc');
    const [price, setPrice] = useState('');
    const [totalPuffs, setTotalPuffs] = useState('');
    const [days, setDays] = useState('');
    const [saving, setSaving] = useState(false);
    const [successVisible, setSuccessVisible] = useState(false);
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        getDevice().then((d) => {
            if (d) {
                setName(d.name || '');
                setType(d.type || 'desc');
                setPrice(d.price?.toString() || '');
                setTotalPuffs(d.totalPuffs?.toString() || '');
                setDays(d.days?.toString() || '');
            }
        });
    }, []);

    const showSuccess = () => {
        setSuccessVisible(true);
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.delay(2000),
            Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setSuccessVisible(false));
    };

    const handleSave = async () => {
        if (!name.trim()) { Alert.alert('Opa', 'Coloca o nome do seu dispositivo.'); return; }
        const p = parseFloat(price.replace(',', '.'));
        const tp = parseInt(totalPuffs);
        const d = parseInt(days);
        if (isNaN(p) || p <= 0) { Alert.alert('Opa', 'Coloca um preço válido.'); return; }
        if (isNaN(tp) || tp <= 0) { Alert.alert('Opa', 'Quantas puxadas ele tem no total?'); return; }
        if (isNaN(d) || d <= 0) { Alert.alert('Opa', 'Quantos dias ele costuma durar?'); return; }
        setSaving(true);
        const device = { name: name.trim(), type, price: p, totalPuffs: tp, days: d };
        await saveDevice(device);
        const allRecords = await getRecords();
        await recalcEconomy(allRecords, device);
        setSaving(false);
        showSuccess();
    };

    const costPerPuff = () => {
        const p = parseFloat(price.replace(',', '.'));
        const tp = parseInt(totalPuffs);
        return (!isNaN(p) && !isNaN(tp) && tp > 0) ? `R$ ${(p / tp).toFixed(4)}` : '—';
    };

    const dailyGoal = () => {
        const tp = parseInt(totalPuffs);
        const d = parseInt(days);
        return (!isNaN(tp) && !isNaN(d) && d > 0) ? `${Math.round(tp / d)} puxadas/dia` : '—';
    };

    const inputStyle = [styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }];

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <ScreenHeader
                title="Seu Dispositivo"
                subtitle="Conta pra gente como ele é"
                colors={colors}
                isDark={isDark}
                toggleTheme={toggleTheme}
                onBackPress={() => navigation.goBack()}
                onProfilePress={() => navigation.navigate('Profile')}
            />

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.fieldLabel, { color: colors.text }]}>Nome / Modelo</Text>
                <TextInput
                    style={inputStyle}
                    placeholder="Ex: Vape Pod – Mint"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                />

                <Text style={[styles.fieldLabel, { color: colors.text }]}>Tipo</Text>
                <View style={styles.toggleRow}>
                    {[{ val: 'desc', label: 'Descartável' }, { val: 'rec', label: 'Recarregável' }].map(({ val, label }) => (
                        <TouchableOpacity
                            key={val}
                            style={[styles.toggleBtn, { borderColor: colors.border, backgroundColor: colors.card }, type === val && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                            onPress={() => setType(val)}
                        >
                            <Text style={[styles.toggleBtnText, { color: colors.textSecondary }, type === val && { color: '#fff' }]}>{label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.text }]}>Preço (R$)</Text>
                <TextInput style={inputStyle} placeholder="Ex: 39.90" placeholderTextColor={colors.textMuted} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

                <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantas puxadas ele dá no total</Text>
                <TextInput style={inputStyle} placeholder="Ex: 600" placeholderTextColor={colors.textMuted} value={totalPuffs} onChangeText={setTotalPuffs} keyboardType="number-pad" />

                <Text style={[styles.fieldLabel, { color: colors.text }]}>Quantos dias ele costuma durar</Text>
                <TextInput style={inputStyle} placeholder="Ex: 14" placeholderTextColor={colors.textMuted} value={days} onChangeText={setDays} keyboardType="number-pad" />

                {(price || totalPuffs || days) && (
                    <View style={[styles.previewBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.previewTitle, { color: colors.primaryDark }]}>Prévia</Text>
                        <View style={styles.previewRow}>
                            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Custo por puxada</Text>
                            <Text style={[styles.previewVal, { color: colors.primaryDark }]}>{costPerPuff()}</Text>
                        </View>
                        <View style={styles.previewRow}>
                            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Sua meta por dia</Text>
                            <Text style={[styles.previewVal, { color: colors.primaryDark }]}>{dailyGoal()}</Text>
                        </View>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    <Ionicons name={saving ? 'hourglass-outline' : 'save-outline'} size={20} color="#fff" />
                    <Text style={styles.saveBtnText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
                </TouchableOpacity>

                {successVisible && (
                    <Animated.View style={[styles.successBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary, opacity: fadeAnim }]}>
                        <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                        <Text style={[styles.successText, { color: colors.primaryDark }]}>Salvo! Já atualizamos suas contas. ✅</Text>
                    </Animated.View>
                )}
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primaryDark }]}>
                    Com esses dados a gente calcula quanto você economiza cada vez que resiste ao vape.
                </Text>
            </View>

            <View style={{ height: 40 }} />
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    card: { borderRadius: RADIUS.lg, padding: 18, marginHorizontal: 16, marginTop: 16 },
    fieldLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 4 },
    input: { borderWidth: 1.5, borderRadius: RADIUS.md, padding: 12, fontSize: 15, marginBottom: 14 },
    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1.5, alignItems: 'center' },
    toggleBtnText: { fontSize: 14, fontWeight: '600' },
    previewBox: { borderRadius: RADIUS.md, padding: 14, marginBottom: 16 },
    previewTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    previewLabel: { fontSize: 13 },
    previewVal: { fontSize: 13, fontWeight: '700' },
    saveBtn: { borderRadius: RADIUS.md, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: RADIUS.md, padding: 14, marginTop: 12 },
    successText: { fontSize: 14, fontWeight: '600', flex: 1 },
    infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, marginTop: 14, borderRadius: RADIUS.md, padding: 14 },
    infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
