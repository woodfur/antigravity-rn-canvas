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
          style={styles.backButton}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <Text style={styles.backButtonText}>← Product</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Express Checkout</Text>
      </View>

      <View style={styles.orderCard}>
        <Text style={styles.sectionHeading}>ORDER SUMMARY</Text>
        <View style={styles.itemRow}>
          <View>
            <Text style={styles.itemName}>Chronos Studio Pro</Text>
            <Text style={styles.itemVariant}>Obsidian Finish · Qty 1</Text>
          </View>
          <Text style={styles.itemPrice}>$349.00</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Priority Air Shipping</Text>
          <Text style={styles.summaryFree}>FREE</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Estimated Tax</Text>
          <Text style={styles.summaryValue}>$28.80</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Due</Text>
          <Text style={styles.totalAmount}>$377.80</Text>
        </View>
      </View>

      <View style={styles.paymentCard}>
        <Text style={styles.sectionHeading}>PAYMENT METHOD</Text>
        <View style={styles.cardMethodRow}>
          <View style={styles.cardBrandBadge}>
            <Text style={styles.cardBrandText}>PAY</Text>
          </View>
          <View>
            <Text style={styles.cardNumber}>Google Pay ·••• 4829</Text>
            <Text style={styles.cardSub}>Biometric instant authorization</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.confirmButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.confirmButtonText}>Authorize $377.80 Now</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  backButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  backButtonText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  sectionHeading: {
    color: '#6366F1',
    fontSize: 11,
    fontWeight: '700',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  itemVariant: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  itemPrice: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
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
    fontSize: 13,
    fontWeight: '700',
  },
  summaryValue: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  totalAmount: {
    color: '#A5B4FC',
    fontSize: 20,
    fontWeight: '700',
  },
  paymentCard: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardBrandBadge: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cardBrandText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
