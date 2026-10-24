import React from 'react';

export interface TailwindThemeConfig {
  colors?: Record<string, unknown>;
  fontSize?: Record<string, unknown>;
  borderRadius?: Record<string, unknown>;
  spacing?: Record<string, unknown>;
  opacity?: Record<string, unknown>;
  fontFamily?: Record<string, unknown>;
}

declare global {
  interface Window {
    __ZELUNE_TAILWIND_THEME__?: TailwindThemeConfig;
  }
}

// Built-in fallback palette combining standard Tailwind v3 colors + M3 / NativeWind semantic tokens
const DEFAULT_COLORS: Record<string, unknown> = {
  transparent: 'transparent',
  current: 'currentColor',
  black: '#000000',
  white: '#FFFFFF',
  surface: {
    DEFAULT: '#FAFAFA',
    dim: '#F2F2F2',
    bright: '#FFFFFF',
    'container-lowest': '#F9FAFB',
    'container-low': '#F3F4F6',
    container: '#FFFFFF',
    'container-high': '#F3F4F6',
    'container-highest': '#E5E7EB',
  },
  'on-surface': {
    DEFAULT: '#1A1A2E',
    variant: '#6B7280',
  },
  primary: {
    DEFAULT: '#0F3460',
    container: '#E8F0FF',
    fixed: '#E8F0FF',
    'fixed-dim': '#C5D5F0',
    'on-primary': '#FFFFFF',
    'on-container': '#0F3460',
  },
  secondary: {
    DEFAULT: '#4B5563',
    container: '#F3F4F6',
    'on-secondary': '#FFFFFF',
    'on-container': '#1A1A2E',
  },
  tertiary: {
    DEFAULT: '#0D9488',
    container: '#CCFBF1',
    'on-tertiary': '#FFFFFF',
    'on-container': '#134E4A',
  },
  outline: {
    DEFAULT: '#E5E7EB',
    variant: '#F3F4F6',
  },
  inverse: {
    surface: '#1A1A2E',
    'on-surface': '#FAFAFA',
    primary: '#C5D5F0',
  },
  error: {
    DEFAULT: '#DC2626',
    container: '#FEE2E2',
  },
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  zinc: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
  },
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
  },
  yellow: {
    50: '#FEFCE8',
    100: '#FEF9C3',
    400: '#FACC15',
    500: '#EAB308',
    600: '#CA8A04',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
  },
  emerald: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  },
  teal: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488',
    700: '#0F766E',
  },
  sky: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
  },
  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  indigo: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
  },
  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    500: '#A855F7',
    600: '#9333EA',
  },
  pink: {
    50: '#FDF2F8',
    100: '#FCE7F3',
    500: '#EC4899',
    600: '#DB2777',
  },
};

