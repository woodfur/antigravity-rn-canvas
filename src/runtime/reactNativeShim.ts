import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resolveTailwindClassNameToStyle } from './nativewindShim';

export type RnStyle = Record<string, unknown> | RnStyle[] | null | undefined | false | number;

const ARTBOARD_DIMENSIONS = {
  width: 393,
  height: 852,
  scale: 3,
  fontScale: 1,
};

export function flattenStyle(styleInput: RnStyle): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function walk(item: RnStyle) {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        walk(item[i]);
      }
      return;
    }
    for (const [k, v] of Object.entries(item)) {
      if (v !== undefined) {
        result[k] = v;
      }
    }
  }
  walk(styleInput);
  return result;
}

function formatTransformArray(transforms: unknown[]): string {
  const parts: string[] = [];
  for (const item of transforms) {
    if (!item || typeof item !== 'object') continue;
    for (const [key, rawVal] of Object.entries(item as Record<string, unknown>)) {
      if (rawVal === undefined || rawVal === null) continue;
      if (
        (key.startsWith('translate') || key === 'perspective') &&
        typeof rawVal === 'number'
      ) {
        parts.push(`${key}(${rawVal}px)`);
      } else {
        parts.push(`${key}(${String(rawVal)})`);
      }
    }
  }
  return parts.join(' ');
}

function applyAlphaToColor(color: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
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
  return color;
}

export function toDomStyle(
  styleInput: RnStyle,
  baseDefaults: Record<string, unknown> = {},
  className?: string
): React.CSSProperties {
  const twStyle = className ? resolveTailwindClassNameToStyle(className) : null;
  const flat = flattenStyle([baseDefaults, twStyle, styleInput]);
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(flat)) {
    if (val === undefined || val === null) continue;
    switch (key) {
      case 'paddingHorizontal':
        if (flat.paddingLeft === undefined) out.paddingLeft = val;
        if (flat.paddingRight === undefined) out.paddingRight = val;
        break;
      case 'paddingVertical':
        if (flat.paddingTop === undefined) out.paddingTop = val;
        if (flat.paddingBottom === undefined) out.paddingBottom = val;
        break;
      case 'paddingStart':
        if (flat.paddingLeft === undefined) out.paddingLeft = val;
        break;
      case 'paddingEnd':
        if (flat.paddingRight === undefined) out.paddingRight = val;
        break;
      case 'marginHorizontal':
        if (flat.marginLeft === undefined) out.marginLeft = val;
        if (flat.marginRight === undefined) out.marginRight = val;
        break;
      case 'marginVertical':
        if (flat.marginTop === undefined) out.marginTop = val;
        if (flat.marginBottom === undefined) out.marginBottom = val;
        break;
      case 'marginStart':
        if (flat.marginLeft === undefined) out.marginLeft = val;
        break;
      case 'marginEnd':
        if (flat.marginRight === undefined) out.marginRight = val;
        break;
      case 'borderStartWidth':
        if (flat.borderLeftWidth === undefined) out.borderLeftWidth = val;
        break;
      case 'borderEndWidth':
        if (flat.borderRightWidth === undefined) out.borderRightWidth = val;
        break;
      case 'borderTopStartRadius':
        if (flat.borderTopLeftRadius === undefined) out.borderTopLeftRadius = val;
        break;
      case 'borderTopEndRadius':
        if (flat.borderTopRightRadius === undefined) out.borderTopRightRadius = val;
        break;
      case 'borderBottomStartRadius':
        if (flat.borderBottomLeftRadius === undefined) out.borderBottomLeftRadius = val;
        break;
      case 'borderBottomEndRadius':
        if (flat.borderBottomRightRadius === undefined) out.borderBottomRightRadius = val;
        break;
      case 'lineHeight':
        out.lineHeight = typeof val === 'number' ? `${val}px` : val;
        break;
      case 'flex':
        if (typeof val === 'number') {
          if (val > 0) {
            if (flat.flexGrow === undefined) out.flexGrow = val;
            if (flat.flexShrink === undefined) out.flexShrink = 1;
            if (flat.flexBasis === undefined) out.flexBasis = '0%';
          } else if (val === 0) {
            if (flat.flexGrow === undefined) out.flexGrow = 0;
            if (flat.flexShrink === undefined) out.flexShrink = 0;
          }
        } else {
          out.flex = val;
        }
        break;
      case 'transform':
        if (Array.isArray(val)) {
          const cssTransform = formatTransformArray(val);
          if (cssTransform) out.transform = cssTransform;
        } else if (typeof val === 'string') {
          out.transform = val;
        }
        break;
      case 'textDecorationLine':
        out.textDecoration = val;
        break;
      case 'includeFontPadding':
      case 'textAlignVertical':
      case 'tintColor':
      case 'resizeMode':
      case 'overlayColor':
      case 'shadowColor':
      case 'shadowOffset':
      case 'shadowOpacity':
      case 'shadowRadius':
      case 'elevation':
        break;
      default:
        out[key] = val;
        break;
    }
  }

  // Ensure React Native borders render solid by default when borderWidth > 0
  const hasBorderWidth =
    (typeof out.borderWidth === 'number' && out.borderWidth > 0) ||
    (typeof out.borderTopWidth === 'number' && out.borderTopWidth > 0) ||
    (typeof out.borderRightWidth === 'number' && out.borderRightWidth > 0) ||
    (typeof out.borderBottomWidth === 'number' && out.borderBottomWidth > 0) ||
    (typeof out.borderLeftWidth === 'number' && out.borderLeftWidth > 0);

  if (hasBorderWidth) {
    if (!out.borderStyle) out.borderStyle = 'solid';
    if (
      !out.borderColor &&
      !out.borderTopColor &&
      !out.borderRightColor &&
      !out.borderBottomColor &&
      !out.borderLeftColor
    ) {
      out.borderColor = 'transparent';
    }
  }

  // Synthesize CSS boxShadow from React Native shadow* / elevation props
  if (!out.boxShadow) {
    const shadowOpacity = typeof flat.shadowOpacity === 'number' ? flat.shadowOpacity : 0;
    const elevation = typeof flat.elevation === 'number' ? flat.elevation : 0;
    if (shadowOpacity > 0) {
      const offset = (flat.shadowOffset as { width?: number; height?: number } | undefined) ?? {};
      const ox = typeof offset.width === 'number' ? offset.width : 0;
      const oy = typeof offset.height === 'number' ? offset.height : 2;
      const radius = typeof flat.shadowRadius === 'number' ? flat.shadowRadius : 4;
      const rawColor = typeof flat.shadowColor === 'string' ? flat.shadowColor : '#000000';
      out.boxShadow = `${ox}px ${oy}px ${radius}px ${applyAlphaToColor(rawColor, shadowOpacity)}`;
    } else if (elevation > 0) {
      const oy = Math.max(1, Math.round(elevation * 0.5));
      const blur = Math.max(2, Math.round(elevation * 1.5));
      out.boxShadow = `0px ${oy}px ${blur}px rgba(15, 23, 42, 0.08)`;
    }
  }

  return out as React.CSSProperties;
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function extractDomAttributes(props: Record<string, unknown>): Record<string, unknown> {
  const domAttrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('data-') || k.startsWith('aria-')) {
      domAttrs[k] = v;
    }
  }
  const dataSet = props.dataSet;
  if (dataSet && typeof dataSet === 'object') {
    for (const [dk, dv] of Object.entries(dataSet as Record<string, unknown>)) {
      if (dv !== undefined && dv !== null) {
        const attrName = `data-${camelToKebab(dk)}`;
        if (!(attrName in domAttrs)) {
          domAttrs[attrName] = String(dv);
        }
      }
    }
  }
  if (typeof props.nativeID === 'string') {
    domAttrs.id = props.nativeID;
  } else if (typeof props.id === 'string') {
    domAttrs.id = props.id;
  }
  if (typeof props.testID === 'string') {
    domAttrs['data-testid'] = props.testID;
  }
  if (typeof props.accessibilityLabel === 'string') {
    domAttrs['aria-label'] = props.accessibilityLabel;
  }
  if (typeof props.accessibilityRole === 'string') {
    domAttrs.role = props.accessibilityRole === ' header' ? 'heading' : props.accessibilityRole;
  }
  return domAttrs;
}

