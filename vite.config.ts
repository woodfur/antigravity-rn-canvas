import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteVirtualScreensPlugin } from './plugins/viteVirtualScreensPlugin';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetProjectRoot = process.env.ANTIGRAVITY_TARGET_PROJECT
  ? path.resolve(process.env.ANTIGRAVITY_TARGET_PROJECT)
  : __dirname;

const mockNavShimPath = path.resolve(__dirname, 'src/runtime/MockNavigationContext.tsx');

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
    if (!fs.existsSync(tsconfigPath)) return aliases;
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
  } catch {
    // Fallback to standard @ alias if tsconfig parsing fails
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
  resolve: {
    alias: {
      ...resolveTargetProjectPathAliases(targetProjectRoot),
      'react-native': 'react-native-web',
      '@react-navigation/native': mockNavShimPath,
      'expo-router': mockNavShimPath,
      'react-native-safe-area-context': mockNavShimPath,
      'expo-status-bar': mockNavShimPath,
      'lucide-react-native': 'lucide-react',
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
      allow: [__dirname, targetProjectRoot],
    },
  },
});
