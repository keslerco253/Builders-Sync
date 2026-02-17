import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext, ThemeContext, API_BASE } from './context';

const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
const rG = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.bl : C.gn;
const rBg = (r, C) => r === 'builder' ? C.gd + '22' : r === 'contractor' ? C.bl + '22' : C.gn + '22';
const rCl = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.blB : C.gnB;

const Lbl = ({ children }) => { const C = React.useContext(ThemeContext); const st = React.useMemo(() => getStyles(C), [C]); return <Text style={st.lbl}>{children}</Text>; };
const Inp = ({ label, value, onChange, placeholder, type, style: ss }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  return (
  <View style={[{ marginBottom: 14 }, ss]}>
    {label && <Lbl>{label}</Lbl>}
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={C.ph} secureTextEntry={type === 'password'}
      keyboardType={type === 'email' ? 'email-address' : 'default'} autoCapitalize="none"
      style={st.inp} />
  </View>
  );
};
const ModalSheet = ({ visible, onClose, title, children }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  return (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={st.modalBg}>
        <View style={st.modalContent}>
          <View style={st.modalHead}>
            <Text style={st.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: C.mt, fontSize: 28 }}>×</Text></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>
  );
};

export default function UserManagement() {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const { user } = React.useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'adduser' | { type:'resetpw', data:user }

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`);
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (e) { console.warn(e); } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { fetchUsers(); }, []));

  const toggleActive = async (u) => {
    try {
      const res = await fetch(`${API_BASE}/users/${u.id}/toggle-active`, { method: 'PUT' });
      const updated = await res.json();
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x));
      Alert.alert('Done', updated.active ? 'User reactivated' : 'User deactivated');
    } catch (e) { Alert.alert('Error', e.message); }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.gd} size="large" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Add User Modal */}
      {modal === 'adduser' && <AddUserModal onClose={() => setModal(null)} onCreated={(u) => { setUsers(prev => [...prev, u]); setModal(null); Alert.alert('Success', `${u.name} added`); }} />}

      {/* Reset Password Modal */}
      {modal?.type === 'resetpw' && <ResetPasswordModal user={modal.data} onClose={() => setModal(null)} onReset={() => { setModal(null); Alert.alert('Success', 'Password reset'); }} />}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold }}>Users</Text>
          <TouchableOpacity onPress={() => setModal('adduser')} style={st.addBtn}>
            <Text style={{ color: C.textBold, fontSize: 14, fontWeight: '700' }}>+ Add User</Text>
          </TouchableOpacity>
        </View>

        {users.map(u => (
          <View key={u.id} style={[st.userCard, !u.active && { opacity: 0.5 }]}>
            <View style={[st.userAvatar, { backgroundColor: rG(u.role, C) }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.textBold }}>{ini(u.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>
                {u.name}{!u.active && <Text style={{ color: C.rd }}> (inactive)</Text>}
              </Text>
              <Text style={{ fontSize: 12, color: C.mt, marginTop: 2 }} numberOfLines={1}>
                {u.username}{u.company_name ? ` · ${u.company_name}` : ''}{u.phone ? ` · ${u.phone}` : ''}
              </Text>
            </View>
            <View style={[st.roleBadge, { backgroundColor: rBg(u.role, C) }]}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: rCl(u.role, C), textTransform: 'uppercase' }}>{u.role}</Text>
            </View>
            <TouchableOpacity onPress={() => setModal({ type: 'resetpw', data: u })} style={st.iconBtn}>
              <Text style={{ fontSize: 14 }}>🔑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => toggleActive(u)} style={st.iconBtn}>
              <Text style={{ fontSize: 14, color: u.active ? C.rd : C.gn }}>{u.active ? '⊘' : '✓'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// Add User Modal
const AddUserModal = ({ onClose, onCreated }) => {
  const [f, sF] = useState({ email: '', password: '', name: '', firstName: '', lastName: '', role: 'contractor', company: '', phone: '', trades: '' });
  const [err, sErr] = useState('');
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!f.firstName || !f.lastName || !f.email || !f.password) return sErr('Name, email, password required');
    if (f.password.length < 8) return sErr('Password min 8 characters');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: f.email.toLowerCase().trim(), password: f.password,
          firstName: f.firstName, lastName: f.lastName,
          companyName: f.company, role: f.role, phone: f.phone, trades: f.trades,
        }),
      });
      if (!res.ok) { const d = await res.json(); sErr(d.error || 'Failed'); setLoading(false); return; }
      const newUser = await res.json();
      onCreated(newUser);
    } catch (e) { sErr(e.message); } finally { setLoading(false); }
  };

  const ROLES = [
    { value: 'builder', label: 'Builder / Employee' },
    { value: 'contractor', label: 'Subcontractor' },
    { value: 'customer', label: 'Customer / Homeowner' },
  ];

  return (
    <ModalSheet visible title="Add New User" onClose={onClose}>
      {err ? <View style={st.errBox}><Text style={{ color: C.rd, fontSize: 13 }}>{err}</Text></View> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Inp label="FIRST NAME" value={f.firstName} onChange={v => sF({ ...f, firstName: v })} placeholder="Jane" style={{ flex: 1 }} />
        <Inp label="LAST NAME" value={f.lastName} onChange={v => sF({ ...f, lastName: v })} placeholder="Smith" style={{ flex: 1 }} />
      </View>
      <Inp label="EMAIL" value={f.email} onChange={v => sF({ ...f, email: v })} type="email" placeholder="jane@company.com" />
      <Inp label="PASSWORD (MIN 8)" value={f.password} onChange={v => sF({ ...f, password: v })} type="password" placeholder="Secure password" />
      <Lbl>ROLE</Lbl>
      <View style={{ marginBottom: 14 }}>
        {ROLES.map(r => (
          <TouchableOpacity key={r.value} onPress={() => sF({ ...f, role: r.value })}
            style={[st.roleOpt, f.role === r.value && { borderColor: rCl(r.value, C), backgroundColor: rBg(r.value, C) }]}>
            <Text style={[{ fontSize: 13, color: C.mt }, f.role === r.value && { color: rCl(r.value, C), fontWeight: '600' }]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Inp label="COMPANY" value={f.company} onChange={v => sF({ ...f, company: v })} placeholder="Optional" />
      <Inp label="PHONE" value={f.phone} onChange={v => sF({ ...f, phone: v })} placeholder="Optional" />
      {f.role === 'contractor' && <Inp label="TRADES" value={f.trades} onChange={v => sF({ ...f, trades: v })} placeholder="Plumbing, Electrical..." />}
      <TouchableOpacity onPress={create} disabled={loading} style={[st.addBtn, { width: '100%', paddingVertical: 14, marginTop: 4 }, loading && { backgroundColor: C.dm }]}>
        <Text style={{ color: C.textBold, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{loading ? 'Creating...' : 'Create User'}</Text>
      </TouchableOpacity>
    </ModalSheet>
  );
};

// Reset Password Modal
const ResetPasswordModal = ({ user: targetUser, onClose, onReset }) => {
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = async () => {
    if (pw.length < 8) return Alert.alert('Error', 'Min 8 characters');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/${targetUser.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) onReset();
      else Alert.alert('Error', 'Reset failed');
    } catch (e) { Alert.alert('Error', e.message); } finally { setLoading(false); }
  };

  return (
    <ModalSheet visible title={`Reset Password — ${targetUser.name}`} onClose={onClose}>
      <Text style={{ fontSize: 13, color: C.mt, marginBottom: 16 }}>Enter a new password for this user.</Text>
      <Inp label="NEW PASSWORD (MIN 8)" value={pw} onChange={setPw} type="password" placeholder="New password" />
      <TouchableOpacity onPress={reset} disabled={pw.length < 8 || loading}
        style={[st.addBtn, { width: '100%', paddingVertical: 14 }, (pw.length < 8 || loading) && { backgroundColor: C.dm }]}>
        <Text style={{ color: C.textBold, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{loading ? 'Resetting...' : 'Reset Password'}</Text>
      </TouchableOpacity>
    </ModalSheet>
  );
};

const getStyles = (C) => StyleSheet.create({
  lbl: { fontSize: 11, fontWeight: '600', color: C.dm, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  inp: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 15, color: C.text },
  addBtn: { backgroundColor: C.gd, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' },
  userCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  iconBtn: { padding: 6, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w08, borderRadius: 6 },
  errBox: { padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16 },
  roleOpt: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: C.w10, marginBottom: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: C.modalBg, borderRadius: 20, padding: 24, maxHeight: '90%', width: '90%', maxWidth: 560 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textBold },
});