const VIEW_BASE_STYLE: Record<string, unknown> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  flexShrink: 0,
  boxSizing: 'border-box',
  position: 'relative',
  minWidth: 0,
  minHeight: 0,
};

const TEXT_BASE_STYLE: Record<string, unknown> = {
  display: 'inline',
  boxSizing: 'border-box',
  color: '#0F172A',
  fontFamily:
    'var(--font-sans, "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  fontSize: 14,
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  margin: 0,
  padding: 0,
};

function useSimulatedLayout(onLayout: unknown) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (!firedRef.current && typeof onLayout === 'function') {
      firedRef.current = true;
      try {
        onLayout({
          nativeEvent: {
            layout: { x: 0, y: 0, width: ARTBOARD_DIMENSIONS.width, height: 48 },
          },
        });
      } catch {
        // Ignore user layout handler errors
      }
    }
  }, [onLayout]);
}

export const View = forwardRef<HTMLDivElement, Record<string, unknown>>(function View(props, ref) {
  useSimulatedLayout(props.onLayout);
  const domAttrs = extractDomAttributes(props);
  const style = toDomStyle(
    props.style as RnStyle,
    VIEW_BASE_STYLE,
    props.className as string | undefined
  );
  if (props.pointerEvents === 'none') {
    style.pointerEvents = 'none';
  } else if (props.pointerEvents === 'box-none') {
    style.pointerEvents = 'auto';
  }
  return React.createElement(
    'div',
    {
      ...domAttrs,
      ref,
      style,
      onClick: typeof props.onClick === 'function' ? props.onClick : undefined,
    },
    props.children as React.ReactNode
  );
});
View.displayName = 'View';

export const Text = forwardRef<HTMLSpanElement, Record<string, unknown>>(function Text(
  props,
  ref
) {
  useSimulatedLayout(props.onLayout);
  const domAttrs = extractDomAttributes(props);
  const style = toDomStyle(
    props.style as RnStyle,
    TEXT_BASE_STYLE,
    props.className as string | undefined
  );

  const numberOfLines =
    typeof props.numberOfLines === 'number' && props.numberOfLines > 0
      ? props.numberOfLines
      : undefined;
  if (numberOfLines === 1) {
    style.overflow = 'hidden';
    style.textOverflow = 'ellipsis';
    style.whiteSpace = 'nowrap';
    style.maxWidth = '100%';
  } else if (numberOfLines && numberOfLines > 1) {
    style.display = '-webkit-box';
    style.WebkitLineClamp = numberOfLines;
    style.WebkitBoxOrient = 'vertical';
    style.overflow = 'hidden';
  }

  if (props.selectable === false) {
    style.userSelect = 'none';
  }
  const onPress = typeof props.onPress === 'function' ? (props.onPress as () => void) : undefined;
  if (onPress) {
    style.cursor = 'pointer';
  }

  return React.createElement(
    'span',
    {
      ...domAttrs,
      ref,
      style,
      onClick: onPress
        ? (e: React.MouseEvent) => {
            onPress();
            void e;
          }
        : undefined,
    },
    props.children as React.ReactNode
  );
});
Text.displayName = 'Text';