const DEFAULT_FONT_SIZES: Record<string, [number, { lineHeight?: number; letterSpacing?: number; fontWeight?: string }]> = {
  xs: [12, { lineHeight: 16 }],
  sm: [14, { lineHeight: 20 }],
  base: [16, { lineHeight: 24 }],
  lg: [18, { lineHeight: 28 }],
  xl: [20, { lineHeight: 28 }],
  '2xl': [24, { lineHeight: 32 }],
  '3xl': [30, { lineHeight: 36 }],
  '4xl': [36, { lineHeight: 40 }],
  '5xl': [48, { lineHeight: 52 }],
  'display-lg': [57, { lineHeight: 64, letterSpacing: -0.25 }],
  'display-md': [45, { lineHeight: 52 }],
  'display-sm': [36, { lineHeight: 44 }],
  'headline-lg': [32, { lineHeight: 40 }],
  'headline-md': [28, { lineHeight: 36 }],
  'headline-sm': [24, { lineHeight: 32 }],
  'title-lg': [22, { lineHeight: 28 }],
  'title-md': [16, { lineHeight: 24, letterSpacing: 0.15, fontWeight: '500' }],
  'title-sm': [14, { lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' }],
  'body-lg': [16, { lineHeight: 24, letterSpacing: 0.5 }],
  'body-md': [14, { lineHeight: 20, letterSpacing: 0.25 }],
  'body-sm': [12, { lineHeight: 16, letterSpacing: 0.4 }],
  'label-lg': [14, { lineHeight: 20, letterSpacing: 0.1, fontWeight: '500' }],
  'label-md': [12, { lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' }],
  'label-sm': [11, { lineHeight: 16, letterSpacing: 0.5, fontWeight: '500' }],
};

const DEFAULT_RADII: Record<string, number> = {
  none: 0,
  sm: 4,
  DEFAULT: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 28,
  full: 9999,
};

function parsePxNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.endsWith('rem')) {
      const n = Number.parseFloat(trimmed);
      return Number.isFinite(n) ? n * 16 : undefined;
    }
    const n = Number.parseFloat(trimmed.replace(/px$/i, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function applyColorAlpha(colorStr: string, alphaRatio: number): string {
  if (!Number.isFinite(alphaRatio) || alphaRatio >= 1) return colorStr;
  const clamped = Math.max(0, Math.min(1, alphaRatio));
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colorStr.trim());
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Number(clamped.toFixed(3))})`;
  }
  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(colorStr.trim());
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${Number(clamped.toFixed(3))})`;
  }
  return colorStr;
}

function lookupColorToken(rawToken: string, themeColors: Record<string, unknown>): string | undefined {
  // Arbitrary value e.g. [#0F3460] or [rgba(0,0,0,0.5)]
  if (rawToken.startsWith('[') && rawToken.endsWith(']')) {
    return rawToken.slice(1, -1);
  }

  const [colorPath, alphaPart] = rawToken.split('/');
  let resolvedHex: string | undefined;

  // 1. Direct match in themeColors or DEFAULT_COLORS
  const sources = [themeColors, DEFAULT_COLORS];
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    const direct = src[colorPath];
    if (typeof direct === 'string') {
      resolvedHex = direct;
      break;
    }
    if (direct && typeof direct === 'object' && 'DEFAULT' in direct) {
      const defVal = (direct as Record<string, unknown>).DEFAULT;
      if (typeof defVal === 'string') {
        resolvedHex = defVal;
        break;
      }
    }

    // Try splitting hyphenated prefixes e.g. 'surface-container-high' -> src['surface']['container-high']
    // or 'on-surface-variant' -> src['on-surface']['variant']
    const parts = colorPath.split('-');
    for (let splitIdx = parts.length - 1; splitIdx >= 1; splitIdx--) {
      const groupKey = parts.slice(0, splitIdx).join('-');
      const shadeKey = parts.slice(splitIdx).join('-');
      const groupObj = src[groupKey];
      if (groupObj && typeof groupObj === 'object') {
        const shadeVal = (groupObj as Record<string, unknown>)[shadeKey];
        if (typeof shadeVal === 'string') {
          resolvedHex = shadeVal;
          break;
        }
      }
    }
    if (resolvedHex) break;
  }

  if (!resolvedHex) return undefined;

  if (alphaPart !== undefined) {
    const customOpacity =
      typeof window !== 'undefined' ? window.__ZELUNE_TAILWIND_THEME__?.opacity?.[alphaPart] : undefined;
    let alphaRatio =
      typeof customOpacity === 'string' || typeof customOpacity === 'number'
        ? Number.parseFloat(String(customOpacity))
        : Number.NaN;
    if (!Number.isFinite(alphaRatio)) {
      const numeric = Number.parseFloat(alphaPart);
      if (Number.isFinite(numeric)) {
        alphaRatio = numeric <= 1 ? numeric : numeric / 100;
      }
    }
    if (Number.isFinite(alphaRatio)) {
      return applyColorAlpha(resolvedHex, alphaRatio);
    }
  }

  return resolvedHex;
}

