import React from 'react';
import type { ArtboardLayoutMap, NavigationEdge, ScreenMetadata } from './types';

interface FlowArrowsLayerProps {
  screens: ScreenMetadata[];
  layout: ArtboardLayoutMap;
  activeScreenId: string | null;
  highlightedScreenId: string | null;
  onSelectFlow?: (edge: NavigationEdge) => void;
}

const ARTBOARD_HEADER_OFFSET = 38;

export const FlowArrowsLayer: React.FC<FlowArrowsLayerProps> = ({
  screens,
  layout,
  activeScreenId,
  highlightedScreenId,
  onSelectFlow,
}) => {
  const edges: NavigationEdge[] = [];
  for (const screen of screens) {
    for (const edge of screen.outgoingFlows) {
      if (layout[edge.fromScreen] && layout[edge.toScreen]) {
        edges.push(edge);
      }
    }
  }

  if (edges.length === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 8000,
        height: 4000,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 5,
      }}
    >
      <defs>
        <marker
          id="flow-arrow-default"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#6366F1" />
        </marker>
        <marker
          id="flow-arrow-active"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#34D399" />
        </marker>
      </defs>

      {edges.map((edge, idx) => {
        const fromBox = layout[edge.fromScreen];
        const toBox = layout[edge.toScreen];
        if (!fromBox || !toBox) return null;

        const isForward = toBox.x >= fromBox.x;
        const isHighlighted =
          activeScreenId === edge.fromScreen ||
          highlightedScreenId === edge.toScreen ||
          activeScreenId === edge.toScreen;

        // Vertical staggering so multiple arrows don't overlap
        const verticalSlot = ((idx % 4) - 1.5) * 56;

        let startX: number;
        let startY: number;
        let endX: number;
        let endY: number;
        let pathD: string;
        let midX: number;
        let midY: number;

        if (isForward) {
          startX = fromBox.x + fromBox.width;
          startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height * 0.45 + verticalSlot;
          endX = toBox.x;
          endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height * 0.35 + verticalSlot * 0.6;

          const dx = Math.max(80, Math.abs(endX - startX) * 0.45);
          pathD = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;
          midX = (startX + endX) / 2;
          midY = (startY + endY) / 2;
        } else {
          // Return loop arched underneath the artboards
          startX = fromBox.x + fromBox.width * 0.5;
          startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height;
          endX = toBox.x + toBox.width * 0.5;
          endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height;

          const archDepth = 110 + (idx % 3) * 35;
          pathD = `M ${startX} ${startY} C ${startX} ${startY + archDepth}, ${endX} ${endY + archDepth}, ${endX} ${endY}`;
          midX = (startX + endX) / 2;
          midY = Math.max(startY, endY) + archDepth * 0.72;
        }

        const strokeColor = isHighlighted ? '#34D399' : '#6366F1';
        const strokeOpacity = isHighlighted ? 0.95 : 0.55;

        return (
          <g key={edge.id}>
            {/* Subtle glow path */}
            {isHighlighted && (
              <path
                d={pathD}
                fill="none"
                stroke="#34D399"
                strokeWidth={6}
                strokeOpacity={0.18}
              />
            )}

            {/* Main cubic-bezier connector */}
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isHighlighted ? 2.25 : 1.75}
              strokeOpacity={strokeOpacity}
              strokeDasharray={isForward ? undefined : '6 5'}
              markerEnd={
                isHighlighted ? 'url(#flow-arrow-active)' : 'url(#flow-arrow-default)'
              }
            />

            {/* Origin anchor dot */}
            <circle
              cx={startX}
              cy={startY}
              r={4}
              fill="var(--studio-surface-1)"
              stroke={strokeColor}
              strokeWidth={2}
            />

            {/* Interactive Flow Label Pill */}
            <foreignObject
              x={midX - 75}
              y={midY - 13}
              width={150}
              height={28}
              style={{ pointerEvents: 'auto', overflow: 'visible' }}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFlow?.(edge);
                }}
                title={`${edge.fromScreen} → ${edge.toScreen} (${edge.triggerLabel})`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '3px 9px',
                  borderRadius: 999,
                  backgroundColor: 'var(--studio-surface-1)',
                  border: `1px solid ${isHighlighted ? 'var(--studio-accent-emerald)' : 'var(--studio-badge-indigo-border)'}`,
                  color: isHighlighted ? 'var(--studio-badge-emerald-text)' : 'var(--studio-badge-indigo-text)',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  margin: '0 auto',
                }}
              >
                <span>{edge.fromScreen}</span>
                <span>→</span>
                <span>{edge.toScreen}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
};
