import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { TouchableOpacity, View } from 'react-native';

export interface NavigationController {
  navigate: (targetRoute: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
  push: (targetRoute: string, params?: Record<string, unknown>) => void;
  replace: (targetRoute: string, params?: Record<string, unknown>) => void;
  back: () => void;
  setOptions: (options?: Record<string, unknown>) => void;
  canGoBack: () => boolean;
}

interface MockNavigationContextValue {
  currentRoute: string;
  params: Record<string, unknown>;
  navigation: NavigationController;
}

function normalizeNavTarget(raw: string): string {
  const cleaned = String(raw ?? '')
    .replace(/^\/+/, '')
    .replace(/\([^)]+\)\/?/g, '')
    .replace(/Screen$/, '')
    .replace(/\/index$/, '');
  if (!cleaned || cleaned === 'index') return 'Home';
  if (cleaned.includes('-') || cleaned.includes('/') || cleaned === cleaned.toLowerCase()) {
    return cleaned
      .split(/[-_/]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  return cleaned;
}

const MockNavigationContext = createContext<MockNavigationContextValue>({
  currentRoute: 'Home',
  params: {},
  navigation: {
    navigate: () => undefined,
    goBack: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    back: () => undefined,
    setOptions: () => undefined,
    canGoBack: () => true,
  },
});

export interface MockNavigationProviderProps {
  routeName: string;
  params?: Record<string, unknown>;
  onNavigate?: (fromScreen: string, toScreen: string, params?: Record<string, unknown>) => void;
  children: React.ReactNode;
}

export const MockNavigationProvider: React.FC<MockNavigationProviderProps> = ({
  routeName,
  params = {},
  onNavigate,
  children,
}) => {
  const value = useMemo<MockNavigationContextValue>(() => {
    const trigger = (targetRoute: string, navParams?: Record<string, unknown>) => {
      onNavigate?.(routeName, normalizeNavTarget(targetRoute), navParams);
    };
    return {
      currentRoute: routeName,
      params,
      navigation: {
        navigate: trigger,
        push: trigger,
        replace: trigger,
        goBack: () => onNavigate?.(routeName, 'Home'),
        back: () => onNavigate?.(routeName, 'Home'),
        setOptions: () => undefined,
        canGoBack: () => true,
      },
    };
  }, [routeName, params, onNavigate]);

  return (
    <MockNavigationContext.Provider value={value}>
      {children}
    </MockNavigationContext.Provider>
  );
};

// React Navigation Shims (@react-navigation/native)
export function useNavigation(): NavigationController {
  return useContext(MockNavigationContext).navigation;
}

export function useRoute(): { key: string; name: string; params: Record<string, unknown> } {
  const ctx = useContext(MockNavigationContext);
  return {
    key: ctx.currentRoute,
    name: ctx.currentRoute,
    params: ctx.params,
  };
}

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(() => {
    return effect();
  }, [effect]);
}

export function useIsFocused(): boolean {
  return true;
}

export const NavigationContainer: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

// Expo Router Shims (expo-router)
export function useRouter(): NavigationController {
  return useContext(MockNavigationContext).navigation;
}

export const router: NavigationController = {
  navigate: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  goBack: () => undefined,
  back: () => undefined,
  setOptions: () => undefined,
  canGoBack: () => true,
};

export function useLocalSearchParams<T extends Record<string, unknown> = Record<string, string>>(): T {
  const ctx = useContext(MockNavigationContext);
  return ctx.params as T;
}

export function useGlobalSearchParams<T extends Record<string, unknown> = Record<string, string>>(): T {
  const ctx = useContext(MockNavigationContext);
  return ctx.params as T;
}

export function usePathname(): string {
  const ctx = useContext(MockNavigationContext);
  return `/${ctx.currentRoute.toLowerCase()}`;
}

export function useSegments(): string[] {
  const ctx = useContext(MockNavigationContext);
  return [ctx.currentRoute.toLowerCase()];
}

export const Link: React.FC<{
  href: string | { pathname: string; params?: Record<string, unknown> };
  asChild?: boolean;
  children?: React.ReactNode;
  style?: unknown;
}> = ({ href, children, style }) => {
  const nav = useContext(MockNavigationContext).navigation;
  const target = typeof href === 'string' ? href : href.pathname;
  return (
    <TouchableOpacity
      activeOpacity={0.78}
      style={style as never}
      onPress={() => nav.push(target)}
    >
      {children}
    </TouchableOpacity>
  );
};

const NoopLayoutScreen: React.FC<{ options?: unknown }> & {
  Screen: React.FC<{ name?: string; options?: unknown }>;
} = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
NoopLayoutScreen.Screen = () => null;

export const Stack = NoopLayoutScreen;
export const Tabs = NoopLayoutScreen;
export const Slot: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;

// React Native Safe Area Context Shims (react-native-safe-area-context)
export const SafeAreaProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <View style={{ flex: 1 }}>{children}</View>
);

export const SafeAreaView: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
  edges?: string[];
}> = ({ children, style }) => (
  <View style={[{ flex: 1 }, style as never]}>{children}</View>
);

export function useSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

// Expo Status Bar Shim (expo-status-bar)
export const StatusBar: React.FC<{ style?: string; hidden?: boolean; backgroundColor?: string }> = () => null;
