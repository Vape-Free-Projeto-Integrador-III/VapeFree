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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import {
    getRecords,
    getDevice,
    getEconomy,
    getLastNDays,
    getCrisisSessions,
    getMissions,
    checkAndCompleteMissions,
    checkAndUnlockAchievements,
    refreshXp,
    calcStreak,
    todayString,
} from '../utils/storage';
import { getLevel } from '../utils/xp';
import { buildMissionContext, checkMissions } from '../utils/missions';
import { RADIUS, SHADOW, TIPS } from '../utils/theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useXpToast } from '../context/XpToastContext';
import ScreenHeader from '../components/ScreenHeader';
import MissionsCard from '../components/MissionsCard';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;

export default function HomeScreen({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const { user } = useAuth();
    const { showRewards } = useXpToast();
    const [records, setRecords] = useState([]);
    const [device, setDevice] = useState(null);
    const [economy, setEconomy] = useState({});
    const [missions, setMissions] = useState([]);
    const [xp, setXp] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        const [r, d, e, c] = await Promise.all([
            getRecords(),
            getDevice(),
            getEconomy(),
            getCrisisSessions(),
        ]);
        setRecords(r);
        setDevice(d);
        setEconomy(e);

        const newMissions = await checkAndCompleteMissions(r, e, c);
        const completedMissions = await getMissions();
        setMissions(checkMissions(buildMissionContext(r, e, c, todayString()), completedMissions));

        // Concluir missão pode desbloquear conquista (ex: first_mission).
        const newAchievements = await checkAndUnlockAchievements(r, e, completedMissions);
        const summary = await refreshXp(r, null, completedMissions);
        setXp(summary.xp);
        showRewards({ achievements: newAchievements, missions: newMissions, gained: summary.gained });
    }, [showRewards]);

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

    function openSettings() {
        navigation.navigate('Settings');
    }

    const today = todayString();
    const todayRecs = records.filter((r) => r.date === today);
    const todayPuffs = todayRecs.reduce((a, r) => a + (r.puffs || 0), 0);
    const streak = calcStreak(records);
    const last7 = getLastNDays(7);
    const weekPuffs = last7.reduce((sum, d) => {
        return sum + records.filter((r) => r.date === d).reduce((a, r) => a + (r.puffs || 0), 0);
    }, 0);

    const chartLabels = last7.map((d) => {
        const [, month, day] = d.split('-');
        return `${day}/${month}`;
    });
    const chartData = last7.map((d) =>
        records.filter((r) => r.date === d).reduce((a, r) => a + (r.puffs || 0), 0)
    );

    const todayEco = economy[today] || 0;
    const totalEco = Object.values(economy).reduce((a, v) => a + v, 0);

    const level = getLevel(xp);
    const tip = TIPS[new Date().getDate() % TIPS.length];
    const welcomeName = user?.displayName?.trim();

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
            style={[styles.scroll, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
            <ScreenHeader
                title="VapeFree"
                subtitle="Vamos deixar o vape pra trás"
                colors={colors}
                showSettings
                onSettingsPress={openSettings}
            />

            <TouchableOpacity
                style={[styles.crisisCard, { backgroundColor: colors.card, borderLeftColor: colors.warning }, SHADOW.medium]}
                onPress={() => navigation.navigate('Crisis')}
            >
                <Ionicons name="hand-left" size={26} color={colors.warning} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.crisisTitle, { color: colors.text }]}>Estou com vontade</Text>
                    <Text style={[styles.crisisSubtitle, { color: colors.textSecondary }]}>
                        Toca aqui — a gente passa por isso junto
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Como você foi hoje?</Text>
                <View style={styles.statRow}>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{todayPuffs}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Puxadas{'\n'}hoje</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{streak}</Text>
                         <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Dias{'\n'}registrados{'\n'}sem uso</Text>
                    </View>
                    <View style={[styles.statBox, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.statNum, { color: colors.primaryDark }]}>{weekPuffs}</Text>
                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Esta{'\n'}semana</Text>
                    </View>
                </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <View style={styles.xpHeader}>
                    <Text style={styles.xpIcon}>{level.icon}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.xpLevel, { color: colors.text }]}>
                            Nível {level.number} · {level.name}
                        </Text>
                        <Text style={[styles.xpSub, { color: colors.textSecondary }]}>
                            {level.nextName
                                ? `${level.xpToNext} XP pra virar ${level.nextName}`
                                : 'Nível máximo — você é lenda 👑'}
                        </Text>
                    </View>
                    <Text style={[styles.xpTotal, { color: colors.primaryDark }]}>{xp} XP</Text>
                </View>
                <View style={[styles.xpTrack, { backgroundColor: colors.primaryLight }]}>
                    <View
                        style={[
                            styles.xpFill,
                            { backgroundColor: colors.primary, width: `${Math.round(level.progress * 100)}%` },
                        ]}
                    />
                </View>
            </View>

            <MissionsCard
                missions={missions.filter((mission) => mission.period === 'daily')}
                colors={colors}
                onPress={() => navigation.navigate('Missions')}
            />

            <View style={[styles.card, { backgroundColor: colors.card }, SHADOW.medium]}>
                <Text style={[styles.cardTitle, { color: colors.textMuted }]}>💰 Economia</Text>
                {device ? (
                    <View style={styles.moneyRow}>
                        <View style={[styles.moneyBox, { backgroundColor: colors.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💰</Text>
                            <Text style={[styles.moneyVal, { color: colors.primaryDark }]}>R$ {todayEco.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>Ficou no seu bolso hoje</Text>
                        </View>
                        <View style={[styles.moneyBox, { backgroundColor: colors.primaryLight }]}>
                            <Text style={styles.moneyIcon}>💵</Text>
                            <Text style={[styles.moneyVal, { color: colors.primaryDark }]}>R$ {totalEco.toFixed(2)}</Text>
                            <Text style={[styles.moneyLabel, { color: colors.textSecondary }]}>Total no bolso</Text>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.devicePrompt, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                        onPress={() => navigation.navigate('Device')}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                        <Text style={[styles.devicePromptText, { color: colors.primaryDark }]}>
                            Cadastra seu dispositivo pra ver quanto você tá economizando 💡
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
                            datasets: [{ data: chartData }],
                        }}
                        width={CHART_WIDTH}
                        height={180}
                        fromZero
                        segments={Math.max(1, Math.min(4, Math.max(...chartData)))}
                        chartConfig={{
                            backgroundColor: colors.card,
                            backgroundGradientFrom: colors.card,
                            backgroundGradientTo: colors.card,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
                            labelColor: () => colors.textSecondary,
                            propsForDots: { r: '4', strokeWidth: '2', stroke: colors.primaryDark },
                            propsForBackgroundLines: { stroke: colors.borderLight },
                            formatYLabel: (v) => `${Math.round(Number(v))}`,
                        }}
                        bezier
                        style={styles.chart}
                    />
                ) : (
                    <Text style={[styles.emptyChart, { color: colors.textMuted }]}>Ainda não tem nada por aqui. Bora começar? 📝</Text>
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
                    {device ? `Seu dispositivo: ${device.name}` : 'Cadastrar meu dispositivo'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </TouchableOpacity>
        </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    welcomeText: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 6 },
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
    crisisCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: RADIUS.lg,
        borderLeftWidth: 4,
        padding: 16,
        marginHorizontal: 16,
        marginTop: 14,
    },
    crisisTitle: { fontSize: 16, fontWeight: '800' },
    crisisSubtitle: { fontSize: 12, marginTop: 2 },
    statRow: { flexDirection: 'row', gap: 8 },
    statBox: {
        flex: 1,
        borderRadius: RADIUS.md,
        padding: 12,
        alignItems: 'center',
    },
    statNum: { fontSize: 26, fontWeight: '800' },
    statLabel: { fontSize: 11, textAlign: 'center', marginTop: 2, lineHeight: 14 },
    xpHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    xpIcon: { fontSize: 26 },
    xpLevel: { fontSize: 15, fontWeight: '800' },
    xpSub: { fontSize: 12, marginTop: 2 },
    xpTotal: { fontSize: 16, fontWeight: '800' },
    xpTrack: { height: 10, borderRadius: RADIUS.md, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: RADIUS.md },
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