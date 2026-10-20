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
          activeOpacity={0.78}
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.backButtonText}>← Catalog</Text>
        </TouchableOpacity>
        <Text style={styles.headerBadge}>MODEL CH-01 // PRO</Text>
      </View>

      <View style={styles.showcaseCard}>
        <Text style={styles.showcaseSpecCode}>45MM BERYLLIUM TRANSDUCER</Text>
        <Text style={styles.showcaseMonogram}>CH // 01</Text>
        <Text style={styles.showcaseTag}>48-HOUR BATTERY · DUAL USB-C LOSS-ZERO DAC</Text>
      </View>

      <View style={styles.detailsSection}>
        <View style={styles.titlePriceRow}>
          <Text style={styles.productTitle}>Chronos Studio Pro</Text>
          <Text style={styles.productPrice}>$349</Text>
        </View>
        <Text style={styles.productDescription}>
          Custom 45mm beryllium drivers paired with dual-chip room calibration and ultra-soft memory foam ear cushions.
        </Text>

        <View style={styles.specGrid}>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>-46 dB</Text>
            <Text style={styles.specLabel}>HYBRID ANC</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>24-bit</Text>
            <Text style={styles.specLabel}>96KHZ PCM</Text>
          </View>
          <View style={styles.specBox}>
            <Text style={styles.specValue}>265 g</Text>
            <Text style={styles.specLabel}>MACHINED TI</Text>
          </View>
        </View>

        <View style={styles.finishRow}>
          {(['Obsidian', 'Silver'] as const).map((finish) => (
            <TouchableOpacity
              key={finish}
              activeOpacity={0.78}
              style={
                selectedFinish === finish ? styles.finishPillActive : styles.finishPill
              }
              onPress={() => setSelectedFinish(finish)}
            >
              <Text style={styles.finishPillText}>{finish} Anodized</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        style={styles.buyButton}
        onPress={() => navigation.navigate('Checkout')}
      >
        <Text style={styles.buyButtonText}>Reserve Unit &amp; Express Checkout</Text>
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
    paddingHorizontal: 14,
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
  headerBadge: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  showcaseCard: {
    backgroundColor: '#11141C',
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  showcaseSpecCode: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  showcaseMonogram: {
    color: '#F8FAFC',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
  },
  showcaseTag: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  detailsSection: {
    gap: 12,
  },
  titlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  productTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  productPrice: {
    color: '#10B981',
    fontSize: 20,
    fontWeight: '700',
  },
  productDescription: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  specGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  specBox: {
    flex: 1,
    backgroundColor: '#11141C',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  specValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
  specLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  finishRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  finishPillActive: {
    flex: 1,
    backgroundColor: '#161A26',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  finishPill: {
    flex: 1,
    backgroundColor: '#11141C',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  finishPillText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  buyButton: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buyButtonText: {
    color: '#052E16',
    fontSize: 14,
    fontWeight: '700',
  },
});
