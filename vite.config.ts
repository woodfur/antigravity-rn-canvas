import { parse } from '@babel/parser';
import { build, defineConfig, loadEnv } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteVirtualScreensPlugin } from './plugins/viteVirtualScreensPlugin';
import { viteReactNativeFallbackPlugin } from './plugins/viteReactNativeFallbackPlugin';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';
import { findMobileAppRoot } from './src/server/astEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawTargetRoot = process.env.ANTIGRAVITY_TARGET_PROJECT
  ? path.resolve(process.env.ANTIGRAVITY_TARGET_PROJECT)
  : __dirname;

const workspaceRoot = process.env.ANTIGRAVITY_WORKSPACE_ROOT
  ? path.resolve(process.env.ANTIGRAVITY_WORKSPACE_ROOT)
  : rawTargetRoot;

const targetProjectRoot = findMobileAppRoot(rawTargetRoot);
const mockNavShimPath = path.resolve(__dirname, 'src/runtime/MockNavigationContext.tsx');
const reactNativeShimPath = path.resolve(__dirname, 'src/runtime/reactNativeShim.ts');

function safeRealpath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function resolvePackageRootDir(pkgName: string): string {
  try {
    const pkgJsonUrl = import.meta.resolve(`${pkgName}/package.json`);
    return path.dirname(fileURLToPath(pkgJsonUrl));
  } catch {
    return pkgName;
  }
}

const resolvedReactDir = resolvePackageRootDir('react');
const resolvedReactDomDir = resolvePackageRootDir('react-dom');
const resolvedLucideDir = resolvePackageRootDir('lucide-react');

function loadPublicProjectEnv(roots: string[]): Record<string, string> {
  const publicEnv: Record<string, string> = {
    NODE_ENV: 'development',
    EXPO_PUBLIC_PLATFORM: 'web',
  };
  const uniqueRoots = Array.from(new Set(roots.map((r) => path.resolve(r))));

  for (const rootDir of uniqueRoots) {
    try {
      const loaded = loadEnv('development', rootDir, ['EXPO_PUBLIC_', 'NEXT_PUBLIC_', 'VITE_']);
      Object.assign(publicEnv, loaded);
    } catch {
      // Ignore unreadable env directories
    }
  }
  return publicEnv;
}

const publicProjectEnv = loadPublicProjectEnv([workspaceRoot, rawTargetRoot, targetProjectRoot]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStaticAstValue(node: any, scope: Map<string, unknown>, depth = 0): unknown {
  if (!node || depth > 12) return undefined;

  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'UnaryExpression': {
      const arg = extractStaticAstValue(node.argument, scope, depth + 1);
      if (typeof arg === 'number') {
        if (node.operator === '-') return -arg;
        if (node.operator === '+') return +arg;
      }
      return undefined;
    }
    case 'TemplateLiteral': {
      if (Array.isArray(node.expressions) && node.expressions.length === 0) {
        return node.quasis?.[0]?.value?.cooked ?? node.quasis?.[0]?.value?.raw ?? '';
      }
      return undefined;
    }
    case 'ArrayExpression': {
      const items: unknown[] = [];
      for (const el of node.elements ?? []) {
        if (!el) continue;
        if (el.type === 'SpreadElement') {
          const spreadVal = extractStaticAstValue(el.argument, scope, depth + 1);
          if (Array.isArray(spreadVal)) items.push(...spreadVal);
        } else {
          const val = extractStaticAstValue(el, scope, depth + 1);
          if (val !== undefined) items.push(val);
        }
      }
      return items;
    }
    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};
      for (const prop of node.properties ?? []) {
        if (prop.type === 'SpreadElement') {
          const spreadObj = extractStaticAstValue(prop.argument, scope, depth + 1);
          if (spreadObj && typeof spreadObj === 'object' && !Array.isArray(spreadObj)) {
            Object.assign(result, spreadObj);
          }
          continue;
        }
        if (prop.type !== 'ObjectProperty' || prop.computed) continue;
        const key =
          prop.key?.type === 'Identifier'
            ? prop.key.name
            : prop.key?.type === 'StringLiteral' || prop.key?.type === 'NumericLiteral'
              ? String(prop.key.value)
              : null;
        if (!key) continue;
        const val = extractStaticAstValue(prop.value, scope, depth + 1);
        if (val !== undefined) {
          result[key] = val;
        }
      }
      return result;
    }
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'ParenthesizedExpression':
      return extractStaticAstValue(node.expression, scope, depth + 1);
    case 'Identifier':
      return scope.get(node.name);
    default:
      return undefined;
  }
}

