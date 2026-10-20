import React, { useRef, useState, useEffect, useCallback } from 'react';
import { GripHorizontal, Maximize2, AlertTriangle } from 'lucide-react';
import { MockNavigationProvider } from '../runtime/MockNavigationContext';
import { ScreenErrorBoundary } from '../runtime/ScreenErrorBoundary';
import type {
  ArtboardPosition,
  CanvasMode,
  ScreenMetadata,
  SelectedElementRef,
} from './types';

interface ScreenArtboardProps {
  screen: ScreenMetadata;
  ScreenComponent: React.ComponentType | undefined;
  position: ArtboardPosition;
  zoom: number;
  mode: CanvasMode;
  isActiveScreen: boolean;
  isHighlightedScreen: boolean;
  selectedElement: SelectedElementRef | null;
  onSelectElement: (ref: SelectedElementRef) => void;
  onSelectScreen: (screenId: string) => void;
  onFocusScreen: (screenId: string) => void;
  onMoveArtboard: (screenId: string, nextX: number, nextY: number) => void;
  onNavigateFlow: (fromScreen: string, toScreen: string) => void;
}

interface BoxOverlay {
  top: number;
  left: number;
  width: number;
  height: number;
  tagName: string;
  astPath: string;
}

function findNearestAgyElement(
  target: EventTarget | null,
  container: HTMLElement | null
): HTMLElement | null {
  if (!target || !(target instanceof HTMLElement) || !container) return null;
  let curr: HTMLElement | null = target;
  while (curr && curr !== container && container.contains(curr)) {
    if (curr.dataset?.agyAstPath && curr.dataset?.agyFile) {
      return curr;
    }
    curr = curr.parentElement;
  }
  return null;
}

