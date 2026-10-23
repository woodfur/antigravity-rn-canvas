import React, { createContext, useContext, useMemo, useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  Pressable,
  View,
  Text,
  Image as RNImage,
  ImageBackground as RNImageBackground,
  ScrollView as RNScrollView,
  FlatList as RNFlatList,
} from 'react-native';

export interface NavigationController {
  navigate: (targetRoute: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
  push: (targetRoute: string, params?: Record<string, unknown>) => void;
  replace: (targetRoute: string, params?: Record<string, unknown>) => void;
  back: () => void;
  setOptions: (options?: Record<string, unknown>) => void;
  canGoBack: () => boolean;
  dispatch: (action?: unknown) => void;
  reset: (state?: unknown) => void;
  addListener: (event: string, callback: () => void) => () => void;
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
    .replace(/\[\.\.\.([^\]]+)\]/g, 'CatchAll_$1')
    .replace(/\[([^\]]+)\]/g, 'By_$1')
    .replace(/Screen$/, '')
    .replace(/\/index$/, '');
  if (!cleaned || cleaned === 'index') return 'Home';
  if (cleaned.includes('-') || cleaned.includes('/') || cleaned.includes('_') || cleaned === cleaned.toLowerCase()) {
    return cleaned
      .split(/[-_/]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  return cleaned;
}

const noopNavigation: NavigationController = {
  navigate: () => undefined,
  goBack: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  back: () => undefined,
  setOptions: () => undefined,
  canGoBack: () => true,
  dispatch: () => undefined,
  reset: () => undefined,
  addListener: () => () => undefined,
};

const MockNavigationContext = createContext<MockNavigationContextValue>({
  currentRoute: 'Home',
  params: {},
  navigation: noopNavigation,
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
        dispatch: () => undefined,
        reset: () => undefined,
        addListener: () => () => undefined,
      },
    };
  }, [routeName, params, onNavigate]);

  return (
    <MockNavigationContext.Provider value={value}>
      {children}
    </MockNavigationContext.Provider>
  );
};

// ============================================================================
// 1. React Navigation Shims (@react-navigation/native, native-stack, bottom-tabs)
// ============================================================================
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
    try {
      return effect();
    } catch {
      return undefined;
    }
  }, [effect]);
}

export function useIsFocused(): boolean {
  return true;
}

export function useScrollToTop(): void {}

export const NavigationContainer: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

export const CommonActions = {
  navigate: (payload: unknown) => ({ type: 'NAVIGATE', payload }),
  reset: (payload: unknown) => ({ type: 'RESET', payload }),
  goBack: () => ({ type: 'GO_BACK' }),
};

export const StackActions = {
  push: (routeName: string, params?: unknown) => ({ type: 'PUSH', payload: { routeName, params } }),
  replace: (routeName: string, params?: unknown) => ({
    type: 'REPLACE',
    payload: { routeName, params },
  }),
  pop: (count = 1) => ({ type: 'POP', payload: { count } }),
  popToTop: () => ({ type: 'POP_TO_TOP' }),
};

function createNavigatorShim() {
  const Navigator: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  const Screen: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  const Group: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  return { Navigator, Screen, Group };
}

export const createNativeStackNavigator = createNavigatorShim;
export const createStackNavigator = createNavigatorShim;
export const createBottomTabNavigator = createNavigatorShim;
export const createDrawerNavigator = createNavigatorShim;
export const createMaterialTopTabNavigator = createNavigatorShim;

export const DefaultTheme = {
  dark: false,
  colors: {
    primary: '#6366F1',
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#0F172A',
    border: '#E2E8F0',
    notification: '#EF4444',
  },
};

export const DarkTheme = {
  dark: true,
  colors: {
    primary: '#6366F1',
    background: '#09090B',
    card: '#18181B',
    text: '#F8FAFC',
    border: '#27272A',
    notification: '#EF4444',
  },
};

export const ThemeProvider: React.FC<{ value?: unknown; children?: React.ReactNode }> = ({
  children,
}) => <>{children}</>;

