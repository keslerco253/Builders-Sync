import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { ThemeContext, API_BASE } from './context';
import { fPhone } from './currentProjectViewer';

const ROLES = [
  { value: 'builder', label: 'Builder / Employee', ckey: 'gd' },
  { value: 'contractor', label: 'Subcontractor', ckey: 'bl' },
  { value: 'customer', label: 'Customer / Homeowner', ckey: 'gn' },
];

export const Register = ({ navigation }) => {
  const C = React.useContext(ThemeContext);
  const styles = React.useMemo(() => getStyles(C), [C]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('builder');
  const [phone, setPhone] = useState('');
  const [trades, setTrades] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(username)) {
      Alert.alert('Error', 'Please enter a valid email');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.toLowerCase().trim(),
          password, firstName, lastName, companyName, role, phone, trades,
        }),
      });

      if (response.ok) {
        Alert.alert('Success', 'Registration complete! Please log in.');
        navigation.navigate('LoginScreen');
      } else {
        const err = await response.json();
        Alert.alert('Error', err.error || 'Registration failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.brandContainer}>
          <View style={styles.logoBox}><Text style={styles.logoIcon}>⬡</Text></View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join BuilderSync to manage your projects</Text>
        </View>

        <View style={styles.card}>

          {/* Role selector */}
          <Text style={styles.label}>ROLE</Text>
          <View style={styles.roleRow}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r.value}
                onPress={() => setRole(r.value)}
                style={[
                  styles.roleBtn,
                  role === r.value && { borderColor: C[r.ckey], backgroundColor: C[r.ckey] + '18' },
                ]}
              >
                <Text style={[styles.roleBtnTxt, role === r.value && { color: C[r.ckey], fontWeight: '700' }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} placeholder="you@company.com" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph}
              value={username} onChangeText={setUsername} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>FIRST NAME</Text>
              <TextInput style={styles.input} placeholder="First" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={firstName} onChangeText={setFirstName} />
            </View>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>LAST NAME</Text>
              <TextInput style={styles.input} placeholder="Last" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={lastName} onChangeText={setLastName} />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>COMPANY NAME</Text>
            <TextInput style={styles.input} placeholder="Your company (optional)" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={companyName} onChangeText={setCompanyName} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PHONE</Text>
            <TextInput style={styles.input} placeholder="(555) 555-5555" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={fPhone(phone)} onChangeText={v => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" />
          </View>

          {role === 'contractor' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>TRADES</Text>
              <TextInput style={styles.input} placeholder="Plumbing, Electrical..." placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={trades} onChangeText={setTrades} />
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PASSWORD (MIN 8)</Text>
            <TextInput style={styles.input} placeholder="Min 8 characters" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={password} onChangeText={setPassword} secureTextEntry />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor={C.mode === "light" ? "#999999" : C.ph} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          </View>

          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
            <Text style={styles.buttonText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityRow}>
          <Text style={{ fontSize: 12 }}>🔒</Text>
          <Text style={styles.securityText}>Your data is encrypted and secure</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (C) => {
  const isLight = C.mode === 'light';
  const bgColor = isLight ? C.sidebarBg : C.bg;
  const txtBold = isLight ? '#ffffff' : C.textBold;
  const txtMuted = isLight ? 'rgba(255,255,255,0.7)' : C.mt;
  const txtDim = isLight ? 'rgba(255,255,255,0.5)' : C.dm;
  const txtPh = isLight ? 'rgba(255,255,255,0.35)' : C.ph;
  const cardBg = isLight ? '#ffffff' : C.w04;
  const cardBd = isLight ? 'rgba(255,255,255,0.18)' : C.w08;
  const inpBg = isLight ? '#f5f6f8' : C.inputBg;
  const inpBd = isLight ? '#dde0e4' : C.w10;
  const cardTxt = isLight ? '#333333' : C.text;
  const cardTxtBold = isLight ? '#1a1a1a' : txtBold;
  const cardDim = isLight ? '#777777' : txtDim;
  const cardPh = isLight ? '#999999' : txtPh;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: bgColor },
  scrollContent: { padding: 24, paddingTop: Platform.OS === 'ios' ? 20 : 16, paddingBottom: 40, maxWidth: 480, width: '100%', alignSelf: 'center' },

  brandContainer: { alignItems: 'center', marginBottom: 28 },
  logoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: `0px 4px 8px ${C.gdD}66` },
  logoIcon: { fontSize: 22, color: txtBold, fontWeight: '700' },
  title: { fontSize: 24, fontWeight: '700', color: txtBold, letterSpacing: 0.3 },
  subtitle: { fontSize: 14, color: txtMuted, marginTop: 6 },

  card: { backgroundColor: cardBg, borderWidth: 1, borderColor: cardBd, borderRadius: 16, padding: 24 },

  roleRow: { flexDirection: 'column', gap: 8, marginBottom: 20 },
  roleBtn: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: isLight ? '#dde0e4' : inpBd, backgroundColor: isLight ? '#f9fafc' : C.w02 },
  roleBtnTxt: { fontSize: 13, color: isLight ? '#777777' : txtMuted, textAlign: 'center' },

  inputContainer: { marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: cardDim, letterSpacing: 1, marginBottom: 8 },
  input: { backgroundColor: inpBg, borderWidth: 1, borderColor: inpBd, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 15, color: cardTxt },

  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  divider: { height: 1, backgroundColor: isLight ? '#e2e5ea' : C.w06, marginVertical: 8, marginBottom: 20 },

  button: { backgroundColor: C.gd, paddingVertical: 15, borderRadius: 10, marginTop: 6, boxShadow: `0px 4px 8px ${C.gdD}4D` },
  buttonDisabled: { backgroundColor: C.dm, boxShadow: 'none' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 6 },
  securityText: { fontSize: 12, color: txtPh },
});
};

export default Register;
