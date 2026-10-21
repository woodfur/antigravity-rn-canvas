import type { Plugin } from 'vite';
import { discoverScreenFilesSync } from '../src/server/astEngine';

const VIRTUAL_MODULE_ID = 'virtual:zelune-screens';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

const PREFERRED_ORDER = ['Login', 'Home', 'ProductDetail', 'Checkout', 'Profile'];

/**
 * Vite Virtual Module plugin that dynamically discovers and imports React Native / Expo
 * screen components from any target project (`--project /path/to/app`).
 */
export function viteVirtualScreensPlugin(workspaceRoot: string): Plugin {
  return {
    name: 'vite-virtual-zelune-screens',
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return null;
      }

      const discovered = discoverScreenFilesSync(workspaceRoot);
      const importLines: string[] = [
        `import React from 'react';`,
        `function resolveScreenComponent(mod) {`,
        `  if (!mod) return null;`,
        `  if (typeof mod.default === 'function' || (typeof mod.default === 'object' && mod.default !== null)) {`,
        `    return mod.default;`,
        `  }`,
        `  for (const key of Object.keys(mod)) {`,
        `    if (typeof mod[key] === 'function') return mod[key];`,
        `  }`,
        `  return null;`,
        `}`,
      ];

      const mapEntries: string[] = [];
      const orderIds: string[] = [];

      const sorted = [...discovered].sort((a, b) => {
        const idxA = PREFERRED_ORDER.indexOf(a.id);
        const idxB = PREFERRED_ORDER.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.id.localeCompare(b.id);
      });

      sorted.forEach((scr, index) => {
        const varName = `_screenMod_${index}`;
        const normalizedFullPath = scr.fullPath.replace(/\\/g, '/');
        importLines.push(`import * as ${varName} from ${JSON.stringify(normalizedFullPath)};`);
        mapEntries.push(`  ${JSON.stringify(scr.id)}: resolveScreenComponent(${varName})`);
        orderIds.push(scr.id);
      });

      return [
        ...importLines,
        `export const SCREEN_COMPONENTS = {`,
        mapEntries.join(',\n'),
        `};`,
        `export const SCREEN_ORDER = ${JSON.stringify(orderIds)};`,
      ].join('\n');
    },
    configureServer(server) {
      server.watcher.on('add', (file) => {
        if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      });
      server.watcher.on('unlink', (file) => {
        if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
      });
    },
  };
}
