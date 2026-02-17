import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { AuthContext, ThemeContext, API_BASE } from './context';

export const LoginScreen = ({ navigation }) => {
  const C = React.useContext(ThemeContext);
  const styles = React.useMemo(() => getStyles(C), [C]);
  const { signin } = React.useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(username)) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        // Store full user object (matches buildersync pattern)
        signin(data.user);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Logo & Branding */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoIcon}>⬡</Text>
          </View>
          <Text style={styles.brandName}>BuilderSync</Text>
          <Text style={styles.brandTagline}>Construction Project Management</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={C.mode === "light" ? "#999999" : C.ph}
              value={username}
              onChangeText={(v) => { setUsername(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter password"
                placeholderTextColor={C.mode === "light" ? "#999999" : C.ph}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeText}>{showPassword ? '◉' : '◎'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>
              Don't have an account? <Text style={styles.linkBold}>Register</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Security badge */}
        <View style={styles.securityRow}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.securityText}>256-bit SSL Encrypted · SOC 2 Compliant</Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const getStyles = (C) => {
  // In light mode, login uses dark navy background like the sidebar
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
  scrollContent: { padding: 24, paddingTop: Platform.OS === 'ios' ? 80 : 60, flexGrow: 1, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' },

  brandContainer: { alignItems: 'center', marginBottom: 36 },
  logoBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.gd, alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: `0px 4px 8px ${C.gdD}66` },
  logoIcon: { fontSize: 26, color: txtBold, fontWeight: '700' },
  brandName: { fontSize: 30, fontWeight: '700', color: txtBold, letterSpacing: 0.5 },
  brandTagline: { fontSize: 14, color: txtMuted, marginTop: 4 },

  card: { backgroundColor: cardBg, borderWidth: 1, borderColor: cardBd, borderRadius: 16, padding: 28 },
  title: { fontSize: 20, fontWeight: '600', color: cardTxtBold, marginBottom: 24 },

  errorBox: { padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16 },
  errorText: { color: C.rd, fontSize: 13 },

  inputContainer: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: '600', color: cardDim, letterSpacing: 1, marginBottom: 8 },
  input: { backgroundColor: inpBg, borderWidth: 1, borderColor: inpBd, borderRadius: 10, padding: 14, paddingHorizontal: 16, fontSize: 15, color: cardTxt },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  eyeText: { fontSize: 18, color: cardDim },

  button: { backgroundColor: C.gd, paddingVertical: 15, borderRadius: 10, marginTop: 8, boxShadow: `0px 4px 8px ${C.gdD}4D` },
  buttonDisabled: { backgroundColor: C.dm, boxShadow: 'none' },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },

  link: { textAlign: 'center', color: isLight ? '#777777' : txtMuted, marginTop: 22, fontSize: 14 },
  linkBold: { color: C.gd, fontWeight: '600' },

  securityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, gap: 6 },
  lockIcon: { fontSize: 12 },
  securityText: { fontSize: 12, color: txtPh },
});
};

export default LoginScreen;