function createInteractiveComponent(displayName: string, defaultActiveOpacity = 1) {
  const Comp = forwardRef<HTMLDivElement, Record<string, unknown>>(function InteractiveView(
    props,
    ref
  ) {
    const [pressed, setPressed] = useState(false);
    useSimulatedLayout(props.onLayout);
    const disabled = Boolean(props.disabled);
    const domAttrs = extractDomAttributes(props);

    const rawStyle =
      typeof props.style === 'function'
        ? (props.style as (state: { pressed: boolean; hovered: boolean; focused: boolean }) => RnStyle)({
            pressed,
            hovered: false,
            focused: false,
          })
        : (props.style as RnStyle);

    const style = toDomStyle(rawStyle, VIEW_BASE_STYLE, props.className as string | undefined);
    style.cursor = disabled ? 'default' : 'pointer';
    style.userSelect = 'none';

    const activeOpacity =
      typeof props.activeOpacity === 'number' ? props.activeOpacity : defaultActiveOpacity;
    if (pressed && !disabled && activeOpacity < 1) {
      style.opacity = activeOpacity;
    }

    const onPress = typeof props.onPress === 'function' ? (props.onPress as (e: unknown) => void) : undefined;
    const onPressIn =
      typeof props.onPressIn === 'function' ? (props.onPressIn as (e: unknown) => void) : undefined;
    const onPressOut =
      typeof props.onPressOut === 'function' ? (props.onPressOut as (e: unknown) => void) : undefined;

    const resolvedChildren =
      typeof props.children === 'function'
        ? (props.children as (state: { pressed: boolean }) => React.ReactNode)({ pressed })
        : (props.children as React.ReactNode);

    return React.createElement(
      'div',
      {
        ...domAttrs,
        ref,
        role: (domAttrs.role as string | undefined) ?? 'button',
        'aria-disabled': disabled || undefined,
        style,
        onMouseDown: (e: React.MouseEvent) => {
          if (disabled) return;
          setPressed(true);
          onPressIn?.(e);
        },
        onMouseUp: (e: React.MouseEvent) => {
          if (disabled) return;
          setPressed(false);
          onPressOut?.(e);
        },
        onMouseLeave: () => {
          if (pressed) setPressed(false);
        },
        onClick: (e: React.MouseEvent) => {
          if (disabled) return;
          onPress?.(e);
        },
      },
      resolvedChildren
    );
  });
  Comp.displayName = displayName;
  return Comp;
}

export const Pressable = createInteractiveComponent('Pressable', 1);
export const TouchableOpacity = createInteractiveComponent('TouchableOpacity', 0.78);
export const TouchableHighlight = createInteractiveComponent('TouchableHighlight', 0.85);
export const TouchableWithoutFeedback = createInteractiveComponent('TouchableWithoutFeedback', 1);
export const TouchableNativeFeedback = createInteractiveComponent('TouchableNativeFeedback', 0.85);

export const ScrollView = forwardRef<unknown, Record<string, unknown>>(function ScrollView(
  props,
  ref
) {
  const domRef = useRef<HTMLDivElement | null>(null);
  useSimulatedLayout(props.onLayout);

  useImperativeHandle(ref, () => ({
    scrollTo: (opts?: { x?: number; y?: number; animated?: boolean }) => {
      if (domRef.current && opts) {
        domRef.current.scrollTo({
          left: opts.x ?? 0,
          top: opts.y ?? 0,
          behavior: opts.animated ? 'smooth' : 'auto',
        });
      }
    },
    scrollToEnd: (opts?: { animated?: boolean }) => {
      if (domRef.current) {
        domRef.current.scrollTo({
          top: domRef.current.scrollHeight,
          left: domRef.current.scrollWidth,
          behavior: opts?.animated ? 'smooth' : 'auto',
        });
      }
    },
    flashScrollIndicators: () => undefined,
    getScrollResponder: () => ({}),
    getInnerViewNode: () => domRef.current,
  }));

  const horizontal = Boolean(props.horizontal);
  const domAttrs = extractDomAttributes(props);

  const outerStyle = toDomStyle(
    props.style as RnStyle,
    {
      ...VIEW_BASE_STYLE,
      flexGrow: 1,
      flexShrink: 1,
      overflowX: horizontal ? 'auto' : 'hidden',
      overflowY: horizontal ? 'hidden' : 'auto',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth:
        props.showsVerticalScrollIndicator === false ||
        props.showsHorizontalScrollIndicator === false
          ? 'none'
          : undefined,
    },
    props.className as string | undefined
  );

  const innerStyle = toDomStyle(
    props.contentContainerStyle as RnStyle,
    {
      ...VIEW_BASE_STYLE,
      flexDirection: horizontal ? 'row' : 'column',
      minWidth: horizontal ? 'max-content' : undefined,
    },
    props.contentContainerClassName as string | undefined
  );

  return React.createElement(
    'div',
    {
      ...domAttrs,
      ref: domRef,
      style: outerStyle,
      onScroll: typeof props.onScroll === 'function' ? props.onScroll : undefined,
    },
    React.createElement('div', { style: innerStyle }, props.children as React.ReactNode)
  );
});
ScrollView.displayName = 'ScrollView';

