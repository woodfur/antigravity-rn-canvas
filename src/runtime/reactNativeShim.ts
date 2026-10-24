import React, { useRef } from 'react';
import * as RNW from 'react-native-web';
import { withNativeWind } from './nativewindShim';

export * from 'react-native-web';

// Wrap core React Native primitives with NativeWind className -> style support
export const View = withNativeWind(RNW.View as unknown as React.ComponentType<Record<string, unknown>>, 'View');
export const Text = withNativeWind(RNW.Text as unknown as React.ComponentType<Record<string, unknown>>, 'Text');
export const Pressable = withNativeWind(
  RNW.Pressable as unknown as React.ComponentType<Record<string, unknown>>,
  'Pressable'
);
export const TouchableOpacity = withNativeWind(
  RNW.TouchableOpacity as unknown as React.ComponentType<Record<string, unknown>>,
  'TouchableOpacity'
);
export const TouchableHighlight = withNativeWind(
  RNW.TouchableHighlight as unknown as React.ComponentType<Record<string, unknown>>,
  'TouchableHighlight'
);
export const TouchableWithoutFeedback = withNativeWind(
  RNW.TouchableWithoutFeedback as unknown as React.ComponentType<Record<string, unknown>>,
  'TouchableWithoutFeedback'
);
export const ScrollView = withNativeWind(
  RNW.ScrollView as unknown as React.ComponentType<Record<string, unknown>>,
  'ScrollView'
);
export const FlatList = withNativeWind(
  RNW.FlatList as unknown as React.ComponentType<Record<string, unknown>>,
  'FlatList'
);
export const SectionList = withNativeWind(
  RNW.SectionList as unknown as React.ComponentType<Record<string, unknown>>,
  'SectionList'
);
export const KeyboardAvoidingView = withNativeWind(
  RNW.KeyboardAvoidingView as unknown as React.ComponentType<Record<string, unknown>>,
  'KeyboardAvoidingView'
);
export const TextInput = withNativeWind(
  RNW.TextInput as unknown as React.ComponentType<Record<string, unknown>>,
  'TextInput'
);
export const Image = withNativeWind(
  RNW.Image as unknown as React.ComponentType<Record<string, unknown>>,
  'Image'
);
export const ImageBackground = withNativeWind(
  RNW.ImageBackground as unknown as React.ComponentType<Record<string, unknown>>,
  'ImageBackground'
);
export const SafeAreaView = withNativeWind(
  RNW.SafeAreaView as unknown as React.ComponentType<Record<string, unknown>>,
  'SafeAreaView'
);
export const ActivityIndicator = withNativeWind(
  RNW.ActivityIndicator as unknown as React.ComponentType<Record<string, unknown>>,
  'ActivityIndicator'
);
export const Modal = withNativeWind(
  RNW.Modal as unknown as React.ComponentType<Record<string, unknown>>,
  'Modal'
);

// Pin mobile artboard dimensions (393x852 iPhone 15 Pro) so Dimensions.get('window')
// and useWindowDimensions() never return the desktop browser's 1440x900 window size.
const ARTBOARD_DIMENSIONS = {
  width: 393,
  height: 852,
  scale: 3,
  fontScale: 1,
};

export const Dimensions = {
  get: (_dim?: 'window' | 'screen' | string) => ARTBOARD_DIMENSIONS,
  set: () => undefined,
  addEventListener: () => ({ remove: () => undefined }),
  removeEventListener: () => undefined,
};

export function useWindowDimensions() {
  return ARTBOARD_DIMENSIONS;
}

export function useAnimatedValue(initialValue = 0): RNW.Animated.Value {
  const ref = useRef<RNW.Animated.Value | null>(null);
  if (!ref.current) {
    ref.current = new RNW.Animated.Value(initialValue);
  }
  return ref.current;
}

export const PermissionsAndroid = {
  PERMISSIONS: new Proxy({} as Record<string, string>, {
    get: (_target, prop) => String(prop),
  }),
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  check: async () => true,
  request: async () => 'granted',
  requestMultiple: async () => ({}),
};

export const ToastAndroid = {
  SHORT: 2000,
  LONG: 3500,
  TOP: 0,
  BOTTOM: 1,
  CENTER: 2,
  show: () => undefined,
  showWithGravity: () => undefined,
  showWithGravityAndOffset: () => undefined,
};

export const ActionSheetIOS = {
  showActionSheetWithOptions: () => undefined,
  showShareActionSheetWithOptions: () => undefined,
  dismissActionSheet: () => undefined,
};

export const InputAccessoryView: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const DrawerLayoutAndroid: React.FC<{
  children?: React.ReactNode;
  style?: unknown;
}> = ({ children, style }) =>
  React.createElement(RNW.View, { style: [{ flex: 1 }, style] as never }, children);

export const TurboModuleRegistry = {
  get: () => ({}),
  getEnforcing: () => ({}),
};

export function requireNativeComponent(viewName: string) {
  const Comp: React.FC<{ children?: React.ReactNode; style?: unknown }> = ({
    children,
    style,
  }) => React.createElement(RNW.View, { style: style as never }, children);
  Comp.displayName = viewName;
  return Comp;
}

export const codegenNativeComponent = requireNativeComponent;

export function PlatformColor(...names: string[]): string {
  const first = (names[0] ?? '').toLowerCase();
  if (first.includes('background')) return '#0F172A';
  if (first.includes('label') || first.includes('text')) return '#F8FAFC';
  return '#6366F1';
}

export function DynamicColorIOS(tuple: { light?: string; dark?: string }): string {
  return tuple?.dark ?? tuple?.light ?? '#6366F1';
}

export const DevSettings = {
  addMenuItem: () => undefined,
  reload: () => undefined,
};

export const Systrace = {
  isEnabled: () => false,
  beginEvent: () => undefined,
  endEvent: () => undefined,
  beginAsyncEvent: () => 0,
  endAsyncEvent: () => undefined,
  counterEvent: () => undefined,
};

export const Networking = {
  addListener: () => ({ remove: () => undefined }),
  sendRequest: () => undefined,
  abortRequest: () => undefined,
  clearCookies: () => undefined,
};

export const Settings = {
  get: () => undefined,
  set: () => undefined,
  watchKeys: () => 0,
  clearWatch: () => undefined,
};

const ReactNativeDefault = new Proxy(
  {
    ...RNW,
    View,
    Text,
    Pressable,
    TouchableOpacity,
    TouchableHighlight,
    TouchableWithoutFeedback,
    ScrollView,
    FlatList,
    SectionList,
    KeyboardAvoidingView,
    TextInput,
    Image,
    ImageBackground,
    SafeAreaView,
    ActivityIndicator,
    Modal,
    Dimensions,
    useWindowDimensions,
    useAnimatedValue,
    PermissionsAndroid,
    ToastAndroid,
    ActionSheetIOS,
    InputAccessoryView,
    DrawerLayoutAndroid,
    TurboModuleRegistry,
    requireNativeComponent,
    codegenNativeComponent,
    PlatformColor,
    DynamicColorIOS,
    DevSettings,
    Systrace,
    Networking,
    Settings,
  },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target];
      }
      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
        return requireNativeComponent(prop);
      }
      return () => undefined;
    },
  }
);

export default ReactNativeDefault;
