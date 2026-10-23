import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL_STUB_PREFIX = '\0virtual:zelune-native-stub:';

const SHIMMED_PACKAGE_PREFIXES = [
  '@react-navigation/',
  'expo-router',
  'react-native-safe-area-context',
  'expo-status-bar',
  '@expo/vector-icons',
  'react-native-vector-icons',
  'expo-linear-gradient',
  'expo-blur',
  'expo-image',
  'react-native-svg',
  'react-native-reanimated',
  'react-native-gesture-handler',
  'expo-haptics',
  'expo-constants',
  'expo-font',
  'expo-splash-screen',
  'expo-secure-store',
  'expo-clipboard',
  'expo-linking',
  '@react-native-async-storage/async-storage',
  '@shopify/flash-list',
];

const NATIVE_ONLY_PACKAGE_PATTERN =
  /^(react-native-|@react-native|expo-|@expo\/|@gorhom\/|lottie-react-native|react-native-)/;

const CORE_WEB_PACKAGES = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-native',
  'react-native-web',
  'lucide-react',
  'lucide-react-native',
  'virtual:zelune-screens',
]);

function extractNamedImportsFromImporter(importerPath: string, targetSpecifier: string): string[] {
  const names = new Set<string>();
  try {
    const cleanImporter = importerPath.split('?')[0];
    if (!fs.existsSync(cleanImporter)) return [];
    const content = fs.readFileSync(cleanImporter, 'utf-8');
    const escapedSpec = targetSpecifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importRegex = new RegExp(
      `import\\s+([^;]+?)\\s+from\\s+['"]${escapedSpec}['"]`,
      'g'
    );
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const clause = match[1];
      const braceMatch = clause.match(/\{([\s\S]*?)\}/);
      if (braceMatch) {
        const items = braceMatch[1].split(',');
        for (const rawItem of items) {
          const cleaned = rawItem.replace(/\btype\s+/g, '').trim();
          if (!cleaned) continue;
          const parts = cleaned.split(/\s+as\s+/);
          const importedName = parts[0]?.trim();
          if (importedName && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(importedName)) {
            names.add(importedName);
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return Array.from(names);
}

export function viteReactNativeFallbackPlugin(
  targetProjectRoot: string,
  mockNavShimPath: string
): Plugin {
  const normalizedShimPath = mockNavShimPath.replace(/\\/g, '/');

  return {
    name: 'vite-react-native-fallback',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        !source ||
        source.startsWith('\0') ||
        source.startsWith('.') ||
        source.startsWith('/') ||
        source.startsWith('virtual:') ||
        CORE_WEB_PACKAGES.has(source)
      ) {
        return null;
      }

      // Route known shimmed packages (and their subpaths like @expo/vector-icons/Ionicons)
      const matchesKnownShim = SHIMMED_PACKAGE_PREFIXES.some(
        (prefix) =>
          source === prefix ||
          (prefix.endsWith('/') ? source.startsWith(prefix) : source.startsWith(prefix + '/'))
      );

      if (matchesKnownShim) {
        const requestedNames = importer ? extractNamedImportsFromImporter(importer, source) : [];
        if (requestedNames.length === 0) {
          return mockNavShimPath;
        }
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      // If it is a known native-only RN/Expo package, synthesize a safe universal React/Hook module
      if (NATIVE_ONLY_PACKAGE_PATTERN.test(source)) {
        const requestedNames = importer ? extractNamedImportsFromImporter(importer, source) : [];
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      // For other bare packages imported from targetProjectRoot, check if resolvable from targetProjectRoot
      if (importer && !importer.startsWith('\0')) {
        const cleanImporter = importer.split('?')[0];
        try {
          const reqFromImporter = createRequire(cleanImporter);
          reqFromImporter.resolve(source);
          return null; // Let Vite handle standard resolvable web packages
        } catch {
          try {
            const reqFromTarget = createRequire(path.join(targetProjectRoot, 'package.json'));
            reqFromTarget.resolve(source);
            return null;
          } catch {
            // Unresolvable bare specifier in target project — fallback to virtual stub so the canvas still loads
            const requestedNames = extractNamedImportsFromImporter(cleanImporter, source);
            return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(
              source
            )}?exports=${encodeURIComponent(requestedNames.join(','))}`;
          }
        }
      }

      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_STUB_PREFIX)) {
        return null;
      }

      const queryIndex = id.indexOf('?exports=');
      const encodedExports = queryIndex !== -1 ? id.slice(queryIndex + '?exports='.length) : '';
      const exportNames = decodeURIComponent(encodedExports)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== 'default');

      const lines: string[] = [
        `import React from 'react';`,
        `import { View } from 'react-native';`,
        `import * as KnownShims from ${JSON.stringify(normalizedShimPath)};`,
        `import DefaultShim from ${JSON.stringify(normalizedShimPath)};`,
        `function createUniversalHookResult() {`,
        `  const arr = [{ granted: true, status: 'granted' }, async () => ({ granted: true, status: 'granted' })];`,
        `  return Object.assign(arr, {`,
        `    granted: true,`,
        `    status: 'granted',`,
        `    data: null,`,
        `    error: null,`,
        `    isLoading: false,`,
        `    loading: false,`,
        `    isReady: true,`,
        `    ref: { current: null },`,
        `    value: 0,`,
        `  });`,
        `}`,
        `function createUniversalComponentStub(displayName) {`,
        `  const Comp = React.forwardRef(function UniversalNativeStub(props, ref) {`,
        `    return React.createElement(View, { style: props?.style, ref }, props?.children);`,
        `  });`,
        `  Comp.displayName = displayName;`,
        `  return new Proxy(Comp, {`,
        `    get(target, prop) {`,
        `      if (prop in target) return target[prop];`,
        `      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {`,
        `        return createUniversalComponentStub(displayName + '.' + prop);`,
        `      }`,
        `      return () => undefined;`,
        `    },`,
        `  });`,
        `}`,
        `function resolveStubExport(name) {`,
        `  if (name in KnownShims) return KnownShims[name];`,
        `  if (DefaultShim && name in DefaultShim) return DefaultShim[name];`,
        `  if (/^use[A-Z]/.test(name)) return () => createUniversalHookResult();`,
        `  if (/^[A-Z]/.test(name)) return createUniversalComponentStub(name);`,
        `  return async () => ({});`,
        `}`,
        `export default DefaultShim;`,
      ];

      for (const name of exportNames) {
        lines.push(`export const ${name} = resolveStubExport(${JSON.stringify(name)});`);
      }

      return lines.join('\n');
    },
  };
}
