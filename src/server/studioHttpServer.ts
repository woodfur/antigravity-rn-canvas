import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {
  discoverScreens,
  discoverScreenFilesSync,
  getActiveProjectRoot,
  inspectElement,
  patchElement,
  reorderElement,
  insertElement,
  duplicateElement,
  deleteElement,
  undoLastPatch,
  redoLastPatch,
  getHistoryStatus,
  type PatchPayload,
  type ReorderPayload,
  type InsertElementPayload,
  type DuplicateElementPayload,
  type DeleteElementPayload,
} from './astEngine';
import {
  verifyApiRequestSecurity,
  sanitizeLayoutPayload,
  readJsonBody,
} from './apiMiddleware';
import { compileModuleForBrowser } from './tsxBrowserCompiler';
import { loadProjectTailwindTheme } from './tailwindThemeLoader';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

const REACT_EXPORTS = [
  'Children',
  'Component',
  'Fragment',
  'Profiler',
  'PureComponent',
  'StrictMode',
  'Suspense',
  'cloneElement',
  'createContext',
  'createElement',
  'createFactory',
  'createRef',
  'forwardRef',
  'isValidElement',
  'lazy',
  'memo',
  'startTransition',
  'useCallback',
  'useContext',
  'useDebugValue',
  'useDeferredValue',
  'useEffect',
  'useId',
  'useImperativeHandle',
  'useInsertionEffect',
  'useLayoutEffect',
  'useMemo',
  'useReducer',
  'useRef',
  'useState',
  'useSyncExternalStore',
  'useTransition',
  'version',
];

const REACT_NATIVE_EXPORTS = [
  'View',
  'Text',
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'ScrollView',
  'FlatList',
  'SectionList',
  'VirtualizedList',
  'KeyboardAvoidingView',
  'TextInput',
  'Image',
  'ImageBackground',
  'SafeAreaView',
  'ActivityIndicator',
  'Switch',
  'Modal',
  'Button',
  'RefreshControl',
  'StatusBar',
  'StyleSheet',
  'Platform',
  'Dimensions',
  'useWindowDimensions',
  'PixelRatio',
  'Animated',
  'useAnimatedValue',
  'Easing',
  'Alert',
  'Linking',
  'Share',
  'Vibration',
  'Keyboard',
  'BackHandler',
  'AppState',
  'Appearance',
  'useColorScheme',
  'PanResponder',
  'LayoutAnimation',
  'UIManager',
  'InteractionManager',
  'NativeEventEmitter',
  'DeviceEventEmitter',
  'NativeAppEventEmitter',
  'NativeModules',
  'I18nManager',
  'AccessibilityInfo',
  'LogBox',
  'YellowBox',
  'findNodeHandle',
  'processColor',
  'PermissionsAndroid',
  'ToastAndroid',
  'ActionSheetIOS',
  'InputAccessoryView',
  'DrawerLayoutAndroid',
  'TurboModuleRegistry',
  'requireNativeComponent',
  'codegenNativeComponent',
  'PlatformColor',
  'DynamicColorIOS',
  'DevSettings',
  'Systrace',
  'Networking',
  'Settings',
];

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function sendJs(res: http.ServerResponse, code: string) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(code);
}

function buildReactShimModule(): string {
  const lines = [
    `const R = window.__ZELUNE_RUNTIME__.React;`,
    `export default R;`,
    `export const jsx = R.createElement;`,
    `export const jsxs = R.createElement;`,
    `export const jsxDEV = R.createElement;`,
  ];
  for (const name of REACT_EXPORTS) {
    lines.push(`export const ${name} = R.${name};`);
  }
  return lines.join('\n');
}

function buildReactDomShimModule(): string {
  return [
    `const RD = window.__ZELUNE_RUNTIME__.ReactDOM;`,
    `export default RD;`,
    `export const createRoot = RD.createRoot;`,
    `export const hydrateRoot = RD.hydrateRoot;`,
    `export const flushSync = RD.flushSync;`,
    `export const createPortal = RD.createPortal;`,
  ].join('\n');
}

function buildReactNativeShimModule(): string {
  const lines = [
    `const RN = window.__ZELUNE_RUNTIME__.ReactNative;`,
    `export default RN.default || RN;`,
  ];
  for (const name of REACT_NATIVE_EXPORTS) {
    lines.push(`export const ${name} = RN.${name};`);
  }
  return lines.join('\n');
}

