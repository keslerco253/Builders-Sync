import React, { useState, useEffect, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AuthContext, ThemeContext, DARK_COLORS, LIGHT_COLORS, API_BASE } from './context';
import { LoginScreen } from './login';
import { Register } from './register';
import Dashboard from './dashboard';
import UserManagement from './userManagement';
import AccountScreen from './account';

// Inject custom scrollbar styles on web (updated dynamically)
let scrollStyleEl = null;
function updateScrollbarCSS(isDark) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const track = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const thumb = isDark ? 'rgba(232,168,56,0.35)' : 'rgba(232,168,56,0.3)';
  const thumbH = isDark ? 'rgba(232,168,56,0.55)' : 'rgba(232,168,56,0.5)';
  const scrollCol = isDark ? `rgba(232,168,56,0.35) rgba(255,255,255,0.04)` : `rgba(232,168,56,0.3) rgba(0,0,0,0.04)`;
  const css = `
    * { scrollbar-width: thin; scrollbar-color: ${scrollCol}; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: ${track}; border-radius: 4px; }
    *::-webkit-scrollbar-thumb { background: ${thumb}; border-radius: 4px; min-height: 40px; }
    *::-webkit-scrollbar-thumb:hover { background: ${thumbH}; }
    *::-webkit-scrollbar-corner { background: transparent; }
  `;
  if (!scrollStyleEl) {
    scrollStyleEl = document.createElement('style');
    scrollStyleEl.id = 'bs-scrollbar';
    document.head.appendChild(scrollStyleEl);
  }
  scrollStyleEl.textContent = css;
}

const AuthStack = createStackNavigator();
const MainStack = createStackNavigator();

export default function RootLayout() {
  const [user, setUser] = useState(null);
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [themePreference, setThemePreference] = useState('system'); // 'system' | 'dark' | 'light'

  // Resolve actual theme from preference + system
  const themeMode = themePreference === 'system'
    ? (systemScheme === 'light' ? 'light' : 'dark')
    : themePreference;

  const C = themeMode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  // Update scrollbar CSS when theme changes
  useEffect(() => { updateScrollbarCSS(themeMode === 'dark'); }, [themeMode]);

  // Save theme preference to backend
  const saveThemePreference = async (pref, userId) => {
    const uid = userId || user?.id;
    if (!uid) return;
    try {
      await fetch(`${API_BASE}/users/${uid}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_preference: pref }),
      });
    } catch (e) { console.warn('Failed to save theme:', e); }
  };

  const authContext = useMemo(() => ({
    user,
    signin: (userData) => {
      setUser(userData);
      // Apply saved theme preference on login
      const pref = userData.theme_preference || 'system';
      setThemePreference(pref);
    },
    signout: () => { setUser(null); setThemePreference('system'); },
    updateUser: (updates) => setUser(prev => ({ ...prev, ...updates })),
  }), [user]);

  const themeContext = useMemo(() => ({
    ...C,
    themeMode,
    themePreference,
    setThemePreference: (pref) => {
      setThemePreference(pref);
      saveThemePreference(pref);
    },
    toggleTheme: () => {
      const next = themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system';
      setThemePreference(next);
      saveThemePreference(next);
    },
  }), [themeMode, themePreference, C, user?.id]);

  // Navigation theme
  const LightThemeBase = {
    dark: false,
    fonts: DarkTheme.fonts, // reuse same font config
    colors: {
      primary: 'rgb(0, 122, 255)',
      background: 'rgb(242, 242, 242)',
      card: 'rgb(255, 255, 255)',
      text: 'rgb(28, 28, 30)',
      border: 'rgb(216, 216, 216)',
      notification: 'rgb(255, 59, 48)',
    },
  };
  const navTheme = useMemo(() => ({
    ...(themeMode === 'dark' ? DarkTheme : LightThemeBase),
    fonts: DarkTheme.fonts,
    colors: {
      ...(themeMode === 'dark' ? DarkTheme : LightThemeBase).colors,
      primary: C.gd,
      background: C.bg,
      card: C.headerBg,
      text: C.text,
      border: C.bd,
      notification: C.gd,
    },
  }), [themeMode, C]);

  return (
    <AuthContext.Provider value={authContext}>
      <ThemeContext.Provider value={themeContext}>
        <ThemeProvider value={navTheme}>
          {user ? (
            <MainStack.Navigator
              screenOptions={{
                headerStyle: { backgroundColor: C.headerBg, elevation: 0, boxShadow: 'none' },
                headerTintColor: C.gd,
                headerTitleStyle: { color: C.chromeTxt, fontWeight: '600' },
                headerBackTitleVisible: false,
                cardStyle: { backgroundColor: C.bg, flex: 1, minHeight: 0 },
              }}
            >
              <MainStack.Screen
                name="Dashboard"
                component={Dashboard}
                options={{ headerShown: false }}
              />
              {user.role === 'builder' && (
                <MainStack.Screen
                  name="UserManagement"
                  component={UserManagement}
                  options={{ title: 'User Management' }}
                />
              )}
              <MainStack.Screen
                name="Account"
                component={AccountScreen}
                options={{ title: 'Account' }}
              />
            </MainStack.Navigator>
          ) : (
            <AuthStack.Navigator
              screenOptions={{
                headerShown: false,
                cardStyle: { backgroundColor: C.bg, flex: 1, minHeight: 0 },
              }}
            >
              <AuthStack.Screen name="LoginScreen" component={LoginScreen} options={{ title: 'Login' }} />
              <AuthStack.Screen
                name="Register"
                component={Register}
                options={{
                  headerShown: true,
                  headerStyle: { backgroundColor: C.headerBg, elevation: 0, boxShadow: 'none' },
                  headerTintColor: C.gd,
                  headerTitleStyle: { color: C.chromeTxt, fontWeight: '600' },
                  headerBackTitleVisible: false,
                }}
              />
            </AuthStack.Navigator>
          )}
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
