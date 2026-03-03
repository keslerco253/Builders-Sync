import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, Modal, Platform, useWindowDimensions,
} from 'react-native';
import { AuthContext, ThemeContext, API_BASE, apiFetch } from './context';

export default function AdminDashboard() {
  const C = React.useContext(ThemeContext);
  const { user, signout } = React.useContext(AuthContext);
  const sty = useMemo(() => getStyles(C), [C]);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [tab, setTab] = useState('companies'); // companies | pending | stats
  const [companies, setCompanies] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyUsers, setCompanyUsers] = useState([]);
  const [companyUsersLoading, setCompanyUsersLoading] = useState(false);
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('builder');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, pendRes, statRes] = await Promise.all([
        apiFetch(`/admin/companies?admin_id=${user.id}`),
        apiFetch(`/admin/users/pending?admin_id=${user.id}`),
        apiFetch(`/admin/stats?admin_id=${user.id}`),
      ]);
      const [compData, pendData, statData] = await Promise.all([
        compRes.json(), pendRes.json(), statRes.json(),
      ]);
      if (Array.isArray(compData)) setCompanies(compData);
      if (Array.isArray(pendData)) setPendingUsers(pendData);
      if (statData && !statData.error) setStats(statData);
    } catch (e) { console.warn('Admin fetch error:', e); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectCompany = async (company) => {
    setSelectedCompany(company);
    setCompanyUsersLoading(true);
    try {
      const res = await apiFetch(`/admin/companies/${company.id}/users?admin_id=${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) setCompanyUsers(data);
    } catch (e) { console.warn(e); }
    finally { setCompanyUsersLoading(false); }
  };

  const createCompany = async () => {
    const name = newCompanyName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.id, name }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompanies(prev => [...prev, { ...data, user_count: 0, project_count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        setNewCompanyName('');
        setShowNewCompany(false);
        Alert.alert('Success', `Company "${name}" created`);
      } else {
        Alert.alert('Error', data.error || 'Failed to create company');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const inviteUser = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (!selectedCompany) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/companies/${selectedCompany.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.id, email, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteEmail('');
        setInviteRole('builder');
        setShowInvite(false);
        selectCompany(selectedCompany); // refresh user list
        Alert.alert('Success', `Invitation sent to ${email}`);
      } else {
        Alert.alert('Error', data.error || 'Failed to invite user');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const removeUser = async (uid, name) => {
    const doRemove = async () => {
      try {
        const res = await apiFetch(`/admin/companies/${selectedCompany.id}/invited/${uid}?admin_id=${user.id}`, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: user.id }),
        });
        if (res.ok) {
          selectCompany(selectedCompany);
        }
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove ${name || 'this user'}?`)) doRemove();
    } else {
      Alert.alert('Remove User', `Remove ${name || 'this user'}?`, [
        { text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const resetDatabase = async () => {
    const doReset = async () => {
      try {
        const res = await apiFetch(`/admin/reset-database`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: user.id }),
        });
        if (res.ok) {
          Alert.alert('Success', 'Database cleared. All companies and users removed.');
          setSelectedCompany(null);
          setCompanyUsers([]);
          fetchAll();
        } else {
          const data = await res.json();
          Alert.alert('Error', data.error || 'Failed to reset database');
        }
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('DANGER: This will delete ALL companies, users, projects, and data. Only the admin account will remain. Are you sure?')) doReset();
    } else {
      Alert.alert('Reset Database', 'DANGER: This will delete ALL companies, users, projects, and data. Only the admin account will remain.', [
        { text: 'Cancel' }, { text: 'Reset Everything', style: 'destructive', onPress: doReset },
      ]);
    }
  };

  const toggleCompanyStatus = async (company, action) => {
    const label = action === 'pause' ? 'Pause' : action === 'activate' ? 'Activate' : 'Delete';
    const doAction = async () => {
      try {
        const method = action === 'delete' ? 'DELETE' : 'PUT';
        const path = action === 'delete'
          ? `/admin/companies/${company.id}?admin_id=${user.id}`
          : `/admin/companies/${company.id}/${action}?admin_id=${user.id}`;
        const res = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ admin_id: user.id }) });
        if (res.ok) {
          fetchAll();
          if (selectedCompany?.id === company.id) {
            if (action === 'delete') setSelectedCompany(null);
            else {
              const updated = await res.json();
              setSelectedCompany(prev => ({ ...prev, ...updated }));
            }
          }
        }
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (action === 'delete') {
      if (Platform.OS === 'web') {
        if (window.confirm(`Delete "${company.name}"? This will deactivate all users in this company.`)) doAction();
      } else {
        Alert.alert('Delete Company', `Delete "${company.name}"? This will deactivate all users.`, [
          { text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: doAction },
        ]);
      }
    } else { doAction(); }
  };

  const authorizeUser = async (uid) => {
    try {
      const res = await apiFetch(`/admin/users/${uid}/authorize?admin_id=${user.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: user.id }),
      });
      if (res.ok) {
        setPendingUsers(prev => prev.filter(u => u.id !== uid));
        if (stats) setStats(prev => ({ ...prev, pending_users: Math.max(0, (prev.pending_users || 1) - 1) }));
      }
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const rejectUser = async (uid) => {
    const doReject = async () => {
      try {
        await apiFetch(`/admin/users/${uid}/reject?admin_id=${user.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: user.id }),
        });
        setPendingUsers(prev => prev.filter(u => u.id !== uid));
      } catch (e) { Alert.alert('Error', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Reject and delete this user?')) doReject();
    } else {
      Alert.alert('Reject User', 'Reject and delete this user?', [
        { text: 'Cancel' }, { text: 'Reject', style: 'destructive', onPress: doReject },
      ]);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out?')) signout();
    } else {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel' }, { text: 'Sign Out', style: 'destructive', onPress: signout },
      ]);
    }
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge = (role) => {
    const colors = { company_admin: C.gd, builder: C.gd, contractor: C.bl, customer: C.gn };
    const labels = { company_admin: 'ADMIN' };
    return (
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: (colors[role] || C.dm) + '22' }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors[role] || C.dm, textTransform: 'uppercase' }}>{labels[role] || role}</Text>
      </View>
    );
  };

  const statusBadge = (status) => {
    const colors = { active: C.gn, paused: C.yl, deleted: C.rd };
    return (
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: (colors[status] || C.dm) + '22' }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors[status] || C.dm, textTransform: 'uppercase' }}>{status}</Text>
      </View>
    );
  };

  // ── Stats Tab ──
  const renderStats = () => {
    if (!stats) return <ActivityIndicator color={C.gd} style={{ marginTop: 40 }} />;
    const cards = [
      { label: 'Companies', val: stats.total_companies, sub: `${stats.active_companies} active, ${stats.paused_companies} paused`, color: C.bl },
      { label: 'Users', val: stats.total_users, sub: `${stats.total_builders} builders, ${stats.total_contractors} subs, ${stats.total_customers} customers`, color: C.gn },
      { label: 'Projects', val: stats.total_projects, color: C.gd },
      { label: 'Pending Approval', val: stats.pending_users, color: stats.pending_users > 0 ? C.rd : C.dm },
    ];
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, maxWidth: 800 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: C.textBold, marginBottom: 6 }}>Overview</Text>
        {cards.map(c => (
          <View key={c.label} style={[sty.card, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: c.color + '18', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: c.color }}>{c.val}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBold }}>{c.label}</Text>
              {c.sub && <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>{c.sub}</Text>}
            </View>
          </View>
        ))}

        {/* Danger Zone */}
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.rd, marginBottom: 10, letterSpacing: 0.5 }}>DANGER ZONE</Text>
          <View style={[sty.card, { borderColor: C.rd + '44' }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.textBold, marginBottom: 4 }}>Reset Database</Text>
            <Text style={{ fontSize: 12, color: C.dm, marginBottom: 12 }}>
              Permanently delete all companies, users, projects, and data. Only the admin account will be kept.
            </Text>
            <TouchableOpacity onPress={resetDatabase}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd, alignSelf: 'flex-start' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Reset Everything</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  // ── Pending Users Tab ──
  const renderPending = () => (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 10, maxWidth: 800 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.textBold, marginBottom: 6 }}>
        Pending Users {pendingUsers.length > 0 && <Text style={{ color: C.rd }}>({pendingUsers.length})</Text>}
      </Text>
      {pendingUsers.length === 0 && (
        <View style={[sty.card, { alignItems: 'center', paddingVertical: 40 }]}>
          <Text style={{ fontSize: 16, color: C.dm }}>No pending users</Text>
        </View>
      )}
      {pendingUsers.map(u => (
        <View key={u.id} style={[sty.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: C.textBold }}>{u.name}</Text>
            <Text style={{ fontSize: 13, color: C.dm, marginTop: 2 }}>{u.username}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
              {roleBadge(u.role)}
              {u.company_name && <Text style={{ fontSize: 12, color: C.mt }}>{u.company_name}</Text>}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => authorizeUser(u.id)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.gn + '22' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gn }}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => rejectUser(u.id)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.rd + '22' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.rd }}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  // ── Company Detail Panel ──
  const renderCompanyDetail = () => {
    if (!selectedCompany) return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: C.dm }}>Select a company</Text>
      </View>
    );
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {!isWide && (
            <TouchableOpacity onPress={() => setSelectedCompany(null)} style={{ marginRight: 4 }}>
              <Text style={{ fontSize: 22, color: C.gd }}>{'<'}</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.textBold }}>{selectedCompany.name}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
              {statusBadge(selectedCompany.status)}
              <Text style={{ fontSize: 12, color: C.dm }}>
                {selectedCompany.user_count || 0} users · {selectedCompany.project_count || 0} projects
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {selectedCompany.status === 'active' && (
            <TouchableOpacity onPress={() => toggleCompanyStatus(selectedCompany, 'pause')}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: C.yl + '22' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.yl }}>Pause Company</Text>
            </TouchableOpacity>
          )}
          {selectedCompany.status === 'paused' && (
            <TouchableOpacity onPress={() => toggleCompanyStatus(selectedCompany, 'activate')}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gn + '22' }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.gn }}>Activate Company</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => toggleCompanyStatus(selectedCompany, 'delete')}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: C.rd + '22' }}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.rd }}>Delete Company</Text>
          </TouchableOpacity>
        </View>

        {/* Users */}
        <View style={sty.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBold }}>Users</Text>
            <TouchableOpacity onPress={() => setShowInvite(true)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.gd }}
              activeOpacity={0.7}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>+ Add User</Text>
            </TouchableOpacity>
          </View>
          {companyUsersLoading ? (
            <ActivityIndicator color={C.gd} />
          ) : companyUsers.length === 0 ? (
            <Text style={{ fontSize: 14, color: C.dm }}>No users yet. Invite someone to get started.</Text>
          ) : (
            companyUsers.map((u, i) => {
              const invited = u.registered === false;
              return (
                <View key={u.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: invited ? C.yl + '18' : (u.role === 'builder' || u.role === 'company_admin') ? C.gd + '22' : u.role === 'contractor' ? C.bl + '22' : C.gn + '22', alignItems: 'center', justifyContent: 'center' }}>
                      {invited ? (
                        <Text style={{ fontSize: 16, color: C.yl }}>@</Text>
                      ) : (
                        <Text style={{ fontSize: 13, fontWeight: '700', color: (u.role === 'builder' || u.role === 'company_admin') ? C.gd : u.role === 'contractor' ? C.bl : C.gn }}>
                          {(u.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      {invited ? (
                        <>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.yl }}>{u.username}</Text>
                          <Text style={{ fontSize: 11, color: C.dm, fontStyle: 'italic' }}>Invited — pending registration</Text>
                        </>
                      ) : (
                        <>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: C.textBold }}>{u.name}</Text>
                          <Text style={{ fontSize: 12, color: C.dm }}>{u.username}</Text>
                        </>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {roleBadge(u.role)}
                      <TouchableOpacity onPress={() => removeUser(u.id, invited ? u.username : u.name)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: C.rd + '18' }}
                        activeOpacity={0.7}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: C.rd }}>x</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {i < companyUsers.length - 1 && <View style={{ height: 1, backgroundColor: C.w06 }} />}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  // ── Companies List ──
  const renderCompaniesList = () => (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.textBold }}>Companies</Text>
          <TouchableOpacity onPress={() => setShowNewCompany(true)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: C.gd }}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>+ Add Company</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Search companies..." placeholderTextColor={C.ph}
          style={[sty.inp, { marginBottom: 0 }]}
        />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }}>
        {filteredCompanies.length === 0 && (
          <Text style={{ fontSize: 14, color: C.dm, textAlign: 'center', paddingVertical: 30 }}>
            {search ? 'No matching companies' : 'No companies yet'}
          </Text>
        )}
        {filteredCompanies.map(c => {
          const selected = selectedCompany?.id === c.id;
          return (
            <TouchableOpacity key={c.id} onPress={() => selectCompany(c)}
              style={[sty.card, selected && { borderColor: C.gd, borderWidth: 2 }, { marginBottom: 0 }]}
              activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.textBold }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: C.dm, marginTop: 3 }}>
                    {c.user_count} users · {c.project_count} projects
                  </Text>
                </View>
                {statusBadge(c.status)}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── New Company Modal ──
  const renderNewCompanyModal = () => (
    <Modal visible={showNewCompany} transparent animationType="fade">
      <View style={sty.modalBg}>
        <View style={sty.modalContent}>
          <View style={sty.modalHead}>
            <Text style={sty.modalTitle}>Add Company</Text>
            <TouchableOpacity onPress={() => { setShowNewCompany(false); setNewCompanyName(''); }}>
              <Text style={{ color: C.mt, fontSize: 28 }}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={sty.lbl}>COMPANY NAME</Text>
          <TextInput
            value={newCompanyName} onChangeText={setNewCompanyName}
            placeholder="e.g. Liberty Homes" placeholderTextColor={C.ph}
            style={sty.inp} autoFocus
            onSubmitEditing={createCompany}
          />
          <TouchableOpacity onPress={createCompany} disabled={!newCompanyName.trim() || saving}
            style={[sty.submitBtn, (!newCompanyName.trim() || saving) && { backgroundColor: C.dm }]}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.textBold, textAlign: 'center' }}>
              {saving ? 'Creating...' : 'Create Company'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const ROLE_OPTIONS = [
    { value: 'company_admin', label: 'Admin', color: C.gd },
    { value: 'builder', label: 'Builder / Employee', color: C.gd },
    { value: 'contractor', label: 'Subcontractor', color: C.bl },
    { value: 'customer', label: 'Customer / Homeowner', color: C.gn },
  ];

  // ── Invite User Modal ──
  const renderInviteModal = () => (
    <Modal visible={showInvite} transparent animationType="fade">
      <View style={sty.modalBg}>
        <View style={sty.modalContent}>
          <View style={sty.modalHead}>
            <Text style={sty.modalTitle}>Add User to {selectedCompany?.name}</Text>
            <TouchableOpacity onPress={() => { setShowInvite(false); setInviteEmail(''); setInviteRole('builder'); }}>
              <Text style={{ color: C.mt, fontSize: 28 }}>x</Text>
            </TouchableOpacity>
          </View>
          <Text style={sty.lbl}>EMAIL</Text>
          <TextInput
            value={inviteEmail} onChangeText={setInviteEmail}
            placeholder="user@example.com" placeholderTextColor={C.ph}
            style={sty.inp} autoFocus keyboardType="email-address" autoCapitalize="none"
          />
          <Text style={[sty.lbl, { marginTop: 16 }]}>ROLE</Text>
          <View style={{ gap: 8, marginBottom: 8 }}>
            {ROLE_OPTIONS.map(r => (
              <TouchableOpacity key={r.value} onPress={() => setInviteRole(r.value)}
                style={{
                  padding: 12, borderRadius: 8, borderWidth: 1,
                  borderColor: inviteRole === r.value ? r.color : C.w10,
                  backgroundColor: inviteRole === r.value ? r.color + '18' : 'transparent',
                }}
                activeOpacity={0.7}>
                <Text style={{
                  fontSize: 13, textAlign: 'center',
                  fontWeight: inviteRole === r.value ? '700' : '400',
                  color: inviteRole === r.value ? r.color : C.dm,
                }}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={inviteUser} disabled={!inviteEmail.trim().includes('@') || saving}
            style={[sty.submitBtn, (!inviteEmail.trim().includes('@') || saving) && { backgroundColor: C.dm }]}
            activeOpacity={0.7}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', textAlign: 'center' }}>
              {saving ? 'Adding...' : 'Add User'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.gd} />
      </View>
    );
  }

  // ── Main Layout ──
  const tabs = [
    { id: 'companies', label: 'Companies', count: companies.length },
    { id: 'pending', label: 'Pending', count: pendingUsers.length },
    { id: 'stats', label: 'Overview' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {renderNewCompanyModal()}
      {renderInviteModal()}

      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        backgroundColor: C.headerBg, borderBottomWidth: 1, borderBottomColor: C.w08,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>BS</Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.chromeTxt }}>BuilderSync Admin</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut}
          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' }}
          activeOpacity={0.7}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.rd }}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={{ flexDirection: 'row', backgroundColor: C.headerBg, borderBottomWidth: 1, borderBottomColor: C.w08, paddingHorizontal: 16 }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <TouchableOpacity key={t.id} onPress={() => { setTab(t.id); if (t.id !== 'companies') setSelectedCompany(null); }}
              style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: active ? C.gd : 'transparent' }}
              activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? C.gd : C.chromeDm }}>{t.label}</Text>
                {t.count > 0 && (
                  <View style={{ backgroundColor: t.id === 'pending' && t.count > 0 ? C.rd : C.w15, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: t.id === 'pending' && t.count > 0 ? '#fff' : C.chromeDm }}>{t.count}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {tab === 'stats' && renderStats()}
      {tab === 'pending' && renderPending()}
      {tab === 'companies' && (
        isWide ? (
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ width: 380, borderRightWidth: 1, borderRightColor: C.w08 }}>
              {renderCompaniesList()}
            </View>
            <View style={{ flex: 1 }}>
              {renderCompanyDetail()}
            </View>
          </View>
        ) : (
          selectedCompany ? renderCompanyDetail() : renderCompaniesList()
        )
      )}
    </View>
  );
}

const getStyles = (C) => StyleSheet.create({
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 14, padding: 16, marginBottom: 8 },
  inp: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 12, paddingHorizontal: 16, fontSize: 15, color: C.text },
  lbl: { fontSize: 11, fontWeight: '600', color: C.dm, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  submitBtn: { backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, marginTop: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: C.modalBg, borderRadius: 20, padding: 24, width: '90%', maxWidth: 460 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textBold },
});