function buildLucideShimModule(requestedNames: string[]): string {
  const lines = [
    `const L = window.__ZELUNE_RUNTIME__.LucideIcons || {};`,
    `const M = window.__ZELUNE_RUNTIME__.MockNav || {};`,
    `export default L;`,
  ];
  const unique = Array.from(
    new Set(
      requestedNames
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== 'default')
    )
  );
  for (const name of unique) {
    lines.push(
      `export const ${name} = L[${JSON.stringify(name)}] || M.createVectorIconComponent(${JSON.stringify(name)});`
    );
  }
  return lines.join('\n');
}

function buildUniversalStubModule(requestedNames: string[]): string {
  const lines = [
    `const React = window.__ZELUNE_RUNTIME__.React;`,
    `const RN = window.__ZELUNE_RUNTIME__.ReactNative;`,
    `const M = window.__ZELUNE_RUNTIME__.MockNav;`,
    `export default M.default || M;`,
    `const COMPOUND_SUB_NAMES = ['Item', 'Header', 'Footer', 'Title', 'Content', 'Trigger', 'Portal', 'Overlay', 'Close', 'Action', 'Cancel', 'Description', 'Label', 'Group', 'Separator', 'Value', 'Icon', 'Viewport', 'Root', 'Screen', 'Navigator', 'Provider', 'Consumer'];`,
    `function createSubStub(displayName) {`,
    `  const Sub = React.forwardRef(function SubComp(props, ref) {`,
    `    const content = typeof props?.children === 'function' ? props.children(M.SAFE_CHAINABLE_PROXY) : props?.children;`,
    `    return React.createElement(RN.View, { style: props?.style, className: props?.className, ref }, content);`,
    `  });`,
    `  Sub.displayName = displayName;`,
    `  return Sub;`,
    `}`,
    `function createComponentStub(displayName) {`,
    `  const Comp = React.forwardRef(function StubComp(props, ref) {`,
    `    if (typeof props?.render === 'function') {`,
    `      return props.render({`,
    `        field: { name: props?.name ?? '', value: props?.defaultValue ?? '', onChange: () => undefined, onBlur: () => undefined, ref: () => undefined },`,
    `        fieldState: { invalid: false, isTouched: false, isDirty: false, error: undefined },`,
    `        formState: { errors: {}, isSubmitting: false, isValid: true },`,
    `      });`,
    `    }`,
    `    const content = typeof props?.children === 'function' ? props.children(M.SAFE_CHAINABLE_PROXY) : props?.children;`,
    `    return React.createElement(RN.View, { style: props?.style, className: props?.className, ref }, content);`,
    `  });`,
    `  Comp.displayName = displayName;`,
    `  for (const sub of COMPOUND_SUB_NAMES) {`,
    `    Comp[sub] = createSubStub(displayName + '.' + sub);`,
    `  }`,
    `  return Comp;`,
    `}`,
    `function resolveExport(name) {`,
    `  if (name in M) return M[name];`,
    `  if (M.default && name in M.default) return M.default[name];`,
    `  if (/^use[A-Z]/.test(name)) return () => M.SAFE_CHAINABLE_PROXY;`,
    `  if (/^[A-Z]/.test(name)) return createComponentStub(name);`,
    `  return M.SAFE_CHAINABLE_PROXY;`,
    `}`,
  ];
  const unique = Array.from(
    new Set(
      requestedNames
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== 'default')
    )
  );
  for (const name of unique) {
    lines.push(`export const ${name} = resolveExport(${JSON.stringify(name)});`);
  }
  return lines.join('\n');
}