export function useTheme() {
  return DarkTheme;
}

export function useNavigationContainerRef() {
  return { current: noopNavigation, isReady: () => true };
}

// ============================================================================
// 2. Expo Router Shims (expo-router)
// ============================================================================
export function useRouter(): NavigationController {
  return useContext(MockNavigationContext).navigation;
}

export const router: NavigationController = noopNavigation;

export function useLocalSearchParams<
  T extends Record<string, unknown> = Record<string, string>
>(): T {
  const ctx = useContext(MockNavigationContext);
  return ctx.params as T;
}

export function useGlobalSearchParams<
  T extends Record<string, unknown> = Record<string, string>
>(): T {
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

export function useRootNavigationState() {
  return { key: 'root', stale: false };
}

export const Link: React.FC<{
  href: string | { pathname: string; params?: Record<string, unknown> };
  asChild?: boolean;
  children?: React.ReactNode;
  style?: unknown;
}> = ({ href, children, style }) => {
  const nav = useContext(MockNavigationContext).navigation;
  const target = typeof href === 'string' ? href : href?.pathname ?? 'Home';
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

export const Redirect: React.FC<{ href: string }> = () => null;

const NoopLayoutScreen: React.FC<{ children?: React.ReactNode; screenOptions?: unknown }> & {
  Screen: React.FC<{ name?: string; options?: unknown }>;
} = ({ children }) => <>{children}</>;
NoopLayoutScreen.Screen = () => null;

export const Stack = NoopLayoutScreen;
export const Tabs = NoopLayoutScreen;
export const Drawer = NoopLayoutScreen;
export const Slot: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
export const SplashScreen = {
  preventAutoHideAsync: async () => true,
  hideAsync: async () => true,
};

// ============================================================================
// 3. React Native Safe Area Context Shims (react-native-safe-area-context)
// ============================================================================
export const SafeAreaProvider: React.FC<{ children?: React.ReactNode; style?: unknown }> = ({
  children,
  style,
}) => <View style={[{ flex: 1 }, style as never]}>{children}</View>;

export const SafeAreaView: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
  edges?: string[];
}> = ({ children, style }) => <View style={[{ flex: 1 }, style as never]}>{children}</View>;

export function useSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

export function useSafeAreaFrame(): { x: number; y: number; width: number; height: number } {
  return { x: 0, y: 0, width: 393, height: 852 };
}

export const SafeAreaInsetsContext = createContext({ top: 0, right: 0, bottom: 0, left: 0 });
export const SafeAreaFrameContext = createContext({ x: 0, y: 0, width: 393, height: 852 });

export function withSafeAreaInsets<P extends object>(Component: React.ComponentType<P>) {
  return function WithSafeAreaInsetsWrapper(props: P) {
    return <Component {...props} insets={{ top: 0, right: 0, bottom: 0, left: 0 }} />;
  };
}

export const initialWindowMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
};

// ============================================================================
// 4. Expo Status Bar Shim (expo-status-bar)
// ============================================================================
export const StatusBar: React.FC<{
  style?: string;
  hidden?: boolean;
  backgroundColor?: string;
  translucent?: boolean;
}> = () => null;

// ============================================================================
// 5. @expo/vector-icons Shims
// ============================================================================
export interface VectorIconProps {
  name?: string;
  size?: number;
  color?: string;
  style?: unknown;
  onPress?: () => void;
}

