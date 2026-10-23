import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteVirtualScreensPlugin } from './plugins/viteVirtualScreensPlugin';
import { viteReactNativeFallbackPlugin } from './plugins/viteReactNativeFallbackPlugin';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';
import { findMobileAppRoot } from './src/server/astEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromZelune = createRequire(import.meta.url);

const rawTargetRoot = process.env.ANTIGRAVITY_TARGET_PROJECT
  ? path.resolve(process.env.ANTIGRAVITY_TARGET_PROJECT)
  : __dirname;

const workspaceRoot = process.env.ANTIGRAVITY_WORKSPACE_ROOT
  ? path.resolve(process.env.ANTIGRAVITY_WORKSPACE_ROOT)
  : rawTargetRoot;

const targetProjectRoot = findMobileAppRoot(rawTargetRoot);
const mockNavShimPath = path.resolve(__dirname, 'src/runtime/MockNavigationContext.tsx');

function safeRealpath(targetPath: string): string {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function resolvePackageRootDir(pkgName: string): string {
  try {
    const pkgJsonPath = requireFromZelune.resolve(`${pkgName}/package.json`);
    return path.dirname(pkgJsonPath);
  } catch {
    return pkgName;
  }
}

const resolvedReactDir = resolvePackageRootDir('react');
const resolvedReactDomDir = resolvePackageRootDir('react-dom');
const resolvedRnWebDir = resolvePackageRootDir('react-native-web');
const resolvedLucideDir = resolvePackageRootDir('lucide-react');

/**
 * Loads only safe client-public environment variables (EXPO_PUBLIC_*, NEXT_PUBLIC_*, VITE_*)
 * from the target project's .env files so top-level SDK initializers in mobile screens work.
 */
function loadPublicProjectEnv(roots: string[]): Record<string, string> {
  const publicEnv: Record<string, string> = {
    NODE_ENV: 'development',
    EXPO_PUBLIC_PLATFORM: 'web',
  };
  const envFiles = ['.env', '.env.development', '.env.local'];
  const uniqueRoots = Array.from(new Set(roots.map((r) => path.resolve(r))));

  for (const rootDir of uniqueRoots) {
    for (const fileName of envFiles) {
      const fullPath = path.join(rootDir, fileName);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const raw = fs.readFileSync(fullPath, 'utf-8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx <= 0) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          if (
            !key.startsWith('EXPO_PUBLIC_') &&
            !key.startsWith('NEXT_PUBLIC_') &&
            !key.startsWith('VITE_')
          ) {
            continue;
          }
          let val = trimmed.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          publicEnv[key] = val;
        }
      } catch {
        // Ignore unreadable .env files
      }
    }
  }
  return publicEnv;
}

const publicProjectEnv = loadPublicProjectEnv([workspaceRoot, rawTargetRoot, targetProjectRoot]);

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
        const envScript = `<script>
(function() {
  var baseEnv = ${serializedEnv};
  var envProxy = new Proxy(baseEnv, {
    get: function(target, prop) {
      if (typeof prop !== 'string') return target[prop];
      if (prop in target && target[prop] !== undefined && target[prop] !== '') {
        return target[prop];
      }
      var upper = prop.toUpperCase();
      if (upper.includes('URL') || upper.includes('ENDPOINT') || upper.includes('HOST')) {
        return 'https://placeholder.example.com';
      }
      if (upper.includes('KEY') || upper.includes('TOKEN') || upper.includes('ID') || upper.includes('SECRET')) {
        return 'placeholder-public-token';
      }
      return '';
    }
  });
  function createRequireProxy() {
    var fn = function() { return proxy; };
    var proxy = new Proxy(fn, {
      get: function(_t, prop) {
        if (prop === Symbol.toPrimitive) return function(hint) { return hint === 'number' ? 0 : ''; };
        if (prop === 'valueOf') return function() { return 0; };
        if (prop === 'toString') return function() { return ''; };
        if (prop === 'uri' || prop === 'default') return '';
        return proxy;
      }
    });
    return proxy;
  }
  window.global = window;
  window.__DEV__ = true;
  window.process = window.process || { env: envProxy, platform: 'browser', version: '', cwd: function() { return '/'; } };
  window.process.env = envProxy;
  window.require = window.require || function(modId) {
    if (typeof modId === 'string' && /\\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(modId)) {
      return { uri: modId, default: modId };
    }
    return createRequireProxy();
  };
})();
</script>`;
        return html.replace('<head>', `<head>\n    ${envScript}`);
      },
    },
    viteReactNativeFallbackPlugin(targetProjectRoot, mockNavShimPath, workspaceRoot),
    viteVirtualScreensPlugin(targetProjectRoot),
    viteRnSourceInject(targetProjectRoot),
    react(),
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
      'react-native-web',
      'lucide-react',
    ],
  },
  esbuild: {
    // Ensure .tsx/.ts/.jsx/.js files (including RN .js files with JSX) are transpiled cleanly
    include: /\.(tsx|ts|jsx|js)$/,
    exclude: [],
    loader: 'tsx',
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-native-web'],
    alias: {
      react: resolvedReactDir,
      'react-dom': resolvedReactDomDir,
      'react-native-web': resolvedRnWebDir,
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
