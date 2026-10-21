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

function resolveTargetProjectPathAliases(projectRoot: string): Record<string, string> {
  const aliases: Record<string, string> = {};
  try {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return aliases;
    const raw = fs.readFileSync(tsconfigPath, 'utf-8');
    // Strip single-line and multi-line comments before JSON.parse
    const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
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
      const cleanTarget = targets[0].replace(/\/\*$/, '');
      aliases[cleanKey] = path.resolve(projectRoot, baseUrl, cleanTarget);
    }
  } catch {
    // Fallback to standard @ alias if tsconfig parsing fails
    const srcDir = path.join(projectRoot, 'src');
    aliases['@'] = fs.existsSync(srcDir) ? srcDir : projectRoot;
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
    fs: {
      allow: [__dirname, targetProjectRoot],
    },
  },
});
