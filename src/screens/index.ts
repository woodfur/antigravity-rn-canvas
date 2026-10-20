import React from 'react';
import LoginScreen from './LoginScreen';
import HomeScreen from './HomeScreen';
import ProductDetailScreen from './ProductDetailScreen';
import CheckoutScreen from './CheckoutScreen';
import ProfileScreen from './ProfileScreen';

export const SCREEN_COMPONENTS: Record<string, React.ComponentType> = {
  Login: LoginScreen,
  Home: HomeScreen,
  ProductDetail: ProductDetailScreen,
  Checkout: CheckoutScreen,
  Profile: ProfileScreen,
};

export const SCREEN_ORDER = ['Login', 'Home', 'ProductDetail', 'Checkout', 'Profile'];
