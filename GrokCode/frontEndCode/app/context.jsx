import React from 'react';

export const AuthContext = React.createContext();

// Replace with your actual backend URL
export const API_BASE = 'https://buildersync.net';

// Full color superset for both themes
export const DARK_COLORS = {
  mode: 'dark',
  bg: '#0f1923',
  card: 'rgba(255,255,255,0.04)',
  cardBg: '#1a2938',
  bd: 'rgba(255,255,255,0.06)',
  text: '#e0e8ef',
  textBold: '#ffffff',
  mt: '#7a8fa3',
  dm: '#6a7f92',
  chromeTxt: '#ffffff',
  chromeDm: '#7a8fa3',
  inputBg: 'rgba(255,255,255,0.05)',
  inputBd: 'rgba(255,255,255,0.1)',
  ph: '#4a6070',
  modalBg: '#1a2938',
  headerBg: '#0f1923',
  sidebarBg: 'rgba(15,25,35,0.6)',
  w02: 'rgba(255,255,255,0.02)',
  w03: 'rgba(255,255,255,0.03)',
  w04: 'rgba(255,255,255,0.04)',
  w06: 'rgba(255,255,255,0.06)',
  w08: 'rgba(255,255,255,0.08)',
  w10: 'rgba(255,255,255,0.10)',
  w12: 'rgba(255,255,255,0.12)',
  w15: 'rgba(255,255,255,0.15)',
  w20: 'rgba(255,255,255,0.20)',
  w40: 'rgba(255,255,255,0.40)',
  sw06: 'rgba(255,255,255,0.06)',
  sw10: 'rgba(255,255,255,0.10)',
  sw03: 'rgba(255,255,255,0.03)',
  gd: '#e8a838', gdD: '#d4832f',
  gn: '#10b981', gnB: '#34d399',
  bl: '#3b82f6', blB: '#60a5fa',
  yl: '#f59e0b', rd: '#ef4444', pp: '#8b5cf6',
  bH: 'rgba(232,168,56,0.3)', bH05: 'rgba(232,168,56,0.05)', bH08: 'rgba(232,168,56,0.08)', bH12: 'rgba(232,168,56,0.12)',
};

export const LIGHT_COLORS = {
  mode: 'light',
  bg: '#F9FAFC',
  card: '#ffffff',
  cardBg: '#ffffff',
  bd: '#e2e5ea',
  text: '#333333',
  textBold: '#1a1a1a',
  mt: '#555555',
  dm: '#777777',
  chromeTxt: '#ffffff',
  chromeDm: 'rgba(255,255,255,0.7)',
  inputBg: '#ffffff',
  inputBd: '#dde0e4',
  ph: '#999999',
  modalBg: '#ffffff',
  headerBg: '#2C3E50',
  sidebarBg: '#2C3E50',
  w02: 'rgba(0,0,0,0.02)',
  w03: 'rgba(0,0,0,0.03)',
  w04: 'rgba(0,0,0,0.04)',
  w06: 'rgba(0,0,0,0.06)',
  w08: 'rgba(0,0,0,0.08)',
  w10: 'rgba(0,0,0,0.10)',
  w12: 'rgba(0,0,0,0.12)',
  w15: 'rgba(0,0,0,0.15)',
  w20: 'rgba(0,0,0,0.20)',
  w40: 'rgba(0,0,0,0.40)',
  sw06: 'rgba(255,255,255,0.08)',
  sw10: 'rgba(255,255,255,0.12)',
  sw03: 'rgba(255,255,255,0.05)',
  gd: '#e8a838', gdD: '#d4832f',
  gn: '#27AE60', gnB: '#2ecc71',
  bl: '#3b82f6', blB: '#60a5fa',
  yl: '#f59e0b', rd: '#ef4444', pp: '#8b5cf6',
  bH: 'rgba(232,168,56,0.12)', bH05: 'rgba(232,168,56,0.05)', bH08: 'rgba(232,168,56,0.08)', bH12: 'rgba(232,168,56,0.12)',
};

// ThemeContext with DARK_COLORS as default (defined after color constants)
export const ThemeContext = React.createContext({
  ...DARK_COLORS,
  themeMode: 'dark',
  themePreference: 'system',
  setThemePreference: () => {},
  toggleTheme: () => {},
});

// Default export required by expo-router (this file is not a route)
export default function ContextPlaceholder() { return null; }