function resolveSpacingToken(rawVal: string, themeSpacing: Record<string, unknown>): number | string | undefined {
  if (rawVal === 'auto') return 'auto';
  if (rawVal === 'px') return 1;
  if (rawVal === 'full') return '100%';
  if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
    const inner = rawVal.slice(1, -1);
    if (inner.endsWith('%')) return inner;
    const px = parsePxNumber(inner);
    return px !== undefined ? px : inner;
  }
  if (rawVal.includes('/')) {
    const [num, den] = rawVal.split('/').map(Number);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return `${Number(((num / den) * 100).toFixed(4))}%`;
    }
  }
  if (themeSpacing && rawVal in themeSpacing) {
    const customPx = parsePxNumber(themeSpacing[rawVal]);
    if (customPx !== undefined) return customPx;
  }
  const num = Number.parseFloat(rawVal);
  if (Number.isFinite(num)) {
    return num * 4;
  }
  return undefined;
}

const classStyleCache = new Map<string, Record<string, unknown>>();

export function resolveTailwindClassNameToStyle(className?: string): Record<string, unknown> | null {
  if (!className || typeof className !== 'string') return null;
  const normalized = className.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const cached = classStyleCache.get(normalized);
  if (cached) return cached;

  const projectTheme: TailwindThemeConfig =
    (typeof window !== 'undefined' && window.__ZELUNE_TAILWIND_THEME__) || {};
  const themeColors = (projectTheme.colors ?? {}) as Record<string, unknown>;
  const themeFontSizes = (projectTheme.fontSize ?? {}) as Record<string, unknown>;
  const themeFontFamilies = (projectTheme.fontFamily ?? {}) as Record<string, unknown>;
  const themeRadii = (projectTheme.borderRadius ?? {}) as Record<string, unknown>;
  const themeSpacing = (projectTheme.spacing ?? {}) as Record<string, unknown>;

  const style: Record<string, unknown> = {};
  const tokens = normalized.split(' ');

  for (const rawToken of tokens) {
    if (!rawToken) continue;
    // Strip responsive/state prefixes like sm:, md:, active:, focus:, dark:
    const token = rawToken.includes(':') ? rawToken.slice(rawToken.lastIndexOf(':') + 1) : rawToken;
    if (!token) continue;

    // 1. Flexbox & Layout
    if (token === 'flex-1') {
      style.flex = 1;
      continue;
    }
    if (token === 'flex-auto') {
      style.flex = 1;
      continue;
    }
    if (token === 'flex-none') {
      style.flex = 0;
      continue;
    }
    if (token === 'flex-grow' || token === 'grow') {
      style.flexGrow = 1;
      continue;
    }
    if (token === 'flex-shrink' || token === 'shrink') {
      style.flexShrink = 1;
      continue;
    }
    if (token === 'flex-shrink-0' || token === 'shrink-0') {
      style.flexShrink = 0;
      continue;
    }
    if (token === 'flex-row') {
      style.flexDirection = 'row';
      continue;
    }
    if (token === 'flex-row-reverse') {
      style.flexDirection = 'row-reverse';
      continue;
    }
    if (token === 'flex-col') {
      style.flexDirection = 'column';
      continue;
    }
    if (token === 'flex-col-reverse') {
      style.flexDirection = 'column-reverse';
      continue;
    }
    if (token === 'flex-wrap') {
      style.flexWrap = 'wrap';
      continue;
    }
    if (token === 'flex-nowrap') {
      style.flexWrap = 'nowrap';
      continue;
    }
    if (token === 'hidden') {
      style.display = 'none';
      continue;
    }

    // Align Items & Self & Content
    if (token === 'items-start') {
      style.alignItems = 'flex-start';
      continue;
    }
    if (token === 'items-center') {
      style.alignItems = 'center';
      continue;
    }
    if (token === 'items-end') {
      style.alignItems = 'flex-end';
      continue;
    }
    if (token === 'items-stretch') {
      style.alignItems = 'stretch';
      continue;
    }
    if (token === 'items-baseline') {
      style.alignItems = 'baseline';
      continue;
    }
    if (token === 'self-start') {
      style.alignSelf = 'flex-start';
      continue;
    }
    if (token === 'self-center') {
      style.alignSelf = 'center';
      continue;
    }
    if (token === 'self-end') {
      style.alignSelf = 'flex-end';
      continue;
    }
    if (token === 'self-stretch') {
      style.alignSelf = 'stretch';
      continue;
    }
    if (token === 'self-auto') {
      style.alignSelf = 'auto';
      continue;
    }

    // Justify Content
    if (token === 'justify-start') {
      style.justifyContent = 'flex-start';
      continue;
    }
    if (token === 'justify-center') {
      style.justifyContent = 'center';
      continue;
    }
    if (token === 'justify-end') {
      style.justifyContent = 'flex-end';
      continue;
    }
    if (token === 'justify-between') {
      style.justifyContent = 'space-between';
      continue;
    }
    if (token === 'justify-around') {
      style.justifyContent = 'space-around';
      continue;
    }
    if (token === 'justify-evenly') {
      style.justifyContent = 'space-evenly';
      continue;
    }

    // Position & Overflow
    if (token === 'relative') {
      style.position = 'relative';
      continue;
    }
    if (token === 'absolute') {
      style.position = 'absolute';
      continue;
    }
    if (token === 'inset-0') {
      style.top = 0;
      style.right = 0;
      style.bottom = 0;
      style.left = 0;
      continue;
    }
    if (token === 'overflow-hidden') {
      style.overflow = 'hidden';
      continue;
    }
    if (token === 'overflow-visible') {
      style.overflow = 'visible';
      continue;
    }
    if (token === 'overflow-scroll') {
      style.overflow = 'scroll';
      continue;
    }

    const posMatch = /^(-?)(top|right|bottom|left)-(.+)$/.exec(token);
    if (posMatch) {
      const sign = posMatch[1] === '-' ? -1 : 1;
      const prop = posMatch[2];
      const val = resolveSpacingToken(posMatch[3], themeSpacing);
      if (typeof val === 'number') style[prop] = val * sign;
      else if (val !== undefined) style[prop] = val;
      continue;
    }

    if (token.startsWith('z-')) {
      const zVal = Number.parseInt(token.slice(2), 10);
      if (Number.isFinite(zVal)) style.zIndex = zVal;
      continue;
    }

    // 2. Gap
    if (token.startsWith('gap-x-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (typeof v === 'number') style.columnGap = v;
      continue;
    }
    if (token.startsWith('gap-y-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (typeof v === 'number') style.rowGap = v;
      continue;
    }
    if (token.startsWith('gap-')) {
      const v = resolveSpacingToken(token.slice(4), themeSpacing);
      if (typeof v === 'number') style.gap = v;
      continue;
    }

    // 3. Padding & Margin
    const spacingMatch = /^(-?)(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-(.+)$/.exec(token);
    if (spacingMatch) {
      const sign = spacingMatch[1] === '-' ? -1 : 1;
      const dir = spacingMatch[2];
      const rawVal = resolveSpacingToken(spacingMatch[3], themeSpacing);
      if (rawVal !== undefined) {
        const val = typeof rawVal === 'number' ? rawVal * sign : rawVal;
        const propMap: Record<string, string> = {
          p: 'padding',
          px: 'paddingHorizontal',
          py: 'paddingVertical',
          pt: 'paddingTop',
          pr: 'paddingRight',
          pb: 'paddingBottom',
          pl: 'paddingLeft',
          m: 'margin',
          mx: 'marginHorizontal',
          my: 'marginVertical',
          mt: 'marginTop',
          mr: 'marginRight',
          mb: 'marginBottom',
          ml: 'marginLeft',
        };
        style[propMap[dir]] = val;
        continue;
      }
    }

    // 4. Width & Height
    if (token === 'w-screen') {
      style.width = 393;
      continue;
    }
    if (token === 'h-screen') {
      style.height = 852;
      continue;
    }
    if (token.startsWith('w-')) {
      const v = resolveSpacingToken(token.slice(2), themeSpacing);
      if (v !== undefined) {
        style.width = v;
        continue;
      }
    }
    if (token.startsWith('h-')) {
      const v = resolveSpacingToken(token.slice(2), themeSpacing);
      if (v !== undefined) {
        style.height = v;
        continue;
      }
    }
    if (token.startsWith('size-')) {
      const v = resolveSpacingToken(token.slice(5), themeSpacing);
      if (v !== undefined) {
        style.width = v;
        style.height = v;
        continue;
      }
    }
    if (token.startsWith('min-w-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (v !== undefined) {
        style.minWidth = v;
        continue;
      }
    }
    if (token.startsWith('min-h-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (v !== undefined) {
        style.minHeight = v;
        continue;
      }
    }
    if (token.startsWith('max-w-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (v !== undefined) {
        style.maxWidth = v;
        continue;
      }
    }
    if (token.startsWith('max-h-')) {
      const v = resolveSpacingToken(token.slice(6), themeSpacing);
      if (v !== undefined) {
        style.maxHeight = v;
        continue;
      }
    }

    // 5. Border Radius
    if (token === 'rounded' || token.startsWith('rounded-')) {
      const suffix = token === 'rounded' ? 'DEFAULT' : token.slice(8);
      const customR = parsePxNumber(themeRadii[suffix]);
      const radiusVal = customR ?? DEFAULT_RADII[suffix];
      if (radiusVal !== undefined) {
        style.borderRadius = radiusVal;
        continue;
      }
      const cornerMatch = /^(t|b|l|r|tl|tr|bl|br)-(.+)$/.exec(suffix);
      if (cornerMatch) {
        const cDir = cornerMatch[1];
        const cKey = cornerMatch[2];
        const r = parsePxNumber(themeRadii[cKey]) ?? DEFAULT_RADII[cKey];
        if (r !== undefined) {
          if (cDir === 't' || cDir === 'tl') style.borderTopLeftRadius = r;
          if (cDir === 't' || cDir === 'tr') style.borderTopRightRadius = r;
          if (cDir === 'b' || cDir === 'bl') style.borderBottomLeftRadius = r;
          if (cDir === 'b' || cDir === 'br') style.borderBottomRightRadius = r;
          if (cDir === 'l') {
            style.borderTopLeftRadius = r;
            style.borderBottomLeftRadius = r;
          }
          if (cDir === 'r') {
            style.borderTopRightRadius = r;
            style.borderBottomRightRadius = r;
          }
          continue;
        }
      }
    }

    // 6. Borders
    if (token === 'border') {
      style.borderWidth = 1;
      continue;
    }
    const borderWidthMatch = /^border-(0|2|4|8)$/.exec(token);
    if (borderWidthMatch) {
      style.borderWidth = Number.parseInt(borderWidthMatch[1], 10);
      continue;
    }
    const borderSideMatch = /^border-(t|r|b|l)(?:-(0|2|4|8))?$/.exec(token);
    if (borderSideMatch) {
      const sideMap: Record<string, string> = {
        t: 'borderTopWidth',
        r: 'borderRightWidth',
        b: 'borderBottomWidth',
        l: 'borderLeftWidth',
      };
      style[sideMap[borderSideMatch[1]]] = borderSideMatch[2]
        ? Number.parseInt(borderSideMatch[2], 10)
        : 1;
      continue;
    }
    if (token.startsWith('border-')) {
      const bColor = lookupColorToken(token.slice(7), themeColors);
      if (bColor) {
        style.borderColor = bColor;
        continue;
      }
    }

    // 7. Background Color (bg-*)
    if (token.startsWith('bg-')) {
      const bgColor = lookupColorToken(token.slice(3), themeColors);
      if (bgColor) {
        style.backgroundColor = bgColor;
        continue;
      }
    }

    // 8. Typography & Text Color (text-*, font-*, tracking-*, leading-*, etc.)
    if (token === 'italic') {
      style.fontStyle = 'italic';
      continue;
    }
    if (token === 'not-italic') {
      style.fontStyle = 'normal';
      continue;
    }
    if (token === 'uppercase') {
      style.textTransform = 'uppercase';
      continue;
    }
    if (token === 'lowercase') {
      style.textTransform = 'lowercase';
      continue;
    }
    if (token === 'capitalize') {
      style.textTransform = 'capitalize';
      continue;
    }
    if (token === 'underline') {
      style.textDecorationLine = 'underline';
      continue;
    }
    if (token === 'line-through') {
      style.textDecorationLine = 'line-through';
      continue;
    }
    if (token === 'text-left') {
      style.textAlign = 'left';
      continue;
    }
    if (token === 'text-center') {
      style.textAlign = 'center';
      continue;
    }
    if (token === 'text-right') {
      style.textAlign = 'right';
      continue;
    }

    // Font family / weight shorthands (both standard Tailwind and custom M3 font tokens)
    if (token === 'font-headline' || token === 'font-bold') {
      style.fontWeight = '700';
      continue;
    }
    if (
      token === 'font-headline-medium' ||
      token === 'font-body-semibold' ||
      token === 'font-semibold'
    ) {
      style.fontWeight = '600';
      continue;
    }
    if (token === 'font-body-medium' || token === 'font-medium') {
      style.fontWeight = '500';
      continue;
    }
    if (token === 'font-body' || token === 'font-normal') {
      style.fontWeight = '400';
      continue;
    }
    if (token === 'font-light') {
      style.fontWeight = '300';
      continue;
    }
    if (token === 'font-extrabold' || token === 'font-black') {
      style.fontWeight = '800';
      continue;
    }
    if (token === 'font-mono') {
      style.fontFamily = 'monospace';
      continue;
    }
    if (token.startsWith('font-')) {
      const fontKey = token.slice(5);
      const customFontEntry = themeFontFamilies[fontKey];
      if (customFontEntry !== undefined) {
        const primaryFont = Array.isArray(customFontEntry)
          ? String(customFontEntry[0] ?? '')
          : String(customFontEntry ?? '');
        const lowerFont = primaryFont.toLowerCase();
        if (lowerFont.includes('800') || lowerFont.includes('extrabold') || lowerFont.includes('black')) {
          style.fontWeight = '800';
        } else if (lowerFont.includes('700') || lowerFont.includes('bold')) {
          style.fontWeight = lowerFont.includes('semibold') ? '600' : '700';
        } else if (lowerFont.includes('600') || lowerFont.includes('semibold')) {
          style.fontWeight = '600';
        } else if (lowerFont.includes('500') || lowerFont.includes('medium')) {
          style.fontWeight = '500';
        } else if (lowerFont.includes('300') || lowerFont.includes('light')) {
          style.fontWeight = '300';
        } else {
          style.fontWeight = '400';
        }
        continue;
      }
    }

    // Letter spacing (tracking-*)
    if (token === 'tracking-tighter') {
      style.letterSpacing = -0.8;
      continue;
    }
    if (token === 'tracking-tight') {
      style.letterSpacing = -0.4;
      continue;
    }
    if (token === 'tracking-normal') {
      style.letterSpacing = 0;
      continue;
    }
    if (token === 'tracking-wide') {
      style.letterSpacing = 0.4;
      continue;
    }
    if (token === 'tracking-wider') {
      style.letterSpacing = 0.8;
      continue;
    }
    if (token === 'tracking-widest') {
      style.letterSpacing = 1.4;
      continue;
    }

    if (token.startsWith('text-')) {
      const textSuffix = token.slice(5);

      // Check custom theme fontSize first
      const customFs = themeFontSizes[textSuffix];
      if (customFs !== undefined) {
        if (Array.isArray(customFs)) {
          const sz = parsePxNumber(customFs[0]);
          if (sz !== undefined) style.fontSize = sz;
          const meta = customFs[1];
          if (meta && typeof meta === 'object') {
            const lh = parsePxNumber((meta as Record<string, unknown>).lineHeight);
            const ls = parsePxNumber((meta as Record<string, unknown>).letterSpacing);
            const fw = (meta as Record<string, unknown>).fontWeight;
            if (lh !== undefined) style.lineHeight = lh;
            if (ls !== undefined) style.letterSpacing = ls;
            if (typeof fw === 'string' || typeof fw === 'number') style.fontWeight = String(fw);
          }
          continue;
        }
        const singleSz = parsePxNumber(customFs);
        if (singleSz !== undefined) {
          style.fontSize = singleSz;
          continue;
        }
      }

      // Check built-in fontSize scale (including M3 type scale: headline-md, title-lg, body-sm, label-md, etc.)
      const builtinFs = DEFAULT_FONT_SIZES[textSuffix];
      if (builtinFs) {
        style.fontSize = builtinFs[0];
        if (builtinFs[1].lineHeight !== undefined) style.lineHeight = builtinFs[1].lineHeight;
        if (builtinFs[1].letterSpacing !== undefined) style.letterSpacing = builtinFs[1].letterSpacing;
        if (builtinFs[1].fontWeight !== undefined && !style.fontWeight) {
          style.fontWeight = builtinFs[1].fontWeight;
        }
        continue;
      }

      // Arbitrary font size e.g. text-[15px]
      if (textSuffix.startsWith('[') && textSuffix.endsWith(']')) {
        const inner = textSuffix.slice(1, -1);
        const px = parsePxNumber(inner);
        if (px !== undefined && !inner.startsWith('#') && !inner.startsWith('rgb')) {
          style.fontSize = px;
          continue;
        }
      }

      // Otherwise resolve as text color
      const tColor = lookupColorToken(textSuffix, themeColors);
      if (tColor) {
        style.color = tColor;
        continue;
      }
    }

    // 9. Opacity & Shadows
    if (token.startsWith('opacity-')) {
      const opVal = Number.parseFloat(token.slice(8));
      if (Number.isFinite(opVal)) {
        style.opacity = opVal <= 1 ? opVal : opVal / 100;
        continue;
      }
    }
    if (token === 'shadow-sm' || token === 'shadow') {
      style.shadowColor = '#0F172A';
      style.shadowOffset = { width: 0, height: 2 };
      style.shadowOpacity = 0.06;
      style.shadowRadius = 6;
      continue;
    }
    if (token === 'shadow-md' || token === 'shadow-lg' || token === 'shadow-xl') {
      style.shadowColor = '#0F172A';
      style.shadowOffset = { width: 0, height: 6 };
      style.shadowOpacity = 0.1;
      style.shadowRadius = 14;
      continue;
    }
  }

  classStyleCache.set(normalized, style);
  return style;
}

export function withNativeWind<P extends Record<string, unknown>>(
  BaseComponent: React.ComponentType<P>,
  displayName?: string
): React.ComponentType<P> {
  const Wrapped = React.forwardRef<unknown, P>((props, ref) => {
    const rawClassName = props?.className as string | undefined;
    const rawContentClassName = props?.contentContainerClassName as string | undefined;

    if (!rawClassName && !rawContentClassName) {
      return React.createElement(BaseComponent, { ...props, ref } as unknown as P);
    }

    const twStyle = resolveTailwindClassNameToStyle(rawClassName);
    const twContentStyle = resolveTailwindClassNameToStyle(rawContentClassName);

    const nextProps: Record<string, unknown> = { ...props, ref };
    delete nextProps.className;
    delete nextProps.contentContainerClassName;

    if (twStyle) {
      const origStyle = props.style;
      if (typeof origStyle === 'function') {
        nextProps.style = (state: unknown) => [twStyle, (origStyle as (s: unknown) => unknown)(state)];
      } else if (origStyle !== undefined) {
        nextProps.style = [twStyle, origStyle];
      } else {
        nextProps.style = twStyle;
      }
    }

    if (twContentStyle) {
      const origContentStyle = props.contentContainerStyle;
      nextProps.contentContainerStyle =
        origContentStyle !== undefined ? [twContentStyle, origContentStyle] : twContentStyle;
    }

    return React.createElement(BaseComponent, nextProps as unknown as P);
  });

  Wrapped.displayName = displayName ?? BaseComponent.displayName ?? BaseComponent.name ?? 'RNComponent';
  // Copy static properties (e.g., Image.getSize, Image.prefetch, Animated.*)
  for (const key of Object.keys(BaseComponent)) {
    if (!(key in Wrapped)) {
      (Wrapped as unknown as Record<string, unknown>)[key] = (
        BaseComponent as unknown as Record<string, unknown>
      )[key];
    }
  }
  return Wrapped as unknown as React.ComponentType<P>;
}
