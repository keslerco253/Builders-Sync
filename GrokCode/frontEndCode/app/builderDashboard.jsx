import React, { useState, useCallback, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, useWindowDimensions, Platform, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { AuthContext, ThemeContext, apiFetch } from './context';

const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
const rG = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.bl : C.gn;

const WIDE = 768;

// Pure-View pie chart using half-circle rotation technique (no SVG library needed)
function PieChart({ data, size = 180, C }) {
  // data = [{ value, color, label }]
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.w10, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.dm, fontSize: 14 }}>No data</Text>
      </View>
    );
  }

  // On web, use conic-gradient for clean rendering
  if (Platform.OS === 'web') {
    let gradientParts = [];
    let cumPct = 0;
    for (const d of data) {
      const pct = (d.value / total) * 100;
      gradientParts.push(`${d.color} ${cumPct}% ${cumPct + pct}%`);
      cumPct += pct;
    }
    const gradient = `conic-gradient(${gradientParts.join(', ')})`;
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundImage: gradient,
        }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 12 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: d.color }} />
              <Text style={{ color: C.text, fontSize: 13 }}>{d.label}: {d.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Native fallback: simple bar-style representation
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', height: 24, borderRadius: 12, overflow: 'hidden', width: size }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: d.value, backgroundColor: d.color }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 12 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: d.color }} />
            <Text style={{ color: C.text, fontSize: 13 }}>{d.label}: {d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BuilderDashboard() {
  const C = useContext(ThemeContext);
  const { user, signout } = useContext(AuthContext);
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE;

  const goToDashboard = () => {
    navigation.navigate('Dashboard');
  };

  const handleSignout = async () => {
    const doSignout = () => { signout(); };
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) doSignout();
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doSignout },
      ]);
    }
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/builder-dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.warn('Builder dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const st = getStyles(C, isWide);

  if (loading && !data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.gd} size="large" />
      </View>
    );
  }

  const coList = data?.change_orders_needing_signature || [];
  const warrantyList = data?.warranty_requests || [];
  const onHoldList = data?.on_hold_projects || [];
  const escrowList = data?.pending_escrow_projects || [];
  const counts = data?.project_status_counts || { open: 0, closed: 0, bid: 0 };

  const pieData = [
    { value: counts.open, color: '#10b981', label: 'Open' },
    { value: counts.closed, color: '#6b7280', label: 'Closed' },
    { value: counts.bid, color: '#3b82f6', label: 'Bid' },
  ];

  const formatDate = (d) => {
    if (!d) return '';
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return d; }
  };

  const statusLabel = (s) => {
    const map = {
      pending_super: 'Pending Super',
      pending_customer: 'Pending Customer',
      pending_customer_review: 'Customer Review',
      pending_subs: 'Pending Sub',
      pending_pm: 'Pending PM',
    };
    return map[s] || s;
  };

  const priorityColor = (p) => {
    if (p === 'urgent') return '#ef4444';
    if (p === 'high') return '#f59e0b';
    return C.text;
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ========== HEADER ========== */}
      <View style={st.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
          <View style={st.logoBox}>
            <Text style={{ fontSize: 24, color: '#fff', fontWeight: '700' }}>⬡</Text>
          </View>
          <Text style={st.brandName}>BuilderSync</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity onPress={() => navigation.navigate('Account')} style={st.headerBtn}>
            <View style={[st.avatar, { backgroundColor: rG(user?.role, C) }]}>
              <Text style={st.avatarTxt}>{ini(user?.name)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSignout} style={st.headerBtn}>
            <Feather name="log-out" size={22} color={C.chromeDm} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gd} />}
      >
      {/* Welcome header */}
      <View style={st.welcomeRow}>
        <View style={{ flex: 1 }}>
          <Text style={st.welcomeText}>Welcome back, {user?.name?.split(' ')[0] || 'Builder'}</Text>
          <Text style={st.welcomeSub}>Here's your overview for today</Text>
        </View>
        <TouchableOpacity onPress={() => goToDashboard()} style={st.enterBtn} activeOpacity={0.7}>
          <Feather name="arrow-right" size={18} color="#fff" />
          <Text style={st.enterBtnTxt}>Go to Projects</Text>
        </TouchableOpacity>
      </View>

      {/* Cards grid */}
      <View style={st.grid}>

        {/* Pie Chart Card */}
        <View style={[st.card, isWide && st.cardThird]}>
          <View style={st.cardHeader}>
            <Feather name="pie-chart" size={20} color={C.gd} />
            <Text style={st.cardTitle}>Project Status</Text>
          </View>
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <PieChart data={pieData} size={160} C={C} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: '#10b981' }}>{counts.open}</Text>
                <Text style={{ fontSize: 13, color: C.dm }}>Open</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: '#6b7280' }}>{counts.closed}</Text>
                <Text style={{ fontSize: 13, color: C.dm }}>Closed</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: '#3b82f6' }}>{counts.bid}</Text>
                <Text style={{ fontSize: 13, color: C.dm }}>Bid</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Change Orders Needing Signature */}
        <View style={[st.card, isWide && st.cardTwoThird]}>
          <View style={st.cardHeader}>
            <Feather name="edit-3" size={20} color={C.gd} />
            <Text style={st.cardTitle}>Change Orders Awaiting Your Signature</Text>
            {coList.length > 0 && (
              <View style={st.badge}><Text style={st.badgeTxt}>{coList.length}</Text></View>
            )}
          </View>
          {coList.length === 0 ? (
            <View style={st.emptyBox}>
              <Feather name="check-circle" size={32} color={C.dm} />
              <Text style={st.emptyTxt}>All caught up! No signatures needed.</Text>
            </View>
          ) : (
            <View>
              {coList.map(co => (
                <TouchableOpacity key={co.id} style={st.listRow} activeOpacity={0.7}
                  onPress={() => goToDashboard()}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.listTitle}>{co.title || `CO #${co.co_number}`}</Text>
                    <Text style={st.listSub}>{co.project_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[st.statusPill, { backgroundColor: '#f59e0b20' }]}>
                      <Text style={[st.statusTxt, { color: '#f59e0b' }]}>{statusLabel(co.status)}</Text>
                    </View>
                    {co.amount != null && (
                      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gd, marginTop: 4 }}>
                        ${Number(co.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* On Hold Projects */}
        <View style={[st.card, isWide && st.cardHalf]}>
          <View style={st.cardHeader}>
            <Feather name="pause-circle" size={20} color="#f59e0b" />
            <Text style={st.cardTitle}>On Hold Projects</Text>
            {onHoldList.length > 0 && (
              <View style={[st.badge, { backgroundColor: '#f59e0b' }]}><Text style={st.badgeTxt}>{onHoldList.length}</Text></View>
            )}
          </View>
          {onHoldList.length === 0 ? (
            <View style={st.emptyBox}>
              <Feather name="play-circle" size={32} color={C.dm} />
              <Text style={st.emptyTxt}>No projects on hold</Text>
            </View>
          ) : (
            <View>
              {onHoldList.map(p => (
                <TouchableOpacity key={p.id} style={st.listRow} activeOpacity={0.7}
                  onPress={() => goToDashboard()}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.listTitle}>{p.name}</Text>
                    {p.hold_reason ? <Text style={st.listSub} numberOfLines={1}>{p.hold_reason}</Text> : null}
                  </View>
                  {p.hold_start_date ? (
                    <Text style={{ fontSize: 12, color: C.dm }}>{formatDate(p.hold_start_date)}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Pending Escrows */}
        <View style={[st.card, isWide && st.cardHalf]}>
          <View style={st.cardHeader}>
            <Feather name="shield" size={20} color="#8b5cf6" />
            <Text style={st.cardTitle}>Pending Escrows</Text>
            {escrowList.length > 0 && (
              <View style={[st.badge, { backgroundColor: '#8b5cf6' }]}><Text style={st.badgeTxt}>{escrowList.length}</Text></View>
            )}
          </View>
          {escrowList.length === 0 ? (
            <View style={st.emptyBox}>
              <Feather name="check-circle" size={32} color={C.dm} />
              <Text style={st.emptyTxt}>No pending escrows</Text>
            </View>
          ) : (
            <View>
              {escrowList.map(p => (
                <TouchableOpacity key={p.id} style={st.listRow} activeOpacity={0.7}
                  onPress={() => goToDashboard()}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.listTitle}>{p.name}</Text>
                    <Text style={st.listSub}>
                      {p.escrows.length} pending escrow{p.escrows.length !== 1 ? 's' : ''}
                      {' — $'}
                      {p.escrows.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Warranty Requests (only shown for warranty specialists) */}
        {(user?.is_warranty_specialist && warrantyList.length > 0) && (
          <View style={[st.card, isWide && { width: '100%' }]}>
            <View style={st.cardHeader}>
              <Feather name="tool" size={20} color="#ef4444" />
              <Text style={st.cardTitle}>Warranty Requests</Text>
              <View style={[st.badge, { backgroundColor: '#ef4444' }]}><Text style={st.badgeTxt}>{warrantyList.length}</Text></View>
            </View>
            <View>
              {warrantyList.map(w => (
                <TouchableOpacity key={w.id} style={st.listRow} activeOpacity={0.7}
                  onPress={() => goToDashboard()}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.listTitle}>{w.title}</Text>
                    <Text style={st.listSub}>{w.project_name} — {w.category || 'General'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={[st.statusPill, { backgroundColor: w.status === 'submitted' ? '#ef444420' : '#3b82f620' }]}>
                      <Text style={[st.statusTxt, { color: w.status === 'submitted' ? '#ef4444' : '#3b82f6' }]}>
                        {w.status?.replace('_', ' ') || 'submitted'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: priorityColor(w.priority), fontWeight: '600', marginTop: 4, textTransform: 'uppercase' }}>
                      {w.priority || 'normal'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
    </View>
  );
}

const getStyles = (C, isWide) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.chrome,
    borderBottomWidth: 1,
    borderBottomColor: C.bd,
  },
  logoBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.gd,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  brandName: {
    fontSize: 20, fontWeight: '700', color: C.textBold, letterSpacing: -0.3,
  },
  headerBtn: { padding: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  container: {
    padding: isWide ? 28 : 16,
    paddingBottom: 40,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '700',
    color: C.textBold,
  },
  welcomeSub: {
    fontSize: 15,
    color: C.dm,
    marginTop: 2,
  },
  enterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.gd,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  enterBtnTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    backgroundColor: C.chrome,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.bd,
    overflow: 'hidden',
    width: '100%',
  },
  cardThird: {
    width: '32%',
    minWidth: 280,
  },
  cardTwoThird: {
    width: '65%',
    minWidth: 400,
    flexGrow: 1,
  },
  cardHalf: {
    width: '48%',
    minWidth: 340,
    flexGrow: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.w08 || C.bd,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textBold,
    flex: 1,
  },
  badge: {
    backgroundColor: C.gd,
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  badgeTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    gap: 8,
  },
  emptyTxt: {
    fontSize: 15,
    color: C.dm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.w06 || C.bd,
    gap: 12,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  listSub: {
    fontSize: 13,
    color: C.dm,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTxt: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});
