import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '../runtime/MockNavigationContext';

export default function LoginScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('alex@zelune.studio');
  const [password, setPassword] = useState('••••••••••••');

  return (
    <View style={styles.container}>
      <View style={styles.brandSection}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>CH//01</Text>
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Authenticate to access Chronos Acoustic Lab &amp; hardware telemetry
        </Text>
      </View>

      <View style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>OPERATOR ID / EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="operator@chronos.audio"
            placeholderTextColor="#64748B"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>SECURITY KEY</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#64748B"
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.primaryButtonText}>Enter Acoustic Studio</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.secondaryButtonText}>Hardware Passkey Handshake</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerHint}>SYS-AUTH · ENCRYPTED SESSION 256-GCM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
    paddingHorizontal: 24,
    paddingVertical: 38,
    justifyContent: 'space-between',
  },
  brandSection: {
    marginTop: 22,
    gap: 10,
  },
  logoBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#13161E',
    borderWidth: 1,
    borderColor: '#262D3D',
    marginBottom: 6,
  },
  logoText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: '#11141C',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#08090C',
    borderWidth: 1,
    borderColor: '#222836',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#F8FAFC',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#08090C',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#161A24',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  footerRow: {
    alignItems: 'center',
    paddingBottom: 6,
  },
  footerHint: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
