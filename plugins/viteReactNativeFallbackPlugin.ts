import { parse } from '@babel/parser';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin } from 'vite';

const VIRTUAL_STUB_PREFIX = '\0virtual:zelune-native-stub:';
const VIRTUAL_LUCIDE_PREFIX = '\0virtual:zelune-lucide-stub:';

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
  'zustand',
  '@tanstack/react-query',
  '@supabase/supabase-js',
];

const NATIVE_ONLY_PACKAGE_PATTERN =
  /^(react-native-|@react-native|expo|expo-|@expo\/|@gorhom\/|lottie-react-native|moti|nativewind|tamagui|@tamagui\/|@shopify\/)/;

const CORE_PASSTHROUGH_PACKAGES = new Set([
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-native-web',
  'virtual:zelune-screens',
]);

const RESOLVABLE_EXTENSIONS = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.json',
  '.css',
];

function stripJsonCommentsAndTrailingCommas(input: string): string {
  const withoutComments = input.replace(
    /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*/g,
    (_match, quotedString?: string) => quotedString ?? ''
  );
  return withoutComments.replace(/,\s*([}\]])/g, '$1');
}

function tryResolveLocalFile(candidateBase: string): string | null {
  try {
    const cleanBase = candidateBase.split('?')[0];
    if (fs.existsSync(cleanBase) && fs.statSync(cleanBase).isFile()) {
      return cleanBase;
    }
    for (const ext of RESOLVABLE_EXTENSIONS) {
      const withExt = cleanBase + ext;
      if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
        return withExt;
      }
    }
    if (fs.existsSync(cleanBase) && fs.statSync(cleanBase).isDirectory()) {
      for (const ext of RESOLVABLE_EXTENSIONS) {
        const indexFile = path.join(cleanBase, `index${ext}`);
        if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
          return indexFile;
        }
      }
    }
  } catch {
    // Ignore filesystem errors
  }
  return null;
}

function loadTsconfigAliasCandidates(roots: string[]): Array<{ prefix: string; targetDir: string }> {
  const mappings: Array<{ prefix: string; targetDir: string }> = [];
  for (const rootDir of roots) {
    try {
      const tsconfigPath = path.join(rootDir, 'tsconfig.json');
      if (!fs.existsSync(tsconfigPath)) continue;
      const raw = fs.readFileSync(tsconfigPath, 'utf-8');
      const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw)) as {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[]>;
        };
      };
      const baseUrl = parsed.compilerOptions?.baseUrl ?? '.';
      const paths = parsed.compilerOptions?.paths ?? {};
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets)) continue;
        const cleanPrefix = pattern.replace(/\/\*$/, '');
        if (!cleanPrefix) continue;
        for (const t of targets) {
          const cleanTarget = t.replace(/\/\*$/, '');
          const resolvedDir = path.resolve(rootDir, baseUrl, cleanTarget);
          mappings.push({ prefix: cleanPrefix, targetDir: resolvedDir });
        }
      }
    } catch {
      // Ignore malformed tsconfig.json
    }
  }
  return mappings;
}

function extractModuleNamedExports(filePath: string): Set<string> {
  const exportedNames = new Set<string>();
  try {
    if (!fs.existsSync(filePath)) return exportedNames;
    const content = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy'],
      errorRecovery: true,
    });
    for (const stmt of ast.program.body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.exportKind === 'type') continue;
        for (const spec of stmt.specifiers) {
          if (spec.type === 'ExportSpecifier' && spec.exportKind !== 'type') {
            const name =
              spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
            if (name && name !== 'default') exportedNames.add(name);
          }
        }
        const decl = stmt.declaration;
        if (decl) {
          if (
            (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') &&
            decl.id?.name
          ) {
            exportedNames.add(decl.id.name);
          } else if (decl.type === 'VariableDeclaration') {
            for (const d of decl.declarations) {
              if (d.id.type === 'Identifier') {
                exportedNames.add(d.id.name);
              }
            }
          }
        }
      }
    }
  } catch {
    // Ignore parse errors
  }
  return exportedNames;
}

