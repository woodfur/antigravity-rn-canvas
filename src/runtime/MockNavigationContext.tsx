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
import { withNativeWind, resolveTailwindClassNameToStyle } from './nativewindShim';

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
  const ctx = useContext(MockNavigationContext);
  const effectRef = useRef(effect);
  effectRef.current = effect;
  useEffect(() => {
    try {
      const cleanup = effectRef.current();
      return typeof cleanup === 'function' ? cleanup : undefined;
    } catch {
      return undefined;
    }
  }, [ctx.currentRoute]);
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
  return useMemo(() => [ctx.currentRoute.toLowerCase()], [ctx.currentRoute]);
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
export const SafeAreaProvider: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
  className?: string;
}> = ({ children, style, className, ...rest }) => (
  <View className={className as never} style={[{ flex: 1 }, style as never]} {...rest}>
    {children}
  </View>
);

export const SafeAreaView: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
  className?: string;
  edges?: string[];
}> = ({ children, style, className, edges: _edges, ...rest }) => (
  <View className={className as never} style={[{ flex: 1 }, style as never]} {...rest}>
    {children}
  </View>
);

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
  colors?: readonly string[] | string[];
  locations?: readonly number[] | number[];
  start?: { x: number; y: number } | [number, number];
  end?: { x: number; y: number } | [number, number];
  style?: unknown;
  className?: string;
  children?: React.ReactNode;
}> = ({
  colors = ['#1E293B', '#0F172A'],
  locations: _locations,
  start: _start,
  end: _end,
  style,
  className,
  children,
  ...rest
}) => {
  const safeColors = Array.isArray(colors) && colors.length >= 2 ? colors : ['#1E293B', '#0F172A'];
  return (
    <View
      className={className as never}
      style={[
        {
          backgroundColor: safeColors[0],
          backgroundImage: `linear-gradient(135deg, ${safeColors.join(', ')})`,
        } as never,
        style as never,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

export const BlurView: React.FC<{
  intensity?: number;
  tint?: string;
  style?: unknown;
  className?: string;
  children?: React.ReactNode;
}> = ({ intensity = 40, tint = 'dark', style, className, children, ...rest }) => {
  const bg = tint === 'light' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(15, 23, 42, 0.65)';
  return (
    <View
      className={className as never}
      style={[
        {
          backgroundColor: bg,
          backdropFilter: `blur(${Math.round(intensity / 4)}px)`,
        } as never,
        style as never,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

export const Image: React.FC<Record<string, unknown>> = ({
  contentFit,
  resizeMode,
  source,
  placeholder,
  transition: _transition,
  className,
  style,
  ...rest
}) => {
  let uri = '';
  if (typeof source === 'string') {
    uri = source;
  } else if (Array.isArray(source) && source[0] && typeof source[0] === 'object') {
    uri = String((source[0] as Record<string, unknown>).uri ?? '');
  } else if (source && typeof source === 'object') {
    uri = String((source as Record<string, unknown>).uri ?? '');
  }
  const placeholderBg =
    placeholder && typeof placeholder === 'object' && 'color' in placeholder
      ? String((placeholder as Record<string, unknown>).color ?? 'transparent')
      : undefined;
  const fit = String(contentFit ?? resizeMode ?? 'cover') as React.CSSProperties['objectFit'];

  return (
    <View
      className={className as never}
      style={[
        {
          overflow: 'hidden',
          ...(placeholderBg ? { backgroundColor: placeholderBg } : {}),
        } as never,
        style as never,
      ]}
      {...(rest as Record<string, unknown>)}
    >
      {uri ? (
        <img
          src={uri}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            display: 'block',
          }}
        />
      ) : null}
    </View>
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
  ({ width = 24, height = 24 }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" style={{ display: 'inline-flex' }} />
  );
export const SvgUri: React.FC<{ uri?: string; width?: number; height?: number }> = ({
  uri,
  width = 24,
  height = 24,
}) => <RNImage source={{ uri }} style={{ width, height }} />;

// ============================================================================
// 8. React Native Reanimated & Gesture Handler Shims
// ============================================================================
const CHAINABLE_ANIMATION_METHODS = [
  'duration',
  'delay',
  'springify',
  'damping',
  'mass',
  'stiffness',
  'overshootClamping',
  'restDisplacementThreshold',
  'restSpeedThreshold',
  'withInitialValues',
  'withCallback',
  'easing',
  'randomDelay',
  'enabled',
  'onBegin',
  'onStart',
  'onUpdate',
  'onChange',
  'onEnd',
  'onFinalize',
  'onTouchesDown',
  'onTouchesMove',
  'onTouchesUp',
  'activeOffsetX',
  'activeOffsetY',
  'failOffsetX',
  'failOffsetY',
  'minDistance',
  'minPointers',
  'maxPointers',
  'runOnJS',
];

function createChainableAnimationStub(): Record<string, unknown> {
  const stub: Record<string, unknown> = {
    build: () => ({}),
  };
  const returnSelf = () => stub;
  for (const method of CHAINABLE_ANIMATION_METHODS) {
    stub[method] = returnSelf;
  }
  return stub;
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
  return withNativeWind(
    Component as unknown as React.ComponentType<Record<string, unknown>>
  ) as unknown as React.ComponentType<P>;
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
export const GestureHandlerRootView: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
  className?: string;
}> = ({ children, style, className, ...rest }) => (
  <View className={className as never} style={[{ flex: 1 }, style as never]} {...rest}>
    {children}
  </View>
);

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
export async function openURL(_url: string): Promise<boolean> {
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

const singletonQueryClient = new QueryClient();

export function useQueryClient() {
  return singletonQueryClient;
}

const STABLE_EMPTY_ARRAY: unknown[] = [];

const STABLE_QUERY_RESULT = {
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

export function useQuery() {
  return STABLE_QUERY_RESULT;
}

const STABLE_INFINITE_QUERY_RESULT = {
  data: { pages: STABLE_EMPTY_ARRAY, pageParams: STABLE_EMPTY_ARRAY },
  error: null,
  isLoading: false,
  isPending: false,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: async () => ({}),
  refetch: async () => ({}),
};

export function useInfiniteQuery() {
  return STABLE_INFINITE_QUERY_RESULT;
}

const STABLE_MUTATION_RESULT = {
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

export function useMutation() {
  return STABLE_MUTATION_RESULT;
}

// ============================================================================
// 11. Universal Chainable Proxy, Zod, React Hook Form & Context Fallbacks
// ============================================================================
const CHAINABLE_SCHEMA_METHODS = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'enum',
  'nativeEnum',
  'union',
  'discriminatedUnion',
  'intersection',
  'literal',
  'record',
  'set',
  'tuple',
  'lazy',
  'function',
  'promise',
  'any',
  'unknown',
  'never',
  'void',
  'null',
  'undefined',
  'date',
  'symbol',
  'bigint',
  'optional',
  'nullable',
  'nullish',
  'default',
  'describe',
  'brand',
  'readonly',
  'pipe',
  'preprocess',
  'email',
  'url',
  'emoji',
  'uuid',
  'cuid',
  'cuid2',
  'ulid',
  'regex',
  'includes',
  'startsWith',
  'endsWith',
  'datetime',
  'ip',
  'trim',
  'toLowerCase',
  'toUpperCase',
  'min',
  'max',
  'int',
  'positive',
  'nonnegative',
  'negative',
  'nonpositive',
  'multipleOf',
  'finite',
  'safe',
  'nonempty',
  'refine',
  'superRefine',
  'transform',
  'extend',
  'merge',
  'pick',
  'omit',
  'partial',
  'deepPartial',
  'required',
  'passthrough',
  'strict',
  'strip',
  'catchall',
  'or',
  'and',
];

export function createSafeChainableProxy(): unknown {
  const fnTarget = function (..._args: unknown[]) {
    return fnTarget;
  } as unknown as Record<string | symbol, unknown>;

  const returnSelf = () => fnTarget;
  for (const method of CHAINABLE_SCHEMA_METHODS) {
    fnTarget[method] = returnSelf;
  }

  fnTarget[Symbol.toPrimitive] = (hint: string) => (hint === 'number' ? 0 : '');
  fnTarget.valueOf = () => 0;
  fnTarget.toString = () => '';
  fnTarget[Symbol.iterator] = function* () {
    yield fnTarget;
    yield fnTarget;
  };
  fnTarget.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
  fnTarget.catch = () => Promise.resolve({ data: null, error: null });
  fnTarget.finally = (cb?: () => void) => Promise.resolve({ data: null, error: null }).finally(cb);
  fnTarget.safeParse = (val?: unknown) => ({ success: true, data: val ?? {}, error: null });
  fnTarget.spa = fnTarget.safeParse;
  fnTarget.safeParseAsync = async (val?: unknown) => ({
    success: true,
    data: val ?? {},
    error: null,
  });
  fnTarget.parse = (val?: unknown) => val ?? {};
  fnTarget.parseAsync = async (val?: unknown) => val ?? {};
  fnTarget.isLoading = false;
  fnTarget.loading = false;
  fnTarget.isPending = false;
  fnTarget.isError = false;
  fnTarget.disabled = false;
  fnTarget.isSubmitting = false;
  fnTarget.isReady = true;
  fnTarget.granted = true;
  fnTarget.isSuccess = true;
  fnTarget.isAuthenticated = true;
  fnTarget.isValid = true;
  fnTarget.error = null;
  fnTarget.errors = null;
  fnTarget.status = 'granted';
  fnTarget.data = STABLE_EMPTY_ARRAY;
  fnTarget.items = STABLE_EMPTY_ARRAY;
  fnTarget.results = STABLE_EMPTY_ARRAY;
  fnTarget.list = STABLE_EMPTY_ARRAY;
  fnTarget.size = 0;
  fnTarget.count = 0;
  fnTarget.value = 0;
  fnTarget.ref = { current: null };
  fnTarget.map = () => STABLE_EMPTY_ARRAY;
  fnTarget.filter = () => STABLE_EMPTY_ARRAY;
  fnTarget.slice = () => STABLE_EMPTY_ARRAY;
  fnTarget.flatMap = () => STABLE_EMPTY_ARRAY;
  fnTarget.forEach = () => undefined;
  fnTarget.reduce = (_fn: unknown, init: unknown) => init;
  fnTarget.shape = {};
  fnTarget._def = {};
  fnTarget.coerce = fnTarget;

  return fnTarget;
}

export const SAFE_CHAINABLE_PROXY = createSafeChainableProxy();

// Zod Shims (import { z } from 'zod' or import * as z from 'zod')
export const z = SAFE_CHAINABLE_PROXY as Record<string, unknown>;
export const string = () => SAFE_CHAINABLE_PROXY;
export const number = () => SAFE_CHAINABLE_PROXY;
export const boolean = () => SAFE_CHAINABLE_PROXY;
export const object = () => SAFE_CHAINABLE_PROXY;
export const array = () => SAFE_CHAINABLE_PROXY;
export const union = () => SAFE_CHAINABLE_PROXY;
export const literal = () => SAFE_CHAINABLE_PROXY;
export const record = () => SAFE_CHAINABLE_PROXY;
export const tuple = () => SAFE_CHAINABLE_PROXY;
export const any = () => SAFE_CHAINABLE_PROXY;
export const unknown = () => SAFE_CHAINABLE_PROXY;
export const optional = () => SAFE_CHAINABLE_PROXY;
export const nullable = () => SAFE_CHAINABLE_PROXY;
export const coerce = SAFE_CHAINABLE_PROXY;
export const zodResolver = () => async (values: unknown) => ({
  values: values ?? {},
  errors: {},
});
export const yupResolver = zodResolver;

// Common React Native Sizing & Classname Utility Shims
export const scale = (size: number) => size;
export const verticalScale = (size: number) => size;
export const moderateScale = (size: number) => size;
export const moderateVerticalScale = (size: number) => size;
export const s = scale;
export const vs = verticalScale;
export const ms = moderateScale;
export const mvs = moderateVerticalScale;
export const RFValue = (size: number) => size;
export const RFPercentage = (pct: number) => Math.round(pct * 8);
export const widthPercentageToDP = (pct: number | string) =>
  typeof pct === 'number' ? Math.round((393 * pct) / 100) : 100;
export const heightPercentageToDP = (pct: number | string) =>
  typeof pct === 'number' ? Math.round((852 * pct) / 100) : 100;
export const wp = widthPercentageToDP;
export const hp = heightPercentageToDP;
export const clsx = (...args: unknown[]) =>
  args.filter((a): a is string => typeof a === 'string' && a.length > 0).join(' ');
export const cn = clsx;
export const twMerge = clsx;

// NativeWind (v2 / v4) & twrnc Universal Shims
export function styled<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  baseClassName?: string
): React.ComponentType<P> {
  const Wrapped = withNativeWind(Component as unknown as React.ComponentType<Record<string, unknown>>);
  if (!baseClassName) return Wrapped as unknown as React.ComponentType<P>;
  return React.forwardRef<unknown, P>((props, ref) => {
    const combinedClass = [baseClassName, props?.className].filter(Boolean).join(' ');
    return React.createElement(Wrapped, { ...props, className: combinedClass, ref });
  }) as unknown as React.ComponentType<P>;
}

export function cssInterop<P extends Record<string, unknown>>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return withNativeWind(Component as unknown as React.ComponentType<Record<string, unknown>>) as unknown as React.ComponentType<P>;
}

export const remapProps = cssInterop;

function twFn(stringsOrClass: TemplateStringsArray | string, ...values: unknown[]): Record<string, unknown> {
  if (typeof stringsOrClass === 'string') {
    return resolveTailwindClassNameToStyle(stringsOrClass) ?? {};
  }
  if (Array.isArray(stringsOrClass)) {
    const built = stringsOrClass.reduce(
      (acc, str, idx) => acc + str + (values[idx] !== undefined ? String(values[idx]) : ''),
      ''
    );
    return resolveTailwindClassNameToStyle(built) ?? {};
  }
  return {};
}

twFn.style = (...args: unknown[]) => {
  const mergedClass = args.filter((a): a is string => typeof a === 'string' && a.length > 0).join(' ');
  return resolveTailwindClassNameToStyle(mergedClass) ?? {};
};
twFn.color = (token: string) => {
  const s = resolveTailwindClassNameToStyle(`text-${token}`);
  return (s?.color as string | undefined) ?? '#0F172A';
};

export const tw = twFn;
export const createTw = () => twFn;

// React Hook Form Shims (react-hook-form)
export function useForm(config?: { defaultValues?: Record<string, unknown> }) {
  const defaults = config?.defaultValues ?? {};
  return {
    control: {},
    register: (name: string) => ({
      name,
      onChange: () => undefined,
      onBlur: () => undefined,
      ref: () => undefined,
    }),
    handleSubmit: (onValid?: (data: Record<string, unknown>) => unknown) => () =>
      onValid?.(defaults),
    watch: (name?: string) => (name ? defaults[name] ?? '' : defaults),
    getValues: (name?: string) => (name ? defaults[name] : defaults),
    setValue: () => undefined,
    reset: () => undefined,
    clearErrors: () => undefined,
    setError: () => undefined,
    trigger: async () => true,
    formState: {
      errors: {},
      isDirty: false,
      isLoading: false,
      isSubmitted: false,
      isSubmitting: false,
      isSubmitSuccessful: false,
      isValid: true,
      dirtyFields: {},
      touchedFields: {},
    },
  };
}

export const useFormContext = () => useForm();
export const FormProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);
export const useWatch = () => '';
export const useFieldArray = () => ({
  fields: STABLE_EMPTY_ARRAY,
  append: () => undefined,
  prepend: () => undefined,
  remove: () => undefined,
  insert: () => undefined,
   move: () => undefined,
  update: () => undefined,
  replace: () => undefined,
});

export const Controller: React.FC<{
  name?: string;
  defaultValue?: unknown;
  render?: (params: {
    field: {
      name: string;
      value: unknown;
      onChange: (...args: unknown[]) => void;
      onBlur: () => void;
      ref: () => void;
    };
    fieldState: { invalid: boolean; isTouched: boolean; isDirty: boolean; error: undefined };
    formState: { errors: Record<string, unknown>; isSubmitting: boolean; isValid: boolean };
  }) => React.ReactNode;
  children?: React.ReactNode;
}> = ({ name = '', defaultValue = '', render, children }) => {
  if (typeof render === 'function') {
    return (
      <>
        {render({
          field: {
            name,
            value: defaultValue ?? '',
            onChange: () => undefined,
            onBlur: () => undefined,
            ref: () => undefined,
          },
          fieldState: { invalid: false, isTouched: false, isDirty: false, error: undefined },
          formState: { errors: {}, isSubmitting: false, isValid: true },
        })}
      </>
    );
  }
  return <>{children}</>;
};

// Universal Unmounted Context Fallback (prevents "useAuth must be used within an AuthProvider")
const previewUserBase: Record<string, unknown> = {
  id: 'usr_preview_01',
  uid: 'usr_preview_01',
  email: 'alex.morgan@example.com',
  name: 'Alex Morgan',
  fullName: 'Alex Morgan',
  full_name: 'Alex Morgan',
  firstName: 'Alex',
  first_name: 'Alex',
  lastName: 'Morgan',
  last_name: 'Morgan',
  displayName: 'Alex Morgan',
  display_name: 'Alex Morgan',
  username: 'alexmorgan',
  phone: '+1 (555) 019-2834',
  phoneNumber: '+1 (555) 019-2834',
  phone_number: '+1 (555) 019-2834',
  role: 'buyer',
  accountType: 'buyer',
  account_type: 'buyer',
  location: 'San Francisco, CA',
  city: 'San Francisco',
  bio: 'Product designer & automotive enthusiast.',
  avatar: '',
  avatarUrl: '',
  avatar_url: '',
  photoURL: '',
  profileImage: '',
  profile_image: '',
  isVerified: true,
  is_verified: true,
  verified: true,
  createdAt: '2025-01-15T10:00:00Z',
  created_at: '2025-01-15T10:00:00Z',
  user_metadata: {
    full_name: 'Alex Morgan',
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    role: 'buyer',
    avatar_url: '',
  },
  app_metadata: {
    provider: 'email',
    role: 'buyer',
  },
};

const previewColorsBase: Record<string, string> = {
  primary: '#2563EB',
  primaryLight: '#DBEAFE',
  secondary: '#64748B',
  accent: '#4F46E5',
  background: '#FFFFFF',
  backgroundSecondary: '#F8FAFC',
  surface: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  muted: '#94A3B8',
  placeholder: '#94A3B8',
  border: '#E2E8F0',
  divider: '#E2E8F0',
  error: '#EF4444',
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  white: '#FFFFFF',
  black: '#0F172A',
  tint: '#2563EB',
  icon: '#64748B',
  tabIconDefault: '#94A3B8',
  tabIconSelected: '#2563EB',
  notification: '#EF4444',
};

const safeContextFallbackBase: Record<string | symbol, unknown> = {
  user: previewUserBase,
  currentUser: previewUserBase,
  profile: previewUserBase,
  session: {
    access_token: 'preview-access-token',
    refresh_token: 'preview-refresh-token',
    user: previewUserBase,
  },
  isAuthenticated: true,
  isLoggedIn: true,
  isSignedIn: true,
  isLoading: false,
  loading: false,
  isPending: false,
  isRefreshing: false,
  isInitialized: true,
  isReady: true,
  error: null,
  theme: 'light',
  colorScheme: 'light',
  isDark: false,
  dark: false,
  colors: previewColorsBase,
  items: STABLE_EMPTY_ARRAY,
  cart: STABLE_EMPTY_ARRAY,
  favorites: STABLE_EMPTY_ARRAY,
  wishlist: STABLE_EMPTY_ARRAY,
  notifications: STABLE_EMPTY_ARRAY,
  bookings: STABLE_EMPTY_ARRAY,
  listings: STABLE_EMPTY_ARRAY,
  vehicles: STABLE_EMPTY_ARRAY,
  cars: STABLE_EMPTY_ARRAY,
  orders: STABLE_EMPTY_ARRAY,
  transactions: STABLE_EMPTY_ARRAY,
  messages: STABLE_EMPTY_ARRAY,
  chats: STABLE_EMPTY_ARRAY,
  unreadCount: 0,
  count: 0,
  total: 0,
  balance: 0,
  signIn: async () => ({ data: { user: previewUserBase }, error: null }),
  signUp: async () => ({ data: { user: previewUserBase }, error: null }),
  signOut: async () => ({ error: null }),
  login: async () => ({ data: { user: previewUserBase }, error: null }),
  logout: async () => undefined,
  register: async () => ({ data: { user: previewUserBase }, error: null }),
  refresh: async () => undefined,
  refetch: async () => undefined,
  updateProfile: async () => ({ error: null }),
  toggleTheme: () => undefined,
  setTheme: () => undefined,
};

safeContextFallbackBase[Symbol.iterator] = function* () {
  yield safeContextFallbackBase;
  yield () => undefined;
};

export const SAFE_CONTEXT_FALLBACK: Record<string, unknown> =
  safeContextFallbackBase as Record<string, unknown>;

// Install unmounted user-context fallback on React.createContext & React.useContext
// (runs after react-native-web has already initialized its internal VirtualizedListContext)
const origCreateContext = React.createContext;
const origUseContext = React.useContext;

const wrappedCreateContext = function zeluneCreateContext(
  defaultValue: unknown,
  ...rest: unknown[]
) {
  const isEmptyDefault =
    defaultValue === undefined ||
    defaultValue === null ||
    (typeof defaultValue === 'object' &&
      defaultValue !== null &&
      Object.keys(defaultValue as object).length === 0);
  const effectiveDefault = isEmptyDefault ? SAFE_CONTEXT_FALLBACK : defaultValue;
  const ctx = (origCreateContext as (...a: unknown[]) => Record<string, unknown>).call(
    React,
    effectiveDefault,
    ...rest
  );
  if (ctx && typeof ctx === 'object' && isEmptyDefault) {
    ctx.__zeluneUserContext = true;
  }
  return ctx;
} as unknown as typeof React.createContext;

const wrappedUseContext = function zeluneUseContext(
  Context: React.Context<unknown>,
  ...rest: unknown[]
) {
  const val = (origUseContext as (...a: unknown[]) => unknown).call(React, Context, ...rest);
  if (
    val === undefined ||
    (val === null &&
      Boolean((Context as unknown as Record<string, unknown>)?.__zeluneUserContext))
  ) {
    return SAFE_CONTEXT_FALLBACK;
  }
  return val;
} as unknown as typeof React.useContext;

try {
  React.createContext = wrappedCreateContext;
  React.useContext = wrappedUseContext;
} catch {
  // Ignore if React namespace is frozen in test environment
}

const SUPABASE_QUERY_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'rangeGt',
  'rangeGte',
  'rangeLt',
  'rangeLte',
  'rangeAdjacent',
  'overlaps',
  'textSearch',
  'match',
  'not',
  'or',
  'filter',
  'order',
  'limit',
  'range',
  'abortSignal',
  'csv',
  'returns',
];

function createSupabaseQueryBuilder(): Record<string, unknown> {
  const resultPromise = Promise.resolve({ data: [], error: null, count: 0 });
  const builder: Record<string, unknown> = {
    then: resultPromise.then.bind(resultPromise),
    catch: resultPromise.catch.bind(resultPromise),
    finally: resultPromise.finally.bind(resultPromise),
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const returnSelf = () => builder;
  for (const method of SUPABASE_QUERY_METHODS) {
    builder[method] = returnSelf;
  }
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
  z,
  string,
  number,
  boolean,
  object,
  array,
  union,
  literal,
  record,
  tuple,
  any,
  unknown,
  optional,
  nullable,
  coerce,
  zodResolver,
  yupResolver,
  useForm,
  useFormContext,
  FormProvider,
  useWatch,
  useFieldArray,
  Controller,
};

Object.assign(UniversalDefaultExportComponent, defaultExportProperties);

export default UniversalDefaultExportComponent as typeof UniversalDefaultExportComponent &
  typeof defaultExportProperties;