async function resolveConnectedProjectName(workspaceRoot: string): Promise<string> {
  const activeRoot = getActiveProjectRoot(workspaceRoot);
  const dirName = path.basename(activeRoot);
  try {
    const appJsonRaw = await fsp.readFile(path.join(activeRoot, 'app.json'), 'utf-8');
    const appJson = JSON.parse(appJsonRaw) as {
      expo?: { name?: string };
      name?: string;
    };
    if (appJson?.expo?.name) return appJson.expo.name;
    if (appJson?.name) return appJson.name;
  } catch {
    // No app.json
  }
  try {
    const pkgRaw = await fsp.readFile(path.join(activeRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { name?: string };
    if (pkg?.name && pkg.name.toLowerCase() !== 'zelune') {
      return pkg.name;
    }
  } catch {
    // Fallback
  }
  return dirName;
}

export interface StudioServerOptions {
  packageRoot: string;
  targetProjectRoot: string;
  workspaceRoot: string;
  port?: number;
}

export async function startStudioHttpServer(
  options: StudioServerOptions
): Promise<{ server: http.Server; port: number }> {
  const { packageRoot, targetProjectRoot, workspaceRoot } = options;
  const distDir = path.resolve(packageRoot, 'dist');
  const allowedRoots = Array.from(
    new Set([
      path.resolve(packageRoot),
      path.resolve(targetProjectRoot),
      path.resolve(workspaceRoot),
    ])
  );

  function isPathAllowed(candidatePath: string): boolean {
    const resolved = path.resolve(candidatePath);
    return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  }

  const requestHandler = async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const rawUrl = req.url ?? '/';
    const qIdx = rawUrl.indexOf('?');
    const pathname = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
    const searchParams = new URLSearchParams(qIdx === -1 ? '' : rawUrl.slice(qIdx + 1));

    // 1. Handle /api/* AST & layout routes
    if (pathname.startsWith('/api/')) {
      const securityCheck = verifyApiRequestSecurity(req);
      if (!securityCheck.allowed) {
        return sendJson(res, 403, { ok: false, error: securityCheck.reason });
      }

      const activeRoot = getActiveProjectRoot(targetProjectRoot);
      const layoutFilePath = path.resolve(activeRoot, '.canvas-layout.json');

      try {
        if (req.method === 'GET' && pathname === '/api/screens') {
          const [screens, projectName] = await Promise.all([
            discoverScreens(targetProjectRoot),
            resolveConnectedProjectName(targetProjectRoot),
          ]);
          const history = getHistoryStatus();
          return sendJson(res, 200, { ok: true, projectName, screens, history });
        }

        if (req.method === 'GET' && pathname === '/api/inspect') {
          const file = searchParams.get('file') ?? '';
          const astPath = searchParams.get('astPath') ?? '';
          const lineParam = searchParams.get('line');
          const line = lineParam ? Number.parseInt(lineParam, 10) : undefined;
          const element = await inspectElement(targetProjectRoot, { file, astPath, line });
          const history = getHistoryStatus();
          return sendJson(res, 200, { ok: true, element, history });
        }

        if (req.method === 'POST' && pathname === '/api/patch') {
          const body = await readJsonBody<PatchPayload>(req);
          const result = await patchElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable,
            },
          });
        }

        if (req.method === 'POST' && pathname === '/api/reorder') {
          const body = await readJsonBody<ReorderPayload>(req);
          const result = await reorderElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable,
            },
          });
        }

        if (req.method === 'POST' && pathname === '/api/insert') {
          const body = await readJsonBody<InsertElementPayload>(req);
          const result = await insertElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable,
            },
          });
        }

        if (req.method === 'POST' && pathname === '/api/duplicate') {
          const body = await readJsonBody<DuplicateElementPayload>(req);
          const result = await duplicateElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable,
            },
          });
        }

        if (req.method === 'POST' && pathname === '/api/delete') {
          const body = await readJsonBody<DeleteElementPayload>(req);
          const result = await deleteElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            deletedAstPath: result.deletedAstPath,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable,
            },
          });
        }

        if (req.method === 'POST' && pathname === '/api/undo') {
          const result = await undoLastPatch(targetProjectRoot);
          return sendJson(res, 200, { ok: true, ...result });
        }

        if (req.method === 'POST' && pathname === '/api/redo') {
          const result = await redoLastPatch(targetProjectRoot);
          return sendJson(res, 200, { ok: true, ...result });
        }

        if (req.method === 'GET' && pathname === '/api/layout') {
          try {
            const raw = await fsp.readFile(layoutFilePath, 'utf-8');
            const validated = sanitizeLayoutPayload(JSON.parse(raw));
            return sendJson(res, 200, { ok: true, layout: validated });
          } catch {
            return sendJson(res, 200, { ok: true, layout: null });
          }
        }

        if (req.method === 'POST' && pathname === '/api/layout') {
          const body = await readJsonBody<Record<string, unknown>>(req);
          const validated = sanitizeLayoutPayload(body);
          await fsp.writeFile(layoutFilePath, JSON.stringify(validated, null, 2), 'utf-8');
          return sendJson(res, 200, { ok: true });
        }

        return sendJson(res, 404, { ok: false, error: `Unknown API route: ${pathname}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return sendJson(res, 400, { ok: false, error: message });
      }
    }

    // 2. Handle /@zelune/shim/* virtual runtime bridges
    if (pathname === '/@zelune/shim/react.js') {
      return sendJs(res, buildReactShimModule());
    }
    if (pathname === '/@zelune/shim/react-dom.js') {
      return sendJs(res, buildReactDomShimModule());
    }
    if (pathname === '/@zelune/shim/react-native.js') {
      return sendJs(res, buildReactNativeShimModule());
    }
    if (pathname === '/@zelune/shim/lucide.js') {
      const exportsParam = searchParams.get('exports') ?? '';
      return sendJs(res, buildLucideShimModule(exportsParam.split(',')));
    }
    if (pathname === '/@zelune/shim/stub.js') {
      const exportsParam = searchParams.get('exports') ?? '';
      return sendJs(res, buildUniversalStubModule(exportsParam.split(',')));
    }

    // 3. Handle /@zelune/module?file=... on-the-fly TSX/TS/JSX compilation
    if (pathname === '/@zelune/module') {
      const fileParam = searchParams.get('file') ?? '';
      if (!fileParam || !isPathAllowed(fileParam) || !fs.existsSync(fileParam)) {
        res.statusCode = 404;
        return res.end('// Module not found\nexport default {};\n');
      }
      try {
        const compiled = compileModuleForBrowser({
          filePath: fileParam,
          targetProjectRoot,
          workspaceRoot,
        });
        return sendJs(res, compiled);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.statusCode = 500;
        return res.end(`throw new Error(${JSON.stringify(msg)});\n`);
      }
    }

    // 4. Handle /@zelune/asset?file=... local image/asset serving
    if (pathname === '/@zelune/asset') {
      const fileParam = searchParams.get('file') ?? '';
      if (!fileParam || !isPathAllowed(fileParam) || !fs.existsSync(fileParam)) {
        res.statusCode = 404;
        return res.end('Not found');
      }
      const ext = path.extname(fileParam).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
      return fs.createReadStream(fileParam).pipe(res);
    }

    // 5. Serve pre-built dist/ Studio files
    if (pathname === '/' || pathname === '/index.html') {
      const indexHtmlPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) {
        res.statusCode = 500;
        return res.end('Zelune dist/index.html not found.');
      }
      const rawHtml = await fsp.readFile(indexHtmlPath, 'utf-8');
      const tailwindTheme = loadProjectTailwindTheme([targetProjectRoot, workspaceRoot]);
      const discoveredManifest = discoverScreenFilesSync(targetProjectRoot);
      const runtimeScript = `<script>window.__ZELUNE_TAILWIND_THEME__ = ${JSON.stringify(
        tailwindTheme
      )}; window.__ZELUNE_SCREEN_MANIFEST__ = ${JSON.stringify(discoveredManifest)};</script>`;
      const injectedHtml = rawHtml.replace('<head>', `<head>\n    ${runtimeScript}`);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(injectedHtml);
    }

    const relativeAsset = pathname.replace(/^\/+/, '');
    const assetCandidate = path.resolve(distDir, relativeAsset);
    if (
      assetCandidate.startsWith(distDir + path.sep) &&
      fs.existsSync(assetCandidate) &&
      fs.statSync(assetCandidate).isFile()
    ) {
      const ext = path.extname(assetCandidate).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
      return fs.createReadStream(assetCandidate).pipe(res);
    }

    res.statusCode = 404;
    res.end('Not found');
  };

  const basePort = options.port ?? 5173;
  for (let offset = 0; offset < 25; offset++) {
    const candidatePort = basePort + offset;
    try {
      const srv = await new Promise<http.Server>((resolve, reject) => {
        const s = http.createServer(requestHandler);
        s.once('error', reject);
        s.listen(candidatePort, '127.0.0.1', () => {
          s.removeListener('error', reject);
          resolve(s);
        });
      });
      return { server: srv, port: candidatePort };
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'EADDRINUSE' && !options.port) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Unable to bind Studio HTTP server starting from port ${basePort}`);
}
