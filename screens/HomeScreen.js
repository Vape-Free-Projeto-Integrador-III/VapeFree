// src/screens/HomeScreen.js
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    RefreshControl,
    Alert,
    Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import {
    getRecords,
    getDevice,
    getEconomy,
    getLastNDays,
    calcStreak,
    todayString,
} from '../utils/storage';
import { RADIUS, SHADOW, TIPS } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;

export default function HomeScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const { logout } = useAuth();
    const [records, setRecords] = useState([]);
    const [device, setDevice] = useState(null);
    const [economy, setEconomy] = useState({});
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        const [r, d, e] = await Promise.all([getRecords(), getDevice(), getEconomy()]);
        setRecords(r);
        setDevice(d);
        setEconomy(e);
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    function handleLogout() {
        if (Platform.OS === 'web') {
            const confirmado = window.confirm('Deseja realmente sair da sua conta?');
            if (confirmado) {
                performLogout();
            }
            return;
        }

        Alert.alert(
            'Sair',
            'Deseja realmente sair da sua conta?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sair',
                    style: 'destructive',
                    onPress: performLogout,
                },
            ]
        );
    }

    async function performLogout() {
        await logout();

    }

    const today = todayString();
    const todayRecs = records.filter((r) => r.date === today);
    const todayPuffs = todayRecs.reduce((a, r) => a + (r.puffs || 0), 0);
    const streak = calcStreak(records);
    const last7 = getLastNDays(7);
    const weekPuffs = last7.reduce((sum, d) => {
        return sum + records.filter((r) => r.date === d).reduce((a, r) => a + (r.puffs || 0), 0);
    }, 0);

    const chartLabels = last7.map((d) => d.slice(5));
    const chartData = last7.map((d) =>
        records.filter((r) => r.date === d).reduce((a, r) => a + (r.puffs || 0), 0)
    );

    const todayEco = economy[today] || 0;
    const totalEco = Object.values(economy).reduce((a, v) => a + v, 0);

    const tip = TIPS[new Date().getDate() % TIPS.length];

    return (
        <ScrollView
            style={[styles.scroll, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <View style={[styles.header, { backgroundColor: colors.primary }]}>
                <View>
                    <Text style={styles.headerTitle}>VapeFree</Text>
                    <Text style={styles.headerSub}>Sua jornada para uma vida livre do vape</Text>
                </View>

                <TouchableOpacity onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={24} color="white" />
                </TouchableOpacity>

                <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn}>
                    <Ionicons name={isDark ? 'sunny' : 'moon'} size={22} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Progresso de Hoje</Text>
                <View style={styles.statRow}>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{todayPuffs}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Puxadas{'\n'}hoje</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{streak}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dias{'\n'}seguidos</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{weekPuffs}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Esta{'\n'}semana</Text>
                    </View>
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>💰 Economia</Text>
                {device ? (
                    <View style={styles.moneyRow}>
                        <View style={[styles.moneyBox, { backgroundColor: colors.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💰</Text>
                            <Text style={[styles.moneyVal, { color: colors.primaryDark }]}>R$ {todayEco.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>Economizado hoje</Text>
                        </View>
                        <View style={[styles.moneyBox, { backgroundColor: colors.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💵</Text>
                            <Text style={[styles.moneyVal, { color: colors.primaryDark }]}>R$ {totalEco.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>Total economizado</Text>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.devicePrompt, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                        onPress={() => navigation.navigate('Device')}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                        <Text style={[styles.devicePromptText, { color: colors.primaryDark }]}>
                            Cadastre seu dispositivo para ver sua economia 💡
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Últimos 7 dias</Text>
                {records.length > 0 ? (
                    <LineChart
                        data={{
                            labels: chartLabels,
                            datasets: [{ data: chartData.map((v) => (v === 0 ? 0 : v)) }],
                        }}
                        width={CHART_WIDTH}
                        height={140}
                        chartConfig={{
                            backgroundColor: colors.card,
                            backgroundGradientFrom: colors.card,
                            backgroundGradientTo: colors.card,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                            labelColor: () => colors.textSecondary,
                            propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primaryDark },
                            propsForBackgroundLines: { stroke: colors.borderLight },
                        }}
                        bezier
                        style={styles.chart}
                    />
                ) : (
                    <Text style={[styles.emptyChart, { color: colors.textMuted }]}>Nenhum dado ainda. Comece registrando! 📝</Text>
                )}
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.card, borderLeftColor: colors.primary }, SHADOW.small]}>
                <Ionicons name="bulb-outline" size={24} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.tipText, { color: colors.text }]}>{tip}</Text>
            </View>

            <TouchableOpacity
                style={[styles.deviceBtn, { backgroundColor: colors.card, borderColor: colors.primary }, SHADOW.small]}
                onPress={() => navigation.navigate('Device')}
            >
                <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
                <Text style={[styles.deviceBtnText, { color: colors.primaryDark }]}>
                    {device ? `Meu Dispositivo: ${device.name}` : 'Cadastrar Meu Dispositivo'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
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
    headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    themeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    cardTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 14,
    },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: {
        flex: 1,
        borderRadius: RADIUS.md,
        padding: 12,
        alignItems: 'center',
    },
    statNum: { fontSize: 26, fontWeight: '800' },
    statLabel: { fontSize: 11, textAlign: 'center', marginTop: 2, lineHeight: 14 },
    moneyRow: { flexDirection: 'row', gap: 10 },
    moneyBox: {
        flex: 1,
        borderRadius: RADIUS.md,
        padding: 14,
    },
    moneyIcon: { fontSize: 22, marginBottom: 4 },
    moneyVal: { fontSize: 20, fontWeight: '800' },
    moneyLabel: { fontSize: 11, marginTop: 2 },
    devicePrompt: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: RADIUS.md,
        borderWidth: 1.5,
        borderStyle: 'dashed',
    },
    devicePromptText: { flex: 1, fontSize: 13, fontWeight: '500' },
    chart: { borderRadius: RADIUS.md, marginTop: 4 },
    emptyChart: { fontSize: 13, textAlign: 'center', padding: 20 },
    tipCard: {
        borderRadius: RADIUS.lg,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
        borderLeftWidth: 4,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    tipText: { flex: 1, fontSize: 14, lineHeight: 20 },
    deviceBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderRadius: RADIUS.lg,
        padding: 14,
        marginHorizontal: 16,
        marginTop: 14,
        borderWidth: 1.5,
    },
    deviceBtnText: { flex: 1, fontSize: 14, fontWeight: '600' },
});