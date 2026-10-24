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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sliders,
  Sun,
  Moon,
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
import type { PatchPayload, ReorderPayload } from '../server/astEngine';

const DEFAULT_WIDTH = 393;
const DEFAULT_HEIGHT = 852;
const ARTBOARD_GAP = 160;
const ARTBOARD_ROW_GAP = 220;
const INITIAL_OFFSET_X = 80;
const INITIAL_OFFSET_Y = 70;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.0;

function clampZoom(z: number): number {
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
}

function snapToDevicePixel(v: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.round(v * dpr) / dpr;
}

function buildDefaultLayout(screens: ScreenMetadata[]): ArtboardLayoutMap {
  const map: ArtboardLayoutMap = {};
  const cols =
    screens.length <= 5
      ? Math.max(1, screens.length)
      : Math.min(7, Math.ceil(Math.sqrt(screens.length * 1.6)));
  screens.forEach((screen, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    map[screen.id] = {
      x: INITIAL_OFFSET_X + col * (DEFAULT_WIDTH + ARTBOARD_GAP),
      y: INITIAL_OFFSET_Y + row * (DEFAULT_HEIGHT + ARTBOARD_ROW_GAP),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  });
  return map;
}

export const CanvasApp: React.FC = () => {
  const [screens, setScreens] = useState<ScreenMetadata[]>([]);
  const [projectName, setProjectName] = useState<string>('Google Artifact');
  const [layout, setLayout] = useState<ArtboardLayoutMap>({});
  const [mode, setMode] = useState<CanvasMode>('inspect');
  const [showFlows, setShowFlows] = useState<boolean>(true);

  // Collapsible Left (Screen Rail) & Right (AST Inspector) Panels
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState<boolean>(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);

  // Studio color-scheme state ('dark' default, persisted in localStorage & <meta name="color-scheme">)
  const [colorScheme, setColorScheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('color-scheme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const applyColorScheme = useCallback((next: 'dark' | 'light') => {
    setColorScheme(next);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    if (meta) {
      meta.content = next;
    }
    try {
      localStorage.setItem('color-scheme', next);
    } catch {
      // Ignore storage write errors in restricted environments
    }
  }, []);

  const toggleColorScheme = useCallback(() => {
    applyColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
  }, [colorScheme, applyColorScheme]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== 'color-scheme') return;
      const next = e.newValue === 'light' ? 'light' : 'dark';
      setColorScheme(next);
      const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
      if (meta) {
        meta.content = next;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 10 });
  const [zoom, setZoom] = useState<number>(0.68);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isCameraAnimating, setIsCameraAnimating] = useState<boolean>(false);

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
  const worldContainerRef = useRef<HTMLDivElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);
  const cameraTimerRef = useRef<number | null>(null);
  const panSyncTimerRef = useRef<number | null>(null);
  const hasInitialFitRef = useRef<boolean>(false);

  // Refs for synchronous access inside non-passive native wheel/gesture listeners
  const zoomRef = useRef<number>(zoom);
  const panRef = useRef<{ x: number; y: number }>(pan);
  useEffect(() => {
    zoomRef.current = zoom;
    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(zoom * 100)}%`;
    }
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const scheduleCameraStateSync = useCallback((commitImmediately = false) => {
    if (panSyncTimerRef.current) {
      window.clearTimeout(panSyncTimerRef.current);
      panSyncTimerRef.current = null;
    }
    if (commitImmediately) {
      setIsCameraAnimating(false);
      setZoom(zoomRef.current);
      setPan(panRef.current);
    } else {
      panSyncTimerRef.current = window.setTimeout(() => {
        panSyncTimerRef.current = null;
        setIsCameraAnimating(false);
        setZoom(zoomRef.current);
        setPan(panRef.current);
      }, 140);
    }
  }, []);

  const applyDirectPanTransform = useCallback(
    (rawX: number, rawY: number, commitImmediately = false) => {
      const nextPan = {
        x: snapToDevicePixel(rawX),
        y: snapToDevicePixel(rawY),
      };
      panRef.current = nextPan;

      const worldEl = worldContainerRef.current;
      if (worldEl) {
        worldEl.style.transition = 'none';
        worldEl.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${zoomRef.current})`;
      }

      scheduleCameraStateSync(commitImmediately);
    },
    [scheduleCameraStateSync]
  );

  const triggerCameraTransition = useCallback(() => {
    if (cameraTimerRef.current) {
      window.clearTimeout(cameraTimerRef.current);
    }
    setIsCameraAnimating(true);
    cameraTimerRef.current = window.setTimeout(() => {
      setIsCameraAnimating(false);
    }, 390);
  }, []);

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
        projectName?: string;
        screens: ScreenMetadata[];
        history?: { undoAvailable: number; redoAvailable: number };
      };
      const layoutJson = (await layoutRes.json()) as {
        ok: boolean;
        layout: ArtboardLayoutMap | null;
      };

      if (screensJson.ok) {
        if (screensJson.projectName) {
          setProjectName(screensJson.projectName);
        }
        const sorted = sortScreensByOrder(screensJson.screens);
        setScreens(sorted);
        setActiveScreenId((prev) => {
          if (prev && sorted.some((s) => s.id === prev)) return prev;
          const home = sorted.find((s) => s.id.toLowerCase() === 'home');
          return home ? home.id : (sorted[0]?.id ?? null);
        });
        if (screensJson.history) {
          setHistoryState(screensJson.history);
        }

        setLayout((prev) => {
          const base = buildDefaultLayout(sorted);
          const saved = layoutJson.ok && layoutJson.layout ? layoutJson.layout : {};
          const merged = { ...base, ...saved, ...prev };
          if (!hasInitialFitRef.current && sorted.length > 0 && canvasViewportRef.current) {
            hasInitialFitRef.current = true;
            const rect = canvasViewportRef.current.getBoundingClientRect();
            const positions = Object.values(merged);
            if (positions.length > 0 && rect.width > 0 && rect.height > 0) {
              const minX = Math.min(...positions.map((p) => p.x));
              const minY = Math.min(...positions.map((p) => p.y));
              const maxX = Math.max(...positions.map((p) => p.x + p.width));
              const maxY = Math.max(...positions.map((p) => p.y + p.height + 50));
              const contentWidth = maxX - minX + 140;
              const contentHeight = maxY - minY + 140;
              const nextZoom = clampZoom(
                Math.min(rect.width / contentWidth, rect.height / contentHeight, 0.85)
              );
              const centerX = (minX + maxX) / 2;
              const centerY = (minY + maxY) / 2;
              const nextPan = {
                x: Math.round(rect.width / 2 - centerX * nextZoom),
                y: Math.round(rect.height / 2 - centerY * nextZoom),
              };
              zoomRef.current = nextZoom;
              panRef.current = nextPan;
              setZoom(nextZoom);
              setPan(nextPan);
            }
          }
          return merged;
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
      setIsRightPanelOpen(true);
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

  // Surgical AST Sibling Reorder handler
  const handleReorderElement = useCallback(
    async (payload: ReorderPayload) => {
      setIsSaving(true);
      setStatusMessage(null);
      try {
        const res = await fetch('/api/reorder', {
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
          setStatusMessage('Reordered in .tsx');
          void fetchScreens();
        } else if (data.error) {
          setStatusMessage(`Error: ${data.error}`);
        }
      } catch {
        setStatusMessage('Failed to reorder AST element');
      } finally {
        setIsSaving(false);
      }
    },
    [fetchScreens]
  );

  // Undo & Redo handlers
  const handleUndo = useCallback(async () => {
    const res = await fetch('/api/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
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
    const res = await fetch('/api/redo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
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

  // Global keyboard shortcuts (Cmd+Z, Cmd+Shift+Z, [ and ] for sidebars, Escape)
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
      } else if (!isInputFocused && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '[') {
        e.preventDefault();
        setIsLeftPanelOpen((prev) => !prev);
      } else if (!isInputFocused && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === ']') {
        e.preventDefault();
        setIsRightPanelOpen((prev) => !prev);
      } else if (
        !isInputFocused &&
        selectedElement &&
        inspectedData &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 8 : 1;
        const isAbs = inspectedData.styles.position === 'absolute';
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const prop = isAbs ? 'top' : 'marginTop';
          const currentVal = Number(inspectedData.styles[prop] ?? 0) || 0;
          const nextVal = e.key === 'ArrowUp' ? currentVal - step : currentVal + step;
          void handlePatchElement({
            file: selectedElement.file,
            astPath: selectedElement.astPath,
            line: selectedElement.line,
            styles: { [prop]: nextVal },
          });
        } else {
          const prop = isAbs ? 'left' : 'marginLeft';
          const currentVal = Number(inspectedData.styles[prop] ?? 0) || 0;
          const nextVal = e.key === 'ArrowLeft' ? currentVal - step : currentVal + step;
          void handlePatchElement({
            file: selectedElement.file,
            astPath: selectedElement.astPath,
            line: selectedElement.line,
            styles: { [prop]: nextVal },
          });
        }
      } else if (e.key === 'Escape') {
        setSelectedElement(null);
        setInspectedData(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedElement, inspectedData, handlePatchElement]);

  // Lock out whole-page browser pinch-to-zoom & route trackpad pinch to cursor-centered canvas zoom
  useEffect(() => {
    const viewport = canvasViewportRef.current;

    const applyFocalZoom = (nextZoomRaw: number, clientX: number, clientY: number) => {
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const prevZoom = zoomRef.current;
      const prevPan = panRef.current;
      const nextZoom = clampZoom(nextZoomRaw);

      if (nextZoom === prevZoom) return;

      // Pin the world coordinate directly under the user's cursor during two-finger pinch
      // Keep full floating-point precision during active zoom gesture so (cursorX - worldX * nextZoom) never oscillates
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      const worldX = (cursorX - prevPan.x) / prevZoom;
      const worldY = (cursorY - prevPan.y) / prevZoom;

      const nextPan = {
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
      };

      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      if (worldContainerRef.current) {
        worldContainerRef.current.style.transition = 'none';
        worldContainerRef.current.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${nextZoom})`;
      }
      if (zoomLabelRef.current) {
        zoomLabelRef.current.textContent = `${Math.round(nextZoom * 100)}%`;
      }
      scheduleCameraStateSync(false);
    };

    // 1. Non-passive wheel listener on the canvas viewport for 0ms pan & focal pinch-zoom
    const handleCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Trackpad two-finger pinch or Cmd/Ctrl + wheel
        const zoomFactor = Math.exp(-e.deltaY * 0.0085);
        applyFocalZoom(zoomRef.current * zoomFactor, e.clientX, e.clientY);
      } else {
        applyDirectPanTransform(
          panRef.current.x - e.deltaX,
          panRef.current.y - e.deltaY,
          false
        );
      }
    };

    // 2. Document-level non-passive guard so pinching over the top bar or sidebars NEVER zooms the browser page
    const handleDocumentWheelGuard = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    // 3. WebKit/Safari proprietary trackpad gesture guard (gesturestart / gesturechange / gestureend)
    let gestureStartZoom = zoomRef.current;
    const handleGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStartZoom = zoomRef.current;
    };
    const handleGestureChange = (e: Event) => {
      e.preventDefault();
      const gestureEvent = e as unknown as {
        scale?: number;
        clientX?: number;
        clientY?: number;
      };
      if (typeof gestureEvent.scale === 'number' && viewport) {
        const rect = viewport.getBoundingClientRect();
        const cx = gestureEvent.clientX ?? rect.left + rect.width / 2;
        const cy = gestureEvent.clientY ?? rect.top + rect.height / 2;
        applyFocalZoom(gestureStartZoom * gestureEvent.scale, cx, cy);
      }
    };
    const handleGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    viewport?.addEventListener('wheel', handleCanvasWheel, { passive: false });
    document.addEventListener('wheel', handleDocumentWheelGuard, { passive: false });
    document.addEventListener('gesturestart', handleGestureStart, { passive: false });
    document.addEventListener('gesturechange', handleGestureChange, { passive: false });
    document.addEventListener('gestureend', handleGestureEnd, { passive: false });

    return () => {
      viewport?.removeEventListener('wheel', handleCanvasWheel);
      document.removeEventListener('wheel', handleDocumentWheelGuard);
      document.removeEventListener('gesturestart', handleGestureStart);
      document.removeEventListener('gesturechange', handleGestureChange);
      document.removeEventListener('gestureend', handleGestureEnd);
    };
  }, [applyDirectPanTransform, scheduleCameraStateSync]);

  // Center viewport on a specific screen artboard using Emil Kowalski ease-out-expo camera physics
  const focusOnScreen = useCallback(
    (screenId: string) => {
      const pos = layout[screenId];
      const viewport = canvasViewportRef.current;
      if (!pos || !viewport) return;

      const rect = viewport.getBoundingClientRect();
      const targetZoom = Math.min(Math.max(zoom, 0.72), 0.95);
      const nextPanX = rect.width / 2 - (pos.x + pos.width / 2) * targetZoom;
      const nextPanY = rect.height / 2 - (pos.y + pos.height / 2) * targetZoom;

      triggerCameraTransition();
      setZoom(targetZoom);
      setPan({ x: Math.round(nextPanX), y: Math.round(nextPanY) });
      setActiveScreenId(screenId);
      setHighlightedScreenId(screenId);
      window.setTimeout(() => setHighlightedScreenId(null), 1600);
    },
    [layout, zoom, triggerCameraTransition]
  );

  // Fit all screens in viewport
  const fitCameraToLayout = useCallback(
    (targetLayout: ArtboardLayoutMap) => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();

      const positions = Object.values(targetLayout);
      if (positions.length === 0) return;

      const minX = Math.min(...positions.map((p) => p.x));
      const minY = Math.min(...positions.map((p) => p.y));
      const maxX = Math.max(...positions.map((p) => p.x + p.width));
      const maxY = Math.max(...positions.map((p) => p.y + p.height + 50));

      const contentWidth = maxX - minX + 140;
      const contentHeight = maxY - minY + 140;

      const scaleX = rect.width / contentWidth;
      const scaleY = rect.height / contentHeight;
      const nextZoom = clampZoom(Math.min(scaleX, scaleY, 1.0));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const nextPan = {
        x: Math.round(rect.width / 2 - centerX * nextZoom),
        y: Math.round(rect.height / 2 - centerY * nextZoom),
      };

      triggerCameraTransition();
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    },
    [triggerCameraTransition]
  );

  const handleFitAllScreens = useCallback(() => {
    fitCameraToLayout(layout);
  }, [fitCameraToLayout, layout]);

  // Reset layout to clean multi-row grid and fit in viewport
  const handleResetGridLayout = useCallback(() => {
    const reset = buildDefaultLayout(screens);
    setLayout(reset);
    fitCameraToLayout(reset);
    void fetch('/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reset),
    });
  }, [screens, fitCameraToLayout]);

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

  const handleSelectFlow = useCallback(
    (edge: NavigationEdge) => {
      focusOnScreen(edge.toScreen);
    },
    [focusOnScreen]
  );

  // Canvas background pointer pan (0ms direct DOM manipulation override)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    setIsCameraAnimating(false);
    setIsPanning(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = panRef.current.x;
    const startPanY = panRef.current.y;

    const handleMove = (moveEvent: PointerEvent) => {
      applyDirectPanTransform(
        startPanX + (moveEvent.clientX - startX),
        startPanY + (moveEvent.clientY - startY),
        false
      );
    };

    const handleUp = () => {
      setIsPanning(false);
      applyDirectPanTransform(panRef.current.x, panRef.current.y, true);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    <div
      className="zelune-studio-root"
      data-density="spacious"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--studio-canvas-bg)',
        color: 'var(--studio-text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Top Studio Bar */}
      <header
        style={{
          height: 52,
          backgroundColor: 'var(--studio-surface-1)',
          borderBottom: '1px solid var(--studio-border-hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          zIndex: 40,
        }}
      >
        {/* Left: Sidebar Toggle + Architectural Brand Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="zelune-interactive"
            onClick={() => setIsLeftPanelOpen((prev) => !prev)}
            title={`${isLeftPanelOpen ? 'Collapse' : 'Expand'} Screens Sidebar ([)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 7,
              border: `1px solid ${
                isLeftPanelOpen ? 'rgba(56, 189, 248, 0.35)' : 'var(--studio-border-subtle)'
              }`,
              backgroundColor: isLeftPanelOpen ? 'var(--studio-surface-3)' : 'var(--studio-surface-2)',
              color: isLeftPanelOpen ? '#38BDF8' : 'var(--studio-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {isLeftPanelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>

          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              backgroundColor: 'var(--studio-surface-2)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '-0.03em',
              color: '#38BDF8',
            }}
          >
            ZL
          </div>
          <div>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--studio-text-primary)',
              }}
            >
              Zelune
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--studio-text-secondary)',
                fontFamily: 'var(--font-mono)',
                marginTop: 1,
              }}
            >
              {projectName}
            </div>
          </div>
        </div>

        {/* Center: Icon-First Mode Switcher & Flow Toggle (Reveals Label on Hover) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              backgroundColor: 'var(--studio-canvas-bg)',
              padding: 3,
              borderRadius: 8,
              border: '1px solid var(--studio-border-subtle)',
            }}
          >
            <button
              type="button"
              className="zelune-interactive zelune-icon-reveal-btn"
              onClick={() => setMode('inspect')}
              title="Inspect & Edit"
              aria-label="Inspect & Edit"
              style={{
                padding: '6px 9px',
                borderRadius: 5,
                border: mode === 'inspect' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                backgroundColor: mode === 'inspect' ? 'var(--studio-surface-3)' : 'transparent',
                color: mode === 'inspect' ? '#0284C7' : 'var(--studio-text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <MousePointer size={14} style={{ flexShrink: 0, color: mode === 'inspect' ? '#38BDF8' : 'currentColor' }} />
              <span className="zelune-reveal-label" style={{ color: mode === 'inspect' ? 'var(--studio-text-primary)' : 'inherit' }}>
                Inspect &amp; Edit
              </span>
            </button>

            <button
              type="button"
              className="zelune-interactive zelune-icon-reveal-btn"
              onClick={() => setMode('interact')}
              title="Interact & Navigate"
              aria-label="Interact & Navigate"
              style={{
                padding: '6px 9px',
                borderRadius: 5,
                border: mode === 'interact' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                backgroundColor: mode === 'interact' ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
                color: mode === 'interact' ? (colorScheme === 'dark' ? '#34D399' : '#059669') : 'var(--studio-text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Play size={14} style={{ flexShrink: 0 }} />
              <span className="zelune-reveal-label">Interact &amp; Navigate</span>
            </button>
          </div>

          <button
            type="button"
            className="zelune-interactive zelune-icon-reveal-btn"
            onClick={() => setShowFlows((prev) => !prev)}
            title="Toggle Flow Graph"
            aria-label="Toggle Flow Graph"
            style={{
              padding: '7px 9px',
              borderRadius: 7,
              border: `1px solid ${showFlows ? 'rgba(99, 102, 241, 0.45)' : 'var(--studio-border-subtle)'}`,
              backgroundColor: showFlows ? 'rgba(99, 102, 241, 0.14)' : 'var(--studio-surface-2)',
              color: showFlows ? (colorScheme === 'dark' ? '#C7D2FE' : '#4F46E5') : 'var(--studio-text-secondary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <GitCommit size={14} style={{ flexShrink: 0 }} />
            <span className="zelune-reveal-label">Flow Graph</span>
          </button>
        </div>

        {/* Right: Undo/Redo, Viewport Controls, Theme Toggle & Right Inspector Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="zelune-interactive tabular-nums"
            onClick={handleUndo}
            disabled={historyState.undoAvailable === 0}
            title="Undo AST Patch (Cmd+Z)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color:
                historyState.undoAvailable > 0
                  ? 'var(--studio-text-primary)'
                  : 'var(--studio-text-muted)',
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              cursor: historyState.undoAvailable > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Undo2 size={13} />
            <span>{historyState.undoAvailable}</span>
          </button>

          <button
            type="button"
            className="zelune-interactive"
            onClick={handleRedo}
            disabled={historyState.redoAvailable === 0}
            title="Redo AST Patch (Cmd+Shift+Z)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color:
                historyState.redoAvailable > 0
                  ? 'var(--studio-text-primary)'
                  : 'var(--studio-text-muted)',
              fontSize: 11.5,
              cursor: historyState.redoAvailable > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Redo2 size={13} />
          </button>

          <div style={{ width: 1, height: 20, backgroundColor: 'var(--studio-border-subtle)', margin: '0 3px' }} />

          <button
            type="button"
            className="zelune-interactive"
            onClick={() => {
              triggerCameraTransition();
              setZoom((z) => clampZoom(z - 0.1));
            }}
            title="Zoom Out"
            style={{
              padding: 6,
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: 'var(--studio-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <ZoomOut size={13} />
          </button>

          <span
            ref={zoomLabelRef}
            className="tabular-nums"
            style={{
              minWidth: 46,
              textAlign: 'center',
              fontSize: 11.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--studio-text-secondary)',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            className="zelune-interactive"
            onClick={() => {
              triggerCameraTransition();
              setZoom((z) => clampZoom(z + 0.1));
            }}
            title="Zoom In"
            style={{
              padding: 6,
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: 'var(--studio-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <ZoomIn size={13} />
          </button>

          <button
            type="button"
            className="zelune-interactive zelune-icon-reveal-btn"
            onClick={handleFitAllScreens}
            title="Fit All Screens in Viewport"
            aria-label="Fit All Screens in Viewport"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: 'var(--studio-text-secondary)',
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Maximize size={13} style={{ flexShrink: 0 }} />
            <span className="zelune-reveal-label">Fit</span>
          </button>

          <button
            type="button"
            className="zelune-interactive zelune-icon-reveal-btn"
            onClick={handleResetGridLayout}
            title="Auto-Arrange Clean Artboard Grid"
            aria-label="Auto-Arrange Clean Artboard Grid"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: 'var(--studio-text-secondary)',
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={13} style={{ flexShrink: 0 }} />
            <span className="zelune-reveal-label">Grid</span>
          </button>

          <button
            type="button"
            className="zelune-interactive zelune-icon-reveal-btn"
            onClick={toggleColorScheme}
            title={
              colorScheme === 'dark' ? 'Switch Canvas to Light Mode' : 'Switch Canvas to Dark Mode'
            }
            aria-label={
              colorScheme === 'dark' ? 'Switch Canvas to Light Mode' : 'Switch Canvas to Dark Mode'
            }
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: 'var(--studio-text-secondary)',
              fontSize: 11.5,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {colorScheme === 'dark' ? (
              <Sun size={13} style={{ flexShrink: 0, color: '#F59E0B' }} />
            ) : (
              <Moon size={13} style={{ flexShrink: 0, color: '#6366F1' }} />
            )}
            <span className="zelune-reveal-label">
              {colorScheme === 'dark' ? 'Light' : 'Dark'}
            </span>
          </button>

          <div style={{ width: 1, height: 20, backgroundColor: 'var(--studio-border-subtle)', margin: '0 3px' }} />

          <button
            type="button"
            className="zelune-interactive"
            onClick={() => setIsRightPanelOpen((prev) => !prev)}
            title={`${isRightPanelOpen ? 'Collapse' : 'Expand'} AST Inspector Panel (])`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 7,
              border: `1px solid ${
                isRightPanelOpen ? 'rgba(56, 189, 248, 0.35)' : 'var(--studio-border-subtle)'
              }`,
              backgroundColor: isRightPanelOpen ? 'var(--studio-surface-3)' : 'var(--studio-surface-2)',
              color: isRightPanelOpen ? '#38BDF8' : 'var(--studio-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {isRightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </button>
        </div>
      </header>

      {/* Main Studio Body: Collapsible Left Screen Rail + Infinite Canvas + Collapsible Right AST Inspector */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar: Screen Artboard Navigator */}
        <aside
          aria-hidden={!isLeftPanelOpen}
          className="zelune-collapsible-panel"
          style={{
            width: isLeftPanelOpen ? 224 : 0,
            opacity: isLeftPanelOpen ? 1 : 0,
            pointerEvents: isLeftPanelOpen ? 'auto' : 'none',
            backgroundColor: 'var(--studio-surface-1)',
            borderRight: isLeftPanelOpen
              ? '1px solid var(--studio-border-hairline)'
              : '0px solid transparent',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 30,
          }}
        >
          <div
            className="zelune-scroller"
            style={{
              width: 224,
              minWidth: 224,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 12,
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                className="tabular-nums"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px 6px',
                  fontSize: 10.5,
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: 'var(--studio-text-muted)',
                  letterSpacing: '0.06em',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} color="#38BDF8" />
                  <span>SCREENS ({screens.length})</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    className="zelune-interactive"
                    onClick={() => void fetchScreens()}
                    title="Refresh Screen Discovery"
                    style={{
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 4,
                      color: 'var(--studio-text-muted)',
                      cursor: 'pointer',
                      padding: 3,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <RefreshCw size={11} />
                  </button>
                  <button
                    type="button"
                    className="zelune-interactive"
                    onClick={() => setIsLeftPanelOpen(false)}
                    title="Collapse Screens Sidebar ([)"
                    style={{
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 4,
                      color: 'var(--studio-text-muted)',
                      cursor: 'pointer',
                      padding: 3,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <PanelLeftClose size={12} />
                  </button>
                </div>
              </div>

              {screens.map((scr) => {
                const isSelected = activeScreenId === scr.id;
                return (
                  <button
                    key={scr.id}
                    type="button"
                    className="zelune-interactive zelune-rail-item"
                    onClick={() => focusOnScreen(scr.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      paddingLeft: 10,
                      paddingRight: 10,
                      borderRadius: 7,
                      border: `1px solid ${
                        isSelected ? 'rgba(56, 189, 248, 0.35)' : 'transparent'
                      }`,
                      backgroundColor: isSelected ? 'var(--studio-surface-2)' : 'transparent',
                      color: isSelected ? 'var(--studio-text-primary)' : 'var(--studio-text-secondary)',
                      fontSize: 12.5,
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{scr.id}</span>
                    <span
                      className="tabular-nums"
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: isSelected ? '#38BDF8' : 'var(--studio-text-muted)',
                      }}
                    >
                      {scr.outgoingFlows.length}→
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                backgroundColor: 'var(--studio-surface-2)',
                border: '1px solid var(--studio-border-hairline)',
                borderRadius: 9,
                padding: 11,
                fontSize: 11,
                color: 'var(--studio-text-secondary)',
                lineHeight: 1.55,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: 'var(--studio-text-primary)',
                  marginBottom: 4,
                }}
              >
                STUDIO ERGONOMICS
              </div>
              <div>• Two-finger scroll to pan</div>
              <div>• Two-finger pinch to zoom</div>
              <div>• Press [ or ] to toggle panels</div>
              <div>• Click any node to patch AST</div>
            </div>
          </div>
        </aside>

        {/* Center: Infinite Zoom/Pan Canvas */}
        <main
          ref={canvasViewportRef}
          onPointerDown={handleCanvasPointerDown}
          className="infinite-canvas-surface"
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            cursor: isPanning ? 'grabbing' : 'grab',
          }}
        >
          {/* Floating Edge Restore Pill for Collapsed Left Sidebar */}
          {!isLeftPanelOpen && (
            <button
              type="button"
              className="zelune-interactive tabular-nums"
              onClick={(e) => {
                e.stopPropagation();
                setIsLeftPanelOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Expand Screens Navigator ([)"
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 35,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 11px',
                borderRadius: 8,
                backgroundColor: 'var(--studio-surface-1)',
                border: '1px solid var(--studio-border-subtle)',
                color: 'var(--studio-text-primary)',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 10px 24px -6px rgba(0, 0, 0, 0.28)',
              }}
            >
              <PanelLeftOpen size={13} color="#38BDF8" />
              <span>Screens ({screens.length})</span>
            </button>
          )}

          {/* Floating Edge Restore Pill for Collapsed Right Inspector */}
          {!isRightPanelOpen && (
            <button
              type="button"
              className="zelune-interactive tabular-nums"
              onClick={(e) => {
                e.stopPropagation();
                setIsRightPanelOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Expand AST Visual Inspector (])"
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                zIndex: 35,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 11px',
                borderRadius: 8,
                backgroundColor: 'var(--studio-surface-1)',
                border: '1px solid var(--studio-border-subtle)',
                color: 'var(--studio-text-primary)',
                fontSize: 11.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 10px 24px -6px rgba(0, 0, 0, 0.28)',
              }}
            >
              <Sliders size={13} color="#38BDF8" />
              <span>
                {inspectedData ? `<${inspectedData.tagName}> L${inspectedData.line}` : 'AST Inspector'}
              </span>
              <PanelRightOpen size={13} color="var(--studio-text-secondary)" />
            </button>
          )}

          {/* World Transform Container: Emil Kowalski ease-out-expo on camera focus, 0ms on direct drag/pinch */}
          <div
            ref={worldContainerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isCameraAnimating
                ? 'transform var(--duration-camera) var(--ease-out-expo)'
                : 'none',
            }}
          >
            {showFlows && (
              <FlowArrowsLayer
                screens={screens}
                layout={layout}
                activeScreenId={activeScreenId}
                highlightedScreenId={highlightedScreenId}
                onSelectFlow={handleSelectFlow}
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
              const isSelectedScreen = selectedElement?.screenId === screen.id;

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
                  isCanvasMoving={isPanning}
                  selectedElement={isSelectedScreen ? selectedElement : null}
                  inspectedElement={isSelectedScreen ? inspectedData : null}
                  onSelectElement={handleSelectElement}
                  onSelectScreen={setActiveScreenId}
                  onFocusScreen={focusOnScreen}
                  onMoveArtboard={handleMoveArtboard}
                  onNavigateFlow={handleNavigateFlow}
                  onPatchElement={handlePatchElement}
                  onReorderElement={handleReorderElement}
                />
              );
            })}
          </div>
        </main>

        {/* Right: AST Visual Inspector Panel */}
        <InspectorPanel
          inspected={inspectedData}
          isOpen={isRightPanelOpen}
          isLoading={isInspecting}
          isSaving={isSaving}
          statusMessage={statusMessage}
          onPatch={handlePatchElement}
          onClearSelection={() => {
            setSelectedElement(null);
            setInspectedData(null);
          }}
          onCollapse={() => setIsRightPanelOpen(false)}
          onJumpToScreen={focusOnScreen}
        />
      </div>
    </div>
  );
};
