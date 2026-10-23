import type { Plugin } from 'vite';
import { discoverScreenFilesSync } from '../src/server/astEngine';

const VIRTUAL_MODULE_ID = 'virtual:zelune-screens';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

const PREFERRED_ORDER = ['Login', 'Home', 'ProductDetail', 'Checkout', 'Profile'];

/**
 * Vite Virtual Module plugin that dynamically discovers and loads React Native / Expo
 * screen components from any target project (`--project /path/to/app`) with per-screen
 * dynamic import() fault isolation so a broken import or top-level exception in one screen
 * can never blank out the entire Zelune studio canvas.
 */
export function viteVirtualScreensPlugin(workspaceRoot: string): Plugin {
  let isBuild = false;

  return {
    name: 'vite-virtual-zelune-screens',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
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
      const lines: string[] = [
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
        `function createIsolatedScreenComponent(screenId, filePath, loader) {`,
        `  let cachedComp = null;`,
        `  return function IsolatedScreenWrapper(props) {`,
        `    const [state, setState] = React.useState(() => ({`,
        `      Comp: cachedComp,`,
        `      error: null,`,
        `      attempt: 0,`,
        `    }));`,
        `    React.useEffect(() => {`,
        `      let cancelled = false;`,
        `      Promise.resolve()`,
        `        .then(() => loader(state.attempt))`,
        `        .then((mod) => {`,
        `          if (cancelled) return;`,
        `          const resolved = resolveScreenComponent(mod);`,
        `          if (!resolved) {`,
        `            setState((prev) => ({`,
        `              ...prev,`,
        `              Comp: null,`,
        `              error: 'No exported React component found in ' + filePath,`,
        `            }));`,
        `          } else {`,
        `            cachedComp = resolved;`,
        `            setState((prev) => ({ ...prev, Comp: resolved, error: null }));`,
        `          }`,
        `        })`,
        `        .catch((err) => {`,
        `          if (cancelled) return;`,
        `          const msg = err instanceof Error ? err.message : String(err);`,
        `          setState((prev) => ({ ...prev, Comp: null, error: msg }));`,
        `        });`,
        `      return () => {`,
        `        cancelled = true;`,
        `      };`,
        `    }, [state.attempt]);`,
        `    if (state.error) {`,
        `      return React.createElement(`,
        `        'div',`,
        `        {`,
        `          style: {`,
        `            flex: 1,`,
        `            padding: 24,`,
        `            backgroundColor: '#18181B',`,
        `            color: '#FCA5A5',`,
        `            display: 'flex',`,
        `            flexDirection: 'column',`,
        `            justifyContent: 'center',`,
        `            gap: 10,`,
        `            fontFamily: 'var(--font-mono)',`,
        `          },`,
        `        },`,
        `        React.createElement(`,
        `          'div',`,
        `          { style: { color: '#F87171', fontWeight: 700, fontSize: 13 } },`,
        `          'Module Load Error in ' + filePath`,
        `        ),`,
        `        React.createElement(`,
        `          'div',`,
        `          {`,
        `            style: {`,
        `              fontSize: 11,`,
        `              color: '#FECACA',`,
        `              whiteSpace: 'pre-wrap',`,
        `              wordBreak: 'break-word',`,
        `              maxHeight: 360,`,
        `              overflowY: 'auto',`,
        `            },`,
        `          },`,
        `          state.error`,
        `        ),`,
        `        React.createElement(`,
        `          'button',`,
        `          {`,
        `            type: 'button',`,
        `            onClick: () => setState((prev) => ({ ...prev, error: null, attempt: prev.attempt + 1 })),`,
        `            style: {`,
        `              alignSelf: 'flex-start',`,
        `              marginTop: 6,`,
        `              padding: '6px 12px',`,
        `              borderRadius: 6,`,
        `              border: '1px solid rgba(248, 113, 113, 0.45)',`,
        `              backgroundColor: 'rgba(127, 29, 29, 0.4)',`,
        `              color: '#FEE2E2',`,
        `              fontSize: 11,`,
        `              fontWeight: 600,`,
        `              cursor: 'pointer',`,
        `            },`,
        `          },`,
        `          'Retry Screen Load'`,
        `        )`,
        `      );`,
        `    }`,
        `    if (!state.Comp) {`,
        `      return React.createElement(`,
        `        'div',`,
        `        {`,
        `          style: {`,
        `            flex: 1,`,
        `            display: 'flex',`,
        `            alignItems: 'center',`,
        `            justifyContent: 'center',`,
        `            color: '#64748B',`,
        `            fontSize: 12,`,
        `            fontFamily: 'var(--font-mono)',`,
        `          },`,
        `        },`,
        `        'Loading ' + screenId + '...'`,
        `      );`,
        `    }`,
        `    return React.createElement(state.Comp, props);`,
        `  };`,
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

      sorted.forEach((scr) => {
        const normalizedFullPath = scr.fullPath.replace(/\\/g, '/');
        const fsUrl =
          '/@fs' + (normalizedFullPath.startsWith('/') ? '' : '/') + normalizedFullPath;
        const loaderExpr = isBuild
          ? `(attempt) => attempt > 0 ? import(/* @vite-ignore */ ${JSON.stringify(
              normalizedFullPath
            )} + '?t=' + Date.now()) : import(${JSON.stringify(normalizedFullPath)})`
          : `(attempt) => import(/* @vite-ignore */ ${JSON.stringify(
              fsUrl
            )} + (attempt > 0 ? '?t=' + Date.now() : ''))`;

        mapEntries.push(
          `  ${JSON.stringify(scr.id)}: createIsolatedScreenComponent(${JSON.stringify(
            scr.id
          )}, ${JSON.stringify(scr.relPath)}, ${loaderExpr})`
        );
        orderIds.push(scr.id);
      });

      return [
        ...lines,
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
