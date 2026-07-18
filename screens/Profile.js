import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RADIUS, SHADOW } from '../utils/theme';
import ScreenHeader from '../components/ScreenHeader';

function getInitials(name, email) {
    const source = (name || email || '').trim();
    if (!source) return 'U';

    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function Profile({ navigation }) {
    const { colors, isDark, toggleTheme } = useTheme();
    const { user, isGuest, logout } = useAuth();
    const [busy, setBusy] = React.useState(false);

    const displayName = isGuest ? 'Convidado' : user?.displayName?.trim() || 'Usuário';
    const email = user?.email?.trim() || 'E-mail não disponível';
    const initials = getInitials(user?.displayName, user?.email);

    function handleBack() {
        navigation.goBack();
    }

    function handleLogout() {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm('Deseja realmente sair da sua conta?');
            if (confirmed) {
                performLogout('Login');
            }
            return;
        }

        Alert.alert('Sair', 'Deseja realmente sair da sua conta?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Sair',
                style: 'destructive',
                onPress: () => performLogout('Login'),
            },
        ]);
    }

    async function performLogout(nextAuthScreen) {
        setBusy(true);
        try {
            await logout(nextAuthScreen);
        } finally {
            setBusy(false);
        }
    }

    async function openAuthScreen(nextAuthScreen) {
        if (busy) {
            return;
        }

        await performLogout(nextAuthScreen);
    }

    return (
        <ScrollView style={[styles.scroll, { backgroundColor: colors.background }]} contentContainerStyle={styles.container}>
            <ScreenHeader
                title="Perfil"
                subtitle={isGuest ? 'Você ainda está como convidado' : 'Informações da sua conta'}
                colors={colors}
                isDark={isDark}
                toggleTheme={toggleTheme}
                onBackPress={handleBack}
                showProfile={false}
            />

            {isGuest ? (
                <>
                    <View style={[styles.profileCard, { backgroundColor: colors.card }, SHADOW.medium]}>
                        <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.avatarText, { color: colors.primaryDark }]}>G</Text>
                        </View>

                        <Text style={[styles.name, { color: colors.text }]}>Você está como convidado</Text>
                        <Text style={[styles.guestText, { color: colors.textMuted }]}>Faça login ou crie uma conta para salvar seus dados na nuvem e não perder seu progresso.</Text>
                    </View>

                    <View style={styles.guestActions}>
                        <TouchableOpacity
                            style={[styles.primaryAction, { backgroundColor: colors.primary }, SHADOW.small]}
                            onPress={() => openAuthScreen('Login')}
                            disabled={busy}
                        >
                            <Text style={styles.primaryActionText}>Entrar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.secondaryAction, { borderColor: colors.primary, backgroundColor: colors.card }, SHADOW.small]}
                            onPress={() => openAuthScreen('SignUp')}
                            disabled={busy}
                        >
                            <Text style={[styles.secondaryActionText, { color: colors.primaryDark }]}>Cadastrar</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: colors.card }, SHADOW.small]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="cloud-outline" size={18} color={colors.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Modo convidado</Text>
                                <Text style={[styles.infoValue, { color: colors.text }]}>Os dados ficam apenas neste aparelho até você entrar na conta.</Text>
                            </View>
                        </View>
                    </View>
                </>
            ) : (
                <>
                    <View style={[styles.profileCard, { backgroundColor: colors.card }, SHADOW.medium]}>
                        <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                            <Text style={[styles.avatarText, { color: colors.primaryDark }]}>{initials}</Text>
                        </View>

                        <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
                        <Text style={[styles.email, { color: colors.textMuted }]}>{email}</Text>
                    </View>

                    <View style={[styles.infoCard, { backgroundColor: colors.card }, SHADOW.small]}>
                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="person-outline" size={18} color={colors.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Nome</Text>
                                <Text style={[styles.infoValue, { color: colors.text }]}>{displayName}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: colors.border }]} />

                        <View style={styles.infoRow}>
                            <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                                <Ionicons name="mail-outline" size={18} color={colors.primaryDark} />
                            </View>
                            <View style={styles.infoTextWrap}>
                                <Text style={[styles.infoLabel, { color: colors.textMuted }]}>E-mail</Text>
                                <Text style={[styles.infoValue, { color: colors.text }]}>{email}</Text>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.logoutBtn, { backgroundColor: colors.danger }, SHADOW.small]}
                        onPress={handleLogout}
                        disabled={busy}
                    >
                        <Ionicons name="log-out-outline" size={20} color="#fff" />
                        <Text style={styles.logoutText}>Sair da conta</Text>
                    </TouchableOpacity>
                </>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1 },
    container: { paddingBottom: 24 },
    profileCard: {
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: RADIUS.lg,
        padding: 20,
        alignItems: 'center',
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    avatarText: {
        fontSize: 28,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    email: { fontSize: 13, marginTop: 6, textAlign: 'center' },
    guestText: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
    infoCard: {
        marginHorizontal: 16,
        marginTop: 14,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    infoIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    infoTextWrap: { flex: 1 },
    infoLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    infoValue: { fontSize: 15, fontWeight: '600', marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E0E0E0' },
    guestActions: {
        paddingHorizontal: 16,
        marginTop: 4,
        gap: 10,
    },
    primaryAction: {
        minHeight: 48,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    secondaryAction: {
        minHeight: 48,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryActionText: { fontSize: 15, fontWeight: '700' },
    logoutBtn: {
        marginHorizontal: 16,
        marginTop: 18,
        borderRadius: RADIUS.lg,
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    logoutText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});