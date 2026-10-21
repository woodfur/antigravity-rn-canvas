import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _traverse, { type NodePath } from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import { getJsxTagName } from '../../plugins/viteRnSourceInject';

const traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse;
const generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate;

export interface NavigationEdge {
  id: string;
  fromScreen: string;
  toScreen: string;
  triggerLabel: string;
  line: number;
}

export interface ScreenMetadata {
  id: string;
  name: string;
  routeName: string;
  filePath: string;
  elementCount: number;
  outgoingFlows: NavigationEdge[];
  parseError?: string;
}

export type StyleValue = string | number;

export interface InspectedElement {
  file: string;
  astPath: string;
  tagName: string;
  line: number;
  col: number;
  textContent: string | null;
  hasDynamicText: boolean;
  isTextEditable: boolean;
  styleSource: 'stylesheet' | 'inline' | 'none';
  styleSheetKey: string | null;
  styles: Record<string, StyleValue>;
  codeSnippet: string;
  navigationTarget: string | null;
}

export interface PatchPayload {
  file: string;
  astPath: string;
  line?: number;
  col?: number;
  text?: string;
  styles?: Record<string, StyleValue | null | undefined>;
}

export interface ReorderPayload {
  file: string;
  astPath: string;
  targetAstPath?: string;
  placement?: 'before' | 'after';
  direction?: 'up' | 'down';
}

interface HistoryEntry {
  file: string;
  previousContent: string;
  nextContent: string;
  description: string;
  timestamp: number;
}

const MAX_HISTORY = 50;
const undoStack: HistoryEntry[] = [];
const redoStack: HistoryEntry[] = [];

// Per-file sequential write queue to prevent race conditions during rapid slider scrubbing
const fileWriteLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const prev = fileWriteLocks.get(filePath) ?? Promise.resolve();
  const next = prev.then(task, task);
  fileWriteLocks.set(
    filePath,
    next.catch(() => undefined)
  );
  return next;
}

const SCREEN_DIR_CANDIDATES = ['src/screens', 'screens', 'app', 'src/app'] as const;
const IGNORED_SCAN_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  'ios',
  'android',
  'vendor',
  'coverage',
  '.agents',
  '.gemini',
]);

function countScreenFilesInDirectory(screensDir: string, maxDepth = 4): number {
  let count = 0;

  function walk(curr: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: fsSync.Dirent[] = [];
    try {
      entries = fsSync.readdirSync(curr, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '__tests__' ||
          entry.name === 'components'
        ) {
          continue;
        }
        walk(path.join(curr, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const f = entry.name;
        if (f.startsWith('_') || f.startsWith('+')) continue;
        if (f === 'index.ts' || f === 'index.js') continue;
        if (f.includes('.test.') || f.includes('.spec.') || f.endsWith('.d.ts')) continue;
        if (f.endsWith('.tsx') || f.endsWith('.jsx')) {
          count++;
        }
      }
    }
  }

  walk(screensDir, 0);
  return count;
}

function hasDirectScreenFiles(dirPath: string): { found: boolean; screenCount: number } {
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(dirPath, rel);
    try {
      if (fsSync.existsSync(full) && fsSync.statSync(full).isDirectory()) {
        const count = countScreenFilesInDirectory(full);
        if (count > 0) {
          return { found: true, screenCount: count };
        }
      }
    } catch {
      // Ignore unreadable directories
    }
  }
  return { found: false, screenCount: 0 };
}

function scoreMobileCandidate(dirPath: string, screenCount: number): number {
  let score = screenCount;
  const folderName = path.basename(dirPath).toLowerCase();
  if (/mobile|native|expo|app|client/.test(folderName)) {
    score += 10;
  }
  if (fsSync.existsSync(path.join(dirPath, 'app.json')) || fsSync.existsSync(path.join(dirPath, 'eas.json'))) {
    score += 25;
  }
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    if (fsSync.existsSync(pkgPath)) {
      const pkgRaw = fsSync.readFileSync(pkgPath, 'utf-8');
      if (pkgRaw.includes('"react-native"') || pkgRaw.includes('"expo"')) {
        score += 20;
      }
    }
  } catch {
    // Ignore malformed package.json
  }
  return score;
}

/**
 * Automatically locates the React Native / Expo mobile project root even when invoked
 * from a top-level monorepo or parent workspace folder (e.g., containing `mobile/` or `apps/mobile/`).
 */