const ICON_GLYPH_MAP: Record<string, string> = {
  'arrow-back': '←',
  'arrow-left': '←',
  'chevron-back': '‹',
  'chevron-left': '‹',
  'arrow-forward': '→',
  'arrow-right': '→',
  'chevron-forward': '›',
  'chevron-right': '›',
  'chevron-down': '▾',
  'chevron-up': '▴',
  close: '✕',
  'close-circle': '⊗',
  x: '✕',
  add: '+',
  plus: '+',
  'add-circle': '⊕',
  remove: '−',
  minus: '−',
  check: '✓',
  checkmark: '✓',
  'checkmark-circle': '✓',
  search: '⌕',
  home: '⌂',
  person: '◉',
  user: '◉',
  settings: '⚙',
  cog: '⚙',
  bell: '🔔',
  notifications: '🔔',
  heart: '♥',
  'heart-outline': '♡',
  star: '★',
  'star-outline': '☆',
  cart: '🛒',
  'shopping-cart': '🛒',
  bag: '🛍',
  lock: '🔒',
  'lock-closed': '🔒',
  mail: '✉',
  eye: '👁',
  'eye-off': '◡',
  trash: '🗑',
  edit: '✎',
  pencil: '✎',
  share: '↗',
  info: 'ℹ',
  warning: '⚠',
  alert: '⚠',
  menu: '☰',
  filter: '⊶',
  calendar: '📅',
  time: '⏱',
  clock: '⏱',
  location: '⌖',
  'map-pin': '⌖',
  camera: '📷',
  image: '🖼',
  send: '➤',
  refresh: '↻',
  sync: '↻',
  wallet: '💳',
  card: '💳',
  cash: '¤',
  'trending-up': '↗',
  'trending-down': '↘',
};

export function createVectorIconComponent(familyName: string) {
  const IconComp: React.FC<VectorIconProps> & {
    glyphMap?: Record<string, number>;
    loadFont?: () => Promise<void>;
  } = ({ name = '', size = 18, color = '#94A3B8', style, onPress }) => {
    const cleanName = String(name)
      .toLowerCase()
      .replace(/^ios-|^md-|^logo-/, '')
      .replace(/-outline$|-sharp$/, '');
    const symbol = ICON_GLYPH_MAP[String(name).toLowerCase()] ?? ICON_GLYPH_MAP[cleanName] ?? '◆';
    return (
      <Text
        onPress={onPress}
        accessibilityLabel={`${familyName}:${name}`}
        style={[
          {
            fontSize: size * 0.85,
            lineHeight: size,
            width: size,
            height: size,
            color,
            textAlign: 'center',
             includeFontPadding: false,
          } as never,
          style as never,
        ]}
      >
        {symbol}
      </Text>
    );
  };
  IconComp.glyphMap = {};
  IconComp.loadFont = async () => undefined;
  return IconComp;
}

export const Ionicons = createVectorIconComponent('Ionicons');
export const Feather = createVectorIconComponent('Feather');
export const MaterialIcons = createVectorIconComponent('MaterialIcons');
export const MaterialCommunityIcons = createVectorIconComponent('MaterialCommunityIcons');
export const FontAwesome = createVectorIconComponent('FontAwesome');
export const FontAwesome5 = createVectorIconComponent('FontAwesome5');
export const FontAwesome6 = createVectorIconComponent('FontAwesome6');
export const AntDesign = createVectorIconComponent('AntDesign');
export const Entypo = createVectorIconComponent('Entypo');
export const EvilIcons = createVectorIconComponent('EvilIcons');
export const Foundation = createVectorIconComponent('Foundation');
export const Octicons = createVectorIconComponent('Octicons');
export const SimpleLineIcons = createVectorIconComponent('SimpleLineIcons');
export const Zocial = createVectorIconComponent('Zocial');
export const Fontisto = createVectorIconComponent('Fontisto');
export function createIconSet() {
  return createVectorIconComponent('CustomIcon');
}
export function createIconSetFromIcoMoon() {
  return createVectorIconComponent('IcoMoon');
}
export function createIconSetFromFontello() {
  return createVectorIconComponent('Fontello');
}

// ============================================================================
// 6. Expo Linear Gradient, Blur, Image & FlashList Shims
// ============================================================================
export const LinearGradient: React.FC<{
  colors?: string[];
  locations?: number[];
  start?: { x: number; y: number } | [number, number];
  end?: { x: number; y: number } | [number, number];
  style?: unknown;
  children?: React.ReactNode;
}> = ({ colors = ['#1E293B', '#0F172A'], style, children }) => {
  const safeColors = Array.isArray(colors) && colors.length >= 2 ? colors : ['#1E293B', '#0F172A'];
  return (
    <View
      style={[
        {
          backgroundColor: safeColors[0],
          backgroundImage: `linear-gradient(135deg, ${safeColors.join(', ')})`,
        } as never,
        style as never,
      ]}
    >
      {children}
    </View>
  );
};

