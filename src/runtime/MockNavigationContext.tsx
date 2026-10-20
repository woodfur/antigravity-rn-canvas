import React, { createContext, useContext, useMemo } from 'react';

export interface NavigationController {
  navigate: (targetRoute: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
  push: (targetRoute: string, params?: Record<string, unknown>) => void;
}

interface MockNavigationContextValue {
  currentRoute: string;
  params: Record<string, unknown>;
  navigation: NavigationController;
}

const MockNavigationContext = createContext<MockNavigationContextValue>({
  currentRoute: 'Home',
  params: {},
  navigation: {
    navigate: () => undefined,
    goBack: () => undefined,
    push: () => undefined,
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
    const cleanTarget = (raw: string) => raw.replace(/Screen$/, '');
    return {
      currentRoute: routeName,
      params,
      navigation: {
        navigate: (targetRoute, navParams) => {
          onNavigate?.(routeName, cleanTarget(targetRoute), navParams);
        },
        push: (targetRoute, navParams) => {
          onNavigate?.(routeName, cleanTarget(targetRoute), navParams);
        },
        goBack: () => {
          onNavigate?.(routeName, 'Home');
        },
      },
    };
  }, [routeName, params, onNavigate]);

  return (
    <MockNavigationContext.Provider value={value}>
      {children}
    </MockNavigationContext.Provider>
  );
};

export function useNavigation(): NavigationController {
  return useContext(MockNavigationContext).navigation;
}

export function useRoute(): { name: string; params: Record<string, unknown> } {
  const ctx = useContext(MockNavigationContext);
  return {
    name: ctx.currentRoute,
    params: ctx.params,
  };
}