function renderSlotComponent(slot: unknown): React.ReactNode {
  if (!slot) return null;
  if (React.isValidElement(slot)) return slot;
  if (typeof slot === 'function') {
    const Comp = slot as React.ComponentType;
    return React.createElement(Comp);
  }
  return null;
}

export const FlatList = forwardRef<unknown, Record<string, unknown>>(function FlatList(props, ref) {
  const data = Array.isArray(props.data) ? (props.data as unknown[]) : [];
  const renderItem =
    typeof props.renderItem === 'function'
      ? (props.renderItem as (info: {
          item: unknown;
          index: number;
          separators: {
            highlight: () => void;
            unhighlight: () => void;
            updateProps: () => void;
          };
        }) => React.ReactNode)
      : null;
  const keyExtractor =
    typeof props.keyExtractor === 'function'
      ? (props.keyExtractor as (item: unknown, index: number) => string)
      : (item: unknown, index: number) => {
          if (item && typeof item === 'object' && 'id' in item) {
            return String((item as Record<string, unknown>).id);
          }
          if (item && typeof item === 'object' && 'key' in item) {
            return String((item as Record<string, unknown>).key);
          }
          return String(index);
        };

  const numColumns =
    typeof props.numColumns === 'number' && props.numColumns > 1 ? props.numColumns : 1;
  const separators = {
    highlight: () => undefined,
    unhighlight: () => undefined,
    updateProps: () => undefined,
  };

  const renderedItems: React.ReactNode[] = [];
  if (data.length === 0) {
    renderedItems.push(
      React.createElement(
        React.Fragment,
        { key: '__empty' },
        renderSlotComponent(props.ListEmptyComponent)
      )
    );
  } else if (renderItem) {
    if (numColumns > 1) {
      for (let i = 0; i < data.length; i += numColumns) {
        const rowSlice = data.slice(i, i + numColumns);
        const rowStyle = toDomStyle(props.columnWrapperStyle as RnStyle, {
          ...VIEW_BASE_STYLE,
          flexDirection: 'row',
        });
        renderedItems.push(
          React.createElement(
            'div',
            { key: `row_${i}`, style: rowStyle },
            rowSlice.map((item, colIdx) => {
              const idx = i + colIdx;
              return React.createElement(
                React.Fragment,
                { key: keyExtractor(item, idx) },
                renderItem({ item, index: idx, separators })
              );
            })
          )
        );
      }
    } else {
      data.forEach((item, index) => {
        if (index > 0 && props.ItemSeparatorComponent) {
          renderedItems.push(
            React.createElement(
              React.Fragment,
              { key: `sep_${index}` },
              renderSlotComponent(props.ItemSeparatorComponent)
            )
          );
        }
        renderedItems.push(
          React.createElement(
            React.Fragment,
            { key: keyExtractor(item, index) },
            renderItem({ item, index, separators })
          )
        );
      });
    }
  }

  return React.createElement(
    ScrollView,
    { ...props, ref },
    renderSlotComponent(props.ListHeaderComponent),
    ...renderedItems,
    renderSlotComponent(props.ListFooterComponent)
  );
});
FlatList.displayName = 'FlatList';

export const SectionList = forwardRef<unknown, Record<string, unknown>>(function SectionList(
  props,
  ref
) {
  const sections = Array.isArray(props.sections)
    ? (props.sections as Array<{ data?: unknown[]; [k: string]: unknown }>)
    : [];
  const renderItem =
    typeof props.renderItem === 'function'
      ? (props.renderItem as (info: {
          item: unknown;
          index: number;
          section: unknown;
          separators: Record<string, () => void>;
        }) => React.ReactNode)
      : null;
  const renderSectionHeader =
    typeof props.renderSectionHeader === 'function'
      ? (props.renderSectionHeader as (info: { section: unknown }) => React.ReactNode)
      : null;
  const renderSectionFooter =
    typeof props.renderSectionFooter === 'function'
      ? (props.renderSectionFooter as (info: { section: unknown }) => React.ReactNode)
      : null;

  const separators = {
    highlight: () => undefined,
    unhighlight: () => undefined,
    updateProps: () => undefined,
  };

  const children: React.ReactNode[] = [];
  if (sections.length === 0) {
    children.push(
      React.createElement(
        React.Fragment,
        { key: '__empty' },
        renderSlotComponent(props.ListEmptyComponent)
      )
    );
  } else {
    sections.forEach((section, sIdx) => {
      if ( renderSectionHeader) {
        children.push(
          React.createElement(
            React.Fragment,
            { key: `sec_hdr_${sIdx}` },
            renderSectionHeader({ section })
          )
        );
      }
      const items = Array.isArray(section?.data) ? section.data : [];
      items.forEach((item, iIdx) => {
        if (iIdx > 0 && props.ItemSeparatorComponent) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `sec_${sIdx}_sep_${iIdx}` },
              renderSlotComponent(props.ItemSeparatorComponent)
            )
          );
        }
        if (renderItem) {
          children.push(
            React.createElement(
              React.Fragment,
              { key: `sec_${sIdx}_item_${iIdx}` },
              renderItem({ item, index: iIdx, section, separators })
            )
          );
        }
      });
      if (renderSectionFooter) {
        children.push(
          React.createElement(
            React.Fragment,
            { key: `sec_ftr_${sIdx}` },
            renderSectionFooter({ section })
          )
        );
      }
    });
  }

  return React.createElement(
    ScrollView,
    { ...props, ref },
    renderSlotComponent(props.ListHeaderComponent),
    ...children,
    renderSlotComponent(props.ListFooterComponent)
  );
});
SectionList.displayName = 'SectionList';

