import React from 'react';
import type { ArtboardLayoutMap, NavigationEdge, ScreenMetadata } from './types';

interface FlowArrowsLayerProps {
  screens: ScreenMetadata[];
  layout: ArtboardLayoutMap;
  screenFlowMap?: Record<string, string>;
  spotlightScreenId: string | null;
  highlightedScreenId: string | null;
  onSelectFlow?: (edge: NavigationEdge) => void;
}

const ARTBOARD_HEADER_OFFSET = 38;

function formatCompactStepLabel(edge: NavigationEdge, isAdjacentForward: boolean): string {
  if (!isAdjacentForward) {
    return `${edge.fromScreen} → ${edge.toScreen}`;
  }
  const raw = edge.triggerLabel.trim();
  const stripped = raw
    .replace(/^(?:Navigate|Continue|Go|Open|View)\s*(?:to|→)?\s+/i, '')
    .trim();
  if (
    stripped &&
    stripped.toLowerCase() !== edge.toScreen.toLowerCase() &&
    stripped.length <= 24
  ) {
    return `${stripped} →`;
  }
  return `→ ${edge.toScreen}`;
}

export const FlowArrowsLayer: React.FC<FlowArrowsLayerProps> = React.memo(
  ({
    screens,
    layout,
    screenFlowMap,
    spotlightScreenId,
    highlightedScreenId,
    onSelectFlow,
  }) => {
    const effectiveSpotlight = highlightedScreenId ?? spotlightScreenId;

    const visibleEdges: Array<{
      edge: NavigationEdge;
      sameRow: boolean;
      isReturnOrBackward: boolean;
      isHighlighted: boolean;
    }> = [];

    for (const screen of screens) {
      for (const edge of screen.outgoingFlows) {
        const fromBox = layout[edge.fromScreen];
        const toBox = layout[edge.toScreen];
        if (!fromBox || !toBox) continue;

        const sameRow = Math.abs(toBox.y - fromBox.y) < 180;
        const trimmedTrigger = edge.triggerLabel.trim();
        const isExplicitReturn =
          edge.id.includes(':return') ||
          /^(?:←|‹|<)\s*/.test(trimmedTrigger) ||
          /^(?:back|return|go\s+back)\b/i.test(trimmedTrigger);
        const isReturnOrBackward =
          isExplicitReturn || (sameRow ? toBox.x < fromBox.x : toBox.y < fromBox.y);

        const fromFlow = screenFlowMap?.[edge.fromScreen];
        const toFlow = screenFlowMap?.[edge.toScreen];
        const isSameFlow =
          !screenFlowMap || Boolean(fromFlow && toFlow && fromFlow === toFlow);

        const isForwardStepInFlow =
          isSameFlow &&
          !isExplicitReturn &&
          (sameRow ? toBox.x > fromBox.x : toBox.y > fromBox.y);

        const isConnectedToSpotlight =
          Boolean(effectiveSpotlight) &&
          (edge.fromScreen === effectiveSpotlight || edge.toScreen === effectiveSpotlight);

        // Show clean forward journey steps continuously; spotlight cross-flow & return wires on screen focus
        if (!isForwardStepInFlow && !isConnectedToSpotlight) {
          continue;
        }

        visibleEdges.push({
          edge,
          sameRow,
          isReturnOrBackward,
          isHighlighted: isConnectedToSpotlight,
        });
      }
    }

    if (visibleEdges.length === 0) return null;

    const allBoxes = Object.values(layout);
    const maxRight =
      allBoxes.length > 0 ? Math.max(...allBoxes.map((b) => b.x + b.width)) : 3400;
    const maxBottom =
      allBoxes.length > 0 ? Math.max(...allBoxes.map((b) => b.y + b.height)) : 2400;
    const svgWidth = Math.max(4000, maxRight + 600);
    const svgHeight = Math.max(3000, maxBottom + 600);

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: svgWidth,
          height: svgHeight,
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

        {visibleEdges.map(({ edge, sameRow, isReturnOrBackward, isHighlighted }, idx) => {
          const fromBox = layout[edge.fromScreen];
          const toBox = layout[edge.toScreen];
          if (!fromBox || !toBox) return null;

          const useEmeraldWire = isHighlighted || isReturnOrBackward;
          const horizontalGap = toBox.x - (fromBox.x + fromBox.width);
          const isAdjacentForward = sameRow && toBox.x > fromBox.x && horizontalGap <= 260;

          const verticalSlot = isAdjacentForward ? 0 : ((idx % 4) - 1.5) * 44;
          const horizontalSlot = ((idx % 5) - 2) * 34;

          let startX: number;
          let startY: number;
          let cp1X: number;
          let cp1Y: number;
          let cp2X: number;
          let cp2Y: number;
          let endX: number;
          let endY: number;

          if (sameRow) {
            if (isAdjacentForward) {
              startX = fromBox.x + fromBox.width;
              startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height * 0.44 + verticalSlot;
              endX = toBox.x;
              endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height * 0.44 + verticalSlot;
              const dx = Math.max(54, Math.abs(endX - startX) * 0.45);
              cp1X = startX + dx;
              cp1Y = startY;
              cp2X = endX - dx;
              cp2Y = endY;
            } else {
              startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot * 0.5;
              startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height;
              endX = toBox.x + toBox.width * 0.5 - horizontalSlot * 0.5;
              endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height;
              const archDepth = 56 + (idx % 4) * 24;
              cp1X = startX;
              cp1Y = startY + archDepth;
              cp2X = endX;
              cp2Y = endY + archDepth;
            }
          } else if (toBox.y > fromBox.y) {
            startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot;
            startY = fromBox.y + ARTBOARD_HEADER_OFFSET + fromBox.height;
            endX = toBox.x + toBox.width * 0.5 + horizontalSlot * 0.6;
            endY = toBox.y;
            const dy = Math.max(70, Math.min(140, Math.abs(endY - startY) * 0.45));
            cp1X = startX;
            cp1Y = startY + dy;
            cp2X = endX;
            cp2Y = endY - dy;
          } else {
            startX = fromBox.x + fromBox.width * 0.5 + horizontalSlot;
            startY = fromBox.y;
            endX = toBox.x + toBox.width * 0.5 + horizontalSlot * 0.6;
            endY = toBox.y + ARTBOARD_HEADER_OFFSET + toBox.height;
            const dy = Math.max(70, Math.min(140, Math.abs(startY - endY) * 0.45));
            cp1X = startX;
            cp1Y = startY - dy;
            cp2X = endX;
            cp2Y = endY + dy;
          }

          const pathD = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
          const midX = 0.125 * startX + 0.375 * cp1X + 0.375 * cp2X + 0.125 * endX;
          const midY = 0.125 * startY + 0.375 * cp1Y + 0.375 * cp2Y + 0.125 * endY;

          const strokeColor = useEmeraldWire ? '#10B981' : '#6366F1';
          const strokeOpacity = isHighlighted ? 0.98 : 0.86;
          const badgeLabel = formatCompactStepLabel(edge, isAdjacentForward);

          return (
            <g key={edge.id}>
              {isHighlighted && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={7}
                  strokeOpacity={0.22}
                />
              )}

              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isHighlighted ? 2.8 : 2.2}
                strokeOpacity={strokeOpacity}
                strokeDasharray={isReturnOrBackward ? '7 5' : undefined}
                markerEnd={
                  useEmeraldWire ? 'url(#flow-arrow-active)' : 'url(#flow-arrow-default)'
                }
              />

              <circle
                cx={startX}
                cy={startY}
                r={4.5}
                fill="var(--studio-surface-1)"
                stroke={strokeColor}
                strokeWidth={2.2}
              />

              <foreignObject
                x={midX - 74}
                y={midY - 13}
                width={148}
                height={28}
                style={{ pointerEvents: 'auto', overflow: 'visible' }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
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
                      maxWidth: isAdjacentForward ? 138 : 172,
                      padding: '3px 8px',
                      borderRadius: 999,
                      backgroundColor: 'var(--studio-surface-1)',
                      border: `1px solid ${
                        useEmeraldWire
                          ? 'var(--studio-accent-emerald)'
                          : 'var(--studio-badge-indigo-border)'
                      }`,
                      color: useEmeraldWire
                        ? 'var(--studio-badge-emerald-text)'
                        : 'var(--studio-badge-indigo-text)',
                      fontSize: 9.5,
                      fontWeight: 600,
                      fontFamily: 'JetBrains Mono, monospace',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    }}
                  >
                    {badgeLabel}
                  </div>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    );
  }
);
