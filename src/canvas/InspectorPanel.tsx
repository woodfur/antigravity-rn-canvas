import React, { useState, useEffect, useRef } from 'react';
import {
  Code2,
  Sparkles,
  Type,
  Palette,
  Box,
  Navigation,
  Copy,
  Check,
  Sliders,
  X,
  PanelRightClose,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutTemplate,
  MousePointerClick,
  FormInput,
  Tag,
  Minus,
  Columns,
  Heading,
  AlignLeft,
} from 'lucide-react';
import type {
  InspectedElement,
  PatchPayload,
  ReorderPayload,
  InsertElementPayload,
  InsertElementPreset,
  DuplicateElementPayload,
  DeleteElementPayload,
  ScreenMetadata,
  StyleValue,
} from '../server/astEngine';

interface InspectorPanelProps {
  inspected: InspectedElement | null;
  screens?: ScreenMetadata[];
  activeScreenId?: string | null;
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  statusMessage: string | null;
  onPatch: (payload: PatchPayload) => Promise<void>;
  onInsert?: (payload: InsertElementPayload) => Promise<void>;
  onDuplicate?: (payload: DuplicateElementPayload) => Promise<void>;
  onDelete?: (payload: DeleteElementPayload) => Promise<void>;
  onReorder?: (payload: ReorderPayload) => Promise<void>;
  onSelectScreen?: (screenId: string) => void;
  onClearSelection: () => void;
  onCollapse: () => void;
  onJumpToScreen: (routeName: string) => void;
}

const INSERT_PRESETS: Array<{
  id: InsertElementPreset;
  title: string;
  subtitle: string;
  tagBadge: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}> = [
  {
    id: 'button',
    title: 'Button',
    subtitle: 'CTA + Optional Flow',
    tagBadge: '<TouchableOpacity>',
    icon: MousePointerClick,
  },
  {
    id: 'section',
    title: 'Section Card',
    subtitle: 'Title + Body Card',
    tagBadge: '<View>',
    icon: LayoutTemplate,
  },
  {
    id: 'row',
    title: 'Row Item',
    subtitle: 'Horizontal Flex Row',
    tagBadge: '<View row>',
    icon: Columns,
  },
  {
    id: 'heading',
    title: 'Heading',
    subtitle: 'Bold Title Copy',
    tagBadge: '<Text>',
    icon: Heading,
  },
  {
    id: 'text',
    title: 'Paragraph',
    subtitle: 'Supporting Copy',
    tagBadge: '<Text>',
    icon: AlignLeft,
  },
  {
    id: 'input',
    title: 'Text Input',
    subtitle: 'Form Input Field',
    tagBadge: '<TextInput>',
    icon: FormInput,
  },
  {
    id: 'badge',
    title: 'Badge Pill',
    subtitle: 'Status Tag Pill',
    tagBadge: '<View>',
    icon: Tag,
  },
  {
    id: 'divider',
    title: 'Divider',
    subtitle: '1px Hairline Rule',
    tagBadge: '<View>',
    icon: Minus,
  },
];

const COLOR_SWATCHES = [
  '#0A0B0E',
  '#13161E',
  '#1E2433',
  '#38BDF8',
  '#6366F1',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#F8FAFC',
];