export const VirtualizedList = FlatList;

export const SafeAreaView = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function SafeAreaView(props, ref) {
    return React.createElement(View, {
      ...props,
      ref,
      style: [{ flex: 1 }, props.style as RnStyle],
    });
  }
);
SafeAreaView.displayName = 'SafeAreaView';

export const KeyboardAvoidingView = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function KeyboardAvoidingView(props, ref) {
    return React.createElement(View, {
      ...props,
      ref,
      style: [{ flex: 1 }, props.style as RnStyle],
    });
  }
);
KeyboardAvoidingView.displayName = 'KeyboardAvoidingView';

export const TextInput = forwardRef<unknown, Record<string, unknown>>(function TextInput(
  props,
  ref
) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useSimulatedLayout(props.onLayout);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clear: () => {
      if (inputRef.current) inputRef.current.value = '';
    },
    isFocused: () =>
      typeof document !== 'undefined' && document.activeElement === inputRef.current,
  }));

  const domAttrs = extractDomAttributes(props);
  const style = toDomStyle(
    props.style as RnStyle,
    {
      boxSizing: 'border-box',
      fontFamily:
        'var(--font-sans, "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      fontSize: 14,
      color: '#0F172A',
      backgroundColor: 'transparent',
      borderWidth: 0,
      outline: 'none',
      padding: 0,
      margin: 0,
    },
    props.className as string | undefined
  );

  const multiline = Boolean(props.multiline);
  const editable = props.editable !== false;
  const onChangeText =
    typeof props.onChangeText === 'function'
      ? (props.onChangeText as (text: string) => void)
      : undefined;
  const onChange =
    typeof props.onChange === 'function' ? (props.onChange as (e: unknown) => void) : undefined;
  const onSubmitEditing =
    typeof props.onSubmitEditing === 'function'
      ? (props.onSubmitEditing as (e: unknown) => void)
      : undefined;

  const commonProps: Record<string, unknown> = {
    ...domAttrs,
    ref: inputRef,
    style,
    placeholder: typeof props.placeholder === 'string' ? props.placeholder : undefined,
    readOnly: !editable,
    disabled: !editable,
    maxLength: typeof props.maxLength === 'number' ? props.maxLength : undefined,
    onFocus: typeof props.onFocus === 'function' ? props.onFocus : undefined,
    onBlur: typeof props.onBlur === 'function' ? props.onBlur : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange?.({ nativeEvent: { text: e.target.value } });
      onChangeText?.(e.target.value);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!multiline && e.key === 'Enter' && onSubmitEditing) {
        onSubmitEditing({ nativeEvent: { text: e.currentTarget.value } });
      }
    },
  };

  if (props.value !== undefined) {
    commonProps.value = String(props.value ?? '');
  } else if (props.defaultValue !== undefined) {
    commonProps.defaultValue = String(props.defaultValue ?? '');
  }

  if (multiline) {
    return React.createElement('textarea', {
      ...commonProps,
      rows: typeof props.numberOfLines === 'number' ? props.numberOfLines : 3,
    });
  }

  return React.createElement('input', {
    ...commonProps,
    type: props.secureTextEntry ? 'password' : 'text',
  });
});
TextInput.displayName = 'TextInput';

function resolveImageUri(source: unknown): string {
  if (typeof source === 'string') return source;
  if (Array.isArray(source) && source[0] && typeof source[0] === 'object') {
    return String((source[0] as Record<string, unknown>).uri ?? '');
  }
  if (source && typeof source === 'object') {
    return String((source as Record<string, unknown>).uri ?? '');
  }
  return '';
}

const BaseImage = forwardRef<HTMLDivElement, Record<string, unknown>>(function Image(props, ref) {
  useSimulatedLayout(props.onLayout);
  const domAttrs = extractDomAttributes(props);
  const uri = resolveImageUri(props.source ?? props.src);
  const flatStyle = flattenStyle(props.style as RnStyle);
  const resizeMode = String(
    props.resizeMode ?? flatStyle.resizeMode ?? 'cover'
  ) as React.CSSProperties['objectFit'];

  const style = toDomStyle(
    props.style as RnStyle,
    {
      ...VIEW_BASE_STYLE,
      overflow: 'hidden',
    },
    props.className as string | undefined
  );

  return React.createElement(
    'div',
    {
      ...domAttrs,
      ref,
      style,
    },
    uri
      ? React.createElement('img', {
          src: uri,
          alt: (props.accessibilityLabel as string | undefined) ?? '',
          draggable: false,
          style: {
            width: '100%',
            height: '100%',
            objectFit: resizeMode === 'stretch' ? 'fill' : resizeMode,
            display: 'block',
          },
          onLoad: typeof props.onLoad === 'function' ? props.onLoad : undefined,
          onError: typeof props.onError === 'function' ? props.onError : undefined,
        })
      : null
  );
});
BaseImage.displayName = 'Image';

export const Image = Object.assign(BaseImage, {
  getSize: (
    _uri: string,
    success?: (width: number, height: number) => void
  ) => {
    success?.(393, 240);
  },
  getSizeWithHeaders: (
    _uri: string,
    _headers: Record<string, string>,
    success?: (width: number, height: number) => void
  ) => {
    success?.(393, 240);
  },
  prefetch: async () => true,
  abortPrefetch: () => undefined,
  queryCache: async () => ({}),
  resolveAssetSource: (source: unknown) => ({
    uri: resolveImageUri(source),
    width: 393,
    height: 240,
    scale: 1,
  }),
});