export const BlurView: React.FC<{
  intensity?: number;
  tint?: string;
  style?: unknown;
  children?: React.ReactNode;
}> = ({ intensity = 40, tint = 'dark', style, children }) => {
  const bg = tint === 'light' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(15, 23, 42, 0.65)';
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          backdropFilter: `blur(${Math.round(intensity / 4)}px)`,
        } as never,
        style as never,
      ]}
    >
      {children}
    </View>
  );
};

export const Image: React.FC<Record<string, unknown>> = ({
  contentFit,
  resizeMode,
  source,
  ...rest
}) => {
  const resolvedSource = typeof source === 'string' ? { uri: source } : source;
  return (
    <RNImage
      source={resolvedSource as never}
      resizeMode={(contentFit ?? resizeMode ?? 'cover') as never}
      {...(rest as Record<string, unknown>)}
    />
  );
};

export const ImageBackground = RNImageBackground;
export const FlashList = RNFlatList;

// ============================================================================
// 7. React Native SVG Shims (react-native-svg)
// ============================================================================
function createSvgDomElement(tagName: string) {
  return React.forwardRef< Element, Record<string, unknown>>(({ children, ...props }, ref) =>
    React.createElement(tagName, { ...props, ref }, children as React.ReactNode)
  );
}

export const Svg = createSvgDomElement('svg');
export const Circle = createSvgDomElement('circle');
export const Ellipse = createSvgDomElement('ellipse');
export const G = createSvgDomElement('g');
export const SvgText = createSvgDomElement('text');
export const TSpan = createSvgDomElement('tspan');
export const TextPath = createSvgDomElement('textPath');
export const Path = createSvgDomElement('path');
export const Polygon = createSvgDomElement('polygon');
export const Polyline = createSvgDomElement('polyline');
export const Line = createSvgDomElement('line');
export const Rect = createSvgDomElement('rect');
export const Use = createSvgDomElement('use');
export const SvgImage = createSvgDomElement('image');
export const Symbol = createSvgDomElement('symbol');
export const Defs = createSvgDomElement('defs');
export const RadialGradient = createSvgDomElement('radialGradient');
export const Stop = createSvgDomElement('stop');
export const ClipPath = createSvgDomElement('clipPath');
export const Pattern = createSvgDomElement('pattern');
export const Mask = createSvgDomElement('mask');
export const ForeignObject = createSvgDomElement('foreignObject');
export const SvgXml: React.FC<{ xml?: string; width?: number | string; height?: number | string }> =
  ({ xml = '', width = 24, height = 24 }) => (
    <span
      style={{ display: 'inline-flex', width, height }}
      dangerouslySetInnerHTML={{ __html: xml }}
    />
  );
export const SvgUri: React.FC<{ uri?: string; width?: number; height?: number }> = ({
  uri,
  width = 24,
  height = 24,
}) => <RNImage source={{ uri }} style={{ width, height }} />;

// ============================================================================
// 8. React Native Reanimated & Gesture Handler Shims
// ============================================================================
function createChainableAnimationStub(): Record<string, unknown> {
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'build') return () => ({});
        return () => proxy;
      },
    }
  );
  return proxy;
}

export const FadeIn = createChainableAnimationStub();
export const FadeInDown = createChainableAnimationStub();
export const FadeInUp = createChainableAnimationStub();
export const FadeInLeft = createChainableAnimationStub();
export const FadeInRight = createChainableAnimationStub();
export const FadeOut = createChainableAnimationStub();
export const FadeOutDown = createChainableAnimationStub();
export const FadeOutUp = createChainableAnimationStub();
export const SlideInDown = createChainableAnimationStub();
export const SlideInUp = createChainableAnimationStub();
export const SlideInLeft = createChainableAnimationStub();
export const SlideInRight = createChainableAnimationStub();
export const SlideOutDown = createChainableAnimationStub();
export const SlideOutUp = createChainableAnimationStub();
export const SlideOutLeft = createChainableAnimationStub();
export const SlideOutRight = createChainableAnimationStub();
export const ZoomIn = createChainableAnimationStub();
export const ZoomOut = createChainableAnimationStub();
export const Layout = createChainableAnimationStub();
export const LinearTransition = createChainableAnimationStub();
export const SequencedTransition = createChainableAnimationStub();
export const FadingTransition = createChainableAnimationStub();