export function findMobileAppRoot(rawRoot: string): string {
  const normalizedRoot = path.resolve(rawRoot);
  if (!fsSync.existsSync(normalizedRoot)) {
    return normalizedRoot;
  }

  // 1. Check if rawRoot itself directly contains React Native / Expo screens
  const direct = hasDirectScreenFiles(normalizedRoot);
  if (direct.found) {
    return normalizedRoot;
  }

  // 2. Scan up to 2 levels of subdirectories for a nested mobile app
  let bestCandidate: string | null = null;
  let bestScore = -1;

  function scanSubdirs(parentDir: string, depth: number) {
    if (depth > 2) return;
    let entries: fsSync.Dirent[] = [];
    try {
      entries = fsSync.readdirSync(parentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (IGNORED_SCAN_DIRS.has(entry.name)) continue;

      const subPath = path.join(parentDir, entry.name);
      const check = hasDirectScreenFiles(subPath);
      if (check.found) {
        const score = scoreMobileCandidate(subPath, check.screenCount);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = subPath;
        }
      } else if (depth < 2) {
        scanSubdirs(subPath, depth + 1);
      }
    }
  }

  scanSubdirs(normalizedRoot, 1);
  return bestCandidate ?? normalizedRoot;
}

/**
 * Resolves the active target project root (supports ANTIGRAVITY_TARGET_PROJECT and nested mobile folders).
 */
export function getActiveProjectRoot(fallbackRoot: string): string {
  const envTarget = process.env.ANTIGRAVITY_TARGET_PROJECT;
  const baseRoot =
    envTarget && fsSync.existsSync(envTarget)
      ? path.resolve(envTarget)
      : path.resolve(fallbackRoot);
  return findMobileAppRoot(baseRoot);
}

/**
 * Finds the active screens directory inside a React Native / Expo project.
 * Checks `src/screens`, `screens`, `app` (Expo Router), and `src/app`.
 */
