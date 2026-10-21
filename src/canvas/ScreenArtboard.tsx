import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  GripHorizontal,
  Maximize2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Pin,
  PinOff,
  Type,
  Move,
} from 'lucide-react';
import { MockNavigationProvider } from '../runtime/MockNavigationContext';
import { ScreenErrorBoundary } from '../runtime/ScreenErrorBoundary';
import type {
  ArtboardPosition,
  CanvasMode,
  InspectedElement,
  ScreenMetadata,
  SelectedElementRef,
} from './types';
import type { PatchPayload, ReorderPayload } from '../server/astEngine';

interface ScreenArtboardProps {
  screen: ScreenMetadata;
  ScreenComponent: React.ComponentType | undefined;
  position: ArtboardPosition;
  zoom: number;
  mode: CanvasMode;
  isActiveScreen: boolean;
  isHighlightedScreen: boolean;
  selectedElement: SelectedElementRef | null;
  inspectedElement: InspectedElement | null;
  onSelectElement: (ref: SelectedElementRef) => void;
  onSelectScreen: (screenId: string) => void;
  onFocusScreen: (screenId: string) => void;
  onMoveArtboard: (screenId: string, nextX: number, nextY: number) => void;
  onNavigateFlow: (fromScreen: string, toScreen: string) => void;
  onPatchElement: (payload: PatchPayload) => Promise<void>;
  onReorderElement: (payload: ReorderPayload) => Promise<void>;
}

interface BoxOverlay {
  top: number;
  left: number;
  width: number;
  height: number;
  tagName: string;
  astPath: string;
}

interface DropIndicator {
  targetAstPath: string;
  targetTagName: string;
  placement: 'before' | 'after';
  isRow: boolean;
  lineTop: number;
  lineLeft: number;
  lineWidth: number;
  lineHeight: number;
}

type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

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

