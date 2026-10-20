import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '../runtime/MockNavigationContext';

export default function CheckoutScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.backButton}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <Text style={styles.backButtonText}>← Spec Sheet</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispatch &amp; Settlement</Text>
      </View>

      <View style={styles.orderCard}>
        <Text style={styles.sectionHeading}>MANIFEST // ORDER #CH-8841</Text>
        <View style={styles.itemRow}>
          <View>
            <Text style={styles.itemName}>Chronos Studio Pro</Text>
            <Text style={styles.itemVariant}>Obsidian Anodized · Unit 01</Text>
          </View>
          <Text style={styles.itemPrice}>$349.00</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Priority Courier Dispatch</Text>
          <Text style={styles.summaryFree}>INCLUDED</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Import &amp; Acoustic Levy</Text>
          <Text style={styles.summaryValue}>$28.80</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Settlement</Text>
          <Text style={styles.totalAmount}>$377.80</Text>
        </View>
      </View>

      <View style={styles.paymentCard}>
        <Text style={styles.sectionHeading}>CRYPTOGRAPHIC AUTHORIZATION</Text>
        <View style={styles.cardMethodRow}>
          <View style={styles.cardBrandBadge}>
            <Text style={styles.cardBrandText}>G-PAY</Text>
          </View>
          <View>
            <Text style={styles.cardNumber}>Hardware Token ·••• 4829</Text>
            <Text style={styles.cardSub}>Biometric enclave signature ready</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        style={styles.confirmButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.confirmButtonText}>Authorize $377.80 Settlement</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  backButton: {
    backgroundColor: '#13161E',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222836',
  },
  backButtonText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  orderCard: {
    backgroundColor: '#11141C',
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  sectionHeading: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  itemVariant: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  itemPrice: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E2433',
    marginVertical: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 13,
  },
  summaryFree: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  summaryValue: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  totalAmount: {
    color: '#38BDF8',
    fontSize: 20,
    fontWeight: '700',
  },
  paymentCard: {
    backgroundColor: '#11141C',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  cardMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardBrandBadge: {
    backgroundColor: '#161A26',
    borderWidth: 1,
    borderColor: '#262D3D',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
  },
  cardBrandText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  cardNumber: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  cardSub: {
    color: '#64748B',
    fontSize: 12,
  },
  confirmButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#08090C',
    fontSize: 14,
    fontWeight: '700',
  },
});
