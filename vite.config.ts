import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteVirtualScreensPlugin } from './plugins/viteVirtualScreensPlugin';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';
import { findMobileAppRoot } from './src/server/astEngine';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireFromZelune = createRequire(import.meta.url);

const rawTargetRoot = process.env.ANTIGRAVITY_TARGET_PROJECT
  ? path.resolve(process.env.ANTIGRAVITY_TARGET_PROJECT)
  : __dirname;

const targetProjectRoot = findMobileAppRoot(rawTargetRoot);
const mockNavShimPath = path.resolve(__dirname, 'src/runtime/MockNavigationContext.tsx');

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

const PROTECTED_CORE_ALIASES = new Set([
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  'lucide-react',
  'lucide-react-native',
  '@react-navigation/native',
  'expo-router',
  'react-native-safe-area-context',
  'expo-status-bar',
  '__proto__',
  'constructor',
  'prototype',
]);

function stripJsonComments(input: string): string {
  return input.replace(
    /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*/g,
    (_match, quotedString?: string) => quotedString ?? ''
  );
}

function resolveTargetProjectPathAliases(projectRoot: string): Record<string, string> {
  const normalizedRoot = path.resolve(projectRoot);
  const aliases: Record<string, string> = {};
  try {
    const tsconfigPath = path.join(normalizedRoot, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      const raw = fs.readFileSync(tsconfigPath, 'utf-8');
      const cleaned = stripJsonComments(raw);
      const parsed = JSON.parse(cleaned) as {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[]>;
        };
      };
      const baseUrl = parsed.compilerOptions?.baseUrl ?? '.';
      const paths = parsed.compilerOptions?.paths ?? {};
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!targets || targets.length === 0) continue;
        const cleanKey = pattern.replace(/\/\*$/, '');
        if (!cleanKey || PROTECTED_CORE_ALIASES.has(cleanKey)) continue;
        const cleanTarget = targets[0].replace(/\/\*$/, '');
        const resolvedTarget = path.resolve(normalizedRoot, baseUrl, cleanTarget);
        if (
          resolvedTarget === normalizedRoot ||
          resolvedTarget.startsWith(normalizedRoot + path.sep)
        ) {
          aliases[cleanKey] = resolvedTarget;
        }
      }
    }
  } catch {
    // Ignore malformed tsconfig.json and fall back to standard @ alias below
  }

  if (!aliases['@']) {
    const srcDir = path.join(normalizedRoot, 'src');
    aliases['@'] = fs.existsSync(srcDir) ? srcDir : normalizedRoot;
  }

  return aliases;
}

export default defineConfig({
  plugins: [
    viteVirtualScreensPlugin(targetProjectRoot),
    viteRnSourceInject(targetProjectRoot),
    react(),
    viteCanvasApiMiddleware(targetProjectRoot),
  ],
  esbuild: {
    // Ensure .tsx/.ts/.jsx files are transpiled even when zelune is installed inside node_modules/zelune
    include: /\.(tsx|ts|jsx)$/,
    exclude: [],
    loader: 'tsx',
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-native-web'],
    alias: {
      ...resolveTargetProjectPathAliases(targetProjectRoot),
      react: resolvedReactDir,
      'react-dom': resolvedReactDomDir,
      'react-native': resolvedRnWebDir,
      'react-native-web': resolvedRnWebDir,
      'lucide-react': resolvedLucideDir,
      'lucide-react-native': resolvedLucideDir,
      '@react-navigation/native': mockNavShimPath,
      'expo-router': mockNavShimPath,
      'react-native-safe-area-context': mockNavShimPath,
      'expo-status-bar': mockNavShimPath,
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
      allow: Array.from(new Set([__dirname, rawTargetRoot, targetProjectRoot])),
    },
  },
});