export function useSharedValue<T>(initialValue: T): { value: T } {
  const ref = useRef<{ value: T }>({ value: initialValue });
  return ref.current;
}

export function useAnimatedStyle<T extends Record<string, unknown>>(
  updater: () => T
): T {
  try {
    return updater();
  } catch {
    return {} as T;
  }
}

export function useDerivedValue<T>(updater: () => T): { value: T } {
  try {
    return { value: updater() };
  } catch {
    return { value: undefined as unknown as T };
  }
}

export function useAnimatedProps<T extends Record<string, unknown>>(updater: () => T): T {
  try {
    return updater();
  } catch {
    return {} as T;
  }
}

export function useAnimatedScrollHandler() {
  return () => undefined;
}

export function useAnimatedRef() {
  return useRef(null);
}

export function useAnimatedGestureHandler() {
  return () => undefined;
}

export function withTiming<T>(toValue: T, _config?: unknown, callback?: (finished: boolean) => void): T {
  callback?.(true);
  return toValue;
}

export function withSpring<T>(toValue: T, _config?: unknown, callback?: (finished: boolean) => void): T {
  callback?.(true);
  return toValue;
}

export function withDelay<T>(_delayMs: number, animationValue: T): T {
  return animationValue;
}

export function withSequence<T>(...animations: T[]): T {
  return animations[animations.length - 1];
}

export function withRepeat<T>(animationValue: T): T {
  return animationValue;
}

export function cancelAnimation(): void {}

export function runOnJS<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export function runOnUI<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

export function interpolate(
  value: number,
  inputRange: number[],
  outputRange: number[]
): number {
  if (!inputRange?.length || !outputRange?.length) return value;
  if (value <= inputRange[0]) return outputRange[0];
  if (value >= inputRange[inputRange.length - 1]) return outputRange[outputRange.length - 1];
  return outputRange[0];
}

export const Extrapolation = {
  IDENTITY: 'identity',
  CLAMP: 'clamp',
  EXTEND: 'extend',
};
export const Extrapolate = Extrapolation;

export const Easing = {
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  bezier: () => (t: number) => t,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

export function createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
  return Component;
}

export const Animated = {
  View,
  Text,
  Image: RNImage,
  ScrollView: RNScrollView,
  FlatList: RNFlatList,
  createAnimatedComponent,
  Value: class {
    private _val: number;
    constructor(v = 0) {
      this._val = v;
    }
    setValue(v: number) {
      this._val = v;
    }
    interpolate() {
      return this._val;
    }
  },
};

// React Native Gesture Handler Shims
export const GestureHandlerRootView: React.FC<{ children?: React.ReactNode; style?: unknown }> = ({
  children,
  style,
}) => <View style={[{ flex: 1 }, style as never]}>{children}</View>;

export const ScrollView = RNScrollView;
export const FlatList = RNFlatList;
export { TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback, Pressable };
export const Swipeable: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const DrawerLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const PanGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const TapGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const LongPressGestureHandler: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const GestureDetector: React.FC<{ gesture?: unknown; children?: React.ReactNode }> = ({
  children,
}) => <>{children}</>;
export const Gesture = {
  Pan: () => createChainableAnimationStub(),
  Tap: () => createChainableAnimationStub(),
  LongPress: () => createChainableAnimationStub(),
  Pinch: () => createChainableAnimationStub(),
  Rotation: () => createChainableAnimationStub(),
  Fling: () => createChainableAnimationStub(),
  Simultaneous: () => createChainableAnimationStub(),
  Exclusive: () => createChainableAnimationStub(),
  Race: () => createChainableAnimationStub(),
};
export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};
export const Directions = {
  RIGHT: 1,
  LEFT: 2,
  UP: 4,
  DOWN: 8,
};

