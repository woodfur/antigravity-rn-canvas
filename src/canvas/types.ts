import type { InspectedElement, NavigationEdge, ScreenMetadata } from '../server/astEngine';

export type CanvasMode = 'inspect' | 'interact';

export type FlowAccentTone = 'sky' | 'indigo' | 'emerald' | 'amber' | 'violet' | 'slate';

export interface ArtboardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ArtboardLayoutMap = Record<string, ArtboardPosition>;

export interface DetectedUserFlow {
  id: string;
  index: number;
  title: string;
  accent: FlowAccentTone;
  screenIds: string[];
}

export interface FlowSwimlaneLayoutResult {
  flows: DetectedUserFlow[];
  positions: ArtboardLayoutMap;
  screenFlowMap: Record<string, string>;
  orderedScreens: ScreenMetadata[];
}

export interface SelectedElementRef {
  screenId: string;
  file: string;
  astPath: string;
  line: number;
  col: number;
  tagName: string;
}

export type { InspectedElement, NavigationEdge, ScreenMetadata };
