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
} from 'lucide-react';
import type { InspectedElement, PatchPayload, StyleValue } from '../server/astEngine';

interface InspectorPanelProps {
  inspected: InspectedElement | null;
  isLoading: boolean;
  isSaving: boolean;
  statusMessage: string | null;
  onPatch: (payload: PatchPayload) => Promise<void>;
  onClearSelection: () => void;
  onJumpToScreen: (routeName: string) => void;
}

const COLOR_SWATCHES = [
  '#4F46E5',
  '#6366F1',
  '#10B981',
  '#0EA5E9',
  '#F59E0B',
  '#EF4444',
  '#111827',
  '#1E293B',
  '#F8FAFC',
];

const FONT_WEIGHTS = ['400', '500', '600', '700', '800'];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  inspected,
  isLoading,
  isSaving,
  statusMessage,
  onPatch,
  onClearSelection,
  onJumpToScreen,
}) => {
  const [localText, setLocalText] = useState('');
  const [localStyles, setLocalStyles] = useState<Record<string, StyleValue>>({});
  const [agentInstruction, setAgentInstruction] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

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
      agentInstruction.trim() || 'Update this component layout and styling.',
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

  if (!inspected) {
    return (
      <aside
        style={{
          width: 320,
          backgroundColor: '#11141D',
          borderLeft: '1px solid #1E2433',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 20,
          color: '#94A3B8',
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F8FAFC', fontWeight: 600, fontSize: 14 }}>
            <Sliders size={16} color="#6366F1" />
            <span>AST Visual Inspector</span>
          </div>
          <div
            style={{
              backgroundColor: '#161B26',
              border: '1px solid #262E40',
              borderRadius: 12,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Click any UI element on any screen artboard to inspect and live-edit its{' '}
            <strong style={{ color: '#E2E8F0' }}>React Native StyleSheet</strong> or{' '}
            <strong style={{ color: '#E2E8F0' }}>Text copy</strong> directly in the{' '}
            <code style={{ color: '#A5B4FC' }}>.tsx</code> source file.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.05em' }}>
              TWO-TIER SYNC ARCHITECTURE
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
              • <strong style={{ color: '#CBD5E1' }}>Tier 1 (Direct AST)</strong>: Instant surgical updates to colors, typography, spacing, and copy.
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
              • <strong style={{ color: '#CBD5E1' }}>Tier 2 (Antigravity Bridge)</strong>: Dispatch structural refactors with exact file &amp; AST context.
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#64748B',
            borderTop: '1px solid #1E2433',
            paddingTop: 12,
          }}
        >
          MCP Server: <span style={{ color: '#34D399' }}>Ready (mcp/server.ts)</span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 340,
        backgroundColor: '#11141D',
        borderLeft: '1px solid #1E2433',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        zIndex: 30,
      }}
    >
      {/* Inspector Header */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #1E2433',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#141824',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                backgroundColor: '#312E81',
                color: '#C7D2FE',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 7px',
                borderRadius: 5,
              }}
            >
              &lt;{inspected.tagName}&gt;
            </span>
            {inspected.styleSheetKey && (
              <span
                style={{
                  backgroundColor: '#064E3B',
                  color: '#A7F3D0',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '2px 6px',
                  borderRadius: 5,
                }}
              >
                styles.{inspected.styleSheetKey}
              </span>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#64748B',
              marginTop: 2,
            }}
          >
            {inspected.file}:{inspected.line}:{inspected.col}
          </span>
        </div>

        <button
          type="button"
          onClick={onClearSelection}
          title="Close inspector"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748B',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Live Save Status Indicator */}
      {(isLoading || isSaving || statusMessage) && (
        <div
          style={{
            padding: '6px 16px',
            backgroundColor: '#1E1B4B',
            borderBottom: '1px solid #312E81',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#A5B4FC',
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
          <span style={{ color: '#34D399' }}>● AST Sync</span>
        </div>
      )}

      {/* Navigation Flow Link Banner if element triggers navigation */}
      {inspected.navigationTarget && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 12px',
            backgroundColor: '#064E3B',
            border: '1px solid #10B981',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#D1FAE5' }}>
            <Navigation size={14} color="#34D399" />
            <span>
              Navigates to <strong>{inspected.navigationTarget}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => onJumpToScreen(inspected.navigationTarget!)}
            style={{
              backgroundColor: '#10B981',
              color: '#052E16',
              border: 'none',
              borderRadius: 6,
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

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* SECTION 1: Text Copy Editor */}
        {(inspected.isTextEditable || inspected.hasDynamicText) && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
              <Type size={13} color="#6366F1" />
              <span>TEXT COPY</span>
            </div>

            {inspected.hasDynamicText ? (
              <div
                style={{
                  padding: 10,
                  backgroundColor: '#1E1B4B',
                  border: '1px solid #3730A3',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#C7D2FE',
                }}
              >
                Contains dynamic JSX expression (<code>{'{...}'}</code>). Protected from static overwrite—use <strong>Ask Antigravity</strong> below to modify expression logic.
              </div>
            ) : (
              <textarea
                rows={2}
                value={localText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Enter text content..."
                style={{
                  width: '100%',
                  backgroundColor: '#0B0D12',
                  border: '1px solid #262E40',
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: '#F8FAFC',
                  fontSize: 13,
                  resize: 'vertical',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
            )}
          </section>
        )}

        {/* SECTION 2: Colors (Background & Text/Foreground) */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
            <Palette size={13} color="#6366F1" />
            <span>COLORS &amp; SURFACES</span>
          </div>

          {/* Background Color */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#CBD5E1' }}>Background Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={
                  typeof localStyles.backgroundColor === 'string' &&
                  localStyles.backgroundColor.startsWith('#') &&
                  localStyles.backgroundColor.length === 7
                    ? localStyles.backgroundColor
                    : '#111827'
                }
                onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                style={{
                  width: 32,
                  height: 32,
                  border: '1px solid #334155',
                  borderRadius: 6,
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              />
              <input
                type="text"
                value={String(localStyles.backgroundColor ?? '')}
                placeholder="#111827"
                onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: '#0B0D12',
                  border: '1px solid #262E40',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: '#F8FAFC',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
              {COLOR_SWATCHES.map((hex) => (
                <button
                  key={`bg-${hex}`}
                  type="button"
                  onClick={() => handleStyleChange('backgroundColor', hex)}
                  title={`Set backgroundColor to ${hex}`}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    backgroundColor: hex,
                    border:
                      localStyles.backgroundColor === hex
                        ? '2px solid #FFFFFF'
                        : '1px solid #334155',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Text Color */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#CBD5E1' }}>Text Color</label>
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
                  width: 32,
                  height: 32,
                  border: '1px solid #334155',
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
                style={{
                  flex: 1,
                  backgroundColor: '#0B0D12',
                  border: '1px solid #262E40',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: '#F8FAFC',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            </div>
          </div>
        </section>

        {/* SECTION 3: Typography */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
            <Type size={13} color="#6366F1" />
            <span>TYPOGRAPHY</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                Font Size (px)
              </label>
              <input
                type="number"
                value={localStyles.fontSize ?? ''}
                placeholder="15"
                onChange={(e) => handleNumericStyleChange('fontSize', e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0B0D12',
                  border: '1px solid #262E40',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: '#F8FAFC',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                Font Weight
              </label>
              <select
                value={String(localStyles.fontWeight ?? '600')}
                onChange={(e) => handleStyleChange('fontWeight', e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: '#0B0D12',
                  border: '1px solid #262E40',
                  borderRadius: 6,
                  padding: '6px 8px',
                  color: '#F8FAFC',
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
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
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
            <Box size={13} color="#6366F1" />
            <span>SPACING &amp; GEOMETRY</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { key: 'borderRadius', label: 'Corner Radius' },
              { key: 'padding', label: 'Padding (All)' },
              { key: 'paddingHorizontal', label: 'Padding X' },
              { key: 'paddingVertical', label: 'Padding Y' },
              { key: 'gap', label: 'Flex Gap' },
              { key: 'borderWidth', label: 'Border Width' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                  {label}
                </label>
                <input
                  type="number"
                  value={localStyles[key] ?? ''}
                  placeholder="—"
                  onChange={(e) => handleNumericStyleChange(key, e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0B0D12',
                    border: '1px solid #262E40',
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: '#F8FAFC',
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
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
            onClick={() => dialogRef.current?.showModal()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '11px 14px',
              background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 8px 20px -6px rgba(79, 70, 229, 0.6)',
            }}
          >
            <Sparkles size={15} />
            <span>Ask Antigravity to Refactor</span>
          </button>
        </section>

        {/* SECTION 6: Live JSX Code Snippet */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
            <Code2 size={13} color="#6366F1" />
            <span>LIVE JSX AST NODE</span>
          </div>
          <pre
            style={{
              backgroundColor: '#090B10',
              border: '1px solid #1E2433',
              borderRadius: 8,
              padding: 10,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#CBD5E1',
              overflowX: 'auto',
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {inspected.codeSnippet}
          </pre>
        </section>
      </div>

      {/* Native Modal Dialog with closedby="any" + Modern Web Guidance Scroll Containment */}
      <dialog
        ref={dialogRef}
        closedby="any"
        aria-labelledby="agyDialogTitle"
        className="agy-modal-dialog"
      >
        <div
          style={{
            backgroundColor: '#11141D',
            color: '#F8FAFC',
            border: '1px solid #312E81',
            borderRadius: 16,
            padding: 24,
            width: 480,
            maxWidth: '92vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="#818CF8" />
              <h2 id="agyDialogTitle" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Ask Google Antigravity — Structural Edit
              </h2>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          <p style={{ margin: 0, fontSize: 13, color: '#94A3B8', lineHeight: 1.5 }}>
            Describe the structural or stateful change you want for{' '}
            <code style={{ color: '#A5B4FC' }}>&lt;{inspected.tagName}&gt;</code> in{' '}
            <code style={{ color: '#A5B4FC' }}>{inspected.file}:{inspected.line}</code>.
          </p>

          <textarea
            rows={3}
            value={agentInstruction}
            onChange={(e) => setAgentInstruction(e.target.value)}
            placeholder="e.g., Turn this card into a swipeable horizontal carousel with 3 product items and animated badge..."
            style={{
              width: '100%',
              backgroundColor: '#0B0D12',
              border: '1px solid #2E364F',
              borderRadius: 10,
              padding: 12,
              color: '#F8FAFC',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
            }}
          />

          <div
            style={{
              backgroundColor: '#090B10',
              border: '1px solid #1E2433',
              borderRadius: 8,
              padding: 10,
              maxHeight: 150,
              overflowY: 'auto',
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#94A3B8',
              whiteSpace: 'pre-wrap',
            }}
          >
            {buildAntigravityPrompt()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid #262E40',
                backgroundColor: '#161B26',
                color: '#CBD5E1',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCopyPrompt}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#4F46E5',
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedPrompt ? 'Copied Context for Antigravity!' : 'Copy Agent Prompt Context'}</span>
            </button>
          </div>
        </div>
      </dialog>
    </aside>
  );
};
