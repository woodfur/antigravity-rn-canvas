import { build, defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteVirtualScreensPlugin } from './plugins/viteVirtualScreensPlugin';
import { viteReactNativeFallbackPlugin } from './plugins/viteReactNativeFallbackPlugin';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';
import { findMobileAppRoot } from './src/server/astEngine';
import {
  parseTailwindConfigSource,
  loadProjectTailwindTheme,
} from './src/server/tailwindThemeLoader';

export { parseTailwindConfigSource };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetProjectRoot = findMobileAppRoot(__dirname);
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

const projectTailwindTheme = loadProjectTailwindTheme([targetProjectRoot, __dirname]);

const allowedFsRoots = Array.from(
  new Set([
    __dirname,
    safeRealpath(__dirname),
    targetProjectRoot,
    safeRealpath(targetProjectRoot),
  ])
);

export default defineConfig({
  plugins: [
    {
      name: 'vite-zelune-tailwind-theme-shim',
      transformIndexHtml(html) {
        const serializedTailwindTheme = JSON.stringify(projectTailwindTheme);
        const themeScript = `<script>window.__ZELUNE_TAILWIND_THEME__ = window.__ZELUNE_TAILWIND_THEME__ || ${serializedTailwindTheme};</script>`;
        return html.replace('<head>', `<head>\n    ${themeScript}`);
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
    viteReactNativeFallbackPlugin(targetProjectRoot, mockNavShimPath, __dirname),
    viteVirtualScreensPlugin(targetProjectRoot),
    viteRnSourceInject(targetProjectRoot),
    viteCanvasApiMiddleware(targetProjectRoot),
  ],
  build: {
    minify: false,
    cssMinify: false,
  },
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
