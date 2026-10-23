import React, { useRef } from 'react';
import * as RNW from 'react-native-web';

export * from 'react-native-web';

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
