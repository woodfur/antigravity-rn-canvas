import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '../runtime/MockNavigationContext';

export default function ProductDetailScreen() {
  const navigation = useNavigation();
  const [selectedFinish, setSelectedFinish] = useState<'Obsidian' | 'Silver'>('Obsidian');

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerBadge}>FLAGSHIP AUDIO</Text>
      </View>

      <View style={styles.showcaseCard}>
        <Text style={styles.showcaseIcon}>🎧</Text>
        <Text style={styles.showcaseTag}>48-HOUR BATTERY · USB-C DAC</Text>
      </View>

      <View style={styles.detailsSection}>
        <Text style={styles.productTitle}>Chronos Studio Pro</Text>
        <Text style={styles.productPrice}>$349.00</Text>
        <Text style={styles.productDescription}>
          Custom 45mm beryllium drivers paired with dual-chip room calibration and ultra-soft memory foam ear cushions.
        </Text>

        <View style={styles.specGrid}>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>-46 dB</Text>
            <Text style={styles.specLabel}>Active ANC</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>24-bit</Text>
            <Text style={styles.specLabel}>Lossless</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>265 g</Text>
            <Text style={styles.specLabel}>Featherweight</Text>
          </View>
        </View>

        <View style={styles.finishRow}>
          {(['Obsidian', 'Silver'] as const).map((finish) => (
            <TouchableOpacity
              key={finish}
              style={
                selectedFinish === finish ? styles.finishPillActive : styles.finishPill
              }
              onPress={() => setSelectedFinish(finish)}
            >
              <Text style={styles.finishPillText}>{finish} Finish</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.buyButton}
        onPress={() => navigation.navigate('Checkout')}
      >
        <Text style={styles.buyButtonText}>Add to Bag & Checkout</Text>
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
    paddingHorizontal: 14,
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
  headerBadge: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
  },
  showcaseCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  showcaseIcon: {
    fontSize: 56,
  },
  showcaseTag: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  detailsSection: {
    gap: 12,
  },
  productTitle: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '700',
  },
  productPrice: {
    color: '#6366F1',
    fontSize: 20,
    fontWeight: '700',
  },
  productDescription: {
    color: '#94A3B8',
    fontSize: 14,
  },
  specGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  specBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  specValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  specLabel: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  finishRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  finishPillActive: {
    flex: 1,
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  finishPill: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  finishPillText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  buyButton: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#052E16',
    fontSize: 15,
    fontWeight: '700',
  },
});
