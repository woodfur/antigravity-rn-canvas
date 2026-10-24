import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverScreens,
  discoverScreenFilesSync,
  findMobileAppRoot,
  normalizeRouteTarget,
  inspectElement,
  patchElement,
  reorderElement,
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
import { viteVirtualScreensPlugin } from '../plugins/viteVirtualScreensPlugin';
import { viteReactNativeFallbackPlugin } from '../plugins/viteReactNativeFallbackPlugin';
import DefaultShim, {
  create,
  useQuery,
  createClient,
  Ionicons,
  z,
  useForm,
  Controller,
  zodResolver,
  SAFE_CHAINABLE_PROXY,
  SAFE_CONTEXT_FALLBACK,
} from '../src/runtime/MockNavigationContext';
import RNDefault, {
  PermissionsAndroid,
  ToastAndroid,
  PlatformColor,
  requireNativeComponent,
  Dimensions,
  useWindowDimensions,
} from '../src/runtime/reactNativeShim';
import { resolveTailwindClassNameToStyle } from '../src/runtime/nativewindShim';

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

  it('reorders Flexbox sibling JSX elements in the AST and restores cleanly on undo', async () => {
    const file = 'src/screens/LoginScreen.tsx';

    // In LoginScreen.tsx, astPath '4' is the title <Text> ("Welcome back") and astPath '5' is the subtitle <Text>
    const beforeTitle = await inspectElement(WORKSPACE_ROOT, { file, astPath: '4' });
    expect(beforeTitle.textContent).toBe('Welcome back');

    const reordered = await reorderElement(WORKSPACE_ROOT, {
      file,
      astPath: '4',
      direction: 'down',
    });

    try {
      // After moving down past its sibling, the moved title element now has astPath '5'
      expect(reordered.element.astPath).toBe('5');
      expect(reordered.element.textContent).toBe('Welcome back');
    } finally {
      await undoLastPatch(WORKSPACE_ROOT);
    }

    const restoredTitle = await inspectElement(WORKSPACE_ROOT, { file, astPath: '4' });
    expect(restoredTitle.textContent).toBe('Welcome back');
  });

  it('automatically detects nested React Native / Expo apps when run from a top-level parent directory', async () => {
    const tmpMonorepo = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-monorepo-test-'));
    try {
      const nestedMobile = path.join(tmpMonorepo, 'apps', 'mobile');
      const nestedScreensDir = path.join(nestedMobile, 'src', 'screens');
      fs.mkdirSync(nestedScreensDir, { recursive: true });
      fs.writeFileSync(
        path.join(nestedMobile, 'app.json'),
        JSON.stringify({ expo: { name: 'NestedMobileApp' } }, null, 2),
        'utf8'
      );
      fs.writeFileSync(
        path.join(nestedScreensDir, 'DashboardScreen.tsx'),
        `import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function DashboardScreen() { return <View><Text>Nested</Text></View>; }\n`,
        'utf8'
      );

      const detectedRoot = findMobileAppRoot(tmpMonorepo);
      expect(fs.realpathSync(detectedRoot)).toBe(fs.realpathSync(nestedMobile));

      const discovered = await discoverScreens(tmpMonorepo);
      expect(discovered.map((s) => s.id)).toContain('Dashboard');

      const initRes = initProject(tmpMonorepo, WORKSPACE_ROOT);
      expect(fs.realpathSync(initRes.mobileRoot)).toBe(fs.realpathSync(nestedMobile));
      expect(initRes.screensDir).toBe('apps/mobile/src/screens');
    } finally {
      fs.rmSync(tmpMonorepo, { recursive: true, force: true });
    }
  });

  it('isolates screen modules with dynamic import() and synthesizes named export stubs for Expo/RN native modules', () => {
    expect(normalizeRouteTarget('/(tabs)/loans/[id]')).toBe('LoansById');

    const virtualPlugin = viteVirtualScreensPlugin(WORKSPACE_ROOT) as {
      resolveId: (id: string) => string | null;
      load: (id: string) => string | null;
    };
    const resolvedId = virtualPlugin.resolveId('virtual:zelune-screens');
    expect(resolvedId).toBeTruthy();
    const virtualCode = virtualPlugin.load(resolvedId!);
    expect(virtualCode).toContain('createIsolatedScreenComponent');
    expect(virtualCode).toContain('(attempt) => import(/* @vite-ignore */ "/@fs/');

    const tmpScreenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-fallback-test-'));
    try {
      const sampleScreen = path.join(tmpScreenDir, 'CameraScreen.tsx');
      // Deliberately omit semicolons (Prettier semi: false) across multiple imports
      fs.writeFileSync(
        sampleScreen,
        [
          `import { View, Text, PermissionsAndroid, useAnimatedValue } from 'react-native'`,
          `import { useRouter, useLocalSearchParams, CustomFutureHook } from 'expo-router'`,
          `import { CameraView, useCameraPermissions } from 'expo-camera'`,
          `import { Home, FutureLucideIcon999 } from 'lucide-react-native'`,
          `import { MissingHelper } from './unbuilt/generated'`,
          `export { ReExportedSymbol } from 'react-native-Uninstalled-pkg'`,
        ].join('\n'),
        'utf8'
      );

      const fallbackPlugin = viteReactNativeFallbackPlugin(
        tmpScreenDir,
        path.join(WORKSPACE_ROOT, 'src/runtime/MockNavigationContext.tsx'),
        tmpScreenDir
      ) as {
        resolveId: (source: string, importer?: string) => string | null;
        load: (id: string) => string | null;
      };

      // 1. Semicolon-free multiline import extraction for expo-camera
      const cameraStubId = fallbackPlugin.resolveId('expo-camera', sampleScreen);
      expect(cameraStubId).toContain('virtual:zelune-native-stub:');
      const cameraStubCode = fallbackPlugin.load(cameraStubId!);
      expect(cameraStubCode).toContain('export const CameraView =');
      expect(cameraStubCode).toContain('export const useCameraPermissions =');

      // 2. Semicolon-free multiline import extraction for expo-router (re-exports KnownShims + synthesizes CustomFutureHook)
      const routerStubId = fallbackPlugin.resolveId('expo-router', sampleScreen);
      expect(routerStubId).toContain('virtual:zelune-native-stub:');
      const routerStubCode = fallbackPlugin.load(routerStubId!);
      expect(routerStubCode).toContain('export * from');
      expect(routerStubCode).toContain('export const CustomFutureHook =');

      // 3. lucide-react-native synthesizes fallback icon for FutureLucideIcon999
      const lucideStubId = fallbackPlugin.resolveId('lucide-react-native', sampleScreen);
      expect(lucideStubId).toContain('virtual:zelune-lucide-stub:');
      const lucideStubCode = fallbackPlugin.load(lucideStubId!);
      expect(lucideStubCode).toContain("export * from 'lucide-react';");
      expect(lucideStubCode).toContain('export const FutureLucideIcon999 =');

      // 4. react-native resolves to reactNativeShim.ts and deep subpath resolves to virtual stub
      const rnResolved = fallbackPlugin.resolveId('react-native', sampleScreen);
      expect(rnResolved).toContain('reactNativeShim.ts');
      const rnSubpathResolved = fallbackPlugin.resolveId(
        'react-native/Libraries/Utilities/codegenNativeComponent',
        sampleScreen
      );
      expect(rnSubpathResolved).toContain('virtual:zelune-native-stub:');

      // 5. Missing relative local file in target project falls back to virtual stub instead of crashing (even when Vite injects ?import&)
      const missingRelStubId = fallbackPlugin.resolveId('./unbuilt/generated', sampleScreen);
      expect(missingRelStubId).toContain('virtual:zelune-native-stub:');
      const missingRelWithImportQuery = missingRelStubId!.replace('?exports=', '?import&exports=');
      const missingRelStubCode = fallbackPlugin.load(missingRelWithImportQuery);
      expect(missingRelStubCode).toContain('export const MissingHelper =');

      // 6. Barrel export { ... } from '...' extraction
      const reExportStubId = fallbackPlugin.resolveId('react-native-Uninstalled-pkg', sampleScreen);
      const reExportStubCode = fallbackPlugin.load(reExportStubId!);
      expect(reExportStubCode).toContain('export const ReExportedSymbol =');
    } finally {
      fs.rmSync(tmpScreenDir, { recursive: true, force: true });
    }

    // 7. Verify callable DefaultShim (for default-imported icons/components) + Zustand/ReactQuery/Supabase/RN shims
    expect(typeof DefaultShim).toBe('function');
    const iconElement = (DefaultShim as unknown as (p: Record<string, unknown>) => unknown)({
      name: 'home',
      size: 20,
    });
    expect(iconElement).toBeTruthy();
    expect(DefaultShim.Ionicons).toBe(Ionicons);

    const useCurriedStore = (
      create as () => (init: (set: (p: unknown) => void) => { count: number }) => (
        sel?: (s: { count: number }) => unknown
      ) => unknown
    )()(
      () => ({ count: 42 })
    );
    expect(useCurriedStore((s) => s.count)).toBe(42);
    expect(useQuery().status).toBe('success');
    expect(typeof createClient().from).toBe('function');

    expect(PermissionsAndroid.RESULTS.GRANTED).toBe('granted');
    expect(ToastAndroid.SHORT).toBe(2000);
    expect(PlatformColor('systemBackground')).toBe('#0F172A');
    expect(typeof requireNativeComponent('RCTCustomMapView')).toBe('function');
    expect(RNDefault.PermissionsAndroid).toBe(PermissionsAndroid);

    // 8. Verify Zod unlimited chaining (z.string().email().min(8).max(32)), React Hook Form, and Unmounted Context Fallback
    const signupSchema = (z as Record<string, (...a: unknown[]) => unknown>).object({
      email: (
        (z as Record<string, () => Record<string, (...a: unknown[]) => unknown>>).string() as Record<
          string,
          (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>
        >
      )
        .email('Invalid email')
        .min(5),
      password: (
        (z as Record<string, () => Record<string, (...a: unknown[]) => unknown>>).string() as Record<
          string,
          (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>
        >
      )
        .min(8)
        .max(32)
        .optional(),
    }) as Record<string, (v: unknown) => { success: boolean; data: unknown }>;
    expect(signupSchema.safeParse({ email: 'test@example.com' }).success).toBe(true);
    expect(typeof zodResolver()).toBe('function');

    const form = useForm({ defaultValues: { email: 'alex@example.com' } });
    expect(form.getValues('email')).toBe('alex@example.com');
    expect(form.formState.isValid).toBe(true);
    const controllerNode = Controller({
      name: 'email',
      defaultValue: 'alex@example.com',
      render: ({ field }) => field.value as React.ReactNode,
    });
    expect(controllerNode).toBeTruthy();

    // Unmounted user context created via React.createContext(undefined) or React.createContext(null)
    // automatically receives SAFE_CONTEXT_FALLBACK as its default value so useAuth() never throws
    const AuthContextUndefined = React.createContext<Record<string, unknown> | undefined>(undefined);
    const AuthContextNull = React.createContext<Record<string, unknown> | null>(null);
    const defaultValUndefined = (AuthContextUndefined as unknown as { _currentValue: Record<string, unknown> })._currentValue;
    const defaultValNull = (AuthContextNull as unknown as { _currentValue: Record<string, unknown> })._currentValue;
    expect(defaultValUndefined).toBe(SAFE_CONTEXT_FALLBACK);
    expect(defaultValNull).toBe(SAFE_CONTEXT_FALLBACK);
    expect(defaultValUndefined.isAuthenticated).toBe(true);
    expect(defaultValUndefined.isLoading).toBe(false);
    expect((defaultValUndefined.user as Record<string, unknown>).name).toBe('Alex Morgan');
    expect(typeof SAFE_CHAINABLE_PROXY).toBe('function');

    // 9. Verify NativeWind className -> style compiler & pinned 393x852 mobile Dimensions
    expect(Dimensions.get('window').width).toBe(393);
    expect(Dimensions.get('window').height).toBe(852);
    expect(useWindowDimensions().width).toBe(393);

    const twStyle = resolveTailwindClassNameToStyle(
      'flex-row items-center justify-between p-4 rounded-2xl bg-surface-container-high text-title-sm font-headline text-primary bg-primary/10 w-32 h-32'
    );
    expect(twStyle).toBeTruthy();
    expect(twStyle?.flexDirection).toBe('row');
    expect(twStyle?.alignItems).toBe('center');
    expect(twStyle?.justifyContent).toBe('space-between');
    expect(twStyle?.padding).toBe(16);
    expect(twStyle?.borderRadius).toBe(24);
    expect(twStyle?.fontSize).toBe(14);
    expect(twStyle?.fontWeight).toBe('700');
    expect(twStyle?.color).toBe('#0F3460');
    expect(twStyle?.backgroundColor).toBe('rgba(15, 52, 96, 0.1)');
    expect(twStyle?.width).toBe(128);
    expect(twStyle?.height).toBe(128);
  });
});