export const ScreenArtboard: React.FC<ScreenArtboardProps> = ({
  screen,
  ScreenComponent,
  position,
  zoom,
  mode,
  isActiveScreen,
  isHighlightedScreen,
  selectedElement,
  onSelectElement,
  onSelectScreen,
  onFocusScreen,
  onMoveArtboard,
  onNavigateFlow,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [hoverBox, setHoverBox] = useState<BoxOverlay | null>(null);
  const [selectedBox, setSelectedBox] = useState<BoxOverlay | null>(null);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  const computeRelativeBox = useCallback(
    (domEl: HTMLElement): BoxOverlay | null => {
      const container = viewportRef.current;
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const elRect = domEl.getBoundingClientRect();

      return {
        top: (elRect.top - containerRect.top) / zoom,
        left: (elRect.left - containerRect.left) / zoom,
        width: elRect.width / zoom,
        height: elRect.height / zoom,
        tagName: domEl.dataset.agyTag || 'View',
        astPath: domEl.dataset.agyAstPath || '0',
      };
    },
    [zoom]
  );

  // Keep selected element bounding box updated when screen re-renders or styles change
  useEffect(() => {
    const container = viewportRef.current;
    if (
      !container ||
      !selectedElement ||
      selectedElement.screenId !== screen.id
    ) {
      setSelectedBox(null);
      return;
    }

    const updateSelectionOverlay = () => {
      const match = container.querySelector<HTMLElement>(
        `[data-agy-ast-path="${selectedElement.astPath}"]`
      );
      if (match) {
        setSelectedBox(computeRelativeBox(match));
      } else {
        setSelectedBox(null);
      }
    };

    updateSelectionOverlay();
    const timer = window.setTimeout(updateSelectionOverlay, 90);
    return () => window.clearTimeout(timer);
  }, [selectedElement, screen, computeRelativeBox]);

  // Artboard header drag handler to reposition the screen on the infinite canvas
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelectScreen(screen.id);
    setIsDraggingHeader(true);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = position.x;
    const initialY = position.y;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      onMoveArtboard(
        screen.id,
        Math.round(initialX + dx),
        Math.round(initialY + dy)
      );
    };

    const handlePointerUp = () => {
      setIsDraggingHeader(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Inspect Mode pointer handlers
  const handlePointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'inspect') return;
    const targetEl = findNearestAgyElement(e.target, viewportRef.current);
    if (!targetEl) {
      setHoverBox(null);
      return;
    }
    setHoverBox(computeRelativeBox(targetEl));
  };

  const handlePointerLeave = () => {
    setHoverBox(null);
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'inspect') return;
    e.stopPropagation();
    e.preventDefault();

    onSelectScreen(screen.id);
    const targetEl = findNearestAgyElement(e.target, viewportRef.current);
    if (!targetEl) return;

    const file = targetEl.dataset.agyFile || screen.filePath;
    const astPath = targetEl.dataset.agyAstPath || '0';
    const line = Number.parseInt(targetEl.dataset.agyLine || '1', 10);
    const col = Number.parseInt(targetEl.dataset.agyCol || '0', 10);
    const tagName = targetEl.dataset.agyTag || 'View';

    setSelectedBox(computeRelativeBox(targetEl));
    onSelectElement({
      screenId: screen.id,
      file,
      astPath,
      line,
      col,
      tagName,
    });
  };

  const borderColor = isHighlightedScreen
    ? '#10B981'
    : isActiveScreen
      ? '#6366F1'
      : '#262B38';

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: position.width,
        userSelect: 'none',
        zIndex: isActiveScreen || isHighlightedScreen ? 20 : 10,
      }}
      onPointerDown={(e) => {
        // Prevent background canvas pan when interacting inside an artboard
        e.stopPropagation();
        onSelectScreen(screen.id);
      }}
    >
      {/* Minimalist Figma-Style Artboard Title Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          height: 30,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
          cursor: isDraggingHeader ? 'grabbing' : 'grab',
          color: isActiveScreen ? '#A5B4FC' : '#94A3B8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <GripHorizontal size={14} style={{ opacity: 0.7 }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: isActiveScreen ? '#F8FAFC' : '#CBD5E1',
            }}
          >
            {screen.name}
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#64748B',
            }}
          >
            /{screen.routeName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#64748B',
            }}
          >
            {position.width} × {position.height}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocusScreen(screen.id);
            }}
            title="Center screen in viewport"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 5,
              border: '1px solid #262B38',
              backgroundColor: '#131722',
              color: '#94A3B8',
              cursor: 'pointer',
            }}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>

      {/* Pure Rectangular Screen Artboard (No Device Bezel/Frame) */}
      <div
        ref={viewportRef}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
        style={{
          position: 'relative',
          width: position.width,
          height: position.height,
          backgroundColor: '#090D16',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: isHighlightedScreen
            ? '0 0 0 4px rgba(16, 185, 129, 0.28), 0 24px 48px -12px rgba(0, 0, 0, 0.75)'
            : isActiveScreen
              ? '0 0 0 3px rgba(99, 102, 241, 0.25), 0 24px 48px -12px rgba(0, 0, 0, 0.75)'
              : '0 20px 40px -15px rgba(0, 0, 0, 0.65)',
          display: 'flex',
          flexDirection: 'column',
          cursor: mode === 'inspect' ? 'crosshair' : 'default',
        }}
      >
        {screen.parseError ? (
          <div
            style={{
              flex: 1,
              padding: 24,
              backgroundColor: '#18181B',
              color: '#FCA5A5',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 10,
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#F87171', fontWeight: 700, fontSize: 13 }}>
              <AlertTriangle size={16} />
              <span>AST Syntax Error in {screen.filePath}</span>
            </div>
            <div style={{ fontSize: 11, color: '#FECACA', whiteSpace: 'pre-wrap' }}>
              {screen.parseError}
            </div>
          </div>
        ) : ScreenComponent ? (
          <ScreenErrorBoundary screenName={screen.name}>
            <MockNavigationProvider
              routeName={screen.routeName}
              onNavigate={onNavigateFlow}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <ScreenComponent />
              </div>
            </MockNavigationProvider>
          </ScreenErrorBoundary>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 13 }}>
            Mounting {screen.name}...
          </div>
        )}

        {/* Figma-style Hover Bounding Box in Inspect Mode */}
        {mode === 'inspect' &&
          hoverBox &&
          (!selectedBox || hoverBox.astPath !== selectedBox.astPath) && (
            <div
              style={{
                position: 'absolute',
                top: hoverBox.top,
                left: hoverBox.left,
                width: hoverBox.width,
                height: hoverBox.height,
                border: '1.5px dashed #38BDF8',
                backgroundColor: 'rgba(56, 189, 248, 0.06)',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -19,
                  left: -1,
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                &lt;{hoverBox.tagName}&gt;
              </span>
            </div>
          )}

        {/* Figma-style Active Selection Bounding Box */}
        {selectedBox && selectedElement?.screenId === screen.id && (
          <div
            style={{
              position: 'absolute',
              top: selectedBox.top,
              left: selectedBox.left,
              width: selectedBox.width,
              height: selectedBox.height,
              border: '2px solid #6366F1',
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              pointerEvents: 'none',
              zIndex: 45,
            }}
          >
            {/* Corner resize handles aesthetic */}
            {[
              { top: -4, left: -4 },
              { top: -4, right: -4 },
              { bottom: -4, left: -4 },
              { bottom: -4, right: -4 },
            ].map((pos, idx) => (
              <span
                key={idx}
                style={{
                  position: 'absolute',
                  ...pos,
                  width: 6,
                  height: 6,
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #4F46E5',
                  borderRadius: 1,
                }}
              />
            ))}
            <span
              style={{
                position: 'absolute',
                top: -21,
                left: -1,
                backgroundColor: '#4F46E5',
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 6px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              &lt;{selectedBox.tagName}&gt; · L{selectedElement.line}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
