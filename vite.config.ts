import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteRnSourceInject } from './plugins/viteRnSourceInject';
import { viteCanvasApiMiddleware } from './src/server/apiMiddleware';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetProjectRoot = process.env.ANTIGRAVITY_TARGET_PROJECT
  ? path.resolve(process.env.ANTIGRAVITY_TARGET_PROJECT)
  : __dirname;

export default defineConfig({
  plugins: [
    viteRnSourceInject(targetProjectRoot),
    react(),
    viteCanvasApiMiddleware(targetProjectRoot),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
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
  },
});
