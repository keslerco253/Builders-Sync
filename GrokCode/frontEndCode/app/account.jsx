import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { AuthContext, ThemeContext, API_BASE, apiFetch } from './context';
import { fPhone } from './currentProjectViewer';

const ini = n => n?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
const rG = (r, C) => r === 'builder' ? C.gd : r === 'contractor' ? C.bl : C.gn;

export default function AccountScreen() {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const { user, signout, updateUser } = React.useContext(AuthContext);
  const [showPwModal, setShowPwModal] = useState(false);
  const [logo, setLogo] = useState(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editEmail, setEditEmail] = useState(user?.username || '');
  const [editCompany, setEditCompany] = useState(user?.company_name || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const isBuilder = user?.role === 'builder' || user?.role === 'company_admin';

  const startEditing = () => {
    setEditEmail(user?.username || '');
    setEditCompany(user?.company_name || '');
    setEditPhone(user?.phone || '');
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editEmail.trim(),
          companyName: editCompany.trim(),
          phone: editPhone.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        updateUser({ username: updated.username, company_name: updated.company_name, phone: updated.phone });
        setEditing(false);
        Alert.alert('Success', 'Profile updated!');
      } else {
        const err = await res.json().catch(() => ({}));
        Alert.alert('Error', err.error || 'Failed to update profile');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  // Fetch logo on mount
  useEffect(() => {
    if (!user?.id) return;
    apiFetch(`/users/${user.id}/logo`)
      .then(r => r.json())
      .then(data => { if (data.logo) setLogo(data.logo); })
      .catch(() => {});
  }, [user?.id]);

  const pickLogo = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          Alert.alert('Error', 'Image must be under 2MB');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = reader.result;
          uploadLogo(b64);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  const uploadLogo = async (b64) => {
    setLogoLoading(true);
    try {
      const res = await apiFetch(`/users/${user.id}/logo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: b64 }),
      });
      if (res.ok) {
        setLogo(b64);
        updateUser({ has_logo: true });
        Alert.alert('Success', 'Logo updated!');
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLogoLoading(false); }
  };

  const removeLogo = async () => {
    const doRemove = async () => {
      setLogoLoading(true);
      try {
        await apiFetch(`/users/${user.id}/logo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: '' }),
        });
        setLogo(null);
        updateUser({ has_logo: false });
      } catch (e) { Alert.alert('Error', e.message); }
      finally { setLogoLoading(false); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Remove company logo?')) doRemove();
    } else {
      Alert.alert('Remove Logo', 'Remove your company logo?', [
        { text: 'Cancel' },
        { text: 'Remove', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) signout();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signout },
      ]);
    }
  };

  const readOnlyRows = [
    ['Role', user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)],
    ['Trades', user?.trades],
  ].filter(([, v]) => v);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {showPwModal && <ChangePasswordModal userId={user?.id} onClose={() => setShowPwModal(false)} />}

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        {/* Profile card */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={[st.bigAvatar, { backgroundColor: rG(user?.role, C) }]}>
            <Text style={st.bigAvatarTxt}>{ini(user?.name)}</Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '700', color: C.textBold, marginTop: 12 }}>{user?.name}</Text>
          <View style={[st.rolePill, { backgroundColor: rG(user?.role, C) + '22' }]}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: rG(user?.role, C), textTransform: 'uppercase' }}>{user?.role}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={st.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={[st.cardTitle, { marginBottom: 0 }]}>Account Information</Text>
            {!editing && (
              <TouchableOpacity onPress={startEditing} activeOpacity={0.7}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.gd + '18' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.gd }}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>

          {editing ? (
            <View>
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>EMAIL</Text>
                <TextInput value={editEmail} onChangeText={setEditEmail} placeholder="Email address"
                  placeholderTextColor={C.ph} keyboardType="email-address" autoCapitalize="none" style={st.inp} />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>COMPANY</Text>
                <TextInput value={editCompany} onChangeText={setEditCompany} placeholder="Company name"
                  placeholderTextColor={C.ph} style={st.inp} />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>PHONE</Text>
                <TextInput value={editPhone} onChangeText={setEditPhone} placeholder="Phone number"
                  placeholderTextColor={C.ph} keyboardType="phone-pad" style={st.inp} />
              </View>
              {readOnlyRows.map(([label, val], i) => (
                <View key={label}>
                  <View style={st.infoRow}>
                    <Text style={st.infoLbl}>{label.toUpperCase()}</Text>
                    <Text style={st.infoVal}>{val}</Text>
                  </View>
                  {i < readOnlyRows.length - 1 && <View style={st.divider} />}
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity onPress={cancelEditing} disabled={saving}
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.w15, alignItems: 'center' }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.mt }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveProfile} disabled={saving}
                  style={[st.submitBtn, { flex: 1, marginTop: 0 }, saving && { backgroundColor: C.dm }]}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.textBold, textAlign: 'center' }}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {[
                ['Email', user?.username],
                ['Company', user?.company_name],
                ['Phone', user?.phone ? fPhone(user.phone) : null],
                ...readOnlyRows,
              ].filter(([, v]) => v).map(([label, val], i, arr) => (
                <View key={label}>
                  <View style={st.infoRow}>
                    <Text style={st.infoLbl}>{label.toUpperCase()}</Text>
                    <Text style={st.infoVal}>{val}</Text>
                  </View>
                  {i < arr.length - 1 && <View style={st.divider} />}
                </View>
              ))}
            </>
          )}
        </View>

        {/* Company Logo — company admin only */}
        {user?.role === 'company_admin' && (
          <View style={st.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{ fontSize: 20 }}>🖼</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: C.textBold }}>Company Logo</Text>
                <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>Displayed in the dashboard header</Text>
              </View>
            </View>

            {logo ? (
              <View style={{ alignItems: 'center', gap: 14 }}>
                <View style={{
                  backgroundColor: C.w06, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.w10,
                  width: '100%', alignItems: 'center',
                }}>
                  <Image source={{ uri: logo }} style={{ width: 200, height: 80, resizeMode: 'contain' }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity onPress={pickLogo} disabled={logoLoading}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.gd, alignItems: 'center' }}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gd }}>
                      {logoLoading ? 'Uploading...' : 'Change Logo'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={removeLogo} disabled={logoLoading}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.rd, alignItems: 'center' }}
                    activeOpacity={0.7}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.rd }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={pickLogo} disabled={logoLoading}
                style={{
                  borderWidth: 2, borderColor: C.w10, borderStyle: 'dashed', borderRadius: 12,
                  padding: 28, alignItems: 'center', gap: 8, backgroundColor: C.w03,
                }}
                activeOpacity={0.7}>
                <Text style={{ fontSize: 32 }}>📤</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>
                  {logoLoading ? 'Uploading...' : 'Upload Company Logo'}
                </Text>
                <Text style={{ fontSize: 11, color: C.dm }}>PNG, JPG, or SVG · Max 2MB</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity onPress={() => setShowPwModal(true)} style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Text style={{ fontSize: 20 }}>🔑</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>Change Password</Text>
            <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>Update your login credentials</Text>
          </View>
          <Text style={{ fontSize: 18, color: C.dm }}>›</Text>
        </TouchableOpacity>

        {/* Theme Selector */}
        <View style={[st.card, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 20 }}>{C.themePreference === 'system' ? '💻' : C.mode === 'dark' ? '🌙' : '☀️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: C.text }}>Appearance</Text>
              <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>
                {C.themePreference === 'system' ? 'Following system' : C.mode === 'dark' ? 'Dark mode' : 'Light mode'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[['system', '💻', 'System'], ['light', '☀️', 'Light'], ['dark', '🌙', 'Dark']].map(([val, icon, label]) => {
              const on = C.themePreference === val;
              return (
                <TouchableOpacity key={val} onPress={() => C.setThemePreference(val)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: on ? 2 : 1, borderColor: on ? C.gd : C.w10, backgroundColor: on ? C.gd + '18' : 'transparent' }}
                  activeOpacity={0.7}>
                  <Text style={{ fontSize: 14 }}>{icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: on ? '600' : '400', color: on ? C.gd : C.mt }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity onPress={handleSignOut} style={[st.card, { flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'rgba(239,68,68,0.15)' }]}>
          <Text style={{ fontSize: 20 }}>🚪</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: C.rd }}>Sign Out</Text>
            <Text style={{ fontSize: 12, color: C.dm, marginTop: 2 }}>Log out of BuilderSync</Text>
          </View>
          <Text style={{ fontSize: 18, color: C.dm }}>›</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <View style={[st.logoBox]}><Text style={{ fontSize: 14, color: C.textBold, fontWeight: '700' }}>⬡</Text></View>
          <Text style={{ fontSize: 11, color: C.dm, marginTop: 8 }}>BuilderSync v1.0</Text>
          <Text style={{ fontSize: 11, color: C.ph, marginTop: 2 }}>Construction Project Management</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// Change Password Modal
const ChangePasswordModal = ({ userId, onClose }) => {
  const C = React.useContext(ThemeContext);
  const st = React.useMemo(() => getStyles(C), [C]);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [conf, setConf] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!cur) return setErr('Enter current password');
    if (np.length < 8) return setErr('New password must be 8+ characters');
    if (np !== conf) return setErr("Passwords don't match");
    setLoading(true);
    try {
      const res = await apiFetch(`/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, current_password: cur, new_password: np }),
      });
      const data = await res.json();
      if (res.ok) { Alert.alert('Success', 'Password changed!'); onClose(); }
      else setErr(data.error || 'Failed');
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal visible animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.modalBg}>
          <View style={st.modalContent}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={onClose}><Text style={{ color: C.mt, fontSize: 28 }}>×</Text></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {err ? <View style={st.errBox}><Text style={{ color: C.rd, fontSize: 13 }}>{err}</Text></View> : null}
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>CURRENT PASSWORD</Text>
                <TextInput value={cur} onChangeText={v => { setCur(v); setErr(''); }} placeholder="Current password"
                  placeholderTextColor={C.ph} secureTextEntry style={st.inp} />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>NEW PASSWORD (MIN 8)</Text>
                <TextInput value={np} onChangeText={v => { setNp(v); setErr(''); }} placeholder="New password"
                  placeholderTextColor={C.ph} secureTextEntry style={st.inp} />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={st.lbl}>CONFIRM</Text>
                <TextInput value={conf} onChangeText={v => { setConf(v); setErr(''); }} placeholder="Confirm new password"
                  placeholderTextColor={C.ph} secureTextEntry style={st.inp} />
              </View>
              <TouchableOpacity onPress={submit} disabled={!cur || !np || !conf || loading}
                style={[st.submitBtn, (!cur || !np || !conf || loading) && { backgroundColor: C.dm }]}>
                <Text style={{ color: C.textBold, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (C) => StyleSheet.create({
  bigAvatar: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 4px 8px ${C.gdD}66` },
  bigAvatarTxt: { fontSize: 28, fontWeight: '700', color: C.textBold },
  rolePill: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  logoBox: { width: 28, height: 28, borderRadius: 7, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.bd, borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.textBold, marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  infoLbl: { fontSize: 11, fontWeight: '600', color: C.dm, letterSpacing: 0.8 },
  infoVal: { fontSize: 15, fontWeight: '500', color: C.text, textAlign: 'right', flex: 1, marginLeft: 16 },
  divider: { height: 1, backgroundColor: C.w06, marginVertical: 12 },

  lbl: { fontSize: 11, fontWeight: '600', color: C.dm, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  inp: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.w10, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 15, color: C.text },
  submitBtn: { backgroundColor: C.gd, paddingVertical: 14, borderRadius: 10, marginTop: 4 },
  errBox: { padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16 },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: C.modalBg, borderRadius: 20, padding: 24, maxHeight: '85%', width: '90%', maxWidth: 560 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.textBold },
});