export const ImageBackground = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function ImageBackground(props, ref) {
    const domAttrs = extractDomAttributes(props);
    const uri = resolveImageUri(props.source);
    const style = toDomStyle(
      props.style as RnStyle,
      {
        ...VIEW_BASE_STYLE,
        overflow: 'hidden',
      },
      props.className as string | undefined
    );
    const imageStyle = toDomStyle(props.imageStyle as RnStyle, {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    });

    return React.createElement(
      'div',
      { ...domAttrs, ref, style },
      uri
        ? React.createElement('img', {
            src: uri,
            alt: '',
            draggable: false,
            style: {
              ...imageStyle,
              objectFit: 'cover',
              pointerEvents: 'none',
            },
          })
        : null,
      props.children as React.ReactNode
    );
  }
);
ImageBackground.displayName = 'ImageBackground';

export const ActivityIndicator = forwardRef<HTMLDivElement, Record<string, unknown>>(
  function ActivityIndicator(props, ref) {
    if (props.animating === false) return null;
    const domAttrs = extractDomAttributes(props);
    const rawSize = props.size;
    const pxSize = rawSize === 'large' ? 32 : typeof rawSize === 'number' ? rawSize : 20;
    const color = typeof props.color === 'string' ? props.color : '#6366F1';
    const style = toDomStyle(
      props.style as RnStyle,
      {
        ...VIEW_BASE_STYLE,
        alignItems: 'center',
        justifyContent: 'center',
      },
      props.className as string | undefined
    );

    return React.createElement(
      'div',
      { ...domAttrs, ref, role: 'progressbar', style },
      React.createElement('div', {
        style: {
          width: pxSize,
          height: pxSize,
          borderRadius: '50%',
          border: `2.5px solid ${applyAlphaToColor(color, 0.25)}`,
          borderTopColor: color,
          boxSizing: 'border-box',
        },
      })
    );
  }
);
ActivityIndicator.displayName = 'ActivityIndicator';

export const Switch = forwardRef<HTMLButtonElement, Record<string, unknown>>(function Switch(
  props,
  ref
) {
  const domAttrs = extractDomAttributes(props);
  const value = Boolean(props.value);
  const disabled = Boolean(props.disabled);
  const trackColor = (props.trackColor as { false?: string; true?: string } | undefined) ?? {};
  const activeBg = trackColor.true ?? '#6366F1';
  const inactiveBg = trackColor.false ?? '#CBD5E1';
  const thumbColor = typeof props.thumbColor === 'string' ? props.thumbColor : '#FFFFFF';
  const onValueChange =
    typeof props.onValueChange === 'function'
      ? (props.onValueChange as (next: boolean) => void)
      : undefined;

  const style = toDomStyle(
    props.style as RnStyle,
    {
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: value ? activeBg : inactiveBg,
      padding: 2,
      border: 'none',
      cursor: disabled ? 'default' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: value ? 'flex-end' : 'flex-start',
      boxSizing: 'border-box',
      opacity: disabled ? 0.5 : 1,
    },
    props.className as string | undefined
  );

  return React.createElement(
    'button',
    {
      ...domAttrs,
      ref,
      type: 'button',
      role: 'switch',
      'aria-checked': value,
      disabled,
      style,
      onClick: () => {
        if (!disabled) onValueChange?.(!value);
      },
    },
    React.createElement('span', {
      style: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: thumbColor,
        display: 'block',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      },
    })
  );
});
Switch.displayName = 'Switch';

export const Modal: React.FC<Record<string, unknown>> = (props) => {
  if (props.visible !== true) return null;
  const domAttrs = extractDomAttributes(props);
  return React.createElement(
    'div',
    {
      ...domAttrs,
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      },
    },
    props.children as React.ReactNode
  );
};
Modal.displayName = 'Modal';

export const Button: React.FC<{
  title?: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  testID?: string;
}> = ({ title = 'Button', onPress, color = '#6366F1', disabled = false, testID }) =>
  React.createElement(
    TouchableOpacity,
    {
      onPress,
      disabled,
      testID,
      style: {
        backgroundColor: disabled ? '#94A3B8' : color,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    React.createElement(
      Text,
      { style: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 } },
      title
    )
  );

export const RefreshControl: React.FC<Record<string, unknown>> = () => null;

export const StatusBar = Object.assign(
  function StatusBar(): React.ReactElement | null {
    return null;
  },
  {
    currentHeight: 0,
    setBarStyle: () => undefined,
    setBackgroundColor: () => undefined,
    setHidden: () => undefined,
    setTranslucent: () => undefined,
    setNetworkActivityIndicatorVisible: () => undefined,
    pushStackEntry: () => ({}),
    popStackEntry: () => undefined,
    replaceStackEntry: () => ({}),
  }
);

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: flattenStyle,
  compose: (s1: unknown, s2: unknown) => [s1, s2],
  hairlineWidth: 1,
  absoluteFillObject: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  absoluteFill: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  setStyleAttributePreprocessor: () => undefined,
};