// ============================================================================
// 9. Common Expo SDK Runtime Shims (Haptics, Constants, Font, Storage, etc.)
// ============================================================================
export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' };
export const NotificationFeedbackType = {
  Success: 'success',
  Warning: 'warning',
  Error: 'error',
};
export async function impactAsync(): Promise<void> {}
export async function notificationAsync(): Promise<void> {}
export async function selectionAsync(): Promise<void> {}

export const Constants = {
  expoConfig: { name: 'Zelune App', slug: 'zelune-app', extra: {} },
  manifest: { extra: {} },
  statusBarHeight: 0,
  systemFonts: [],
  appOwnership: 'expo',
  executionEnvironment: 'storeClient',
};

export function useFonts(): [boolean, null] {
  return [true, null];
}
export async function loadAsync(): Promise<void> {}
export function isLoaded(): boolean {
  return true;
}
export async function preventAutoHideAsync(): Promise<boolean> {
  return true;
}
export async function hideAsync(): Promise<boolean> {
  return true;
}

const memoryStorage = new Map<string, string>();
export const AsyncStorage = {
  getItem: async (key: string) => memoryStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memoryStorage.set(key, value);
  },
  removeItem: async (key: string) => {
    memoryStorage.delete(key);
  },
  clear: async () => {
    memoryStorage.clear();
  },
  getAllKeys: async () => Array.from(memoryStorage.keys()),
  multiGet: async (keys: string[]) => keys.map((k) => [k, memoryStorage.get(k) ?? null]),
  multiSet: async (pairs: [string, string][]) => {
    pairs.forEach(([k, v]) => memoryStorage.set(k, v));
  },
  multiRemove: async (keys: string[]) => {
    keys.forEach((k) => memoryStorage.delete(k));
  },
};

export async function getItemAsync(key: string): Promise<string | null> {
  return memoryStorage.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  memoryStorage.set(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  memoryStorage.delete(key);
}

export async function setStringAsync(): Promise<boolean> {
  return true;
}
export async function getStringAsync(): Promise<string> {
  return '';
}
export async function openURL(url: string): Promise<boolean> {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}
export function createURL(pathStr = ''): string {
  return `/${String(pathStr).replace(/^\/+/, '')}`;
}

// ============================================================================
// 10. State Management, Data Fetching & Backend Client Shims
//     (Zustand, TanStack React Query, Supabase Client)
// ============================================================================
export function create(initializer?: unknown): unknown {
  if (typeof initializer !== 'function') {
    return (curriedInitializer: unknown) => create(curriedInitializer);
  }
  let state: Record<string, unknown> = {};
  const setState = (partial: unknown) => {
    try {
      const next =
        typeof partial === 'function' ? (partial as (s: unknown) => unknown)(state) : partial;
      if (next && typeof next === 'object') {
        state = { ...state, ...(next as Record<string, unknown>) };
      }
    } catch {
      // Ignore setter errors in static canvas preview
    }
  };
  const getState = () => state;
  const api = {
    setState,
    getState,
    getInitialState: () => state,
    subscribe: () => () => undefined,
    destroy: () => undefined,
  };
  try {
    const initial = (
      initializer as (
        set: typeof setState,
        get: typeof getState,
        store: typeof api
      ) => Record<string, unknown>
    )(setState, getState, api);
    if (initial && typeof initial === 'object') {
      state = initial;
    }
  } catch {
    state = {};
  }
  const useBoundStore = (selector?: (s: Record<string, unknown>) => unknown) => {
    if (typeof selector === 'function') {
      try {
        return selector(state);
      } catch {
        return undefined;
      }
    }
    return state;
  };
  return Object.assign(useBoundStore, api);
}

export function useStore(
  store: { getState?: () => Record<string, unknown> } | ((s?: unknown) => unknown),
  selector?: (s: Record<string, unknown>) => unknown
) {
  const rawState =
    typeof store === 'function'
      ? (store as () => Record<string, unknown>)()
      : store?.getState?.() ?? {};
  return typeof selector === 'function' ? selector(rawState) : rawState;
}

export class QueryClient {
  mount() {}
  unmount() {}
  clear() {}
  getQueryData() {
    return undefined;
  }
  setQueryData() {}
  invalidateQueries() {
    return Promise.resolve();
  }
  prefetchQuery() {
    return Promise.resolve();
  }
}

export const QueryClientProvider: React.FC<{ client?: unknown; children?: React.ReactNode }> = ({
  children,
}) => <>{children}</>;

export function useQueryClient() {
  return new QueryClient();
}

export function useQuery() {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isError: false,
    isSuccess: true,
    status: 'success',
    refetch: async () => ({ data: undefined, error: null }),
  };
}

