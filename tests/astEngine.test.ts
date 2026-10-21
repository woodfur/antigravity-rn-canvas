import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverScreens,
  discoverScreenFilesSync,
  normalizeRouteTarget,
  inspectElement,
  patchElement,
  undoLastPatch,
  redoLastPatch,
  resolveSafeScreenPath,
} from '../src/server/astEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

describe('Antigravity React Native Visual Canvas — AST Engine', () => {
  it('discovers all 5 React Native screens and extracts navigation flow edges', async () => {
    const screens = await discoverScreens(WORKSPACE_ROOT);
    const ids = screens.map((s) => s.id);

    expect(ids).toContain('Login');
    expect(ids).toContain('Home');
    expect(ids).toContain('ProductDetail');
    expect(ids).toContain('Checkout');
    expect(ids).toContain('Profile');

    const homeScreen = screens.find((s) => s.id === 'Home');
    expect(homeScreen).toBeDefined();
    expect(homeScreen!.outgoingFlows.some((f) => f.toScreen === 'ProductDetail')).toBe(true);
  });

  it('blocks path traversal outside src/screens/', () => {
    expect(() => resolveSafeScreenPath(WORKSPACE_ROOT, '../../etc/passwd')).toThrow(
      /Security violation/
    );
    expect(() => resolveSafeScreenPath(WORKSPACE_ROOT, 'package.json')).toThrow(
      /Security violation/
    );
  });

  it('inspects, surgically patches StyleSheet + copy, and cleanly undoes/redoes changes', async () => {
    const file = 'src/screens/LoginScreen.tsx';

    // Inspect the title <Text> element ("Welcome back")
    const initial = await inspectElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
    });

    expect(initial.tagName).toBe('Text');
    expect(initial.textContent).toBe('Welcome back');
    expect(initial.styleSheetKey).toBe('title');
    expect(initial.styles.fontSize).toBe(28);

    // Apply surgical patch to copy and StyleSheet property
    const patched = await patchElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
      text: 'Welcome to Antigravity',
      styles: { fontSize: 30 },
    });

    expect(patched.element.textContent).toBe('Welcome to Antigravity');
    expect(patched.element.styles.fontSize).toBe(30);
    expect(patched.undoAvailable).toBeGreaterThan(0);

    // Undo the patch to restore the exact original file
    const undone = await undoLastPatch(WORKSPACE_ROOT);
    expect(undone.restoredFile).toBe(file);

    const afterUndo = await inspectElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
    });
    expect(afterUndo.textContent).toBe('Welcome back');
    expect(afterUndo.styles.fontSize).toBe(28);

    // Redo and then Undo once more to leave workspace clean
    await redoLastPatch(WORKSPACE_ROOT);
    const afterRedo = await inspectElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
    });
    expect(afterRedo.textContent).toBe('Welcome to Antigravity');

    await undoLastPatch(WORKSPACE_ROOT);
  });

  it('normalizes Expo Router and nested React Navigation route paths for universal screen loading', () => {
    expect(normalizeRouteTarget('/(tabs)/index')).toBe('Home');
    expect(normalizeRouteTarget('/(tabs)/profile')).toBe('Profile');
    expect(normalizeRouteTarget('ProductDetailScreen')).toBe('ProductDetail');

    const syncFiles = discoverScreenFilesSync(WORKSPACE_ROOT);
    expect(syncFiles.length).toBeGreaterThanOrEqual(5);
    expect(syncFiles.some((f) => f.id === 'Home')).toBe(true);
  });
});