export const Platform = {
  OS: 'ios' as const,
  Version: '17.0',
  isPad: false,
  isTV: false,
  isTesting: false,
  Constants: {
    reactNativeVersion: { major: 0, minor: 76, patch: 0 },
    osVersion: '17.0',
    systemName: 'iOS',
  },
  select: <T,>(spec: Record<string, T>): T =>
    spec.ios ?? spec.default ?? spec.web ?? spec.native ?? spec.android ?? Object.values(spec)[0],
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

export const PixelRatio = {
  get: () => 3,
  getFontScale: () => 1,
  getPixelSizeForLayoutSize: (size: number) => Math.round(size * 3),
  roundToNearestPixel: (size: number) => Math.round(size * 3) / 3,
  startDetecting: () => undefined,
};

export class AnimatedValue {
  private _value: number;
  constructor(value = 0) {
    this._value = value;
  }
  setValue(value: number) {
    this._value = value;
  }
  setOffset(_offset: number) {}
  flattenOffset() {}
  extractOffset() {}
  addListener(_cb: (state: { value: number }) => void): string {
    return 'listener_0';
  }
  removeListener(_id: string) {}
  removeAllListeners() {}
  stopAnimation(cb?: (value: number) => void) {
    cb?.(this._value);
  }
  resetAnimation(cb?: (value: number) => void) {
    cb?.(this._value);
  }
  interpolate(config: { inputRange?: number[]; outputRange?: Array<number | string> }) {
    const out = config?.outputRange;
    if (Array.isArray(out) && out.length > 0) {
      return out[0];
    }
    return this._value;
  }
  __getValue() {
    return this._value;
  }
}

export class AnimatedValueXY {
  x: AnimatedValue;
  y: AnimatedValue;
  constructor(value?: { x?: number; y?: number }) {
    this.x = new AnimatedValue(value?.x ?? 0);
    this.y = new AnimatedValue(value?.y ?? 0);
  }
  setValue(value: { x: number; y: number }) {
    this.x.setValue(value.x);
    this.y.setValue(value.y);
  }
  setOffset(_offset: { x: number; y: number }) {}
  flattenOffset() {}
  extractOffset() {}
  stopAnimation(cb?: (value: { x: number; y: number }) => void) {
    cb?.({ x: this.x.__getValue(), y: this.y.__getValue() });
  }
  resetAnimation(cb?: (value: { x: number; y: number }) => void) {
    cb?.({ x: this.x.__getValue(), y: this.y.__getValue() });
  }
  getLayout() {
    return { left: this.x.__getValue(), top: this.y.__getValue() };
  }
  getTranslateTransform() {
    return [{ translateX: this.x.__getValue() }, { translateY: this.y.__getValue() }];
  }
}

function createNoopCompositeAnimation() {
  return {
    start: (cb?: (result: { finished: boolean }) => void) => {
      cb?.({ finished: true });
    },
    stop: () => undefined,
    reset: () => undefined,
  };
}

export function createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
  return Component;
}

export const Animated = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  SectionList,
  createAnimatedComponent,
  timing: (_value: unknown, _config: unknown) => createNoopCompositeAnimation(),
  spring: (_value: unknown, _config: unknown) => createNoopCompositeAnimation(),
  decay: (_value: unknown, _config: unknown) => createNoopCompositeAnimation(),
  parallel: (_animations: unknown[]) => createNoopCompositeAnimation(),
  sequence: (_animations: unknown[]) => createNoopCompositeAnimation(),
  stagger: (_delay: number, _animations: unknown[]) => createNoopCompositeAnimation(),
  loop: (_animation: unknown) => createNoopCompositeAnimation(),
  delay: (_ms: number) => createNoopCompositeAnimation(),
  event: () => () => undefined,
  add: (a: unknown) => a,
  subtract: (a: unknown) => a,
  divide: (a: unknown) => a,
  multiply: (a: unknown) => a,
  modulo: (a: unknown) => a,
  diffClamp: (a: unknown) => a,
};

export function useAnimatedValue(initialValue = 0): AnimatedValue {
  const ref = useRef<AnimatedValue | null>(null);
  if (!ref.current) {
    ref.current = new AnimatedValue(initialValue);
  }
  return ref.current;
}