export function resolveScreensDirectory(projectRoot: string): {
  dirPath: string;
  relDir: string;
} {
  const normalizedRoot = findMobileAppRoot(projectRoot);

  // Prefer a candidate directory that actually contains .tsx/.jsx screen files
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(normalizedRoot, rel);
    if (
      fsSync.existsSync(full) &&
      fsSync.statSync(full).isDirectory() &&
      countScreenFilesInDirectory(full) > 0
    ) {
      return { dirPath: full, relDir: rel };
    }
  }

  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(normalizedRoot, rel);
    if (fsSync.existsSync(full) && fsSync.statSync(full).isDirectory()) {
      return { dirPath: full, relDir: rel };
    }
  }

  return {
    dirPath: path.join(normalizedRoot, 'src/screens'),
    relDir: 'src/screens',
  };
}

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeRealpath(targetPath: string): string {
  try {
    return fsSync.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

/**
 * Validates that a relative file path stays strictly inside the project's screens directory
 * (`src/screens`, `screens`, or `app`) and ends with `.tsx` or `.jsx`.
 * Prevents lexical path traversal (`../`) and symbolic link escape attacks.
 */
export function resolveSafeScreenPath(workspaceRoot: string, relativeFile: string): string {
  const normalizedRoot = safeRealpath(getActiveProjectRoot(workspaceRoot));
  const cleanRel = String(relativeFile ?? '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(normalizedRoot, cleanRel);

  const allowedDirs = ['src/screens', 'screens', 'app', 'src/app'].map((d) => {
    const candidate = path.resolve(normalizedRoot, d);
    return fsSync.existsSync(candidate) ? safeRealpath(candidate) : candidate;
  });

  const isLexicallyAllowed = allowedDirs.some(
    (dir) => resolved.startsWith(dir + path.sep) || resolved === dir
  );

  if (!isLexicallyAllowed) {
    throw new Error(
      `Security violation: File path "${relativeFile}" is outside allowed screen directories (src/screens, screens, app)`
    );
  }
  if (!resolved.endsWith('.tsx') && !resolved.endsWith('.jsx')) {
    throw new Error(`Invalid file extension for "${relativeFile}". Only .tsx and .jsx are allowed.`);
  }

  // Reject symbolic links or symlinked ancestor directories that escape the allowed screens directories
  if (fsSync.existsSync(resolved)) {
    const stat = fsSync.lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Security violation: Symbolic link "${relativeFile}" is not permitted inside screen directories`
      );
    }
    const realTarget = safeRealpath(resolved);
    const isRealInsideAllowed = allowedDirs.some(
      (dir) => realTarget.startsWith(dir + path.sep) || realTarget === dir
    );
    if (!isRealInsideAllowed) {
      throw new Error(
        `Security violation: Canonical path for "${relativeFile}" resolves outside allowed screen directories`
      );
    }
    return realTarget;
  }

  return resolved;
}

/**
 * Normalizes a route target string (e.g. '/(tabs)/product-detail' or 'ProductDetailScreen') to screen ID.
 */
export function normalizeRouteTarget(rawTarget: string): string {
  const trimmed = rawTarget
    .replace(/^\/+/, '')
    .replace(/\([^)]+\)\/?/g, '')
    .replace(/Screen$/, '')
    .replace(/\/index$/, '');
  if (!trimmed || trimmed === 'index') return 'Home';
  if (trimmed.includes('-') || trimmed.includes('/') || trimmed === trimmed.toLowerCase()) {
    return trimmed
      .split(/[-_/]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  return trimmed;
}

/**
 * Extracts primitive value (string or number) from an AST expression node.
 */
function extractLiteralValue(node: t.Node | null | undefined): StyleValue | undefined {
  if (!node) return undefined;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isUnaryExpression(node) && node.operator === '-' && t.isNumericLiteral(node.argument)) {
    return -node.argument.value;
  }
  return undefined;
}

/**
 * Collects all `StyleSheet.create({ ... })` style definitions in an AST.
 */
function collectStyleSheetMap(ast: t.File): {
  identifierName: string;
  styleObjects: Map<string, t.ObjectExpression>;
  valuesMap: Map<string, Record<string, StyleValue>>;
} {
  let identifierName = 'styles';
  const styleObjects = new Map<string, t.ObjectExpression>();
  const valuesMap = new Map<string, Record<string, StyleValue>>();

  traverse(ast, {
    VariableDeclarator(nodePath) {
      const { id, init } = nodePath.node;
      if (!t.isIdentifier(id) || !init) return;

      const isStyleSheetCreate =
        t.isCallExpression(init) &&
        t.isMemberExpression(init.callee) &&
        t.isIdentifier(init.callee.object, { name: 'StyleSheet' }) &&
        t.isIdentifier(init.callee.property, { name: 'create' }) &&
        init.arguments.length > 0 &&
        t.isObjectExpression(init.arguments[0]);

      if (!isStyleSheetCreate) return;

      identifierName = id.name;
      const rootObj = init.arguments[0] as t.ObjectExpression;

      for (const prop of rootObj.properties) {
        if (t.isObjectProperty(prop) && t.isObjectExpression(prop.value)) {
          const keyName = t.isIdentifier(prop.key)
            ? prop.key.name
            : t.isStringLiteral(prop.key)
              ? prop.key.value
              : null;
          if (!keyName) continue;

          styleObjects.set(keyName, prop.value);
          const styleRecord: Record<string, StyleValue> = {};

          for (const rule of prop.value.properties) {
            if (t.isObjectProperty(rule)) {
              const ruleKey = t.isIdentifier(rule.key)
                ? rule.key.name
                : t.isStringLiteral(rule.key)
                  ? rule.key.value
                  : null;
              const val = extractLiteralValue(rule.value);
              if (ruleKey && val !== undefined) {
                styleRecord[ruleKey] = val;
              }
            }
          }
          valuesMap.set(keyName, styleRecord);
        }
      }
    },
  });

  return { identifierName, styleObjects, valuesMap };
}

/**
 * Extracts static text content and checks if a JSXElement contains dynamic expressions.
 */
function inspectJsxTextChildren(jsxElement: t.JSXElement): {
  textContent: string | null;
  hasDynamicText: boolean;
  isTextEditable: boolean;
} {
  const tagName = getJsxTagName(jsxElement.openingElement.name);
  const isTextComponent = tagName === 'Text' || tagName.endsWith('.Text');

  let hasDynamicText = false;
  const textParts: string[] = [];
  let hasChildElements = false;

  for (const child of jsxElement.children) {
    if (t.isJSXText(child)) {
      const cleaned = child.value.replace(/\s+/g, ' ').trim();
      if (cleaned) textParts.push(cleaned);
    } else if (t.isJSXExpressionContainer(child)) {
      if (t.isStringLiteral(child.expression)) {
        textParts.push(child.expression.value);
      } else if (t.isNumericLiteral(child.expression)) {
        textParts.push(String(child.expression.value));
      } else if (!t.isJSXEmptyExpression(child.expression)) {
        hasDynamicText = true;
      }
    } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      hasChildElements = true;
    }
  }

  if (hasChildElements && !isTextComponent) {
    return {
      textContent: null,
      hasDynamicText: false,
      isTextEditable: false,
    };
  }

  const joined = textParts.join(' ').trim();
  const isTextEditable = (isTextComponent || joined.length > 0) && !hasDynamicText && !hasChildElements;

  return {
    textContent: joined.length > 0 || isTextComponent ? joined : null,
    hasDynamicText,
    isTextEditable,
  };
}

/**
 * Extracts `navigation.navigate('Target')` or `router.push('/target')` target on an element's `onPress`.
 */
function extractElementNavigationTarget(openingElement: t.JSXOpeningElement): string | null {
  for (const attr of openingElement.attributes) {
    if (
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name, { name: 'onPress' }) &&
      t.isJSXExpressionContainer(attr.value)
    ) {
      const expr = attr.value.expression;
      if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
        const codeStr = generate(expr).code;
        const match = codeStr.match(/(?:navigate|push|replace)\(\s*['"]([^'"]+)['"]/);
        if (match) return normalizeRouteTarget(match[1]);
      }
    }
  }
  return null;
}

/**
 * Resolves the style properties and style source for a given JSXOpeningElement.
 */
function resolveElementStyles(
  openingElement: t.JSXOpeningElement,
  styleSheetInfo: ReturnType<typeof collectStyleSheetMap>
): {
  styleSource: 'stylesheet' | 'inline' | 'none';
  styleSheetKey: string | null;
  inlineObject: t.ObjectExpression | null;
  styles: Record<string, StyleValue>;
} {
  let styleSource: 'stylesheet' | 'inline' | 'none' = 'none';
  let styleSheetKey: string | null = null;
  let inlineObject: t.ObjectExpression | null = null;
  const styles: Record<string, StyleValue> = {};

  const styleAttr = openingElement.attributes.find(
    (attr): attr is t.JSXAttribute =>
      t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'style' })
  );

  if (!styleAttr || !t.isJSXExpressionContainer(styleAttr.value)) {
    return { styleSource, styleSheetKey, inlineObject, styles };
  }

  const expr = styleAttr.value.expression;

  const processExpression = (node: t.Expression | t.SpreadElement | t.JSXEmptyExpression) => {
    if (
      t.isMemberExpression(node) &&
      t.isIdentifier(node.object, { name: styleSheetInfo.identifierName }) &&
      t.isIdentifier(node.property)
    ) {
      const key = node.property.name;
      styleSheetKey = key;
      styleSource = 'stylesheet';
      const sheetStyles = styleSheetInfo.valuesMap.get(key);
      if (sheetStyles) {
        Object.assign(styles, sheetStyles);
      }
    } else if (t.isObjectExpression(node)) {
      inlineObject = node;
      if (styleSource === 'none') {
        styleSource = 'inline';
      }
      for (const prop of node.properties) {
        if (t.isObjectProperty(prop)) {
          const propKey = t.isIdentifier(prop.key)
            ? prop.key.name
            : t.isStringLiteral(prop.key)
              ? prop.key.value
              : null;
          const val = extractLiteralValue(prop.value);
          if (propKey && val !== undefined) {
            styles[propKey] = val;
          }
        }
      }
    } else if (t.isArrayExpression(node)) {
      for (const el of node.elements) {
        if (el && (t.isExpression(el) || t.isSpreadElement(el))) {
          processExpression(el);
        }
      }
    }
  };

  processExpression(expr);

  return { styleSource, styleSheetKey, inlineObject, styles };
}

export interface DiscoveredScreenFile {
  id: string;
  name: string;
  routeName: string;
  relPath: string;
  fullPath: string;
}

/**
 * Synchronously discovers all screen files in the active React Native / Expo project
 * (`src/screens`, `screens`, `app`, or `src/app`), supporting nested route folders.
 */
export function discoverScreenFilesSync(workspaceRoot: string): DiscoveredScreenFile[] {
  const activeRoot = getActiveProjectRoot(workspaceRoot);
  const { dirPath: screensDir, relDir } = resolveScreensDirectory(activeRoot);

  const collectedRelFromScreensDir: string[] = [];

  function walk(currDir: string, relPrefix: string, depth: number) {
    if (depth > 4) return;
    let dirents: fsSync.Dirent[] = [];
    try {
      dirents = fsSync.readdirSync(currDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirents) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'components') {
          continue;
        }
        walk(
          path.join(currDir, entry.name),
          relPrefix ? `${relPrefix}/${entry.name}` : entry.name,
          depth + 1
        );
      } else if (entry.isFile()) {
        const f = entry.name;
        if (f.startsWith('_') || f.startsWith('+')) continue;
        if (f === 'index.ts' || f === 'index.js') continue;
        if (f.includes('.test.') || f.includes('.spec.') || f.endsWith('.d.ts')) continue;
        if (!f.endsWith('.tsx') && !f.endsWith('.jsx')) continue;

        collectedRelFromScreensDir.push(relPrefix ? `${relPrefix}/${f}` : f);
      }
    }
  }

  walk(screensDir, '', 0);
  collectedRelFromScreensDir.sort();

  const seenIds = new Set<string>();
  const files: DiscoveredScreenFile[] = [];

  for (const subRel of collectedRelFromScreensDir) {
    const relPath = `${relDir}/${subRel}`.replace(/\\/g, '/');
    const fullPath = path.join(screensDir, subRel);
    const noExt = subRel.replace(/\.(tsx|jsx)$/, '');
    const baseFileName = path.basename(noExt);

    let routeName = normalizeRouteTarget(noExt);
    if (seenIds.has(routeName)) {
      routeName = normalizeRouteTarget(noExt.replace(/[()]/g, ''));
    }
    seenIds.add(routeName);

    const displayName = baseFileName.endsWith('Screen') ? baseFileName : `${routeName}Screen`;

    files.push({
      id: routeName,
      name: displayName,
      routeName,
      relPath,
      fullPath,
    });
  }

  return files;
}

/**
 * Discovers all screens in the active React Native / Expo project (`src/screens`, `screens`, or `app`)
 * and extracts their navigation flow graph.
 */
export async function discoverScreens(workspaceRoot: string): Promise<ScreenMetadata[]> {
  const screenFiles = discoverScreenFilesSync(workspaceRoot);
  const results: ScreenMetadata[] = [];

  for (const item of screenFiles) {
    const { id: routeName, name, relPath, fullPath } = item;

    try {
      const code = await fs.readFile(fullPath, 'utf-8');
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      });

      let elementCount = 0;
      const outgoingFlows: NavigationEdge[] = [];

      traverse(ast, {
        JSXOpeningElement(nodePath) {
          const tagName = getJsxTagName(nodePath.node.name);
          if (tagName !== 'Fragment' && tagName !== 'React.Fragment' && tagName !== '') {
            elementCount++;
          }
        },
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;
          // Match navigation.navigate('Route') or router.push('/route') / router.replace('/route')
          const isNavigateCall =
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.property) &&
            ['navigate', 'push', 'replace'].includes(callee.property.name) &&
            args.length > 0 &&
            t.isStringLiteral(args[0]);

          if (!isNavigateCall) return;

          const targetRoute = normalizeRouteTarget((args[0] as t.StringLiteral).value);
          const line = nodePath.node.loc?.start.line ?? 1;

          let triggerLabel = `Navigate to ${targetRoute}`;
          const jsxParent = nodePath.findParent((p) => p.isJSXElement()) as NodePath<t.JSXElement> | null;
          if (jsxParent) {
            const rawCode = generate(jsxParent.node).code;
            const textMatches = Array.from(rawCode.matchAll(/>([^<>{}\n]+)</g))
              .map((m) => m[1].trim())
              .filter(Boolean);
            if (textMatches.length > 0) {
              triggerLabel = textMatches.join(' · ');
            }
          }

          const edgeId = `${routeName}->${targetRoute}:${line}`;
          if (!outgoingFlows.some((e) => e.fromScreen === routeName && e.toScreen === targetRoute)) {
            outgoingFlows.push({
              id: edgeId,
              fromScreen: routeName,
              toScreen: targetRoute,
              triggerLabel,
              line,
            });
          }
        },
      });

      results.push({
        id: routeName,
        name,
        routeName,
        filePath: relPath,
        elementCount,
        outgoingFlows,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: routeName,
        name,
        routeName,
        filePath: relPath,
        elementCount: 0,
        outgoingFlows: [],
        parseError: msg,
      });
    }
  }

  return results;
}

/**
 * Inspects a specific JSX element inside a screen file by its deterministic `astPath`
 * (or fallback `line` number) and returns its resolved styles, copy, and code snippet.
 */
export async function inspectElement(
  workspaceRoot: string,
  params: { file: string; astPath: string; line?: number; col?: number }
): Promise<InspectedElement> {
  const fullPath = resolveSafeScreenPath(workspaceRoot, params.file);
  const code = await fs.readFile(fullPath, 'utf-8');

  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });

  const styleSheetInfo = collectStyleSheetMap(ast);

  let matchedElement: t.JSXElement | null = null;
  let matchedIndex = -1;
  let currentIndex = 0;

  const targetIndex = Number.parseInt(params.astPath, 10);

  traverse(ast, {
    JSXOpeningElement(nodePath) {
      const tagName = getJsxTagName(nodePath.node.name);
      if (tagName === 'Fragment' || tagName === 'React.Fragment' || tagName === '') {
        return;
      }

      const idx = currentIndex++;
      const parentJsx = nodePath.parentPath.isJSXElement() ? nodePath.parentPath.node : null;
      if (!parentJsx) return;

      if (!Number.isNaN(targetIndex) && idx === targetIndex) {
        matchedElement = parentJsx;
        matchedIndex = idx;
      } else if (!matchedElement && params.line && nodePath.node.loc?.start.line === params.line) {
        matchedElement = parentJsx;
        matchedIndex = idx;
      }
    },
  });

  if (!matchedElement) {
    throw new Error(`Element at astPath=${params.astPath} (line=${params.line ?? '?'}) not found in ${params.file}`);
  }

  const element = matchedElement as t.JSXElement;
  const opening = element.openingElement;
  const tagName = getJsxTagName(opening.name);
  const line = opening.loc?.start.line ?? 1;
  const col = opening.loc?.start.column ?? 0;

  const textInfo = inspectJsxTextChildren(element);
  const styleInfo = resolveElementStyles(opening, styleSheetInfo);
  const navigationTarget = extractElementNavigationTarget(opening);

  const snippetRaw = generate(element, { concise: false }).code;
  const codeSnippet = snippetRaw.length > 600 ? `${snippetRaw.slice(0, 600)}\n  /* ... */` : snippetRaw;

  return {
    file: params.file,
    astPath: String(matchedIndex),
    tagName,
    line,
    col,
    textContent: textInfo.textContent,
    hasDynamicText: textInfo.hasDynamicText,
    isTextEditable: textInfo.isTextEditable,
    styleSource: styleInfo.styleSource,
    styleSheetKey: styleInfo.styleSheetKey,
    styles: styleInfo.styles,
    codeSnippet,
    navigationTarget,
  };
}

function createSafeJsxTextChild(text: string): t.JSXText | t.JSXExpressionContainer {
  // @babel/generator prints JSXText.value verbatim without escaping '{', '}', '<', or '>'.
  // Wrap any string containing JSX metacharacters, newlines, or leading/trailing whitespace
  // inside a JSXExpressionContainer(StringLiteral) so Babel safely escapes it as {"..."}.
  if (/[{}<>]|[\r\n]|^\s|\s$/.test(text)) {
    return t.jsxExpressionContainer(t.stringLiteral(text));
  }
  return t.jsxText(text);
}

function upsertObjectProperty(
  objExpr: t.ObjectExpression,
  key: string,
  val: StyleValue | null | undefined
) {
  if (!key || FORBIDDEN_OBJECT_KEYS.has(key) || key.length > 80) {
    throw new Error(`Security violation: Invalid style property name "${key}"`);
  }

  const existingIndex = objExpr.properties.findIndex((prop) => {
    if (!t.isObjectProperty(prop)) return false;
    const k = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    return k === key;
  });

  if (val === null || val === undefined || val === '') {
    if (existingIndex !== -1) {
      objExpr.properties.splice(existingIndex, 1);
    }
    return;
  }

  if (typeof val !== 'number' && typeof val !== 'string') {
    throw new Error(`Security violation: Style value for "${key}" must be a string or finite number`);
  }
  if (typeof val === 'number' && !Number.isFinite(val)) {
    throw new Error(`Security violation: Style value for "${key}" must be a finite number`);
  }
  if (typeof val === 'string' && val.length > 500) {
    throw new Error(`Security violation: Style value for "${key}" exceeds maximum length`);
  }

  const valueNode =
    typeof val === 'number'
      ? val < 0
        ? t.unaryExpression('-', t.numericLiteral(Math.abs(val)))
        : t.numericLiteral(val)
      : t.stringLiteral(val);

  if (existingIndex !== -1) {
    const existingProp = objExpr.properties[existingIndex] as t.ObjectProperty;
    existingProp.value = valueNode;
  } else {
    const keyNode = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? t.identifier(key)
      : t.stringLiteral(key);
    objExpr.properties.push(t.objectProperty(keyNode, valueNode));
  }
}

/**
 * Surgically patches a JSX element's text copy and/or StyleSheet/inline styles in the `.tsx` file.
 */
export async function patchElement(
  workspaceRoot: string,
  payload: PatchPayload
): Promise<{
  element: InspectedElement;
  undoAvailable: number;
  redoAvailable: number;
}> {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);

  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, 'utf-8');

    const ast = parse(previousContent, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    const styleSheetInfo = collectStyleSheetMap(ast);
    const targetIndex = Number.parseInt(payload.astPath, 10);

    let matchedElement: t.JSXElement | null = null;
    let currentIndex = 0;

    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === 'Fragment' || tagName === 'React.Fragment' || tagName === '') {
          return;
        }
        const idx = currentIndex++;
        const parentJsx = nodePath.parentPath.isJSXElement() ? nodePath.parentPath.node : null;
        if (!parentJsx) return;

        if (!Number.isNaN(targetIndex) && idx === targetIndex) {
          matchedElement = parentJsx;
        } else if (!matchedElement && payload.line && nodePath.node.loc?.start.line === payload.line) {
          matchedElement = parentJsx;
        }
      },
    });

    if (!matchedElement) {
      throw new Error(`Target JSX element (astPath=${payload.astPath}) not found in ${payload.file}`);
    }

    const element = matchedElement as t.JSXElement;
    const opening = element.openingElement;

    if (payload.text !== undefined) {
      if (typeof payload.text !== 'string') {
        throw new Error('Invalid text payload: must be a string.');
      }
      const textCheck = inspectJsxTextChildren(element);
      if (textCheck.hasDynamicText) {
        throw new Error(
          'Cannot overwrite dynamic JSX expression inside <Text>. Use "Ask Antigravity" for structural/expression edits.'
        );
      }
      element.children = [createSafeJsxTextChild(payload.text)];
    }

    if (payload.styles && Object.keys(payload.styles).length > 0) {
      const styleInfo = resolveElementStyles(opening, styleSheetInfo);

      let targetObject: t.ObjectExpression | null = null;

      if (styleInfo.styleSheetKey && styleSheetInfo.styleObjects.has(styleInfo.styleSheetKey)) {
        targetObject = styleSheetInfo.styleObjects.get(styleInfo.styleSheetKey)!;
      } else if (styleInfo.inlineObject) {
        targetObject = styleInfo.inlineObject;
      } else {
        const newObj = t.objectExpression([]);
        const existingStyleAttrIndex = opening.attributes.findIndex(
          (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'style' })
        );

        if (existingStyleAttrIndex !== -1) {
          const existingAttr = opening.attributes[existingStyleAttrIndex] as t.JSXAttribute;
          if (t.isJSXExpressionContainer(existingAttr.value) && t.isExpression(existingAttr.value.expression)) {
            existingAttr.value = t.jsxExpressionContainer(
              t.arrayExpression([existingAttr.value.expression, newObj])
            );
          }
        } else {
          opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier('style'), t.jsxExpressionContainer(newObj))
          );
        }
        targetObject = newObj;
      }

      for (const [styleKey, styleVal] of Object.entries(payload.styles)) {
        upsertObjectProperty(targetObject, styleKey, styleVal);
      }
    }

    const output = generate(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true },
    });

    const nextContent = output.code + '\n';

    if (nextContent !== previousContent) {
      await fs.writeFile(fullPath, nextContent, 'utf-8');
      undoStack.push({
        file: payload.file,
        previousContent,
        nextContent,
        description: `Updated ${getJsxTagName(opening.name)} in ${path.basename(payload.file)}`,
        timestamp: Date.now(),
      });
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
    }

    const updatedElement = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: payload.astPath,
    });

    return {
      element: updatedElement,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length,
    };
  });
}

/**
 * Surgically reorders a JSXElement among its Flexbox siblings in the `.tsx` AST.
 * Supports either explicit target sibling (`targetAstPath` + `placement: 'before' | 'after'`)
 * or relative movement (`direction: 'up' | 'down'`).
 */
export async function reorderElement(
  workspaceRoot: string,
  payload: ReorderPayload
): Promise<{
  element: InspectedElement;
  undoAvailable: number;
  redoAvailable: number;
}> {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);

  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, 'utf-8');
    const ast = parse(previousContent, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    interface IndexedElementInfo {
      index: number;
      element: t.JSXElement;
      parent: t.JSXElement | t.JSXFragment | null;
    }

    const byIndex = new Map<number, IndexedElementInfo>();
    const parentByElement = new Map<t.JSXElement, t.JSXElement | t.JSXFragment | null>();
    let currentIndex = 0;

    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === 'Fragment' || tagName === 'React.Fragment' || tagName === '') {
          return;
        }
        const idx = currentIndex++;
        const jsxElPath = nodePath.parentPath;
        if (!jsxElPath.isJSXElement()) return;

        const element = jsxElPath.node;
        const parentNode = jsxElPath.parentPath?.node;
        const parent =
          t.isJSXElement(parentNode) || t.isJSXFragment(parentNode) ? parentNode : null;

        byIndex.set(idx, { index: idx, element, parent });
        parentByElement.set(element, parent);
      },
    });

    const sourceIdx = Number.parseInt(payload.astPath, 10);
    const sourceInfo = byIndex.get(sourceIdx);
    if (!sourceInfo || !sourceInfo.parent) {
      throw new Error(`Element at astPath=${payload.astPath} cannot be reordered (no JSX parent container).`);
    }

    const parentContainer = sourceInfo.parent;
    const sourceElement = sourceInfo.element;

    const jsxSiblings = parentContainer.children.filter((c): c is t.JSXElement =>
      t.isJSXElement(c)
    );
    if (jsxSiblings.length < 2) {
      throw new Error('Element has no sibling elements inside its parent container to reorder with.');
    }

    let targetSibling: t.JSXElement | null = null;
    let placement: 'before' | 'after' = payload.placement === 'after' ? 'after' : 'before';

    if (payload.direction === 'up' || payload.direction === 'down') {
      const currPos = jsxSiblings.indexOf(sourceElement);
      if (currPos === -1) {
        throw new Error('Could not locate element inside parent children list.');
      }
      if (payload.direction === 'up') {
        if (currPos === 0) {
          throw new Error('Element is already first in its container.');
        }
        targetSibling = jsxSiblings[currPos - 1];
        placement = 'before';
      } else {
        if (currPos >= jsxSiblings.length - 1) {
          throw new Error('Element is already last in its container.');
        }
        targetSibling = jsxSiblings[currPos + 1];
        placement = 'after';
      }
    } else if (payload.targetAstPath !== undefined) {
      const targetIdx = Number.parseInt(payload.targetAstPath, 10);
      const rawTargetInfo = byIndex.get(targetIdx);
      if (!rawTargetInfo) {
        throw new Error(`Target sibling at astPath=${payload.targetAstPath} not found.`);
      }

      // Walk up from rawTargetInfo.element until we find the direct child of parentContainer
      let candidate: t.JSXElement | null = rawTargetInfo.element;
      while (candidate && parentByElement.get(candidate) !== parentContainer) {
        const p = parentByElement.get(candidate);
        candidate = p && t.isJSXElement(p) ? p : null;
      }
      if (!candidate || candidate === sourceElement) {
        throw new Error('Target drop element is not a sibling inside the same Flexbox container.');
      }
      targetSibling = candidate;
    }

    if (!targetSibling || targetSibling === sourceElement) {
      throw new Error('Invalid reorder target sibling.');
    }

    // Rebuild parentContainer.children preserving non-whitespace nodes in the new order
    const meaningfulChildren = parentContainer.children.filter(
      (child) => !(t.isJSXText(child) && child.value.trim() === '')
    );

    const withoutSource = meaningfulChildren.filter((child) => child !== sourceElement);
    const targetPos = withoutSource.indexOf(targetSibling);
    if (targetPos === -1) {
      throw new Error('Target sibling not found in parent children.');
    }

    const insertIdx = placement === 'after' ? targetPos + 1 : targetPos;
    withoutSource.splice(insertIdx, 0, sourceElement);
    parentContainer.children = withoutSource;

    // Re-index the mutated AST to find the updated pre-order astPath of sourceElement
    let newSourceAstPath = payload.astPath;
    let reindexCounter = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === 'Fragment' || tagName === 'React.Fragment' || tagName === '') {
          return;
        }
        const idx = reindexCounter++;
        if (nodePath.parentPath.isJSXElement() && nodePath.parentPath.node === sourceElement) {
          newSourceAstPath = String(idx);
        }
      },
    });

    const output = generate(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true },
    });

    const nextContent = output.code + '\n';
    if (nextContent !== previousContent) {
      await fs.writeFile(fullPath, nextContent, 'utf-8');
      undoStack.push({
        file: payload.file,
        previousContent,
        nextContent,
        description: `Reordered ${getJsxTagName(sourceElement.openingElement.name)} in ${path.basename(payload.file)}`,
        timestamp: Date.now(),
      });
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
    }

    const updatedElement = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: newSourceAstPath,
    });

    return {
      element: updatedElement,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length,
    };
  });
}

export async function undoLastPatch(workspaceRoot: string): Promise<{
  restoredFile: string | null;
  description: string | null;
  undoAvailable: number;
  redoAvailable: number;
}> {
  const entry = undoStack.pop();
  if (!entry) {
    return {
      restoredFile: null,
      description: null,
      undoAvailable: 0,
      redoAvailable: redoStack.length,
    };
  }

  const fullPath = resolveSafeScreenPath(workspaceRoot, entry.file);
  await withFileLock(fullPath, async () => {
    await fs.writeFile(fullPath, entry.previousContent, 'utf-8');
  });

  redoStack.push(entry);

  return {
    restoredFile: entry.file,
    description: entry.description,
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length,
  };
}

export async function redoLastPatch(workspaceRoot: string): Promise<{
  restoredFile: string | null;
  description: string | null;
  undoAvailable: number;
  redoAvailable: number;
}> {
  const entry = redoStack.pop();
  if (!entry) {
    return {
      restoredFile: null,
      description: null,
      undoAvailable: undoStack.length,
      redoAvailable: 0,
    };
  }

  const fullPath = resolveSafeScreenPath(workspaceRoot, entry.file);
  await withFileLock(fullPath, async () => {
    await fs.writeFile(fullPath, entry.nextContent, 'utf-8');
  });

  undoStack.push(entry);

  return {
    restoredFile: entry.file,
    description: entry.description,
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length,
  };
}

export function getHistoryStatus(): { undoAvailable: number; redoAvailable: number } {
  return {
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length,
  };
}
