import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '../runtime/MockNavigationContext';

export default function ProfileScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarInitials}>AX</Text>
        </View>
        <Text style={styles.memberName}>Alex Mercer</Text>
        <Text style={styles.memberTier}>Antigravity Pro Founding Member</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>14</Text>
          <Text style={styles.statCaption}>Orders</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>4,820</Text>
          <Text style={styles.statCaption}>Points</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>VIP</Text>
          <Text style={styles.statCaption}>Tier</Text>
        </View>
      </View>

      <View style={styles.menuList}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.menuItemTitle}>Browse Hardware Store</Text>
          <Text style={styles.menuItemArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.menuItemTitle}>Active Cart & Express Pay</Text>
          <Text style={styles.menuItemArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.signOutText}>Sign Out of Account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    padding: 20,
    justifyContent: 'space-between',
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  memberName: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  memberTier: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statNumber: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  statCaption: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  menuList: {
    gap: 10,
  },
  menuItem: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  menuItemTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemArrow: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '600',
  },
});