export const Easing = {
  step0: (n: number) => (n > 0 ? 1 : 0),
  step1: (n: number) => (n >= 1 ? 1 : 0),
  linear: (t: number) => t,
  ease: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  poly: () => (t: number) => t,
  sin: (t: number) => t,
  circle: (t: number) => t,
  exp: (t: number) => t,
  elastic: () => (t: number) => t,
  back: () => (t: number) => t,
  bounce: (t: number) => t,
  bezier: () => (t: number) => t,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

export const Alert = {
  alert: (_title?: string, _message?: string, _buttons?: unknown[]) => undefined,
  prompt: (_title?: string, _message?: string, _callbackOrButtons?: unknown) => undefined,
};

export const Linking = {
  openURL: async (_url: string) => true,
  canOpenURL: async (_url: string) => true,
  openSettings: async () => undefined,
  getInitialURL: async () => null,
  sendIntent: async () => undefined,
  addEventListener: () => ({ remove: () => undefined }),
  removeEventListener: () => undefined,
};

export const Share = {
  share: async () => ({ action: 'sharedAction' }),
  sharedAction: 'sharedAction',
  dismissedAction: 'dismissedAction',
};

export const Vibration = {
  vibrate: () => undefined,
  cancel: () => undefined,
};

export const Keyboard = {
  dismiss: () => undefined,
  isVisible: () => false,
  metrics: () => undefined,
  addListener: () => ({ remove: () => undefined }),
  removeListener: () => undefined,
  removeAllListeners: () => undefined,
};

export const BackHandler = {
  exitApp: () => undefined,
  addEventListener: () => ({ remove: () => undefined }),
  removeEventListener: () => undefined,
};

export const AppState = {
  currentState: 'active',
  isAvailable: true,
  addEventListener: () => ({ remove: () => undefined }),
  removeEventListener: () => undefined,
};

export const Appearance = {
  getColorScheme: () => 'light' as const,
  setColorScheme: () => undefined,
  addChangeListener: () => ({ remove: () => undefined }),
};

export function useColorScheme(): 'light' | 'dark' {
  return 'light';
}

export const PanResponder = {
  create: () => ({ panHandlers: {} }),
};

export const LayoutAnimation = {
  configureNext: (_config: unknown, onAnimationDidEnd?: () => void) => {
    onAnimationDidEnd?.();
  },
  create: () => ({}),
  Types: {
    spring: 'spring',
    linear: 'linear',
    easeInEaseOut: 'easeInEaseOut',
    easeIn: 'easeIn',
    easeOut: 'easeOut',
    keyboard: 'keyboard',
  },
  Properties: {
    opacity: 'opacity',
    scaleX: 'scaleX',
    scaleY: 'scaleY',
    scaleXY: 'scaleXY',
  },
  Presets: {
    easeInEaseOut: {},
    linear: {},
    spring: {},
  },
};

export const UIManager = {
  setLayoutAnimationEnabledExperimental: () => undefined,
  measure: (
    _node: unknown,
    callback?: (x: number, y: number, w: number, h: number, px: number, py: number) => void
  ) => callback?.(0, 0, 393, 48, 0, 0),
  measureInWindow: (
    _node: unknown,
    callback?: (x: number, y: number, w: number, h: number) => void
  ) => callback?.(0, 0, 393, 48),
  measureLayout: () => undefined,
  dispatchViewManagerCommand: () => undefined,
  getViewManagerConfig: () => ({}),
};

export const InteractionManager = {
  runAfterInteractions: (task?: () => void) => {
    task?.();
    return {
      then: (cb?: () => unknown) => Promise.resolve().then(cb),
      done: (cb?: () => unknown) => cb?.(),
      cancel: () => undefined,
    };
  },
  createInteractionHandle: () => 1,
  clearInteractionHandle: () => undefined,
  setDeadline: () => undefined,
};

export class NativeEventEmitter {
  addListener() {
    return { remove: () => undefined };
  }
  removeAllListeners() {}
  removeSubscription() {}
}

export const DeviceEventEmitter = new NativeEventEmitter();
export const NativeAppEventEmitter = new NativeEventEmitter();

export const NativeModules: Record<string, Record<string, unknown>> = {
  StatusBarManager: { HEIGHT: 0, getHeight: (cb?: (h: { height: number }) => void) => cb?.({ height: 0 }) },
  PlatformConstants: { forceTouchAvailable: false, interfaceIdiom: 'phone' },
  SourceCode: { scriptURL: '' },
  UIManager,
};

export const I18nManager = {
  isRTL: false,
  doLeftAndRightSwapInRTL: true,
  allowRTL: () => undefined,
  forceRTL: () => undefined,
  swapLeftAndRightInRTL: () => undefined,
  getConstants: () => ({ isRTL: false, doLeftAndRightSwapInRTL: true }),
};

export const AccessibilityInfo = {
  isBoldTextEnabled: async () => false,
  isGrayscaleEnabled: async () => false,
  isInvertColorsEnabled: async () => false,
  isReduceMotionEnabled: async () => false,
  isReduceTransparencyEnabled: async () => false,
  isScreenReaderEnabled: async () => false,
  addEventListener: () => ({ remove: () => undefined }),
  announceForAccessibility: () => undefined,
  setAccessibilityFocus: () => undefined,
};

export const LogBox = {
  ignoreLogs: () => undefined,
  ignoreAllLogs: () => undefined,
  install: () => undefined,
  uninstall: () => undefined,
};

export const YellowBox = {
  ignoreWarnings: () => undefined,
};

export function findNodeHandle(_componentOrHandle: unknown): number | null {
  return null;
}

export function processColor(color: unknown): unknown {
  return color;
}

export const PermissionsAndroid = {
  PERMISSIONS: {
    CAMERA: 'android.permission.CAMERA',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
    POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
    RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
    READ_CONTACTS: 'android.permission.READ_CONTACTS',
  },
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
  React.createElement(View, { style: [{ flex: 1 }, style] as never }, children);

export const TurboModuleRegistry = {
  get: () => ({}),
  getEnforcing: () => ({}),
};

export function requireNativeComponent(viewName: string) {
  const Comp: React.FC<{ children?: React.ReactNode; style?: unknown }> = ({
    children,
    style,
  }) => React.createElement(View, { style: style as never }, children);
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

const ReactNativeDefault = {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TouchableNativeFeedback,
  ScrollView,
  FlatList,
  SectionList,
  VirtualizedList,
  KeyboardAvoidingView,
  TextInput,
  Image,
  ImageBackground,
  SafeAreaView,
  ActivityIndicator,
  Switch,
  Modal,
  Button,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Platform,
  Dimensions,
  useWindowDimensions,
  PixelRatio,
  Animated,
  useAnimatedValue,
  Easing,
  Alert,
  Linking,
  Share,
  Vibration,
  Keyboard,
  BackHandler,
  AppState,
  Appearance,
  useColorScheme,
  PanResponder,
  LayoutAnimation,
  UIManager,
  InteractionManager,
  NativeEventEmitter,
  DeviceEventEmitter,
  NativeAppEventEmitter,
  NativeModules,
  I18nManager,
  AccessibilityInfo,
  LogBox,
  YellowBox,
  findNodeHandle,
  processColor,
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
};

export default ReactNativeDefault;
