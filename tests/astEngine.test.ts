import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
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
import {
  isLoopbackHostHeader,
  sanitizeLayoutPayload,
  verifyApiRequestSecurity,
} from '../src/server/apiMiddleware';
import { initProject, findAvailablePort } from '../bin/cli.mjs';

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

  it('initializes an external React Native / Expo project via zelune init and finds available ports', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-init-test-'));
    try {
      fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'demo-rn-app', version: '1.0.0', scripts: { start: 'expo start' } }, null, 2)
      );

      const res = initProject(tmpDir, WORKSPACE_ROOT);
      expect(res.screensDir).toBe('app');
      expect(res.updatedPackageJson).toBe(true);

      const updatedPkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8'));
      expect(updatedPkg.scripts.canvas).toBe('zelune');

      const mcpCfg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'mcp_config.json'), 'utf8'));
      expect(mcpCfg.mcpServers.zelune.command).toBe('npx');

      expect(fs.existsSync(path.join(tmpDir, '.agents/skills/zelune/SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'DESIGN.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'PRODUCT.md'))).toBe(true);
      expect(fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8')).toContain('.canvas-layout.json');

      const port = await findAvailablePort(5173);
      expect(port).toBeGreaterThanOrEqual(5173);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('prevents JSX expression / tag code injection when patching <Text> copy and round-trips safely', async () => {
    const file = 'src/screens/LoginScreen.tsx';
    const fullFilePath = path.join(WORKSPACE_ROOT, file);
    const injectionAttempt = '{(() => { globalThis.__injected = true; })()} </Text><Text>';

    const patched = await patchElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
      text: injectionAttempt,
    });

    try {
      const writtenSource = fs.readFileSync(fullFilePath, 'utf8');
      // Must be serialized as a quoted string literal inside JSXExpressionContainer, NOT raw JSX code
      expect(writtenSource).toContain(JSON.stringify(injectionAttempt));
      expect(patched.element.textContent).toBe(injectionAttempt);
      expect(patched.element.hasDynamicText).toBe(false);
    } finally {
      await undoLastPatch(WORKSPACE_ROOT);
    }
  });

  it('blocks symlink escape inside allowed screen directories and rejects dangerous style keys/values', async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-sec-test-'));
    try {
      const screensDir = path.join(tmpProject, 'src/screens');
      fs.mkdirSync(screensDir, { recursive: true });
      const outsideFile = path.join(tmpProject, 'OutsideSecret.tsx');
      fs.writeFileSync(outsideFile, 'export default function Outside() { return null; }\n', 'utf8');

      const symlinkPath = path.join(screensDir, 'SymlinkScreen.tsx');
      fs.symlinkSync(outsideFile, symlinkPath);

      expect(() => resolveSafeScreenPath(tmpProject, 'src/screens/SymlinkScreen.tsx')).toThrow(
        /Security violation/
      );
    } finally {
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }

    await expect(
      patchElement(WORKSPACE_ROOT, {
        file: 'src/screens/LoginScreen.tsx',
        astPath: '4',
        styles: { constructor: 'polluted' },
      })
    ).rejects.toThrow(/Security violation/);

    await expect(
      patchElement(WORKSPACE_ROOT, {
        file: 'src/screens/LoginScreen.tsx',
        astPath: '4',
        styles: { fontSize: Number.NaN },
      })
    ).rejects.toThrow(/Security violation/);
  });

  it('enforces loopback Host, Same-Origin CSRF guards, and layout schema sanitization on /api/* routes', () => {
    expect(isLoopbackHostHeader('127.0.0.1:5173')).toBe(true);
    expect(isLoopbackHostHeader('localhost:5173')).toBe(true);
    expect(isLoopbackHostHeader('[::1]:5173')).toBe(true);
    expect(isLoopbackHostHeader('attacker-rebind.com:5173')).toBe(false);

    // Reject DNS rebinding Host
    expect(
      verifyApiRequestSecurity({
        method: 'GET',
        headers: { host: 'evil.com:5173' },
      }).allowed
    ).toBe(false);

    // Reject cross-site Sec-Fetch-Site
    expect(
      verifyApiRequestSecurity({
        method: 'POST',
        headers: {
          host: '127.0.0.1:5173',
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
        },
      }).allowed
    ).toBe(false);

    // Reject cross-origin Origin header
    expect(
      verifyApiRequestSecurity({
        method: 'POST',
        headers: {
          host: '127.0.0.1:5173',
          origin: 'https://evil.example.com',
          'content-type': 'application/json',
        },
      }).allowed
    ).toBe(false);

    // Reject simple POST without Content-Type: application/json
    expect(
      verifyApiRequestSecurity({
        method: 'POST',
        headers: {
          host: '127.0.0.1:5173',
          origin: 'http://127.0.0.1:5173',
          'content-type': 'text/plain;charset=UTF-8',
        },
      }).allowed
    ).toBe(false);

    // Allow legitimate same-origin loopback POST
    expect(
      verifyApiRequestSecurity({
        method: 'POST',
        headers: {
          host: '127.0.0.1:5173',
          origin: 'http://127.0.0.1:5173',
          'sec-fetch-site': 'same-origin',
          'content-type': 'application/json',
        },
      }).allowed
    ).toBe(true);

    // Layout payload validation
    const cleanLayout = sanitizeLayoutPayload({
      Home: { x: 80, y: 70, width: 393, height: 852 },
    });
    expect(cleanLayout.Home).toEqual({ x: 80, y: 70, width: 393, height: 852 });

    expect(() =>
      sanitizeLayoutPayload({
        Home: { x: 80, y: 70, width: 999999, height: 852 },
      })
    ).toThrow(/Out-of-bounds/);
  });
});