export function extractNamedImportsFromImporter(
  importerPath: string,
  targetSpecifier: string
): string[] {
  const names = new Set<string>();
  try {
    const cleanImporter = importerPath.split('?')[0];
    if (!fs.existsSync(cleanImporter)) return [];
    const content = fs.readFileSync(cleanImporter, 'utf-8');

    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy'],
        errorRecovery: true,
      });

      for (const stmt of ast.program.body) {
        if (
          stmt.type === 'ImportDeclaration' &&
          stmt.source.value === targetSpecifier &&
          stmt.importKind !== 'type'
        ) {
          for (const spec of stmt.specifiers) {
            if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type') {
              const importedName =
                spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
              if (
                importedName &&
                importedName !== 'default' &&
                /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(importedName)
              ) {
                names.add(importedName);
              }
            }
          }
        } else if (
          stmt.type === 'ExportNamedDeclaration' &&
          stmt.source?.value === targetSpecifier &&
          stmt.exportKind !== 'type'
        ) {
          for (const spec of stmt.specifiers) {
            if (spec.type === 'ExportSpecifier' && spec.exportKind !== 'type') {
              const localName =
                spec.local.type === 'Identifier' ? spec.local.name : spec.local.value;
              const exportedName =
                spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
              if (
                localName &&
                localName !== 'default' &&
                /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(localName)
              ) {
                names.add(localName);
              }
              if (
                exportedName &&
                exportedName !== 'default' &&
                /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportedName)
              ) {
                names.add(exportedName);
              }
            }
          }
        }
      }
      return Array.from(names);
    } catch {
      // Fallback to statement-isolated regex if AST parser fails
      const escapedSpec = targetSpecifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const importRegex = new RegExp(
        `(?:import|export)\\s+(?:type\\s+)?(?:[A-Za-z0-9_$]+\\s*,\\s*)?\\{([^}]+)\\}\\s*from\\s*['"]${escapedSpec}['"]`,
        'g'
      );
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(content)) !== null) {
        const items = match[1].split(',');
        for (const rawItem of items) {
          const cleaned = rawItem.replace(/\btype\s+/g, '').trim();
          if (!cleaned) continue;
          const parts = cleaned.split(/\s+as\s+/);
          const importedName = parts[0]?.trim();
          if (
            importedName &&
            importedName !== 'default' &&
            /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(importedName)
          ) {
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
  mockNavShimPath: string,
  workspaceRoot: string = targetProjectRoot
): Plugin {
  const normalizedShimPath = mockNavShimPath.replace(/\\/g, '/');
  const reactNativeShimPath = path
    .resolve(path.dirname(mockNavShimPath), 'reactNativeShim.ts')
    .replace(/\\/g, '/');
  const zelunePackageRoot = path.resolve(path.dirname(mockNavShimPath), '../..');
  const zeluneDemoScreensDir = path.resolve(zelunePackageRoot, 'src/screens');

  const knownShimExports = extractModuleNamedExports(mockNavShimPath);
  const reqFromPlugin = createRequire(import.meta.url);
  const lucideExportKeys = new Set<string>();
  try {
    const lucideMod = reqFromPlugin('lucide-react') as Record<string, unknown>;
    for (const k of Object.keys(lucideMod)) {
      lucideExportKeys.add(k);
    }
  } catch {
    // Ignore if lucide-react cannot be eagerly inspected
  }

  const uniqueRoots = Array.from(
    new Set([path.resolve(targetProjectRoot), path.resolve(workspaceRoot)])
  );
  const tsconfigMappings = loadTsconfigAliasCandidates(uniqueRoots);

  function resolveProjectAliasImport(source: string): string | null {
    for (const mapping of tsconfigMappings) {
      if (source === mapping.prefix) {
        const found = tryResolveLocalFile(mapping.targetDir);
        if (found) return found;
      } else if (source.startsWith(mapping.prefix + '/')) {
        const rel = source.slice(mapping.prefix.length + 1);
        const found = tryResolveLocalFile(path.join(mapping.targetDir, rel));
        if (found) return found;
      }
    }

    if (source.startsWith('@/') || source.startsWith('~/')) {
      const rel = source.slice(2);
      for (const rootDir of uniqueRoots) {
        const directMatch = tryResolveLocalFile(path.join(rootDir, rel));
        if (directMatch) return directMatch;
        const srcMatch = tryResolveLocalFile(path.join(rootDir, 'src', rel));
        if (srcMatch) return srcMatch;
      }
    }

    return null;
  }

  return {
    name: 'vite-react-native-fallback',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        !source ||
        source.startsWith('\0') ||
        source.startsWith('virtual:') ||
        source.startsWith('node:') ||
        source === 'vitest' ||
        CORE_PASSTHROUGH_PACKAGES.has(source)
      ) {
        return null;
      }

      const cleanImporter = importer ? importer.split('?')[0] : '';
      const isZeluneInternalImporter =
        Boolean(cleanImporter) &&
        ((cleanImporter.startsWith(zelunePackageRoot + path.sep) &&
          !cleanImporter.startsWith(zeluneDemoScreensDir + path.sep)) ||
          cleanImporter.includes(`${path.sep}node_modules${path.sep}`));

      // 1. Exact 'react-native' -> reactNativeShim.ts; subpaths 'react-native/...' -> virtual stub
      if (source === 'react-native') {
        if (cleanImporter && cleanImporter.replace(/\\/g, '/') === reactNativeShimPath) {
          return null;
        }
        return reactNativeShimPath;
      }
      if (source.startsWith('react-native/')) {
        const requestedNames = cleanImporter
          ? extractNamedImportsFromImporter(cleanImporter, source)
          : [];
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      // 2. 'lucide-react' & 'lucide-react-native' -> synthesize fallback icons for any missing icon names
      if (source === 'lucide-react' || source === 'lucide-react-native') {
        const requestedNames = cleanImporter
          ? extractNamedImportsFromImporter(cleanImporter, source)
          : [];
        const missingIcons =
          lucideExportKeys.size > 0
            ? requestedNames.filter((name) => !lucideExportKeys.has(name))
            : [];
        if (source === 'lucide-react' && missingIcons.length === 0) {
          return null;
        }
        return `${VIRTUAL_LUCIDE_PREFIX}?missing=${encodeURIComponent(missingIcons.join(','))}`;
      }

      // 3. Project path aliases (@/..., ~/..., or tsconfig paths)
      if (
        source.startsWith('@/') ||
        source.startsWith('~/') ||
        tsconfigMappings.some((m) => source === m.prefix || source.startsWith(m.prefix + '/'))
      ) {
        const resolvedLocal = resolveProjectAliasImport(source);
        if (resolvedLocal) {
          return resolvedLocal;
        }
        const requestedNames = cleanImporter
          ? extractNamedImportsFromImporter(cleanImporter, source)
          : [];
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      // 4. Relative imports (./..., ../...) from target project screens/files
      if (source.startsWith('.')) {
        if (cleanImporter && !isZeluneInternalImporter) {
          const candidate = path.resolve(path.dirname(cleanImporter), source);
          const resolvedLocal = tryResolveLocalFile(candidate);
          if (resolvedLocal) {
            return null; // Let Vite load existing local files normally
          }
          // Missing local/generated file in target project -> fallback to virtual stub
          const requestedNames = extractNamedImportsFromImporter(cleanImporter, source);
          return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
            requestedNames.join(',')
          )}`;
        }
        return null;
      }

      if (source.startsWith('/')) {
        return null;
      }

      // 5. Known shimmed packages & native-only RN/Expo packages
      const matchesKnownShim = SHIMMED_PACKAGE_PREFIXES.some(
        (prefix) =>
          source === prefix ||
          (prefix.endsWith('/') ? source.startsWith(prefix) : source.startsWith(prefix + '/'))
      );

      if (matchesKnownShim || NATIVE_ONLY_PACKAGE_PATTERN.test(source)) {
        const requestedNames = cleanImporter
          ? extractNamedImportsFromImporter(cleanImporter, source)
          : [];
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      // 6. Any other bare npm package imported by a target project file (avoid loading unbundled CJS/Flow from target node_modules)
      if (cleanImporter && !isZeluneInternalImporter) {
        const requestedNames = extractNamedImportsFromImporter(cleanImporter, source);
        return `${VIRTUAL_STUB_PREFIX}${encodeURIComponent(source)}?exports=${encodeURIComponent(
          requestedNames.join(',')
        )}`;
      }

      return null;
    },
    load(id) {
      if (id.startsWith(VIRTUAL_LUCIDE_PREFIX)) {
        const qIdx = id.indexOf('?');
        const params = qIdx !== -1 ? new URLSearchParams(id.slice(qIdx + 1)) : null;
        const rawMissing = params?.get('missing') ?? '';
        const missingNames = rawMissing
          .split(',')
          .map((s) => s.trim())
          .filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== 'default');

        const lines: string[] = [
          `export * from 'lucide-react';`,
          `import * as LucideIcons from 'lucide-react';`,
          `import { createVectorIconComponent } from ${JSON.stringify(normalizedShimPath)};`,
          `export default LucideIcons;`,
        ];
        for (const name of missingNames) {
          lines.push(
            `export const ${name} = createVectorIconComponent(${JSON.stringify(name)});`
          );
        }
        return lines.join('\n');
      }

      if (!id.startsWith(VIRTUAL_STUB_PREFIX)) {
        return null;
      }

      const qIdx = id.indexOf('?');
      const params = qIdx !== -1 ? new URLSearchParams(id.slice(qIdx + 1)) : null;
      const rawExports = params?.get('exports') ?? '';
      const extraExportNames = rawExports
        .split(',')
        .map((s) => s.trim())
        .filter(
          (s) =>
            /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) &&
            s !== 'default' &&
            !knownShimExports.has(s)
        );

      const lines: string[] = [
        `import React from 'react';`,
        `import { View } from 'react-native';`,
        `export * from ${JSON.stringify(normalizedShimPath)};`,
        `import * as KnownShims from ${JSON.stringify(normalizedShimPath)};`,
        `import DefaultShim, { SAFE_CHAINABLE_PROXY } from ${JSON.stringify(normalizedShimPath)};`,
        `function createUniversalComponentStub(displayName) {`,
        `  const Comp = React.forwardRef(function UniversalNativeStub(props, ref) {`,
        `    if (typeof props?.render === 'function') {`,
        `      return props.render({`,
        `        field: { name: props?.name ?? '', value: props?.defaultValue ?? '', onChange: () => undefined, onBlur: () => undefined, ref: () => undefined },`,
        `        fieldState: { invalid: false, isTouched: false, isDirty: false, error: undefined },`,
        `        formState: { errors: {}, isSubmitting: false, isValid: true },`,
        `      });`,
        `    }`,
        `    const content = typeof props?.children === 'function' ? props.children(SAFE_CHAINABLE_PROXY) : props?.children;`,
        `    return React.createElement(View, { style: props?.style, className: props?.className, ref }, content);`,
        `  });`,
        `  Comp.displayName = displayName;`,
        `  return new Proxy(Comp, {`,
        `    get(target, prop) {`,
        `      if (prop in target) return target[prop];`,
        `      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {`,
        `        return createUniversalComponentStub(displayName + '.' + prop);`,
        `      }`,
        `      return SAFE_CHAINABLE_PROXY;`,
        `    },`,
        `  });`,
        `}`,
        `function resolveStubExport(name) {`,
        `  if (name in KnownShims) return KnownShims[name];`,
        `  if (DefaultShim && name in DefaultShim) return DefaultShim[name];`,
        `  if (/^use[A-Z]/.test(name)) return () => SAFE_CHAINABLE_PROXY;`,
        `  if (/^[A-Z]/.test(name)) return createUniversalComponentStub(name);`,
        `  return SAFE_CHAINABLE_PROXY;`,
        `}`,
        `export default DefaultShim;`,
      ];

      for (const name of extraExportNames) {
        lines.push(`export const ${name} = resolveStubExport(${JSON.stringify(name)});`);
      }

      return lines.join('\n');
    },
  };
}
