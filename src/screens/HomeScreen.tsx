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
          <Text style={styles.greetingLabel}>GOOD MORNING</Text>
          <Text style={styles.headerTitle}>Discover Gear</Text>
        </View>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Text style={styles.avatarButtonText}>AX</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroBanner}>
        <Text style={styles.heroBadge}>NEW RELEASE</Text>
        <Text style={styles.heroTitle}>Chronos Spatial Studio Headphones</Text>
        <Text style={styles.heroSubtitle}>
          Lossless acoustic engineering with adaptive neural cancellation.
        </Text>
        <TouchableOpacity
          style={styles.heroCta}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <Text style={styles.heroCtaText}>Explore Flagship — $349</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.categoryRow}>
        {(['Featured', 'Hardware', 'Audio'] as const).map((cat) => (
          <TouchableOpacity
            key={cat}
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
          style={styles.productCard}
          onPress={() => navigation.navigate('ProductDetail')}
        >
          <View style={styles.productIconBox}>
            <Text style={styles.productEmoji}>🎧</Text>
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>Chronos Studio Pro</Text>
            <Text style={styles.productMeta}>Titanium Matte · In Stock</Text>
          </View>
          <Text style={styles.productPrice}>$349</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.productCard}
          onPress={() => navigation.navigate('Checkout')}
        >
          <View style={styles.productIconBoxAlt}>
            <Text style={styles.productEmoji}>⌨️</Text>
          </View>
          <View style={styles.productInfo}>
            <Text style={styles.productName}>Keystone Low-Profile 75</Text>
            <Text style={styles.productMeta}>Tactile Optical · Express Ship</Text>
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
    backgroundColor: '#090D16',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  greetingLabel: {
    color: '#6366F1',
    fontSize: 11,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
  },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  avatarButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  heroBanner: {
    backgroundColor: '#312E81',
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  heroBadge: {
    color: '#A5B4FC',
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: '#C7D2FE',
    fontSize: 13,
  },
  heroCta: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  heroCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryPillActive: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
  },
  categoryPill: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  productList: {
    gap: 12,
  },
  productCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  productIconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productIconBoxAlt: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productEmoji: {
    fontSize: 22,
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
    color: '#A5B4FC',
    fontSize: 16,
    fontWeight: '700',
  },
});
