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
  insertElement,
  duplicateElement,
  deleteElement,
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
import { handleMcpJsonRpcRequest, MCP_TOOLS } from '../mcp/server';
import { parse as babelParse } from '@babel/parser';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseTailwindConfigSource } from '../src/server/tailwindThemeLoader';
import { compileModuleForBrowser } from '../src/server/tsxBrowserCompiler';
import {
  buildUniversalStubModule,
  buildLucideShimModule,
} from '../src/server/studioHttpServer';
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
import {
  computeFlowSwimlaneLayout,
  extractFeatureGroupFromPath,
  MAX_COLS_PER_SWIMLANE_ROW,
} from '../src/canvas/flowLayoutEngine';

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

  it('extracts forward and return/back flow wires from TS assertions, template literals, data arrays, and router.back()', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-flows-'));
    try {
      const screensDir = path.join(tmpDir, 'src', 'screens');
      fs.mkdirSync(screensDir, { recursive: true });

      fs.writeFileSync(
        path.join(screensDir, 'HomeScreen.tsx'),
        `
        import React from 'react';
        import { View, Pressable, Text } from 'react-native';
        const QUICK_ACTIONS = [
          { id: 'parts', route: '/(tabs)/parts' },
          { id: 'rides', screen: 'RidesScreen' },
        ];
        export default function HomeScreen({ router, navigation }: any) {
          return (
            <View>
              <Pressable onPress={() => router.push('/(tabs)/marketplace' as any)}>
                <Text>Buy Cars</Text>
              </Pressable>
              <Pressable onPress={() => navigation.navigate('MainTabs', { screen: 'Parts' })}>
                <Text>Spare Parts</Text>
              </Pressable>
            </View>
          );
        }
        `,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(screensDir, 'MarketplaceScreen.tsx'),
        `
        import React from 'react';
        import { View, Pressable, Text } from 'react-native';
        export default function MarketplaceScreen({ router }: any) {
          const id = '123';
          return (
            <View>
              <Pressable onPress={() => router.back()}>
                <Text>← Back</Text>
              </Pressable>
              <Pressable onPress={() => router.push(\`/dealers/\${id}\` as any)}>
                <Text>View Dealer</Text>
              </Pressable>
            </View>
          );
        }
        `,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(screensDir, 'DealerDetailsScreen.tsx'),
        `
        import React from 'react';
        import { View, Pressable, Text } from 'react-native';
        export default function DealerDetailsScreen({ navigation }: any) {
          return (
            <View>
              <Pressable onPress={() => navigation.goBack()}>
                <Text>Back</Text>
              </Pressable>
            </View>
          );
        }
        `,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(screensDir, 'PartsScreen.tsx'),
        `
        import React from 'react';
        import { View, Pressable, Text } from 'react-native';
        export default function PartsScreen({ router }: any) {
          return (
            <View>
              <Pressable onPress={() => router.back()}>
                <Text>Back</Text>
              </Pressable>
            </View>
          );
        }
        `,
        'utf-8'
      );

      fs.writeFileSync(
        path.join(screensDir, 'RidesScreen.tsx'),
        `
        import React from 'react';
        import { View } from 'react-native';
        export default function RidesScreen() {
          return <View />;
        }
        `,
        'utf-8'
      );

      const discovered = await discoverScreens(tmpDir);
      const byId = Object.fromEntries(discovered.map((s) => [s.id, s]));

      // Home connects forward to Marketplace, Parts, Rides
      const homeTargets = byId.Home.outgoingFlows.map((f) => f.toScreen);
      expect(homeTargets).toContain('Marketplace');
      expect(homeTargets).toContain('Parts');
      expect(homeTargets).toContain('Rides');

      // Marketplace connects forward to DealerDetails (from template literal `/dealers/${id}`) and returns to Home (from router.back())
      const marketTargets = byId.Marketplace.outgoingFlows.map((f) => f.toScreen);
      expect(marketTargets).toContain('DealerDetails');
      expect(marketTargets).toContain('Home');
      expect(byId.Marketplace.outgoingFlows.some((f) => f.id.includes(':return'))).toBe(true);

      // DealerDetails returns to Marketplace (from navigation.goBack())
      const dealerTargets = byId.DealerDetails.outgoingFlows.map((f) => f.toScreen);
      expect(dealerTargets).toContain('Marketplace');
      expect(byId.DealerDetails.outgoingFlows.some((f) => f.id.includes(':return'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('inserts new buttons, sections, and inputs with auto-imports, duplicates, deletes, and undoes cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-insert-'));
    try {
      const screensDir = path.join(tmpDir, 'src', 'screens');
      fs.mkdirSync(screensDir, { recursive: true });
      const screenFile = path.join(screensDir, 'DashboardScreen.tsx');
      const baselineCode = [
        "import React from 'react';",
        "import { View, Text } from 'react-native';",
        'export default function DashboardScreen({ navigation }: any) {',
        '  return (',
        '    <View>',
        '      <Text>Dashboard Overview</Text>',
        '    </View>',
        '  );',
        '}',
        '',
      ].join('\n');
      fs.writeFileSync(screenFile, baselineCode, 'utf-8');

      // 1. Insert a Button with navigation target 'Wallet' after <Text> (astPath '1')
      const insertedBtn = await insertElement(tmpDir, {
        file: 'src/screens/DashboardScreen.tsx',
        astPath: '1',
        placement: 'after',
        preset: 'button',
        label: 'Open Wallet',
        navigateTo: 'Wallet',
      });
      expect(insertedBtn.element.tagName).toBe('TouchableOpacity');
      expect(insertedBtn.element.navigationTarget).toBe('Wallet');

      // Verify TouchableOpacity was automatically added to `import { ... } from 'react-native'`
      const afterBtnCode = fs.readFileSync(screenFile, 'utf-8');
      expect(afterBtnCode).toContain('TouchableOpacity');
      expect(afterBtnCode).toMatch(/navigation\.navigate\(['"]Wallet['"]\)/);

      // 2. Insert a Section Card inside root <View> (astPath '0')
      const insertedSection = await insertElement(tmpDir, {
        file: 'src/screens/DashboardScreen.tsx',
        astPath: '0',
        placement: 'inside',
        preset: 'section',
        label: 'Analytics Summary',
      });
      expect(insertedSection.element.tagName).toBe('View');
      expect(fs.readFileSync(screenFile, 'utf-8')).toContain('Analytics Summary');

      // 3. Insert a TextInput (auto-imports TextInput from 'react-native')
      const insertedInput = await insertElement(tmpDir, {
        file: 'src/screens/DashboardScreen.tsx',
        preset: 'input',
        label: 'Search metrics...',
      });
      expect(insertedInput.element.tagName).toBe('TextInput');
      expect(fs.readFileSync(screenFile, 'utf-8')).toContain('TextInput');

      // 4. Duplicate the TextInput
      const duplicated = await duplicateElement(tmpDir, {
        file: 'src/screens/DashboardScreen.tsx',
        astPath: insertedInput.element.astPath,
      });
      expect(duplicated.element.tagName).toBe('TextInput');

      // 5. Delete the duplicated TextInput
      const deleted = await deleteElement(tmpDir, {
        file: 'src/screens/DashboardScreen.tsx',
        astPath: duplicated.element.astPath,
      });
      expect(deleted.deletedAstPath).toBe(duplicated.element.astPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('statically extracts Tailwind theme and theme.extend via AST without eval/new Function', () => {
    const tsConfigSource = `
      import type { Config } from 'tailwindcss';
      const brandPalette = {
        primary: '#0F3460',
        accent: '#10B981',
      } as const;
      const config: Config = {
        content: ['./app/**/*.{ts,tsx}'],
        theme: {
          fontFamily: {
            sans: ['PlusJakartaSans', 'sans-serif'],
          },
          extend: {
            colors: {
              ...brandPalette,
              surface: {
                DEFAULT: '#FFFFFF',
                high: '#F3F4F6',
              },
            },
            borderRadius: {
              card: 20,
            },
          },
        },
      } satisfies Config;
      export default config;
    `;

    const theme = parseTailwindConfigSource(tsConfigSource);
    expect(theme.fontFamily).toEqual({ sans: ['PlusJakartaSans', 'sans-serif'] });
    expect(theme.colors).toEqual({
      primary: '#0F3460',
      accent: '#10B981',
      surface: {
        DEFAULT: '#FFFFFF',
        high: '#F3F4F6',
      },
    });
    expect(theme.borderRadius).toEqual({ card: 20 });
  });

  it('handles JSON-RPC 2.0 MCP initialize, tools/list, and tools/call with zero external SDK dependencies', async () => {
    const initRes = await handleMcpJsonRpcRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    expect(initRes?.id).toBe(1);
    expect((initRes?.result as Record<string, unknown>)?.protocolVersion).toBe('2024-11-05');

    const notifRes = await handleMcpJsonRpcRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(notifRes).toBeNull();

    const listRes = await handleMcpJsonRpcRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    const tools = (listRes?.result as { tools: typeof MCP_TOOLS })?.tools;
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(7);

    const callRes = await handleMcpJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_canvas_screens', arguments: {} },
      },
      WORKSPACE_ROOT
    );
    const content = (callRes?.result as { content: Array<{ type: string; text: string }> })
      ?.content;
    expect(content?.[0]?.type).toBe('text');
    const parsedScreens = JSON.parse(content[0].text);
    expect(Array.isArray(parsedScreens)).toBe(true);
    expect(parsedScreens.length).toBeGreaterThanOrEqual(5);
  });

  it('normalizes React Native styles in zero-dependency reactNativeShim and contains zero Proxy/eval/external-URL triggers', () => {
    const domStyle = RNDefault.StyleSheet.flatten([
      { paddingHorizontal: 16, paddingVertical: 10 },
      { paddingLeft: 24, borderWidth: 1, borderColor: '#6366F1' },
    ]);
    expect(domStyle.paddingHorizontal).toBe(16);
    expect(domStyle.paddingLeft).toBe(24);
    expect(domStyle.borderColor).toBe('#6366F1');

    // Verify zero Proxy or http:// literals inside published runtime & server files
    const filesToCheck = [
      'src/runtime/reactNativeShim.ts',
      'src/runtime/MockNavigationContext.tsx',
      'src/server/apiMiddleware.ts',
      'src/server/astEngine.ts',
      'src/server/tsxBrowserCompiler.ts',
      'src/server/studioHttpServer.ts',
      'src/canvas/flowLayoutEngine.ts',
      'src/canvas/FlowSwimlanesLayer.tsx',
      'src/canvas/FlowArrowsLayer.tsx',
      'src/canvas/CanvasApp.tsx',
      'plugins/viteReactNativeFallbackPlugin.ts',
      'index.html',
    ];
    for (const rel of filesToCheck) {
      const src = fs.readFileSync(path.join(WORKSPACE_ROOT, rel), 'utf-8');
      expect(src).not.toContain('new Proxy');
      expect(src).not.toMatch(/https?:\/\//i);
    }

    // Verify standalone TSX-to-Browser-ESM compiler transpiles all 5 screens into pure JS & preserves nested JSX children
    const screenFiles = [
      'src/screens/LoginScreen.tsx',
      'src/screens/HomeScreen.tsx',
      'src/screens/ProductDetailScreen.tsx',
      'src/screens/CheckoutScreen.tsx',
      'src/screens/ProfileScreen.tsx',
    ];
    for (const screenRel of screenFiles) {
      const compiled = compileModuleForBrowser({
        filePath: path.join(WORKSPACE_ROOT, screenRel),
        targetProjectRoot: WORKSPACE_ROOT,
        workspaceRoot: WORKSPACE_ROOT,
      });
      expect(compiled).toContain('__zeluneReact.createElement');
      expect(compiled).toContain('data-agy-ast-path');
      expect(compiled).toContain('/@zelune/shim/react-native.js');
      // Must parse as 100% pure browser ES module with ZERO TypeScript or JSX plugins enabled
      expect(() => babelParse(compiled, { sourceType: 'module', plugins: [] })).not.toThrow();
    }

    const compiledHome = compileModuleForBrowser({
      filePath: path.join(WORKSPACE_ROOT, 'src/screens/HomeScreen.tsx'),
      targetProjectRoot: WORKSPACE_ROOT,
      workspaceRoot: WORKSPACE_ROOT,
    });
    expect(compiledHome).toContain('Chronos Spatial');
    expect(compiledHome).toContain('Inspect Spec Sheet');

    // Verify runtime dependencies in package.json contain zero install-script or shell-access packages
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(WORKSPACE_ROOT, 'package.json'), 'utf-8')
    ) as { dependencies: Record<string, string> };
    expect(Object.keys(pkgJson.dependencies).sort()).toEqual([
      '@babel/generator',
      '@babel/parser',
      '@babel/types',
    ]);
  });

  it('compiles external Expo/TypeScript screens with nested JSX, optional chaining, type import elision, require() assets, and namespace imports', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zelune-compiler-test-'));
    try {
      fs.mkdirSync(path.join(tmpRoot, 'src/types'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'src/screens'), { recursive: true });
      fs.mkdirSync(path.join(tmpRoot, 'assets'), { recursive: true });

      fs.writeFileSync(path.join(tmpRoot, 'assets/hero.png'), 'PNGDATA', 'utf-8');
      fs.writeFileSync(
        path.join(tmpRoot, 'src/types/models.ts'),
        [
          'export interface Vehicle { id: string; title: string; }',
          'export type Dealer = { name?: string };',
          "export const CURRENCY = 'SLE';",
        ].join('\n'),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tmpRoot, 'src/types/index.ts'),
        [
          "export { Vehicle, Dealer, CURRENCY } from './models';",
          "export type * from './models';",
        ].join('\n'),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tmpRoot, 'src/screens/MarketplaceScreen.tsx'),
        [
          "import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';",
          "import * as Haptics from 'expo-haptics';",
          "import * as Icons from 'lucide-react-native';",
          "import { Vehicle, Dealer, CURRENCY } from '../types';",
          '',
          'class PriceFormatter {',
          "  constructor(private readonly prefix: string = 'Le ') {}",
          '  format(this: PriceFormatter, amount: number): string {',
          '    return `${this.prefix}${amount}`;',
          '  }',
          '}',
          '',
          'export default function MarketplaceScreen({ dealer, onSelect }: { dealer?: Dealer; onSelect?: (id: string) => void }) {',
          '  const items: Vehicle[] = [{ id: "v1", title: "Land Cruiser" }];',
          '  const dealerLabel = dealer?.name?.toUpperCase() ?? "Verified Seller";',
          '  const formatter = new PriceFormatter();',
          '  return (',
          '    <ScrollView>',
          '      <View className="p-4">',
          '        <Image source={require("../../assets/hero.png")} style={{ width: 120, height: 80 }} />',
          '        <Icons.Car size={20} />',
          '        <Text>{dealerLabel}</Text>',
          '        <Text>{formatter.format(2500)} {CURRENCY}</Text>',
          '        <TouchableOpacity onPress={() => { Haptics.selectionAsync(); onSelect?.(items[0].id); }}>',
          '          <Text>Explore Inventory</Text>',
          '        </TouchableOpacity>',
          '      </View>',
          '    </ScrollView>',
          '  );',
          '}',
        ].join('\n'),
        'utf-8'
      );

      const compiledModels = compileModuleForBrowser({
        filePath: path.join(tmpRoot, 'src/types/models.ts'),
        targetProjectRoot: tmpRoot,
        workspaceRoot: tmpRoot,
      });
      const compiledBarrel = compileModuleForBrowser({
        filePath: path.join(tmpRoot, 'src/types/index.ts'),
        targetProjectRoot: tmpRoot,
        workspaceRoot: tmpRoot,
      });
      const compiledScreen = compileModuleForBrowser({
        filePath: path.join(tmpRoot, 'src/screens/MarketplaceScreen.tsx'),
        targetProjectRoot: tmpRoot,
        workspaceRoot: tmpRoot,
      });

      // Pure JS syntax check on all 3 compiled modules
      expect(() => babelParse(compiledModels, { sourceType: 'module', plugins: [] })).not.toThrow();
      expect(() => babelParse(compiledBarrel, { sourceType: 'module', plugins: [] })).not.toThrow();
      expect(() => babelParse(compiledScreen, { sourceType: 'module', plugins: [] })).not.toThrow();

      // Type-only bindings Vehicle and Dealer must be elided from both barrel and screen
      expect(compiledBarrel).not.toContain('Vehicle');
      expect(compiledBarrel).not.toContain('Dealer');
      expect(compiledBarrel).toContain('CURRENCY');
      expect(compiledScreen).not.toContain('Vehicle');
      expect(compiledScreen).not.toContain('Dealer');
      expect(compiledScreen).toContain('CURRENCY');

      // Optional chaining (`?.`), constructor parameter assignment, require() asset, namespace icon export, and nested children must all be preserved
      expect(compiledScreen).toContain('dealer?.name?.toUpperCase()');
      expect(compiledScreen).toContain('onSelect?.(');
      expect(compiledScreen).toContain('this.prefix = prefix');
      expect(compiledScreen).toContain('/@zelune/asset?file=');
      expect(compiledScreen).toContain('exports=Car');
      expect(compiledScreen).toContain('Explore Inventory');

      // Stub and Lucide virtual module builders must also emit valid ES modules
      const stubJs = buildUniversalStubModule(['selectionAsync', 'CustomNativeWidget']);
      const lucideJs = buildLucideShimModule(['Car', 'NonExistentFutureIcon']);
      expect(() => babelParse(stubJs, { sourceType: 'module', plugins: [] })).not.toThrow();
      expect(() => babelParse(lucideJs, { sourceType: 'module', plugins: [] })).not.toThrow();
      expect(stubJs).toContain('export const selectionAsync');
      expect(stubJs).toContain('export const useNavigation');

      // Verify React Native shim renders nested elements to HTML markup cleanly
      const html = renderToStaticMarkup(
        React.createElement(
          RNDefault.ScrollView,
          null,
          React.createElement(
            RNDefault.View,
            { style: { padding: 16 } },
            React.createElement(RNDefault.Text, null, 'Explore Inventory')
          )
        )
      );
      expect(html).toContain('Explore Inventory');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('organizes discovered screens into clean User Flow Swimlanes with cycle-safe left-to-right BFS ordering', async () => {
    // 1. Edge cases: 0 screens & 1 screen
    const emptyResult = computeFlowSwimlaneLayout([]);
    expect(emptyResult.flows).toEqual([]);
    expect(emptyResult.positions).toEqual({});

    const singleResult = computeFlowSwimlaneLayout([
      {
        id: 'Home',
        title: 'Home',
        filePath: 'src/screens/HomeScreen.tsx',
        outgoingFlows: [],
      },
    ]);
    expect(singleResult.flows).toHaveLength(1);
    expect(singleResult.flows[0].screenIds).toEqual(['Home']);
    expect(singleResult.positions.Home).toBeDefined();

    // 2. Real 5-screen workspace discovery: Auth, Shopping & Checkout (Home -> ProductDetail -> Checkout), Account & Profile
    const workspaceScreens = await discoverScreens(WORKSPACE_ROOT);
    const wsLayout = computeFlowSwimlaneLayout(workspaceScreens);

    expect(wsLayout.flows.map((f) => f.title)).toEqual([
      'Authentication',
      'Home → Checkout',
      'Account & Profile',
    ]);
    expect(wsLayout.flows[0].screenIds).toEqual(['Login']);
    expect(wsLayout.flows[1].screenIds).toEqual(['Home', 'ProductDetail', 'Checkout']);
    expect(wsLayout.flows[2].screenIds).toEqual(['Profile']);

    // Verify strict left-to-right ordering on the exact same horizontal row for Shopping & Checkout Flow
    expect(wsLayout.positions.Home.y).toBe(wsLayout.positions.ProductDetail.y);
    expect(wsLayout.positions.ProductDetail.y).toBe(wsLayout.positions.Checkout.y);
    expect(wsLayout.positions.Home.x).toBeLessThan(wsLayout.positions.ProductDetail.x);
    expect(wsLayout.positions.ProductDetail.x).toBeLessThan(wsLayout.positions.Checkout.x);

    // Verify vertical lane separation: Auth row above Shopping row above Account row
    expect(wsLayout.positions.Login.y).toBeLessThan(wsLayout.positions.Home.y);
    expect(wsLayout.positions.Home.y).toBeLessThan(wsLayout.positions.Profile.y);

    // 3. Expo Router path extraction ignores navigation shells like (tabs) while honoring feature folders
    expect(extractFeatureGroupFromPath('app/(tabs)/index.tsx')).toBeNull();
    expect(extractFeatureGroupFromPath('app/(auth)/login.tsx')).toEqual({
      slug: 'auth',
      label: 'Auth',
    });
    expect(extractFeatureGroupFromPath('app/marketplace/[id].tsx')).toEqual({
      slug: 'marketplace',
      label: 'Marketplace',
    });

    // 4. Complex 14-screen Expo Router + cyclic edges + >6 screen flow wrapping + standalone orphans
    const makeEdge = (fromScreen: string, toScreen: string, triggerLabel = 'Continue') => ({
      id: `${fromScreen}->${toScreen}:1`,
      fromScreen,
      toScreen,
      triggerLabel,
      line: 1,
    });

    const complexScreens = [
      { id: 'Welcome', title: 'Welcome', filePath: 'app/(auth)/welcome.tsx', outgoingFlows: [makeEdge('Welcome', 'Login')] },
      { id: 'Login', title: 'Login', filePath: 'app/(auth)/login.tsx', outgoingFlows: [makeEdge('Login', 'OtpVerify'), makeEdge('Login', 'Home')] },
      { id: 'OtpVerify', title: 'OtpVerify', filePath: 'app/(auth)/otp.tsx', outgoingFlows: [makeEdge('OtpVerify', 'Home')] },
      { id: 'Home', title: 'Home', filePath: 'app/(tabs)/index.tsx', outgoingFlows: [makeEdge('Home', 'Marketplace'), makeEdge('Home', 'Wallet')] },
      // 7-step Marketplace flow with a cycle (OrderTracking -> Marketplace) to verify cycle-safety & 6-col row wrapping
      { id: 'Marketplace', title: 'Marketplace', filePath: 'app/(tabs)/marketplace.tsx', outgoingFlows: [makeEdge('Marketplace', 'SearchFilters'), makeEdge('Marketplace', 'VehicleDetail')] },
      { id: 'SearchFilters', title: 'SearchFilters', filePath: 'app/marketplace/filters.tsx', outgoingFlows: [makeEdge('SearchFilters', 'VehicleDetail')] },
      { id: 'VehicleDetail', title: 'VehicleDetail', filePath: 'app/marketplace/[id].tsx', outgoingFlows: [makeEdge('VehicleDetail', 'DealerProfile'), makeEdge('VehicleDetail', 'OfferSheet')] },
      { id: 'DealerProfile', title: 'DealerProfile', filePath: 'app/marketplace/dealer.tsx', outgoingFlows: [makeEdge('DealerProfile', 'VehicleDetail')] },
      { id: 'OfferSheet', title: 'OfferSheet', filePath: 'app/marketplace/offer.tsx', outgoingFlows: [makeEdge('OfferSheet', 'EscrowCheckout')] },
      { id: 'EscrowCheckout', title: 'EscrowCheckout', filePath: 'app/marketplace/checkout.tsx', outgoingFlows: [makeEdge('EscrowCheckout', 'OrderTracking')] },
      { id: 'OrderTracking', title: 'OrderTracking', filePath: 'app/marketplace/tracking.tsx', outgoingFlows: [makeEdge('OrderTracking', 'Marketplace')] },
      // Wallet feature folder flow
      { id: 'Wallet', title: 'Wallet', filePath: 'app/wallet/index.tsx', outgoingFlows: [makeEdge('Wallet', 'SendMoney')] },
      { id: 'SendMoney', title: 'SendMoney', filePath: 'app/wallet/send.tsx', outgoingFlows: [] },
      // Standalone unlinked utility screen + Account screen
      { id: 'LegalTerms', title: 'LegalTerms', filePath: 'app/legal.tsx', outgoingFlows: [] },
      { id: 'Settings', title: 'Settings', filePath: 'app/(tabs)/settings.tsx', outgoingFlows: [makeEdge('Settings', 'Login', 'Sign Out')] },
    ];

    const complexLayout = computeFlowSwimlaneLayout(complexScreens);
    expect(complexLayout.orderedScreens).toHaveLength(complexScreens.length);

    const marketFlow = complexLayout.flows.find((f) => f.id === 'flow-marketplace');
    expect(marketFlow).toBeDefined();
    expect(marketFlow!.title).toBe('Marketplace');
    expect(marketFlow!.screenIds).toHaveLength(7);
    expect(marketFlow!.screenIds[0]).toBe('Marketplace');
    expect(MAX_COLS_PER_SWIMLANE_ROW).toBe(6);
    // 7th screen wraps cleanly to a second sub-row below the first 6 screens
    expect(complexLayout.positions[marketFlow!.screenIds[6]].y).toBeGreaterThan(
      complexLayout.positions[marketFlow!.screenIds[0]].y
    );

    const utilityFlow = complexLayout.flows.find((f) => f.id === 'flow-utility');
    expect(utilityFlow?.screenIds).toEqual(['LegalTerms']);
  });
});
