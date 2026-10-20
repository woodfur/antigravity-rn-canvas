import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MousePointer,
  Play,
  GitCommit,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { SCREEN_COMPONENTS, SCREEN_ORDER } from '../screens';
import { ScreenArtboard } from './ScreenArtboard';
import { FlowArrowsLayer } from './FlowArrowsLayer';
import { InspectorPanel } from './InspectorPanel';
import type {
  ArtboardLayoutMap,
  CanvasMode,
  InspectedElement,
  NavigationEdge,
  ScreenMetadata,
  SelectedElementRef,
} from './types';
import type { PatchPayload } from '../server/astEngine';

const DEFAULT_WIDTH = 393;
const DEFAULT_HEIGHT = 852;
const ARTBOARD_GAP = 130;
const INITIAL_OFFSET_X = 80;
const INITIAL_OFFSET_Y = 70;

function buildDefaultLayout(screens: ScreenMetadata[]): ArtboardLayoutMap {
  const map: ArtboardLayoutMap = {};
  screens.forEach((screen, idx) => {
    map[screen.id] = {
      x: INITIAL_OFFSET_X + idx * (DEFAULT_WIDTH + ARTBOARD_GAP),
      y: INITIAL_OFFSET_Y,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  });
  return map;
}

export const CanvasApp: React.FC = () => {
  const [screens, setScreens] = useState<ScreenMetadata[]>([]);
  const [layout, setLayout] = useState<ArtboardLayoutMap>({});
  const [mode, setMode] = useState<CanvasMode>('inspect');
  const [showFlows, setShowFlows] = useState<boolean>(true);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 10 });
  const [zoom, setZoom] = useState<number>(0.68);
  const [isPanning, setIsPanning] = useState<boolean>(false);

  const [activeScreenId, setActiveScreenId] = useState<string | null>('Home');
  const [highlightedScreenId, setHighlightedScreenId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<SelectedElementRef | null>(null);
  const [inspectedData, setInspectedData] = useState<InspectedElement | null>(null);

  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<{
    undoAvailable: number;
    redoAvailable: number;
  }>({ undoAvailable: 0, redoAvailable: 0 });

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);

  const sortScreensByOrder = useCallback((rawScreens: ScreenMetadata[]) => {
    return [...rawScreens].sort((a, b) => {
      const idxA = SCREEN_ORDER.indexOf(a.id);
      const idxB = SCREEN_ORDER.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return a.id.localeCompare(b.id);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, []);

  const fetchScreens = useCallback(async () => {
    try {
      const [screensRes, layoutRes] = await Promise.all([
        fetch('/api/screens'),
        fetch('/api/layout'),
      ]);
      const screensJson = (await screensRes.json()) as {
        ok: boolean;
        screens: ScreenMetadata[];
        history?: { undoAvailable: number; redoAvailable: number };
      };
      const layoutJson = (await layoutRes.json()) as {
        ok: boolean;
        layout: ArtboardLayoutMap | null;
      };

      if (screensJson.ok) {
        const sorted = sortScreensByOrder(screensJson.screens);
        setScreens(sorted);
        if (screensJson.history) {
          setHistoryState(screensJson.history);
        }

        setLayout((prev) => {
          const base = buildDefaultLayout(sorted);
          const saved = layoutJson.ok && layoutJson.layout ? layoutJson.layout : {};
          return { ...base, ...saved, ...prev };
        });
      }
    } catch (err) {
      console.error('Failed to load screens metadata:', err);
    }
  }, [sortScreensByOrder]);

  useEffect(() => {
    void fetchScreens();
  }, [fetchScreens]);

  // Fetch AST inspection details when an element is selected
  const inspectSelectedElement = useCallback(async (ref: SelectedElementRef) => {
    setIsInspecting(true);
    try {
      const params = new URLSearchParams({
        file: ref.file,
        astPath: ref.astPath,
        line: String(ref.line),
      });
      const res = await fetch(`/api/inspect?${params.toString()}`);
      const data = (await res.json()) as {
        ok: boolean;
        element?: InspectedElement;
        history?: { undoAvailable: number; redoAvailable: number };
        error?: string;
      };
      if (data.ok && data.element) {
        setInspectedData(data.element);
        if (data.history) setHistoryState(data.history);
      }
    } catch (err) {
      console.error('Inspect error:', err);
    } finally {
      setIsInspecting(false);
    }
  }, []);

  const handleSelectElement = useCallback(
    (ref: SelectedElementRef) => {
      setSelectedElement(ref);
      setActiveScreenId(ref.screenId);
      void inspectSelectedElement(ref);
    },
    [inspectSelectedElement]
  );

  // Surgical AST Patch handler
  const handlePatchElement = useCallback(
    async (payload: PatchPayload) => {
      setIsSaving(true);
      setStatusMessage(null);
      try {
        const res = await fetch('/api/patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as {
          ok: boolean;
          element?: InspectedElement;
          history?: { undoAvailable: number; redoAvailable: number };
          error?: string;
        };
        if (data.ok && data.element) {
          setInspectedData(data.element);
          if (data.history) setHistoryState(data.history);
          setSelectedElement((prev) =>
            prev
              ? {
                  ...prev,
                  line: data.element!.line,
                  col: data.element!.col,
                  astPath: data.element!.astPath,
                }
              : null
          );
          setStatusMessage('Saved to .tsx');
          void fetchScreens();
        } else if (data.error) {
          setStatusMessage(`Error: ${data.error}`);
        }
      } catch (err) {
        setStatusMessage('Failed to write AST patch');
      } finally {
        setIsSaving(false);
      }
    },
    [fetchScreens]
  );

  // Undo & Redo handlers
  const handleUndo = useCallback(async () => {
    const res = await fetch('/api/undo', { method: 'POST' });
    const data = (await res.json()) as {
      ok: boolean;
      restoredFile: string | null;
      undoAvailable: number;
      redoAvailable: number;
    };
    if (data.ok) {
      setHistoryState({
        undoAvailable: data.undoAvailable,
        redoAvailable: data.redoAvailable,
      });
      if (selectedElement) {
        void inspectSelectedElement(selectedElement);
      }
      void fetchScreens();
      setStatusMessage(data.restoredFile ? `Reverted ${data.restoredFile}` : 'Nothing to undo');
    }
  }, [selectedElement, inspectSelectedElement, fetchScreens]);

  const handleRedo = useCallback(async () => {
    const res = await fetch('/api/redo', { method: 'POST' });
    const data = (await res.json()) as {
      ok: boolean;
      restoredFile: string | null;
      undoAvailable: number;
      redoAvailable: number;
    };
    if (data.ok) {
      setHistoryState({
        undoAvailable: data.undoAvailable,
        redoAvailable: data.redoAvailable,
      });
      if (selectedElement) {
        void inspectSelectedElement(selectedElement);
      }
      void fetchScreens();
      setStatusMessage(data.restoredFile ? `Restored ${data.restoredFile}` : 'Nothing to redo');
    }
  }, [selectedElement, inspectSelectedElement, fetchScreens]);

  // Global keyboard shortcuts (Cmd+Z, Cmd+Shift+Z, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isInputFocused) {
        e.preventDefault();
        if (e.shiftKey) {
          void handleRedo();
        } else {
          void handleUndo();
        }
      } else if (e.key === 'Escape') {
        setSelectedElement(null);
        setInspectedData(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Center viewport on a specific screen artboard
  const focusOnScreen = useCallback(
    (screenId: string) => {
      const pos = layout[screenId];
      const viewport = canvasViewportRef.current;
      if (!pos || !viewport) return;

      const rect = viewport.getBoundingClientRect();
      const targetZoom = Math.min(Math.max(zoom, 0.72), 0.95);
      const nextPanX = rect.width / 2 - (pos.x + pos.width / 2) * targetZoom;
      const nextPanY = rect.height / 2 - (pos.y + pos.height / 2) * targetZoom;

      setZoom(targetZoom);
      setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });
      setActiveScreenId(screenId);
      setHighlightedScreenId(screenId);
      window.setTimeout(() => setHighlightedScreenId(null), 1600);
    },
    [layout, zoom]
  );

  // Fit all screens in viewport
  const handleFitAllScreens = useCallback(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport || screens.length === 0) return;
    const rect = viewport.getBoundingClientRect();

    const positions = Object.values(layout);
    if (positions.length === 0) return;

    const minX = Math.min(...positions.map((p) => p.x));
    const minY = Math.min(...positions.map((p) => p.y));
    const maxX = Math.max(...positions.map((p) => p.x + p.width));
    const maxY = Math.max(...positions.map((p) => p.y + p.height + 50));

    const contentWidth = maxX - minX + 140;
    const contentHeight = maxY - minY + 140;

    const scaleX = rect.width / contentWidth;
    const scaleY = rect.height / contentHeight;
    const nextZoom = Number(Math.min(Math.max(Math.min(scaleX, scaleY), 0.28), 1.0).toFixed(2));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(nextZoom);
    setPan({
      x: Math.round(rect.width / 2 - centerX * nextZoom),
      y: Math.round(rect.height / 2 - centerY * nextZoom),
    });
  }, [layout, screens.length]);

  // Reset layout to clean horizontal grid
  const handleResetGridLayout = useCallback(() => {
    const reset = buildDefaultLayout(screens);
    setLayout(reset);
    void fetch('/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reset),
    });
  }, [screens]);

  // Move single artboard
  const handleMoveArtboard = useCallback((screenId: string, nextX: number, nextY: number) => {
    setLayout((prev) => {
      const current = prev[screenId] ?? {
        x: nextX,
        y: nextY,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
      };
      const updated = {
        ...prev,
        [screenId]: { ...current, x: nextX, y: nextY },
      };
      return updated;
    });
  }, []);

  // Handle interactive navigation inside a React Native screen
  const handleNavigateFlow = useCallback(
    (_fromScreen: string, toScreen: string) => {
      focusOnScreen(toScreen);
    },
    [focusOnScreen]
  );

  // Canvas background pointer pan & wheel zoom/pan
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    setIsPanning(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = pan.x;
    const startPanY = pan.y;

    const handleMove = (moveEvent: PointerEvent) => {
      setPan({
        x: startPanX + (moveEvent.clientX - startX),
        y: startPanY + (moveEvent.clientY - startY),
      });
    };

    const handleUp = () => {
      setIsPanning(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((prev) => Number(Math.min(Math.max(prev + delta, 0.25), 1.75).toFixed(2)));
    } else {
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#0B0D12',
        color: '#F8FAFC',
        overflow: 'hidden',
      }}
    >
      {/* Top Studio Bar */}
      <header
        style={{
          height: 54,
          backgroundColor: '#11141D',
          borderBottom: '1px solid #1E2433',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 40,
        }}
      >
        {/* Left: Brand Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 13,
              color: '#FFFFFF',
            }}
          >
            AG
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
              Antigravity Visual Canvas
            </div>
            <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'JetBrains Mono, monospace' }}>
              React Native Multi-Screen AST Studio · {screens.length} Screens Live
            </div>
          </div>
        </div>

        {/* Center: Mode Switcher & Flow Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#0B0D12',
              padding: 3,
              borderRadius: 9,
              border: '1px solid #1E2433',
            }}
          >
            <button
              type="button"
              onClick={() => setMode('inspect')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: mode === 'inspect' ? '#4F46E5' : 'transparent',
                color: mode === 'inspect' ? '#FFFFFF' : '#94A3B8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <MousePointer size={13} />
              <span>Inspect &amp; Edit AST</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('interact')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: mode === 'interact' ? '#10B981' : 'transparent',
                color: mode === 'interact' ? '#052E16' : '#94A3B8',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Play size={13} />
              <span>Interact &amp; Navigate</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFlows((prev) => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              borderRadius: 8,
              border: `1px solid ${showFlows ? '#4F46E5' : '#262E40'}`,
              backgroundColor: showFlows ? '#1E1B4B' : '#161B26',
              color: showFlows ? '#C7D2FE' : '#94A3B8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <GitCommit size={14} />
            <span>Flow Arrows</span>
          </button>
        </div>

        {/* Right: Undo/Redo & Viewport Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyState.undoAvailable === 0}
            title="Undo AST Patch (Cmd+Z)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: historyState.undoAvailable > 0 ? '#E2E8F0' : '#475569',
              fontSize: 12,
              cursor: historyState.undoAvailable > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Undo2 size={14} />
            <span>{historyState.undoAvailable}</span>
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={historyState.redoAvailable === 0}
            title="Redo AST Patch (Cmd+Shift+Z)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: historyState.redoAvailable > 0 ? '#E2E8F0' : '#475569',
              fontSize: 12,
              cursor: historyState.redoAvailable > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Redo2 size={14} />
          </button>

          <div style={{ width: 1, height: 22, backgroundColor: '#1E2433', margin: '0 4px' }} />

          <button
            type="button"
            onClick={() => setZoom((z) => Number(Math.max(0.25, z - 0.1).toFixed(2)))}
            title="Zoom Out"
            style={{
              padding: 7,
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: '#CBD5E1',
              cursor: 'pointer',
            }}
          >
            <ZoomOut size={14} />
          </button>

          <span
            style={{
              minWidth: 48,
              textAlign: 'center',
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#CBD5E1',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setZoom((z) => Number(Math.min(1.75, z + 0.1).toFixed(2)))}
            title="Zoom In"
            style={{
              padding: 7,
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: '#CBD5E1',
              cursor: 'pointer',
            }}
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            onClick={handleFitAllScreens}
            title="Fit All Screens in Viewport"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: '#CBD5E1',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <Maximize size={13} />
            <span>Fit</span>
          </button>

          <button
            type="button"
            onClick={handleResetGridLayout}
            title="Auto-Arrange Clean Artboard Grid"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid #262E40',
              backgroundColor: '#161B26',
              color: '#CBD5E1',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={13} />
            <span>Grid</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Left Screen Rail + Infinite Canvas + Right AST Inspector */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Screen Artboard Navigator */}
        <aside
          style={{
            width: 220,
            backgroundColor: '#11141D',
            borderRight: '1px solid #1E2433',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 12,
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#64748B',
                letterSpacing: '0.05em',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} color="#6366F1" />
                <span>SCREENS ({screens.length})</span>
              </span>
              <button
                type="button"
                onClick={() => void fetchScreens()}
                title="Refresh Screen Discovery"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {screens.map((scr) => {
              const isSelected = activeScreenId === scr.id;
              return (
                <button
                  key={scr.id}
                  type="button"
                  onClick={() => focusOnScreen(scr.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? '#4F46E5' : 'transparent'}`,
                    backgroundColor: isSelected ? '#1E1B4B' : 'transparent',
                    color: isSelected ? '#F8FAFC' : '#94A3B8',
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>{scr.id}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                      color: isSelected ? '#A5B4FC' : '#64748B',
                    }}
                  >
                    {scr.outgoingFlows.length} flows
                  </span>
                </button>
              );
            })}
          </div>

          <div
            style={{
              backgroundColor: '#161B26',
              border: '1px solid #262E40',
              borderRadius: 10,
              padding: 12,
              fontSize: 11,
              color: '#94A3B8',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, color: '#E2E8F0', marginBottom: 4 }}>
              Canvas Controls
            </div>
            <div>• Drag background to pan</div>
            <div>• Drag screen header to move</div>
            <div>• Ctrl/Cmd + Scroll to zoom</div>
            <div>• Click any element to edit AST</div>
          </div>
        </aside>

        {/* Center: Infinite Zoom/Pan Canvas */}
        <main
          ref={canvasViewportRef}
          onPointerDown={handleCanvasPointerDown}
          onWheel={handleWheel}
          className="infinite-canvas-surface"
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : 'grab',
          }}
        >
          {/* World Transform Container */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            {showFlows && (
              <FlowArrowsLayer
                screens={screens}
                layout={layout}
                activeScreenId={activeScreenId}
                highlightedScreenId={highlightedScreenId}
                onSelectFlow={(edge: NavigationEdge) => focusOnScreen(edge.toScreen)}
              />
            )}

            {screens.map((screen) => {
              const pos = layout[screen.id] ?? {
                x: INITIAL_OFFSET_X,
                y: INITIAL_OFFSET_Y,
                width: DEFAULT_WIDTH,
                height: DEFAULT_HEIGHT,
              };
              const ScreenComponent = SCREEN_COMPONENTS[screen.id];

              return (
                <ScreenArtboard
                  key={screen.id}
                  screen={screen}
                  ScreenComponent={ScreenComponent}
                  position={pos}
                  zoom={zoom}
                  mode={mode}
                  isActiveScreen={activeScreenId === screen.id}
                  isHighlightedScreen={highlightedScreenId === screen.id}
                  selectedElement={selectedElement}
                  onSelectElement={handleSelectElement}
                  onSelectScreen={setActiveScreenId}
                  onFocusScreen={focusOnScreen}
                  onMoveArtboard={handleMoveArtboard}
                  onNavigateFlow={handleNavigateFlow}
                />
              );
            })}
          </div>
        </main>

        {/* Right: AST Visual Inspector Panel */}
        <InspectorPanel
          inspected={inspectedData}
          isLoading={isInspecting}
          isSaving={isSaving}
          statusMessage={statusMessage}
          onPatch={handlePatchElement}
          onClearSelection={() => {
            setSelectedElement(null);
            setInspectedData(null);
          }}
          onJumpToScreen={focusOnScreen}
        />
      </div>
    </div>
  );
};
