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

export const FlowArrowsLayer: React.FC<FlowArrowsLayerProps> = React.memo(({
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
        height: 6000,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 25,
      }}
    >
      <defs>
        <marker
          id="flow-arrow-default"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
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
          <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#10B981" />
        </marker>
      </defs>

      {edges.map((edge, idx) => {
        const fromBox = layout[edge.fromScreen];
        const toBox = layout[edge.toScreen];
        if (!fromBox || !toBox) return null;

        const sameRow = Math.abs(toBox.y - fromBox.y) < 180;
        const isExplicitReturn =
          edge.id.includes(':return') || edge.triggerLabel.startsWith('Back to ');
        const isReturnOrBackward =
          isExplicitReturn || (sameRow ? toBox.x < fromBox.x : toBox.y < fromBox.y);

        const isHighlighted =
          activeScreenId === edge.fromScreen ||
          highlightedScreenId === edge.toScreen ||
          activeScreenId === edge.toScreen;

        // Emerald/Green wires for Return/Back flows AND Active/Highlighted flows; Blue/Indigo wires for Forward flows
        const useEmeraldWire = isHighlighted || isReturnOrBackward;

        const verticalSlot = ((idx % 4) - 1.5) * 52;
        const horizontalSlot = ((idx % 5) - 2) * 38;

        let startX: number;
        let startY: number;
        let cp1X: number;
        let cp1Y: number;
        let cp2X: number;
        let cp2Y: number;
        let endX: number;
        let endY: number;

        if (sameRow) {
          if (toBox.x >= fromBox.x) {
            // Left-to-right forward connection in same row
            startX = fromBox.x + fromBox.width;
            startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height * 0.45 + verticalSlot;
            endX = toBox.x;
            endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height * 0.36 + verticalSlot * 0.6;
            const dx = Math.max(85, Math.abs(endX - startX) * 0.45);
            cp1X = startX + dx;
            cp1Y = startY;
            cp2X = endX - dx;
            cp2Y = endY;
          } else {
            // Return loop arched smoothly in the horizontal alley underneath the row
            startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot * 0.5;
            startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height;
            endX = toBox.x + toBox.width * 0.5 - horizontalSlot * 0.5;
            endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height;
            const archDepth = 95 + (idx % 3) * 32;
            cp1X = startX;
            cp1Y = startY + archDepth;
            cp2X = endX;
            cp2Y = endY + archDepth;
          }
        } else if (toBox.y > fromBox.y) {
          // Cross-row downward connection (Bottom of fromBox -> Top of toBox)
          startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot;
          startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height;
          endX = toBox.x + toBox.width * 0.5 + horizontalSlot * 0.6;
          endY = toBox.y + ARTBOARD_HEADER_OFFSET;
          const dy = Math.max(90, Math.abs(endY - startY) * 0.48);
          cp1X = startX;
          cp1Y = startY + dy;
          cp2X = endX;
          cp2Y = endY - dy;
        } else {
          // Cross-row upward return connection (Top of fromBox -> Bottom of toBox)
          startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot;
          startY = fromBox.y + ARTBOARD_HEADER_OFFSET;
          endX = toBox.x + toBox.width * 0.5 + horizontalSlot * 0.6;
          endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height;
          const dy = Math.max(90, Math.abs(startY - endY) * 0.48);
          cp1X = startX;
          cp1Y = startY - dy;
          cp2X = endX;
          cp2Y = endY + dy;
        }

        const pathD = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
        // Exact cubic Bezier midpoint at t = 0.5
        const midX = 0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
        const midY = 0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

        const strokeColor = useEmeraldWire ? '#10B981' : '#6366F1';
        const strokeOpacity = isHighlighted ? 0.98 : 0.82;

        return (
          <g key={edge.id}>
            {/* Subtle glow path */}
            {isHighlighted && (
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={7}
                strokeOpacity={0.22}
              />
            )}

            {/* Main cubic-bezier connector */}
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isHighlighted ? 2.8 : 2.15}
              strokeOpacity={strokeOpacity}
              strokeDasharray={isReturnOrBackward ? '7 5' : undefined}
              markerEnd={
                useEmeraldWire ? 'url(#flow-arrow-active)' : 'url(#flow-arrow-default)'
              }
            />

            {/* Origin anchor dot */}
            <circle
              cx={startX}
              cy={startY}
              r={4.5}
              fill="var(--studio-surface-1)"
              stroke={strokeColor}
              strokeWidth={2.2}
            />

            {/* Interactive Flow Label Pill */}
            <foreignObject
              x={midX - 85}
              y={midY - 13}
              width={170}
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
                  border: `1px solid ${useEmeraldWire ? 'var(--studio-accent-emerald)' : 'var(--studio-badge-indigo-border)'}`,
                  color: useEmeraldWire ? 'var(--studio-badge-emerald-text)' : 'var(--studio-badge-indigo-text)',
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
});
