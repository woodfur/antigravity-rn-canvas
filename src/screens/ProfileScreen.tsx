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
        <Text style={styles.memberTier}>LEAD ACOUSTIC ENGINEER · TIER 01</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>14</Text>
          <Text style={styles.statCaption}>UNITS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>4,820</Text>
          <Text style={styles.statCaption}>CREDITS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>LAB</Text>
          <Text style={styles.statCaption}>ACCESS</Text>
        </View>
      </View>

      <View style={styles.menuList}>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.menuItem}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.menuItemTitle}>Reference Hardware Catalog</Text>
          <Text style={styles.menuItemArrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.menuItem}
          onPress={() => navigation.navigate('Checkout')}
        >
          <Text style={styles.menuItemTitle}>Active Allocation &amp; Settlement</Text>
          <Text style={styles.menuItemArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        style={styles.signOutButton}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.signOutText}>Terminate Studio Session</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
    padding: 20,
    justifyContent: 'space-between',
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 14,
    gap: 6,
  },
  avatarLarge: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: '#13161E',
    borderWidth: 1,
    borderColor: '#262D3D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarInitials: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  memberName: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  memberTier: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#11141C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  statNumber: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
  },
  statCaption: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  menuList: {
    gap: 10,
  },
  menuItem: {
    backgroundColor: '#11141C',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  menuItemTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemArrow: {
    color: '#38BDF8',
    fontSize: 15,
    fontWeight: '700',
  },
  signOutButton: {
    backgroundColor: '#16131A',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B1D2A',
  },
  signOutText: {
    color: '#FB7185',
    fontSize: 13,
    fontWeight: '600',
  },
});
