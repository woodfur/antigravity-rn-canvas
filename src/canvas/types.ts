import type { InspectedElement, NavigationEdge, ScreenMetadata } from '../server/astEngine';

export type CanvasMode = 'inspect' | 'interact';

export interface ArtboardPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ArtboardLayoutMap = Record<string, ArtboardPosition>;

export interface SelectedElementRef {
  screenId: string;
  file: string;
  astPath: string;
  line: number;
  col: number;
  tagName: string;
}

export type { InspectedElement, NavigationEdge, ScreenMetadata };
