import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '../runtime/MockNavigationContext';

export default function HomeScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<'Featured' | 'Hardware' | 'Audio'>('Featured');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greetingLabel}>CHRONOS ACOUSTIC DIVISION</Text>
          <Text style={styles.headerTitle}>Reference Hardware</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.avatarButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.avatarButtonText}>AX</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroBanner}>
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroBadge}>SERIES 04 // BERYLLIUM</Text>
          <Text style={styles.heroSerial}>48H DAC</Text>
        </View>
        <Text style={styles.heroTitle}>Chronos Spatial Studio Reference</Text>
        <Text style={styles.heroSubtitle}>
          Planar-magnetic acoustic architecture with zero-latency DSP room calibration.
        </Text>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.heroCta}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <Text style={styles.heroCtaText}>Inspect Spec Sheet — $349</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.categoryRow}>
        {(['Featured', 'Hardware', 'Audio'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
            activeOpacity={0.78}
            style={activeTab === cat ? styles.categoryPillActive : styles.categoryPill}
            onPress={() => setActiveTab(cat)}
          >
            <Text
              style={
                activeTab === cat ? styles.categoryTextActive : styles.categoryText
              }
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.productList}>
        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.productCard}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <View style={styles.productIconBox}>
            <Text style={styles.productMonogram}>CH-01</Text>
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>Chronos Studio Pro</Text>
            <Text style={styles.productMeta}>45mm Beryllium · Titanium Matte</Text>
          </View>
          <Text style={styles.productPrice}>$349</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.78}
          style={styles.productCard}
          onPress={() => navigation.navigate('Checkout')}
        >
          <View style={styles.productIconBoxAlt}>
            <Text style={styles.productMonogramAlt}>KS-75</Text>
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>Keystone Field Controller</Text>
            <Text style={styles.productMeta}>CNC Aluminum · Optical Hall Switches</Text>
          </View>
          <Text style={styles.productPrice}>$219</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  greetingLabel: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#13161E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#222836',
  },
  avatarButtonText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  heroBanner: {
    backgroundColor: '#11141C',
    borderRadius: 16,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#262D3D',
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  heroSerial: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  heroCta: {
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  heroCtaText: {
    color: '#08090C',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPillActive: {
    backgroundColor: '#191D28',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  categoryPill: {
    backgroundColor: '#11141C',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  categoryTextActive: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  productList: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#11141C',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#1E2433',
  },
  productIconBox: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#161A26',
    borderWidth: 1,
    borderColor: '#262D3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconBoxAlt: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#131720',
    borderWidth: 1,
    borderColor: '#222836',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productMonogram: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  productMonogramAlt: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  productInfo: {
    flex: 1,
    gap: 3,
  },
  productName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
  },
  productMeta: {
    color: '#64748B',
    fontSize: 12,
  },
  productPrice: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
  },
});
