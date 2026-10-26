import React from 'react';
import { Maximize2 } from 'lucide-react';
import type { ArtboardLayoutMap, DetectedUserFlow, FlowAccentTone } from './types';

interface FlowSwimlanesLayerProps {
  flows: DetectedUserFlow[];
  layout: ArtboardLayoutMap;
  colorScheme: 'dark' | 'light';
  onFocusFlow: (flowId: string) => void;
}

const DOT_COLORS: Record<FlowAccentTone, string> = {
  sky: '#38BDF8',
  indigo: '#6366F1',
  emerald: '#10B981',
  violet: '#A855F7',
  amber: '#F59E0B',
  slate: '#94A3B8',
};

/**
 * Renders quiet, minimalist Figma/Linear-style section labels anchored directly above
 * the entry screen of each horizontal User Flow row — zero bounding-box clutter.
 */
export const FlowSwimlanesLayer: React.FC<FlowSwimlanesLayerProps> = React.memo(
  ({ flows, layout, colorScheme, onFocusFlow }) => {
    if (flows.length === 0) return null;
    const isDark = colorScheme === 'dark';

    return (
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {flows.map((flow) => {
          const anchor = flow.screenIds
            .map((id) => layout[id])
            .filter((pos): pos is NonNullable<typeof pos> => Boolean(pos))
            .sort((a, b) => a.x - b.x || a.y - b.y)[0];

          if (!anchor) return null;

          const dot = DOT_COLORS[flow.accent] ?? DOT_COLORS.indigo;
          const idxLabel = String(flow.index).padStart(2, '0');

          return (
            <button
              key={flow.id}
              type="button"
              className="zelune-interactive tabular-nums"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onFocusFlow(flow.id);
              }}
              title={`Zoom to ${flow.title} (${flow.screenIds.length} ${
                flow.screenIds.length === 1 ? 'screen' : 'screens'
              })`}
              style={{
                position: 'absolute',
                left: anchor.x,
                top: anchor.y - 44,
                pointerEvents: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 12px',
                borderRadius: 999,
                backgroundColor: isDark ? 'rgba(17, 20, 28, 0.88)' : 'rgba(255, 255, 255, 0.92)',
                border: `1px solid ${
                  isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.12)'
                }`,
                color: isDark ? '#E2E8F0' : '#0F172A',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: isDark
                  ? '0 4px 14px rgba(0, 0, 0, 0.32)'
                  : '0 3px 10px rgba(15, 23, 42, 0.06)',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: dot,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  opacity: 0.62,
                }}
              >
                {idxLabel}
              </span>
              <span>{flow.title}</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  opacity: 0.55,
                }}
              >
                · {flow.screenIds.length}
              </span>
              <Maximize2 size={10.5} style={{ opacity: 0.5, marginLeft: 1 }} />
            </button>
          );
        })}
      </div>
    );
  }
);
