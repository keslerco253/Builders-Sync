// app/(tabs)/newProjects.jsx   (or screens/NewProjectScreen.js)

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const NewProjects = () => {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Basic validation
    if (!name.trim() || !number.trim() || !email.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('https://buildersync.net', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          number: number.trim(),
          email: email.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        Alert.alert('Success', 'Project created successfully!');
        // Clear form
        setName('');
        setNumber('');
        setEmail('');
      } else {
        const errorData = await response.json();
        Alert.alert('Error', errorData.error || 'Failed to create project');
      }
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Connection Error', 'Could not reach the server. Check your WiFi and IP address.');
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
        <View style={styles.header}>
          <Text style={styles.title}>New Project</Text>
          <Text style={styles.subtitle}>Set up a new construction project</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>PROJECT NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Parker Residence"
              placeholderTextColor="#4a6070"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>PROJECT NUMBER</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., PRJ-2026-042"
              placeholderTextColor="#4a6070"
              value={number}
              onChangeText={setNumber}
              keyboardType="default"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>CLIENT EMAIL</Text>
            <TextInput
              style={styles.input}
              placeholder="client@email.com"
              placeholderTextColor="#4a6070"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating Project...' : 'Create Project'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
  },
  scrollContent: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#7a8fa3',
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  inputContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6a7f92',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#e0e8ef',
  },
  button: {
    backgroundColor: '#e8a838',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 6,
    shadowColor: '#d4832f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: '#6a7f92',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default NewProjects;