export function useInfiniteQuery() {
  return {
    data: { pages: [], pageParams: [] },
    error: null,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: async () => ({}),
    refetch: async () => ({}),
  };
}

export function useMutation() {
  return {
    mutate: () => undefined,
    mutateAsync: async () => ({}),
    reset: () => undefined,
    data: undefined,
    error: null,
    isLoading: false,
    isPending: false,
    isError: false,
    isSuccess: false,
    status: 'idle',
  };
}

function createSupabaseQueryBuilder(): Record<string, unknown> {
  const resultPromise = Promise.resolve({ data: [], error: null, count: 0 });
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return resultPromise.then.bind(resultPromise);
        if (prop === 'catch') return resultPromise.catch.bind(resultPromise);
        if (prop === 'finally') return resultPromise.finally.bind(resultPromise);
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => ({ data: null, error: null });
        }
        return () => builder;
      },
    }
  );
  return builder;
}

export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
      signUp: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
      startAutoRefresh: () => undefined,
      stopAutoRefresh: () => undefined,
    },
    from: () => createSupabaseQueryBuilder(),
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: '' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        download: async () => ({ data: null, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: () => ch,
        unsubscribe: async () => 'ok',
      };
      return ch;
    },
    removeChannel: async () => 'ok',
    functions: {
      invoke: async () => ({ data: null, error: null }),
    },
  };
}

function UniversalDefaultExportComponent(props: Record<string, unknown> = {}) {
  if (props && typeof props === 'object') {
    if (typeof props.name === 'string') {
      return Ionicons(props as VectorIconProps);
    }
    if ('viewBox' in props || 'xmlns' in props) {
      return React.createElement('svg', props, props.children as React.ReactNode);
    }
  }
  return React.createElement(
    View,
    { style: props?.style as never },
    props?.children as React.ReactNode
  );
}

const defaultExportProperties = {
  ...Animated,
  ...AsyncStorage,
  ...Constants,
  Ionicons,
  Feather,
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome,
  FontAwesome5,
  FontAwesome6,
  AntDesign,
  Entypo,
  EvilIcons,
  Foundation,
  Octicons,
  SimpleLineIcons,
  Zocial,
  Fontisto,
  LinearGradient,
  BlurView,
  Image,
  ImageBackground,
  FlashList,
  Svg,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  selectionAsync,
  useFonts,
  loadAsync,
  isLoaded,
  preventAutoHideAsync,
  hideAsync,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  setStringAsync,
  getStringAsync,
  openURL,
  createURL,
  create,
  useStore,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  useQuery,
  useInfiniteQuery,
  useMutation,
  createClient,
};

Object.assign(UniversalDefaultExportComponent, defaultExportProperties);

const defaultExportProxy = new Proxy(UniversalDefaultExportComponent, {
  get(target, prop) {
    if (prop in target) {
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    }
    if (prop in defaultExportProperties) {
      return defaultExportProperties[prop as keyof typeof defaultExportProperties];
    }
    if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
      return createVectorIconComponent(prop);
    }
    return () => undefined;
  },
});

export default defaultExportProxy;