const FONT_WEIGHTS = ['400', '500', '600', '700', '800'];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  inspected,
  screens = [],
  activeScreenId = null,
  isOpen,
  isLoading,
  isSaving,
  statusMessage,
  onPatch,
  onInsert,
  onDuplicate,
  onDelete,
  onReorder,
  onSelectScreen,
  onClearSelection,
  onCollapse,
  onJumpToScreen,
}) => {
  const [localText, setLocalText] = useState('');
  const [localStyles, setLocalStyles] = useState<Record<string, StyleValue>>({});
  const [agentInstruction, setAgentInstruction] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Add Component / Section builder state
  const [showInsertDrawer, setShowInsertDrawer] = useState(false);
  const [insertPlacement, setInsertPlacement] = useState<'after' | 'before' | 'inside'>('after');
  const [insertLabel, setInsertLabel] = useState('');
  const [insertNavigateTo, setInsertNavigateTo] = useState('');

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOpenInsert = () => {
      setShowInsertDrawer(true);
    };
    window.addEventListener('zelune:open-insert-palette', handleOpenInsert);
    return () => window.removeEventListener('zelune:open-insert-palette', handleOpenInsert);
  }, []);

  const activeScreenObj =
    screens.find((s) => s.id === activeScreenId) ?? screens[0] ?? null;

  const handleTriggerInsert = (preset: InsertElementPreset) => {
    if (!onInsert) return;
    const targetFile = inspected?.file ?? activeScreenObj?.filePath;
    if (!targetFile) return;

    void onInsert({
      file: targetFile,
      astPath: inspected?.astPath,
      placement: inspected ? insertPlacement : 'inside',
      preset,
      label: insertLabel.trim() || undefined,
      navigateTo: preset === 'button' && insertNavigateTo ? insertNavigateTo : undefined,
    });
    setInsertLabel('');
  };

  const renderInsertPaletteContent = (isCompactDrawer: boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: isCompactDrawer ? 12 : 0,
        backgroundColor: isCompactDrawer ? 'var(--studio-surface-2)' : 'transparent',
        borderRadius: isCompactDrawer ? 9 : 0,
        border: isCompactDrawer ? '1px solid rgba(56, 189, 248, 0.3)' : 'none',
      }}
    >
      {/* Target Screen or Placement Selector */}
      {inspected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: 'var(--studio-text-muted)',
              letterSpacing: '0.05em',
            }}
          >
            PLACEMENT RELATIVE TO &lt;{inspected.tagName}&gt;
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {(['after', 'before', 'inside'] as const).map((place) => (
              <button
                key={place}
                type="button"
                className="zelune-interactive"
                onClick={() => setInsertPlacement(place)}
                style={{
                  padding: '5px 6px',
                  borderRadius: 6,
                  border:
                    insertPlacement === place
                      ? '1px solid #38BDF8'
                      : '1px solid var(--studio-border-subtle)',
                  backgroundColor:
                    insertPlacement === place
                      ? 'rgba(56, 189, 248, 0.14)'
                      : 'var(--studio-surface-1)',
                  color:
                    insertPlacement === place
                      ? 'var(--studio-text-primary)'
                      : 'var(--studio-text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {place}
              </button>
            ))}
          </div>
        </div>
      ) : (
        screens.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: 'var(--studio-text-muted)',
                letterSpacing: '0.05em',
              }}
            >
              TARGET ARTBOARD SCREEN
            </label>
            <select
              value={activeScreenObj?.id ?? ''}
              onChange={(e) => onSelectScreen?.(e.target.value)}
              style={{
                padding: '7px 9px',
                borderRadius: 7,
                border: '1px solid var(--studio-border-subtle)',
                backgroundColor: 'var(--studio-surface-2)',
                color: 'var(--studio-text-primary)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {screens.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.filePath})
                </option>
              ))}
            </select>
          </div>
        )
      )}

      {/* Optional Custom Label & Navigation Link */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--studio-text-muted)',
            }}
          >
            CUSTOM LABEL / COPY
          </label>
          <input
            type="text"
            value={insertLabel}
            onChange={(e) => setInsertLabel(e.target.value)}
            placeholder="e.g. Book Now"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-1)',
              color: 'var(--studio-text-primary)',
              fontSize: 11.5,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--studio-text-muted)',
            }}
          >
            BUTTON FLOW LINK
          </label>
          <select
            value={insertNavigateTo}
            onChange={(e) => setInsertNavigateTo(e.target.value)}
            style={{
              padding: '6px 7px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-1)',
              color: 'var(--studio-text-primary)',
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <option value="">None</option>
            {screens.map((s) => (
              <option key={s.id} value={s.id}>
                → {s.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2-Column Component Preset Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
        {INSERT_PRESETS.map((preset) => {
          const IconComp = preset.icon;
          return (
            <button
              key={preset.id}
              type="button"
              className="zelune-interactive"
              disabled={isSaving}
              onClick={() => handleTriggerInsert(preset.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid var(--studio-border-subtle)',
                backgroundColor: 'var(--studio-surface-1)',
                color: 'var(--studio-text-primary)',
                cursor: isSaving ? 'wait' : 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                  <IconComp size={13} color="#38BDF8" />
                  <span>{preset.title}</span>
                </span>
                <Plus size={11} color="var(--studio-text-muted)" />
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--studio-text-secondary)' }}>
                {preset.subtitle}
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: 'var(--font-mono)',
                  color: '#6366F1',
                }}
              >
                {preset.tagBadge}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  useEffect(() => {
    if (!inspected) {
      setLocalText('');
      setLocalStyles({});
      return;
    }
    setLocalText(inspected.textContent ?? '');
    setLocalStyles(inspected.styles ?? {});
  }, [inspected]);

  // Modern Web Guidance fallback for <dialog closedby="any"> light-dismiss in browsers without native closedBy
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => dialog.removeEventListener('click', handleBackdropClick);
    }
  }, [inspected]);

  const schedulePatch = (nextPatch: Omit<PatchPayload, 'file' | 'astPath'>) => {
    if (!inspected) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void onPatch({
        file: inspected.file,
        astPath: inspected.astPath,
        line: inspected.line,
        ...nextPatch,
      });
    }, 220);
  };

  const handleTextChange = (val: string) => {
    setLocalText(val);
    schedulePatch({ text: val });
  };

  const handleStyleChange = (key: string, rawVal: string | number) => {
    const nextStyles = { ...localStyles, [key]: rawVal };
    setLocalStyles(nextStyles);
    schedulePatch({ styles: { [key]: rawVal } });
  };

  const handleNumericStyleChange = (key: string, rawStr: string) => {
    if (rawStr.trim() === '') {
      const copy = { ...localStyles };
      delete copy[key];
      setLocalStyles(copy);
      schedulePatch({ styles: { [key]: null } });
      return;
    }
    const parsed = Number(rawStr);
    if (!Number.isNaN(parsed)) {
      handleStyleChange(key, parsed);
    }
  };

  const buildAntigravityPrompt = () => {
    if (!inspected) return '';
    return [
      `Refactor the <${inspected.tagName}> element in \`${inspected.file}\` (around line ${inspected.line}, AST index ${inspected.astPath}).`,
      inspected.styleSheetKey
        ? `Associated StyleSheet key: \`styles.${inspected.styleSheetKey}\`.`
        : '',
      '',
      `Current JSX Snippet:`,
      '```tsx',
      inspected.codeSnippet,
      '```',
      '',
      `Requested Change:`,
      agentInstruction.trim() || 'Update this component layout and styling per DESIGN.md.',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopyPrompt = async () => {
    const text = buildAntigravityPrompt();
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const targetWidth = inspected ? 340 : 320;

  return (
    <aside
      aria-hidden={!isOpen}
      className="zelune-collapsible-panel"
      style={{
        width: isOpen ? targetWidth : 0,
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        backgroundColor: 'var(--studio-surface-1)',
        borderLeft: isOpen ? '1px solid var(--studio-border-hairline)' : '0px solid transparent',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 30,
      }}
    >
      {!inspected ? (
        <div
          className="zelune-scroller"
          style={{
            width: 320,
            minWidth: 320,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 18,
            color: 'var(--studio-text-secondary)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--studio-text-primary)',
                fontWeight: 600,
                fontSize: 13.5,
                letterSpacing: '-0.01em',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sliders size={15} color="#38BDF8" />
                <span>AST Visual Inspector</span>
              </span>
              <button
                type="button"
                className="zelune-interactive"
                onClick={onCollapse}
                title="Collapse Inspector Panel (])"
                style={{
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 5,
                  color: 'var(--studio-text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PanelRightClose size={14} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'var(--studio-surface-2)',
                border: '1px solid var(--studio-border-hairline)',
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              Select any node on an artboard to inspect &amp; live-patch its{' '}
              <strong style={{ color: 'var(--studio-text-primary)' }}>StyleSheet</strong> or{' '}
              <strong style={{ color: 'var(--studio-text-primary)' }}>copy</strong>, or add new
              buttons, sections, and inputs below:
            </div>

            {(isSaving || statusMessage) && (
              <div
                style={{
                  padding: '7px 12px',
                  backgroundColor: 'var(--studio-badge-indigo-bg)',
                  border: '1px solid var(--studio-badge-indigo-border)',
                  borderRadius: 7,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--studio-badge-indigo-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{isSaving ? 'Writing AST to .tsx...' : statusMessage}</span>
                <span style={{ color: 'var(--studio-accent-emerald)', fontWeight: 600 }}>● Sync</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: '#38BDF8',
                  letterSpacing: '0.06em',
                }}
              >
                <Plus size={12} color="#38BDF8" />
                <span>ADD ELEMENTS &amp; SECTIONS</span>
              </div>
              {renderInsertPaletteContent(false)}
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--studio-text-muted)',
              borderTop: '1px solid var(--studio-border-hairline)',
              paddingTop: 12,
            }}
          >
            MCP Server: <span style={{ color: 'var(--studio-accent-emerald)' }}>Zelune Ready (mcp/server.ts)</span>
          </div>
        </div>
      ) : (
        <div
          className="zelune-scroller"
          style={{
            width: 340,
            minWidth: 340,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Inspector Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--studio-border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--studio-surface-2)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    backgroundColor: 'var(--studio-badge-indigo-bg)',
                    border: '1px solid var(--studio-badge-indigo-border)',
                    color: 'var(--studio-badge-indigo-text)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 6px',
                    borderRadius: 4,
                  }}
                >
                  &lt;{inspected.tagName}&gt;
                </span>
                {inspected.styleSheetKey && (
                  <span
                    style={{
                      backgroundColor: 'var(--studio-badge-emerald-bg)',
                      border: '1px solid var(--studio-badge-emerald-border)',
                      color: 'var(--studio-badge-emerald-text)',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    styles.{inspected.styleSheetKey}
                  </span>
                )}
              </div>
              <span
                className="tabular-nums"
                style={{
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--studio-text-muted)',
                  marginTop: 1,
                }}
              >
                {inspected.file}:{inspected.line}:{inspected.col}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                type="button"
                className="zelune-interactive"
                onClick={onCollapse}
                title="Collapse Inspector Panel (])"
                style={{
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 5,
                  color: 'var(--studio-text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <PanelRightClose size={14} />
              </button>
              <button
                type="button"
                className="zelune-interactive"
                onClick={onClearSelection}
                title="Deselect element (Esc)"
                style={{
                  background: 'transparent',
                  border: '1px solid transparent',
                  borderRadius: 5,
                  color: 'var(--studio-text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Live Save Status Indicator */}
          {(isLoading || isSaving || statusMessage) && (
            <div
              style={{
                padding: '6px 16px',
                backgroundColor: 'var(--studio-badge-indigo-bg)',
                borderBottom: '1px solid var(--studio-badge-indigo-border)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--studio-badge-indigo-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>
                {isSaving
                  ? 'Patching AST & writing .tsx...'
                  : isLoading
                    ? 'Inspecting AST node...'
                    : statusMessage}
              </span>
              <span style={{ color: 'var(--studio-accent-emerald)', fontWeight: 600 }}>● AST Sync</span>
            </div>
          )}

          {/* Structural Element Action Bar: + Add Element, Duplicate, Reorder Up/Down, Delete */}
          <div
            style={{
              padding: '8px 14px',
              borderBottom: '1px solid var(--studio-border-hairline)',
              backgroundColor: 'var(--studio-surface-1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
              <button
                type="button"
                className="zelune-interactive"
                onClick={() => setShowInsertDrawer((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 9px',
                  borderRadius: 6,
                  border: showInsertDrawer
                    ? '1px solid #38BDF8'
                    : '1px solid rgba(56, 189, 248, 0.35)',
                  backgroundColor: showInsertDrawer
                    ? 'rgba(56, 189, 248, 0.18)'
                    : 'rgba(56, 189, 248, 0.08)',
                  color: '#38BDF8',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={12} />
                <span>Add Element</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className="zelune-interactive"
                  disabled={isSaving || inspected.astPath === '0'}
                  onClick={() =>
                    onDuplicate?.({ file: inspected.file, astPath: inspected.astPath })
                  }
                  title="Duplicate Selected Element"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 7px',
                    borderRadius: 6,
                    border: '1px solid var(--studio-border-subtle)',
                    backgroundColor: 'var(--studio-surface-2)',
                    color: 'var(--studio-text-secondary)',
                    fontSize: 11,
                    cursor: inspected.astPath === '0' ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Copy size={11} />
                  <span>Clone</span>
                </button>

                <button
                  type="button"
                  className="zelune-interactive"
                  disabled={isSaving || inspected.astPath === '0'}
                  onClick={() =>
                    onReorder?.({
                      file: inspected.file,
                      astPath: inspected.astPath,
                      direction: 'up',
                    })
                  }
                  title="Move Element Up"
                  style={{
                    padding: '5px 6px',
                    borderRadius: 6,
                    border: '1px solid var(--studio-border-subtle)',
                    backgroundColor: 'var(--studio-surface-2)',
                    color: 'var(--studio-text-secondary)',
                    cursor: inspected.astPath === '0' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <ArrowUp size={12} />
                </button>

                <button
                  type="button"
                  className="zelune-interactive"
                  disabled={isSaving || inspected.astPath === '0'}
                  onClick={() =>
                    onReorder?.({
                      file: inspected.file,
                      astPath: inspected.astPath,
                      direction: 'down',
                    })
                  }
                  title="Move Element Down"
                  style={{
                    padding: '5px 6px',
                    borderRadius: 6,
                    border: '1px solid var(--studio-border-subtle)',
                    backgroundColor: 'var(--studio-surface-2)',
                    color: 'var(--studio-text-secondary)',
                    cursor: inspected.astPath === '0' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <ArrowDown size={12} />
                </button>

                <button
                  type="button"
                  className="zelune-interactive"
                  disabled={isSaving || inspected.astPath === '0'}
                  onClick={() =>
                    onDelete?.({ file: inspected.file, astPath: inspected.astPath })
                  }
                  title="Delete Element from .tsx (Cmd+Z to Undo)"
                  style={{
                    padding: '5px 6px',
                    borderRadius: 6,
                    border: '1px solid rgba(244, 63, 94, 0.35)',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    color: '#F43F5E',
                    cursor: inspected.astPath === '0' ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {showInsertDrawer && renderInsertPaletteContent(true)}
          </div>

          {/* Navigation Flow Link Banner if element triggers navigation */}
          {inspected.navigationTarget && (
            <div
              style={{
                margin: '12px 14px 0',
                padding: '9px 12px',
                backgroundColor: 'var(--studio-badge-emerald-bg)',
                border: '1px solid var(--studio-badge-emerald-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--studio-badge-emerald-text)',
                }}
              >
                <Navigation size={13} color="var(--studio-accent-emerald)" />
                <span>
                  Flow → <strong>{inspected.navigationTarget}</strong>
                </span>
              </div>
              <button
                type="button"
                className="zelune-interactive"
                onClick={() => onJumpToScreen(inspected.navigationTarget!)}
                style={{
                  backgroundColor: '#10B981',
                  color: '#052E16',
                  border: 'none',
                  borderRadius: 5,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Focus Target →
              </button>
            </div>
          )}

          <div className="zelune-inspector-body" style={{ display: 'flex', flexDirection: 'column' }}>
            {/* SECTION 1: Text Copy Editor */}
            {(inspected.isTextEditable || inspected.hasDynamicText) && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: 'var(--studio-text-muted)',
                    letterSpacing: '0.06em',
                  }}
                >
                  <Type size={12} color="#38BDF8" />
                  <span>TEXT COPY</span>
                </div>

                {inspected.hasDynamicText ? (
                  <div
                    style={{
                      padding: 10,
                      backgroundColor: 'var(--studio-surface-2)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 7,
                      fontSize: 11.5,
                      color: 'var(--studio-text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    Contains dynamic JSX expression (<code style={{ color: '#0284C7' }}>{'{...}'}</code>). Protected from static overwrite—use <strong>Ask Antigravity</strong> below to refactor expression logic.
                  </div>
                ) : (
                  <textarea
                    rows={2}
                    value={localText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Enter text content..."
                    className="zelune-input"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--studio-canvas-bg)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 7,
                      paddingLeft: 10,
                      paddingRight: 10,
                      color: 'var(--studio-text-primary)',
                      fontSize: 12.5,
                      resize: 'vertical',
                      fontFamily: 'var(--font-sans)',
                    }}
                  />
                )}
              </section>
            )}

            {/* SECTION 2: Colors (Background & Text/Foreground) */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--studio-text-muted)',
                  letterSpacing: '0.06em',
                }}
              >
                <Palette size={12} color="#38BDF8" />
                <span>COLORS &amp; SURFACES</span>
              </div>

              {/* Background Color */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, color: 'var(--studio-text-secondary)' }}>Background Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={
                      typeof localStyles.backgroundColor === 'string' &&
                      localStyles.backgroundColor.startsWith('#') &&
                      localStyles.backgroundColor.length === 7
                        ? localStyles.backgroundColor
                        : '#13161E'
                    }
                    onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                    style={{
                      width: 30,
                      height: 30,
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text"
                    value={String(localStyles.backgroundColor ?? '')}
                    placeholder="#13161E"
                    onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                    className="zelune-input tabular-nums"
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--studio-canvas-bg)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      paddingLeft: 10,
                      paddingRight: 10,
                      color: 'var(--studio-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                  {COLOR_SWATCHES.map((hex) => (
                    <button
                      key={`bg-${hex}`}
                      type="button"
                      className="zelune-interactive"
                      onClick={() => handleStyleChange('backgroundColor', hex)}
                      title={`Set backgroundColor to ${hex}`}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        backgroundColor: hex,
                        border:
                          localStyles.backgroundColor === hex
                            ? '2px solid #38BDF8'
                            : '1px solid var(--studio-border-strong)',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Text Color */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 11.5, color: 'var(--studio-text-secondary)' }}>Text Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={
                      typeof localStyles.color === 'string' &&
                      localStyles.color.startsWith('#') &&
                      localStyles.color.length === 7
                        ? localStyles.color
                        : '#F8FAFC'
                    }
                    onChange={(e) => handleStyleChange('color', e.target.value)}
                    style={{
                      width: 30,
                      height: 30,
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text"
                    value={String(localStyles.color ?? '')}
                    placeholder="#F8FAFC"
                    onChange={(e) => handleStyleChange('color', e.target.value)}
                    className="zelune-input tabular-nums"
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--studio-canvas-bg)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      paddingLeft: 10,
                      paddingRight: 10,
                      color: 'var(--studio-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>
              </div>
            </section>

            {/* SECTION 3: Typography */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--studio-text-muted)',
                  letterSpacing: '0.06em',
                }}
              >
                <Type size={12} color="#38BDF8" />
                <span>TYPOGRAPHY</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--studio-text-secondary)', display: 'block', marginBottom: 4 }}>
                    Font Size (px)
                  </label>
                  <input
                    type="number"
                    value={localStyles.fontSize ?? ''}
                    placeholder="15"
                    onChange={(e) => handleNumericStyleChange('fontSize', e.target.value)}
                    className="zelune-input tabular-nums"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--studio-canvas-bg)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      paddingLeft: 8,
                      paddingRight: 8,
                      color: 'var(--studio-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: 'var(--studio-text-secondary)', display: 'block', marginBottom: 4 }}>
                    Font Weight
                  </label>
                  <select
                    value={String(localStyles.fontWeight ?? '600')}
                    onChange={(e) => handleStyleChange('fontWeight', e.target.value)}
                    className="zelune-input tabular-nums"
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--studio-canvas-bg)',
                      border: '1px solid var(--studio-border-subtle)',
                      borderRadius: 6,
                      paddingLeft: 8,
                      paddingRight: 8,
                      color: 'var(--studio-text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {FONT_WEIGHTS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* SECTION 4: Layout, Spacing & Radius */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--studio-text-muted)',
                  letterSpacing: '0.06em',
                }}
              >
                <Box size={12} color="#38BDF8" />
                <span>SPACING &amp; GEOMETRY</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { key: 'borderRadius', label: 'Corner Radius' },
                  { key: 'padding', label: 'Padding (All)' },
                  { key: 'paddingHorizontal', label: 'Padding X' },
                  { key: 'paddingVertical', label: 'Padding Y' },
                  { key: 'gap', label: 'Flex Gap' },
                  { key: 'borderWidth', label: 'Border Width' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: 'var(--studio-text-secondary)', display: 'block', marginBottom: 4 }}>
                      {label}
                    </label>
                    <input
                      type="number"
                      value={localStyles[key] ?? ''}
                      placeholder="—"
                      onChange={(e) => handleNumericStyleChange(key, e.target.value)}
                      className="zelune-input tabular-nums"
                      style={{
                        width: '100%',
                        backgroundColor: 'var(--studio-canvas-bg)',
                        border: '1px solid var(--studio-border-subtle)',
                        borderRadius: 6,
                        paddingLeft: 8,
                        paddingRight: 8,
                        color: 'var(--studio-text-primary)',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 5: Tier-2 Antigravity Structural Refactor Button */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                className="zelune-interactive"
                onClick={() => dialogRef.current?.showModal()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: 'var(--studio-surface-3)',
                  color: 'var(--studio-text-primary)',
                  border: '1px solid rgba(56, 189, 248, 0.42)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 20px -8px rgba(0, 0, 0, 0.25)',
                }}
              >
                <Sparkles size={14} color="#38BDF8" />
                <span>Ask Antigravity to Refactor</span>
              </button>
            </section>

            {/* SECTION 6: Live JSX Code Snippet */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--studio-text-muted)',
                  letterSpacing: '0.06em',
                }}
              >
                <Code2 size={12} color="#38BDF8" />
                <span>LIVE JSX AST NODE</span>
              </div>
              <pre
                className="zelune-scroller"
                style={{
                  backgroundColor: 'var(--studio-canvas-bg)',
                  border: '1px solid var(--studio-border-hairline)',
                  borderRadius: 7,
                  padding: 10,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--studio-text-secondary)',
                  overflowX: 'auto',
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                {inspected.codeSnippet}
              </pre>
            </section>
          </div>

          {/* Native Modal Dialog with closedby="any" + Emil Kowalski --ease-out-expo entry choreography */}
          <dialog
            ref={dialogRef}
            closedby="any"
            aria-labelledby="agyDialogTitle"
            className="agy-modal-dialog"
          >
            <div
              style={{
                backgroundColor: 'var(--studio-surface-1)',
                color: 'var(--studio-text-primary)',
                border: '1px solid var(--studio-border-strong)',
                borderRadius: 14,
                padding: 22,
                width: 480,
                maxWidth: '92vw',
                display: 'flex',
                flexDirection: 'column',
                gap: 15,
                boxShadow: '0 28px 60px -12px rgba(0, 0, 0, 0.55)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color="#38BDF8" />
                  <h2
                    id="agyDialogTitle"
                    className="balance-heading"
                    style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.015em' }}
                  >
                    Ask Google Antigravity — Structural AST Edit
                  </h2>
                </div>
                <button
                  type="button"
                  className="zelune-interactive"
                  onClick={() => dialogRef.current?.close()}
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: 5,
                    color: 'var(--studio-text-secondary)',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--studio-text-secondary)', lineHeight: 1.55 }}>
                Describe the structural or stateful change you want for{' '}
                <code style={{ color: '#0284C7', fontFamily: 'var(--font-mono)' }}>&lt;{inspected.tagName}&gt;</code> in{' '}
                <code className="tabular-nums" style={{ color: '#6366F1', fontFamily: 'var(--font-mono)' }}>
                  {inspected.file}:{inspected.line}
                </code>
                .
              </p>

              <textarea
                rows={3}
                value={agentInstruction}
                onChange={(e) => setAgentInstruction(e.target.value)}
                placeholder="e.g., Convert this spec grid into an asymmetric 2-column acoustic telemetry readout..."
                style={{
                  width: '100%',
                  backgroundColor: 'var(--studio-canvas-bg)',
                  border: '1px solid var(--studio-border-subtle)',
                  borderRadius: 8,
                  padding: 11,
                  color: 'var(--studio-text-primary)',
                  fontSize: 12.5,
                  fontFamily: 'var(--font-sans)',
                }}
              />

              <div
                className="zelune-scroller"
                style={{
                  backgroundColor: 'var(--studio-canvas-bg)',
                  border: '1px solid var(--studio-border-hairline)',
                  borderRadius: 7,
                  padding: 10,
                  maxHeight: 150,
                  overflowY: 'auto',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--studio-text-secondary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {buildAntigravityPrompt()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="zelune-interactive"
                  onClick={() => dialogRef.current?.close()}
                  style={{
                    padding: '8px 13px',
                    borderRadius: 7,
                    border: '1px solid var(--studio-border-subtle)',
                    backgroundColor: 'var(--studio-surface-2)',
                    color: 'var(--studio-text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="zelune-interactive"
                  onClick={handleCopyPrompt}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 7,
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    backgroundColor: 'var(--studio-surface-3)',
                    color: 'var(--studio-text-primary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {copiedPrompt ? <Check size={14} color="#34D399" /> : <Copy size={14} color="#38BDF8" />}
                  <span>{copiedPrompt ? 'Copied Context for Antigravity!' : 'Copy Agent Prompt Context'}</span>
                </button>
              </div>
            </div>
          </dialog>
        </div>
      )}
    </aside>
  );
};