export function parseTailwindConfigSource(raw: string): Record<string, unknown> {
  try {
    const ast = parse(raw, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });

    const scope = new Map<string, unknown>();
    let exportedConfig: unknown;

    for (const stmt of ast.program.body) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.id.type === 'Identifier' && decl.init) {
            const val = extractStaticAstValue(decl.init, scope);
            if (val !== undefined) {
              scope.set(decl.id.name, val);
            }
          }
        }
      } else if (stmt.type === 'ExportDefaultDeclaration') {
        exportedConfig = extractStaticAstValue(stmt.declaration, scope);
      } else if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'AssignmentExpression'
      ) {
        const left = stmt.expression.left;
        if (
          left.type === 'MemberExpression' &&
          left.object.type === 'Identifier' &&
          left.property.type === 'Identifier' &&
          ((left.object.name === 'module' && left.property.name === 'exports') ||
            (left.object.name === 'exports' && left.property.name === 'default'))
        ) {
          exportedConfig = extractStaticAstValue(stmt.expression.right, scope);
        }
      }
    }

    const cfg = exportedConfig as
      | { theme?: Record<string, unknown> & { extend?: Record<string, unknown> } }
      | undefined;

    if (cfg?.theme && typeof cfg.theme === 'object') {
      const baseTheme = { ...cfg.theme };
      const extendTheme =
        cfg.theme.extend && typeof cfg.theme.extend === 'object' ? cfg.theme.extend : {};
      delete baseTheme.extend;
      const merged: Record<string, unknown> = { ...baseTheme };
      for (const [k, v] of Object.entries(extendTheme)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          merged[k] = {
            ...((baseTheme[k] as Record<string, unknown>) ?? {}),
            ...(v as Record<string, unknown>),
          };
        } else {
          merged[k] = v;
        }
      }
      return merged;
    }
  } catch {
    // Ignore tailwind config parse errors
  }
  return {};
}

function loadProjectTailwindTheme(roots: string[]): Record<string, unknown> {
  const candidates = [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts',
  ];
  const uniqueRoots = Array.from(new Set(roots.map((r) => path.resolve(r))));
  for (const rootDir of uniqueRoots) {
    for (const fileName of candidates) {
      const fullPath = path.join(rootDir, fileName);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsedTheme = parseTailwindConfigSource(raw);
        if (Object.keys(parsedTheme).length > 0) {
          return parsedTheme;
        }
      } catch {
        // Ignore unreadable tailwind config files
      }
    }
  }
  return {};
}

const projectTailwindTheme = loadProjectTailwindTheme([
  targetProjectRoot,
  rawTargetRoot,
  workspaceRoot,
]);

const allowedFsRoots = Array.from(
  new Set([
    __dirname,
    safeRealpath(__dirname),
    workspaceRoot,
    safeRealpath(workspaceRoot),
    rawTargetRoot,
    safeRealpath(rawTargetRoot),
    targetProjectRoot,
    safeRealpath(targetProjectRoot),
  ])
);

export default defineConfig({
  plugins: [
    {
      name: 'vite-zelune-process-env-shim',
      transformIndexHtml(html) {
        const serializedEnv = JSON.stringify(publicProjectEnv);
        const serializedTailwindTheme = JSON.stringify(projectTailwindTheme);
        const envScript = `<script>window.__ZELUNE_TAILWIND_THEME__ = ${serializedTailwindTheme}; window.__ZELUNE_PUBLIC_ENV__ = ${serializedEnv};</script>`;
        return html.replace('<head>', `<head>\n    ${envScript}`);
      },
      async closeBundle() {
        await build({
          configFile: false,
          css: { postcss: {} },
          logLevel: 'silent',
          build: {
            ssr: path.resolve(__dirname, 'mcp/server.ts'),
            outDir: path.resolve(__dirname, 'mcp'),
            emptyOutDir: false,
            minify: false,
            rollupOptions: {
              external: [/^node:/, /^@babel\//],
              output: {
                format: 'es',
                entryFileNames: 'server.mjs',
              },
            },
          },
        });
      },
    },
    viteReactNativeFallbackPlugin(targetProjectRoot, mockNavShimPath, workspaceRoot),
    viteVirtualScreensPlugin(targetProjectRoot),
    viteRnSourceInject(targetProjectRoot),
    viteCanvasApiMiddleware(targetProjectRoot),
  ],
  optimizeDeps: {
    noDiscovery: true,
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'lucide-react',
    ],
  },
  esbuild: {
    // Ensure .tsx/.ts/.jsx/.js files (including RN .js files with JSX) are transpiled cleanly
    jsx: 'automatic',
    include: /\.(tsx|ts|jsx|js)$/,
    exclude: [],
    loader: 'tsx',
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolvedReactDir,
      'react-dom': resolvedReactDomDir,
      'react-native': reactNativeShimPath,
      'react-native-web': reactNativeShimPath,
      'lucide-react': resolvedLucideDir,
    },
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  define: {
    __DEV__: JSON.stringify(true),
    global: 'window',
  },
  css: {
    postcss: {},
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    cors: false,
    allowedHosts: ['127.0.0.1', 'localhost', '::1'],
    fs: {
      strict: false,
      allow: allowedFsRoots,
    },
  },
});