function escapeAstPathSelector(astPath: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(astPath)
    : astPath.replace(/["\\]/g, '\\$&');
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
  inspectedElement,
  onSelectElement,
  onSelectScreen,
  onFocusScreen,
  onMoveArtboard,
  onNavigateFlow,
  onPatchElement,
  onReorderElement,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);

  const [hoverBox, setHoverBox] = useState<BoxOverlay | null>(null);
  const [selectedBox, setSelectedBox] = useState<BoxOverlay | null>(null);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  // Direct On-Canvas Manipulation States
  const [activeGizmoAction, setActiveGizmoAction] = useState<
    'resize' | 'radius' | 'move' | null
  >(null);
  const [liveHudBadge, setLiveHudBadge] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [showCenterGuideX, setShowCenterGuideX] = useState<boolean>(false);

  // Inline Double-Click Text Editing State
  const [isEditingInlineText, setIsEditingInlineText] = useState<boolean>(false);
  const [inlineTextDraft, setInlineTextDraft] = useState<string>('');

  const isSelectedOnThisScreen =
    Boolean(selectedElement) && selectedElement?.screenId === screen.id;
  const activeInspected =
    isSelectedOnThisScreen &&
    inspectedElement &&
    inspectedElement.astPath === selectedElement?.astPath
      ? inspectedElement
      : null;

  const isAbsolutePositioned = activeInspected?.styles?.position === 'absolute';

  const getSelectedDomNode = useCallback((): HTMLElement | null => {
    const container = viewportRef.current;
    if (!container || !selectedElement || selectedElement.screenId !== screen.id) {
      return null;
    }
    const safeAstPath = escapeAstPathSelector(selectedElement.astPath);
    return container.querySelector<HTMLElement>(`[data-agy-ast-path="${safeAstPath}"]`);
  }, [selectedElement, screen.id]);

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
    setIsEditingInlineText(false);
    if (!isSelectedOnThisScreen) {
      setSelectedBox(null);
      return;
    }

    const updateSelectionOverlay = () => {
      const match = getSelectedDomNode();
      if (match) {
        setSelectedBox(computeRelativeBox(match));
      } else {
        setSelectedBox(null);
      }
    };

    updateSelectionOverlay();
    const timer = window.setTimeout(updateSelectionOverlay, 90);
    return () => window.clearTimeout(timer);
  }, [
    selectedElement,
    inspectedElement,
    screen,
    isSelectedOnThisScreen,
    getSelectedDomNode,
    computeRelativeBox,
  ]);

  // Focus inline text editor when activated
  useEffect(() => {
    if (isEditingInlineText && inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, [isEditingInlineText]);

  const startInlineTextEdit = useCallback(() => {
    if (!activeInspected || !activeInspected.isTextEditable) return;
    setInlineTextDraft(activeInspected.textContent ?? '');
    setIsEditingInlineText(true);
  }, [activeInspected]);

  const commitInlineTextEdit = useCallback(() => {
    if (!isEditingInlineText || !selectedElement || !activeInspected) {
      setIsEditingInlineText(false);
      return;
    }
    setIsEditingInlineText(false);
    if (inlineTextDraft !== (activeInspected.textContent ?? '')) {
      void onPatchElement({
        file: selectedElement.file,
        astPath: selectedElement.astPath,
        line: selectedElement.line,
        text: inlineTextDraft,
      });
    }
  }, [isEditingInlineText, selectedElement, activeInspected, inlineTextDraft, onPatchElement]);

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

  // 8-Point Direct Resize Handler on Artboard
  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLElement>,
    dir: ResizeDirection
  ) => {
    if (e.button !== 0 || !selectedBox || !selectedElement) return;
    e.stopPropagation();
    e.preventDefault();

    const targetDomEl = getSelectedDomNode();
    if (!targetDomEl) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialBox = { ...selectedBox };
    const initialLeft = Number(activeInspected?.styles?.left ?? initialBox.left);
    const initialTop = Number(activeInspected?.styles?.top ?? initialBox.top);

    // Measure parent inner content width so dragging to parent edges can snap to '100%'
    let parentInnerWidth = position.width;
    if (targetDomEl.parentElement) {
      const parentRect = targetDomEl.parentElement.getBoundingClientRect();
      const parentComputed = window.getComputedStyle(targetDomEl.parentElement);
      const padL = Number.parseFloat(parentComputed.paddingLeft) || 0;
      const padR = Number.parseFloat(parentComputed.paddingRight) || 0;
      parentInnerWidth = parentRect.width / zoom - padL - padR;
    }

    setActiveGizmoAction('resize');
    let pendingStyles: Record<string, string | number> = {};

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;

      let nextW = initialBox.width;
      let nextH = initialBox.height;
      let nextL = initialLeft;
      let nextT = initialTop;

      const affectsWidth = dir.includes('e') || dir.includes('w');
      const affectsHeight = dir.includes('s') || dir.includes('n');

      if (dir.includes('e')) {
        nextW = Math.max(20, Math.round(initialBox.width + dx));
      } else if (dir.includes('w')) {
        nextW = Math.max(20, Math.round(initialBox.width - dx));
        if (isAbsolutePositioned) {
          nextL = Math.round(initialLeft + (initialBox.width - nextW));
        }
      }

      if (dir.includes('s')) {
        nextH = Math.max(18, Math.round(initialBox.height + dy));
      } else if (dir.includes('n')) {
        nextH = Math.max(18, Math.round(initialBox.height - dy));
        if (isAbsolutePositioned) {
          nextT = Math.round(initialTop + (initialBox.height - nextH));
        }
      }

      pendingStyles = {};
      let widthLabel = `${Math.round(nextW)}`;

      if (affectsWidth) {
        if (
          !isAbsolutePositioned &&
          !moveEvent.altKey &&
          Math.abs(nextW - parentInnerWidth) <= 7
        ) {
          targetDomEl.style.width = '100%';
          pendingStyles.width = '100%';
          widthLabel = '100%';
        } else {
          targetDomEl.style.width = `${nextW}px`;
          pendingStyles.width = nextW;
        }
        if (isAbsolutePositioned && dir.includes('w')) {
          targetDomEl.style.left = `${nextL}px`;
          pendingStyles.left = nextL;
        }
      }

      if (affectsHeight) {
        targetDomEl.style.height = `${nextH}px`;
        pendingStyles.height = nextH;
        if (isAbsolutePositioned && dir.includes('n')) {
          targetDomEl.style.top = `${nextT}px`;
          pendingStyles.top = nextT;
        }
      }

      const updatedBox = computeRelativeBox(targetDomEl);
      if (updatedBox) {
        setSelectedBox(updatedBox);
      }
      setLiveHudBadge(`${widthLabel} × ${Math.round(nextH)}`);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      setActiveGizmoAction(null);
      setLiveHudBadge(null);

      if (Object.keys(pendingStyles).length > 0) {
        void onPatchElement({
          file: selectedElement.file,
          astPath: selectedElement.astPath,
          line: selectedElement.line,
          styles: pendingStyles,
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Inner Corner borderRadius Drag Handler
  const handleRadiusPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    corner: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    if (e.button !== 0 || !selectedBox || !selectedElement) return;
    e.stopPropagation();
    e.preventDefault();

    const targetDomEl = getSelectedDomNode();
    if (!targetDomEl) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialRadius = Number(activeInspected?.styles?.borderRadius ?? 0) || 0;
    const maxRadius = Math.max(0, Math.round(Math.min(selectedBox.width, selectedBox.height) / 2));

    setActiveGizmoAction('radius');
    let nextRadius = initialRadius;
    let didChange = false;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      const signedX = corner.includes('w') ? dx : -dx;
      const signedY = corner.includes('n') ? dy : -dy;
      const delta = Math.round((signedX + signedY) / 2);

      nextRadius = Math.max(0, Math.min(maxRadius, initialRadius + delta));
      didChange = true;
      targetDomEl.style.borderRadius = `${nextRadius}px`;
      setLiveHudBadge(`Radius ${nextRadius}px`);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      setActiveGizmoAction(null);
      setLiveHudBadge(null);

      if (didChange && nextRadius !== initialRadius) {
        void onPatchElement({
          file: selectedElement.file,
          astPath: selectedElement.astPath,
          line: selectedElement.line,
          styles: { borderRadius: nextRadius },
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Hybrid On-Canvas Move & Reorder Handler (Flexbox Reorder + Freeform Float + Shift Spacing Nudge)
  const startMoveElementInteraction = useCallback(
    (startClientX: number, startClientY: number, initialAltKey: boolean) => {
      if (!selectedBox || !selectedElement) return;
      const targetDomEl = getSelectedDomNode();
      const container = viewportRef.current;
      if (!targetDomEl || !container) return;

      const initialBox = { ...selectedBox };
      const initialLeft = Number(activeInspected?.styles?.left ?? initialBox.left);
      const initialTop = Number(activeInspected?.styles?.top ?? initialBox.top);
      const initialMarginTop = Number(activeInspected?.styles?.marginTop ?? 0) || 0;
      const prevTransform = targetDomEl.style.transform;
      const prevOpacity = targetDomEl.style.opacity;
      const prevZIndex = targetDomEl.style.zIndex;

      let hasExceededThreshold = false;
      let activeDrop: DropIndicator | null = null;
      let pendingStylePatch: Record<string, string | number> | null = null;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const rawDx = moveEvent.clientX - startClientX;
        const rawDy = moveEvent.clientY - startClientY;

        // Wait for 4px movement threshold before entering drag state (per modern-web-guidance)
        if (!hasExceededThreshold) {
          if (Math.hypot(rawDx, rawDy) < 4) return;
          hasExceededThreshold = true;
          setActiveGizmoAction('move');
        }

        const dx = rawDx / zoom;
        const dy = rawDy / zoom;
        const useFreeformFloat = isAbsolutePositioned || initialAltKey || moveEvent.altKey;

        if (useFreeformFloat) {
          setDropIndicator(null);
          activeDrop = null;

          let nextLeft = Math.round(initialLeft + dx);
          const nextTop = Math.round(initialTop + dy);

          // Snap to horizontal center of the 393px artboard within 4px
          const elementCenterX = nextLeft + initialBox.width / 2;
          const artboardCenterX = position.width / 2;
          if (Math.abs(elementCenterX - artboardCenterX) <= 4) {
            nextLeft = Math.round(artboardCenterX - initialBox.width / 2);
            setShowCenterGuideX(true);
          } else {
            setShowCenterGuideX(false);
          }

          targetDomEl.style.transform = prevTransform;
          targetDomEl.style.opacity = '0.95';
          targetDomEl.style.position = 'absolute';
          targetDomEl.style.left = `${nextLeft}px`;
          targetDomEl.style.top = `${nextTop}px`;
          targetDomEl.style.width = `${Math.round(initialBox.width)}px`;
          targetDomEl.style.zIndex = '20';

          pendingStylePatch = {
            position: 'absolute',
            left: nextLeft,
            top: nextTop,
            width: Math.round(initialBox.width),
          };

          const updatedBox = computeRelativeBox(targetDomEl);
          if (updatedBox) setSelectedBox(updatedBox);
          setLiveHudBadge(`Float X:${nextLeft} Y:${nextTop}`);
          return;
        }

        setShowCenterGuideX(false);

        // Shift + Drag in Flexbox mode = Nudge marginTop spacing
        if (moveEvent.shiftKey) {
          setDropIndicator(null);
          activeDrop = null;
          const nextMarginTop = Math.round(initialMarginTop + dy);
          targetDomEl.style.transform = prevTransform;
          targetDomEl.style.marginTop = `${nextMarginTop}px`;
          pendingStylePatch = { marginTop: nextMarginTop };
          const updatedBox = computeRelativeBox(targetDomEl);
          if (updatedBox) setSelectedBox(updatedBox);
          setLiveHudBadge(`marginTop: ${nextMarginTop}px`);
          return;
        }

        // Default Flexbox Drag = Reorder among sibling JSX elements inside parent container
        pendingStylePatch = null;
        targetDomEl.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0)`;
        targetDomEl.style.opacity = '0.84';
        targetDomEl.style.zIndex = '30';

        const parentEl = targetDomEl.parentElement;
        if (!parentEl) return;

        const parentStyle = window.getComputedStyle(parentEl);
        const isRow = parentStyle.flexDirection.startsWith('row');
        const containerRect = container.getBoundingClientRect();
        const pointerX = (moveEvent.clientX - containerRect.left) / zoom;
        const pointerY = (moveEvent.clientY - containerRect.top) / zoom;

        const siblings = Array.from(parentEl.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            child !== targetDomEl &&
            Boolean(child.dataset?.agyAstPath)
        );

        if (siblings.length === 0) {
          // No siblings in parent container: fall back to marginTop nudge
          const nextMarginTop = Math.round(initialMarginTop + dy);
          pendingStylePatch = { marginTop: nextMarginTop };
          setLiveHudBadge(`Offset Y: ${nextMarginTop}px`);
          return;
        }

        let closestSibling: HTMLElement | null = null;
        let closestDist = Number.POSITIVE_INFINITY;
        let closestBox: BoxOverlay | null = null;

        for (const sib of siblings) {
          const box = computeRelativeBox(sib);
          if (!box) continue;
          const centerX = box.left + box.width / 2;
          const centerY = box.top + box.height / 2;
          const dist = isRow
            ? Math.abs(pointerX - centerX)
            : Math.abs(pointerY - centerY);
          if (dist < closestDist) {
            closestDist = dist;
            closestSibling = sib;
            closestBox = box;
          }
        }

        if (closestSibling && closestBox) {
          const placement: 'before' | 'after' = isRow
            ? pointerX < closestBox.left + closestBox.width / 2
              ? 'before'
              : 'after'
            : pointerY < closestBox.top + closestBox.height / 2
              ? 'before'
              : 'after';

          const indicator: DropIndicator = isRow
            ? {
                targetAstPath: closestBox.astPath,
                targetTagName: closestBox.tagName,
                placement,
                isRow: true,
                lineTop: closestBox.top,
                lineLeft:
                  placement === 'before'
                    ? closestBox.left - 3
                    : closestBox.left + closestBox.width + 3,
                lineWidth: 2,
                lineHeight: closestBox.height,
              }
            : {
                targetAstPath: closestBox.astPath,
                targetTagName: closestBox.tagName,
                placement,
                isRow: false,
                lineTop:
                  placement === 'before'
                    ? closestBox.top - 3
                    : closestBox.top + closestBox.height + 3,
                lineLeft: closestBox.left,
                lineWidth: closestBox.width,
                lineHeight: 2,
              };

          activeDrop = indicator;
          setDropIndicator(indicator);
          setLiveHudBadge(`Move ${placement} <${closestBox.tagName}>`);
        }
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);

        targetDomEl.style.transform = prevTransform;
        targetDomEl.style.opacity = prevOpacity;
        targetDomEl.style.zIndex = prevZIndex;

        setActiveGizmoAction(null);
        setLiveHudBadge(null);
        setDropIndicator(null);
        setShowCenterGuideX(false);

        if (!hasExceededThreshold) return;

        if (activeDrop) {
          void onReorderElement({
            file: selectedElement.file,
            astPath: selectedElement.astPath,
            targetAstPath: activeDrop.targetAstPath,
            placement: activeDrop.placement,
          });
        } else if (pendingStylePatch) {
          void onPatchElement({
            file: selectedElement.file,
            astPath: selectedElement.astPath,
            line: selectedElement.line,
            styles: pendingStylePatch,
          });
        }
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [
      selectedBox,
      selectedElement,
      activeInspected,
      isAbsolutePositioned,
      zoom,
      position.width,
      getSelectedDomNode,
      computeRelativeBox,
      onPatchElement,
      onReorderElement,
    ]
  );

  // Toggle between Flexbox flow and Freeform Float (position: 'absolute')
  const handleToggleFloatMode = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!selectedElement || !selectedBox) return;

    if (isAbsolutePositioned) {
      void onPatchElement({
        file: selectedElement.file,
        astPath: selectedElement.astPath,
        line: selectedElement.line,
        styles: {
          position: null,
          left: null,
          top: null,
          zIndex: null,
        },
      });
    } else {
      void onPatchElement({
        file: selectedElement.file,
        astPath: selectedElement.astPath,
        line: selectedElement.line,
        styles: {
          position: 'absolute',
          left: Math.round(selectedBox.left),
          top: Math.round(selectedBox.top),
          width: Math.round(selectedBox.width),
          zIndex: 10,
        },
      });
    }
  };

  // Inspect Mode pointer handlers
  const handlePointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'inspect' || activeGizmoAction) return;
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

  const handleViewportPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'inspect' || e.button !== 0 || isEditingInlineText) return;
    const targetEl = findNearestAgyElement(e.target, viewportRef.current);
    if (!targetEl) return;

    // If user presses down on the already-selected element, allow dragging it after 4px threshold
    if (
      isSelectedOnThisScreen &&
      selectedElement &&
      targetEl.dataset.agyAstPath === selectedElement.astPath
    ) {
      startMoveElementInteraction(e.clientX, e.clientY, e.altKey);
    }
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'inspect' || isEditingInlineText) return;
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

  const handleDoubleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'inspect') return;
    const targetEl = findNearestAgyElement(e.target, viewportRef.current);
    if (!targetEl) return;

    e.stopPropagation();
    e.preventDefault();
    if (activeInspected?.isTextEditable) {
      startInlineTextEdit();
    }
  };

  const borderColor = isHighlightedScreen
    ? '#10B981'
    : isActiveScreen
      ? '#38BDF8'
      : 'rgba(255, 255, 255, 0.09)';

  const toolbarAbove = !selectedBox || selectedBox.top >= 30;

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: position.width,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        zIndex: isActiveScreen || isHighlightedScreen ? 20 : 10,
      }}
      onPointerDown={(e) => {
        // Prevent background canvas pan when interacting inside an artboard
        e.stopPropagation();
        onSelectScreen(screen.id);
      }}
    >
      {/* Minimalist Architectural Artboard Title Header */}
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
          color: isActiveScreen ? '#38BDF8' : '#94A3B8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <GripHorizontal size={14} style={{ opacity: 0.7 }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              color: isActiveScreen ? '#F8FAFC' : '#CBD5E1',
            }}
          >
            {screen.name}
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: '#64748B',
            }}
          >
            /{screen.routeName}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="tabular-nums"
            style={{
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              color: '#64748B',
            }}
          >
            {position.width} × {position.height}
          </span>
          <button
            type="button"
            className="zelune-interactive"
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
              border: '1px solid var(--studio-border-subtle)',
              backgroundColor: 'var(--studio-surface-2)',
              color: '#94A3B8',
              cursor: 'pointer',
            }}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>

      {/* Pure Rectangular Screen Artboard */}
      <div
        ref={viewportRef}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
        onPointerLeave={handlePointerLeave}
        onClickCapture={handleClickCapture}
        onDoubleClickCapture={handleDoubleClickCapture}
        style={{
          position: 'relative',
          width: position.width,
          height: position.height,
          backgroundColor: '#0A0B0E',
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: isHighlightedScreen
            ? '0 0 0 3px rgba(16, 185, 129, 0.28), 0 28px 56px -14px rgba(0, 0, 0, 0.78)'
            : isActiveScreen
              ? '0 0 0 2px rgba(56, 189, 248, 0.22), 0 28px 56px -14px rgba(0, 0, 0, 0.78)'
              : '0 22px 44px -15px rgba(0, 0, 0, 0.68)',
          transition:
            'border-color var(--duration-micro) var(--ease-out), box-shadow var(--duration-micro) var(--ease-out)',
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
              fontFamily: 'var(--font-mono)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#F87171',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
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
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  width: '100%',
                }}
              >
                <ScreenComponent />
              </div>
            </MockNavigationProvider>
          </ScreenErrorBoundary>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B',
              fontSize: 13,
            }}
          >
            Mounting {screen.name}...
          </div>
        )}

        {/* Smart Horizontal Center Snap Guide Line during Freeform Float Move */}
        {showCenterGuideX && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: Math.round(position.width / 2),
              width: 1,
              borderLeft: '1px dashed #F43F5E',
              pointerEvents: 'none',
              zIndex: 55,
            }}
          />
        )}

        {/* Smart Flexbox Drop Insertion Line during Sibling Reorder Drag */}
        {dropIndicator && (
          <div
            style={{
              position: 'absolute',
              top: dropIndicator.lineTop,
              left: dropIndicator.lineLeft,
              width: dropIndicator.lineWidth,
              height: dropIndicator.lineHeight,
              backgroundColor: '#38BDF8',
              boxShadow: '0 0 8px rgba(56, 189, 248, 0.9)',
              pointerEvents: 'none',
              zIndex: 55,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: dropIndicator.isRow ? -3 : -2,
                left: dropIndicator.isRow ? -2 : -3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#38BDF8',
              }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: dropIndicator.isRow ? -3 : -2,
                right: dropIndicator.isRow ? -2 : -3,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#38BDF8',
              }}
            />
          </div>
        )}

        {/* Figma-style Hover Bounding Box in Inspect Mode */}
        {mode === 'inspect' &&
          !activeGizmoAction &&
          hoverBox &&
          (!selectedBox || hoverBox.astPath !== selectedBox.astPath) && (
            <div
              className="zelune-box-overlay"
              style={{
                position: 'absolute',
                top: hoverBox.top,
                left: hoverBox.left,
                width: hoverBox.width,
                height: hoverBox.height,
                border: '1px dashed #38BDF8',
                backgroundColor: 'rgba(56, 189, 248, 0.06)',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            >
              <span
                className="tabular-nums"
                style={{
                  position: 'absolute',
                  top: -19,
                  left: -1,
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                }}
              >
                &lt;{hoverBox.tagName}&gt;
              </span>
            </div>
          )}

        {/* Interactive Direct-Manipulation Selection Gizmo */}
        {mode === 'inspect' && selectedBox && isSelectedOnThisScreen && selectedElement && (
          <div
            className="zelune-box-overlay"
            style={{
              position: 'absolute',
              top: selectedBox.top,
              left: selectedBox.left,
              width: selectedBox.width,
              height: selectedBox.height,
              border: `1.5px solid ${isAbsolutePositioned ? '#F59E0B' : '#6366F1'}`,
              backgroundColor: isAbsolutePositioned
                ? 'rgba(245, 158, 11, 0.07)'
                : 'rgba(99, 102, 241, 0.07)',
              pointerEvents: 'none',
              zIndex: 45,
            }}
          >
            {/* 8-Point Interactive Resize Handles (4 Corners + 4 Edges) */}
            {(
              [
                {
                  dir: 'nw' as ResizeDirection,
                  style: { top: -5, left: -5, cursor: 'nwse-resize' },
                },
                {
                  dir: 'n' as ResizeDirection,
                  style: {
                    top: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    cursor: 'ns-resize',
                  },
                },
                {
                  dir: 'ne' as ResizeDirection,
                  style: { top: -5, right: -5, cursor: 'nesw-resize' },
                },
                {
                  dir: 'e' as ResizeDirection,
                  style: {
                    top: '50%',
                    right: -4,
                    transform: 'translateY(-50%)',
                    cursor: 'ew-resize',
                  },
                },
                {
                  dir: 'se' as ResizeDirection,
                  style: { bottom: -5, right: -5, cursor: 'nwse-resize' },
                },
                {
                  dir: 's' as ResizeDirection,
                  style: {
                    bottom: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    cursor: 'ns-resize',
                  },
                },
                {
                  dir: 'sw' as ResizeDirection,
                  style: { bottom: -5, left: -5, cursor: 'nesw-resize' },
                },
                {
                  dir: 'w' as ResizeDirection,
                  style: {
                    top: '50%',
                    left: -4,
                    transform: 'translateY(-50%)',
                    cursor: 'ew-resize',
                  },
                },
              ] as const
            ).map(({ dir, style }) => (
              <span
                key={dir}
                title={`Drag to resize (${dir.toUpperCase()})`}
                onPointerDown={(e) => handleResizePointerDown(e, dir)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  ...style,
                  width: dir.length === 2 ? 8 : 6,
                  height: dir.length === 2 ? 8 : 6,
                  backgroundColor: '#FFFFFF',
                  border: `1.5px solid ${isAbsolutePositioned ? '#D97706' : '#4F46E5'}`,
                  borderRadius: dir.length === 2 ? 2 : 1,
                  pointerEvents: 'auto',
                  touchAction: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
                }}
              />
            ))}

            {/* 4 Inner Corner borderRadius Handles (Figma-style circular dots) */}
            {selectedBox.width >= 44 &&
              selectedBox.height >= 32 &&
              !isEditingInlineText &&
              (
                [
                  { corner: 'nw' as const, style: { top: 6, left: 6 } },
                  { corner: 'ne' as const, style: { top: 6, right: 6 } },
                  { corner: 'sw' as const, style: { bottom: 6, left: 6 } },
                  { corner: 'se' as const, style: { bottom: 6, right: 6 } },
                ] as const
              ).map(({ corner, style }) => (
                <span
                  key={corner}
                  title="Drag inward/outward to adjust borderRadius"
                  onPointerDown={(e) => handleRadiusPointerDown(e, corner)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    ...style,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(56, 189, 248, 0.9)',
                    border: '1px solid #08090C',
                    cursor: 'crosshair',
                    pointerEvents: 'auto',
                    touchAction: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    opacity: 0.75,
                  }}
                />
              ))}

            {/* On-Canvas Floating Action & Move Toolbar Pill */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                ...(toolbarAbove ? { top: -27 } : { bottom: -27 }),
                left: -1.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                backgroundColor: isAbsolutePositioned ? '#B45309' : '#4F46E5',
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                padding: '2px 4px 2px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.5)',
                pointerEvents: 'auto',
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                zIndex: 50,
              }}
            >
              {/* Drag Grip Handle on the Tag Pill */}
              <span
                className="tabular-nums"
                title="Drag to move or reorder element (Hold Option/Alt for freeform X/Y, Shift for margin offset)"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.preventDefault();
                  startMoveElementInteraction(e.clientX, e.clientY, e.altKey);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: activeGizmoAction === 'move' ? 'grabbing' : 'grab',
                  paddingRight: 4,
                }}
              >
                <Move size={10} />
                <span>
                  &lt;{selectedBox.tagName}&gt; · L{selectedElement.line}
                </span>
              </span>

              {/* Quick Reorder Up inside Flexbox Parent */}
              <button
                type="button"
                title="Move element earlier/up in Flexbox stack"
                onClick={(e) => {
                  e.stopPropagation();
                  void onReorderElement({
                    file: selectedElement.file,
                    astPath: selectedElement.astPath,
                    direction: 'up',
                  });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 17,
                  height: 17,
                  border: 'none',
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <ArrowUp size={10} />
              </button>

              {/* Quick Reorder Down inside Flexbox Parent */}
              <button
                type="button"
                title="Move element later/down in Flexbox stack"
                onClick={(e) => {
                  e.stopPropagation();
                  void onReorderElement({
                    file: selectedElement.file,
                    astPath: selectedElement.astPath,
                    direction: 'down',
                  });
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 17,
                  height: 17,
                  border: 'none',
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <ArrowDown size={10} />
              </button>

              {/* Toggle Freeform Float (position: 'absolute') vs Flexbox Flow */}
              <button
                type="button"
                title={
                  isAbsolutePositioned
                    ? 'Unpin element back to Flexbox flow'
                    : 'Pin/Float element for freeform (X, Y) dragging'
                }
                onClick={handleToggleFloatMode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 17,
                  height: 17,
                  border: 'none',
                  borderRadius: 3,
                  backgroundColor: isAbsolutePositioned
                    ? 'rgba(15, 23, 42, 0.45)'
                    : 'rgba(255, 255, 255, 0.14)',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {isAbsolutePositioned ? <PinOff size={10} /> : <Pin size={10} />}
              </button>

              {/* Inline Text Edit Trigger Button (for editable <Text> nodes) */}
              {activeInspected?.isTextEditable && (
                <button
                  type="button"
                  title="Edit text directly on artboard (or double-click element)"
                  onClick={(e) => {
                    e.stopPropagation();
                    startInlineTextEdit();
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 17,
                    height: 17,
                    border: 'none',
                    borderRadius: 3,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <Type size={10} />
                </button>
              )}
            </div>

            {/* Live HUD Readout Pill (Dimensions / Radius / Move Feedback) */}
            <span
              className="tabular-nums"
              style={{
                position: 'absolute',
                ...(toolbarAbove ? { bottom: -20 } : { top: -20 }),
                right: -1,
                backgroundColor: '#0D0F14',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#38BDF8',
                fontSize: 9.5,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                padding: '1px 5px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
              }}
            >
              {liveHudBadge ??
                `${Math.round(selectedBox.width)} × ${Math.round(selectedBox.height)}`}
            </span>

            {/* Inline Double-Click On-Canvas <Text> Editor */}
            {isEditingInlineText && (
              <textarea
                ref={inlineInputRef}
                value={inlineTextDraft}
                onChange={(e) => setInlineTextDraft(e.target.value)}
                onBlur={commitInlineTextEdit}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitInlineTextEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsEditingInlineText(false);
                  }
                }}
                style={{
                  position: 'absolute',
                  inset: -2,
                  width: Math.max(selectedBox.width + 8, 90),
                  height: Math.max(selectedBox.height + 6, 28),
                  backgroundColor: 'rgba(13, 15, 20, 0.96)',
                  color: String(activeInspected?.styles?.color ?? '#F8FAFC'),
                  fontSize: Number(activeInspected?.styles?.fontSize ?? 14),
                  fontWeight: String(activeInspected?.styles?.fontWeight ?? '500'),
                  fontFamily: 'var(--font-sans)',
                  border: '1.5px solid #38BDF8',
                  borderRadius: 4,
                  padding: '2px 5px',
                  outline: 'none',
                  resize: 'none',
                  pointerEvents: 'auto',
                  zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
