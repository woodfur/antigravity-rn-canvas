/// <reference types="vite/client" />

declare module 'virtual:zelune-screens' {
  import type React from 'react';
  export const SCREEN_COMPONENTS: Record<string, React.ComponentType>;
  export const SCREEN_ORDER: string[];
}
