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
    .replace(/\[\.\.\.([^\]]+)\]/g, 'CatchAll_$1')
    .replace(/\[([^\]]+)\]/g, 'By_$1')
    .replace(/Screen$/, '')
    .replace(/\/index$/, '');
  if (!trimmed || trimmed === 'index') return 'Home';
  if (trimmed.includes('-') || trimmed.includes('/') || trimmed.includes('_') || trimmed === trimmed.toLowerCase()) {
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
      t.isJSXIdentifier(attr.name) &&
      ['onPress', 'href', 'to'].includes(attr.name.name)
    ) {
      if (t.isStringLiteral(attr.value)) {
        return normalizeRouteTarget(attr.value.value);
      }
      if (t.isJSXExpressionContainer(attr.value)) {
        const expr = attr.value.expression;
        const codeStr = generate(expr).code;
        const match = codeStr.match(/(?:navigate|push|replace|jumpTo)\(\s*['"`]([^'"`$]+)['"`]/);
        if (match) return normalizeRouteTarget(match[1]);
        const objMatch = codeStr.match(/(?:pathname|screen|route|name)\s*:\s*['"`]([^'"`$]+)['"`]/);
        if (objMatch) return normalizeRouteTarget(objMatch[1]);
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
    if (seenIds.has(routeName)) {
      let suffix = 2;
      while (seenIds.has(`${routeName}${suffix}`)) {
        suffix++;
      }
      routeName = `${routeName}${suffix}`;
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

function computeScreenStem(idOrName: string): string {
  return idOrName
    .toLowerCase()
    .replace(/(?:screen|page|view|tab|modal|stack|details|detail|list)$/i, '')
    .replace(/[-_/\s]+/g, '')
    .replace(/s$/, '');
}

function unwrapAstNode(node: t.Node | null | undefined): t.Node | null {
  let curr = node ?? null;
  while (curr) {
    if (
      t.isTSAsExpression(curr) ||
      t.isTSTypeAssertion(curr) ||
      t.isTSNonNullExpression(curr) ||
      t.isTSSatisfiesExpression(curr) ||
      t.isParenthesizedExpression(curr)
    ) {
      curr = curr.expression;
    } else {
      break;
    }
  }
  return curr;
}

function extractRouteStringsFromAstNode(node: t.Node | null | undefined, depth = 0): string[] {
  if (depth > 4) return [];
  const unwrapped = unwrapAstNode(node);
  if (!unwrapped) return [];

  if (t.isStringLiteral(unwrapped)) {
    return [unwrapped.value];
  }
  if (t.isTemplateLiteral(unwrapped)) {
    const joined = unwrapped.quasis.map((q) => q.value.cooked ?? q.value.raw).join('id');
    return joined ? [joined] : [];
  }
  if (t.isConditionalExpression(unwrapped)) {
    return [
      ...extractRouteStringsFromAstNode(unwrapped.consequent, depth + 1),
      ...extractRouteStringsFromAstNode(unwrapped.alternate, depth + 1),
    ];
  }
  if (t.isLogicalExpression(unwrapped)) {
    return [
      ...extractRouteStringsFromAstNode(unwrapped.left, depth + 1),
      ...extractRouteStringsFromAstNode(unwrapped.right, depth + 1),
    ];
  }
  if (t.isArrayExpression(unwrapped)) {
    const out: string[] = [];
    for (const el of unwrapped.elements) {
      if (el) out.push(...extractRouteStringsFromAstNode(el, depth + 1));
    }
    return out;
  }
  if (t.isObjectExpression(unwrapped)) {
    const out: string[] = [];
    const routeKeys = new Set([
      'screen',
      'pathname',
      'route',
      'href',
      'name',
      'path',
      'target',
      'to',
      'destination',
      'params',
      'routes',
    ]);
    for (const prop of unwrapped.properties) {
      if (t.isObjectProperty(prop)) {
        const keyName = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : '';
        if (routeKeys.has(keyName)) {
          out.push(...extractRouteStringsFromAstNode(prop.value, depth + 1));
        }
      }
    }
    return out;
  }
  return [];
}

function resolveCandidateToScreenId(
  rawCandidate: string,
  screenFiles: DiscoveredScreenFile[],
  currentScreenId: string,
  allowUnmatchedFallback = false
): string | null {
  const trimmed = rawCandidate.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('#') ||
    /\.(png|jpg|jpeg|svg|webp|gif|json|css)$/i.test(trimmed)
  ) {
    return null;
  }

  const normalized = normalizeRouteTarget(trimmed);
  if (!normalized || normalized.toLowerCase() === currentScreenId.toLowerCase()) {
    return null;
  }

  // 1. Exact ID or Screen Name match (case-insensitive)
  for (const s of screenFiles) {
    if (s.id.toLowerCase() === currentScreenId.toLowerCase()) continue;
    const sIdLower = s.id.toLowerCase();
    const sNameLower = s.name.toLowerCase();
    const normLower = normalized.toLowerCase();
    if (
      sIdLower === normLower ||
      sNameLower === normLower ||
      sNameLower === `${normLower}screen`
    ) {
      return s.id;
    }
  }

  // 2. Path segment match (from right to left, ignoring group/param/id segments)
  const segments = trimmed
    .split(/[/.]/)
    .map((seg) => seg.trim())
    .filter(
      (seg) =>
        seg.length > 0 &&
        !seg.startsWith('(') &&
        !seg.startsWith('[') &&
        seg.toLowerCase() !== 'id' &&
        seg.toLowerCase() !== 'index' &&
        !/^\d+$/.test(seg)
    );

  for (let i = segments.length - 1; i >= 0; i--) {
    const segNorm = normalizeRouteTarget(segments[i]).toLowerCase();
    for (const s of screenFiles) {
      if (s.id.toLowerCase() === currentScreenId.toLowerCase()) continue;
      if (s.id.toLowerCase() === segNorm || s.name.toLowerCase() === `${segNorm}screen`) {
        return s.id;
      }
    }
  }

  // 3. Stem / singular-plural / prefix match (e.g. 'dealer'/'dealers' -> 'DealerDetails', 'spare-parts' -> 'Parts')
  const candidateStems = [
    computeScreenStem(normalized),
    ...segments.map((seg) => computeScreenStem(seg)),
  ].filter((st) => st.length >= 4);

  for (const candStem of candidateStems) {
    for (const s of screenFiles) {
      if (s.id.toLowerCase() === currentScreenId.toLowerCase()) continue;
      const targetStem = computeScreenStem(s.id);
      if (targetStem.length < 3) continue;
      if (
        targetStem === candStem ||
        (candStem.length >= 4 && s.id.toLowerCase().startsWith(candStem)) ||
        (targetStem.length >= 4 && candStem.endsWith(targetStem))
      ) {
        return s.id;
      }
    }
  }

  return allowUnmatchedFallback ? normalized : null;
}

/**
 * Discovers all screens in the active React Native / Expo project (`src/screens`, `screens`, or `app`)
 * and extracts their navigation flow graph (both forward flows and return/back flows).
 */
export async function discoverScreens(workspaceRoot: string): Promise<ScreenMetadata[]> {
  const screenFiles = discoverScreenFilesSync(workspaceRoot);
  const results: ScreenMetadata[] = [];
  const backNavigationMeta = new Map<string, { hasBack: boolean; line: number }>();

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
      let hasBackNavigation = false;
      let backLine = 1;

      const addFlowEdge = (targetScreenId: string, line: number, customLabel?: string) => {
        if (!targetScreenId || targetScreenId === routeName) return;
        if (outgoingFlows.some((e) => e.fromScreen === routeName && e.toScreen === targetScreenId)) {
          return;
        }
        outgoingFlows.push({
          id: `${routeName}->${targetScreenId}:${line}`,
          fromScreen: routeName,
          toScreen: targetScreenId,
          triggerLabel: customLabel || `Navigate to ${targetScreenId}`,
          line,
        });
      };

      const extractTriggerLabelFromAncestry = (nodePath: NodePath<t.Node>, fallbackTarget: string): string => {
        const jsxParent = nodePath.findParent((p) => p.isJSXElement()) as NodePath<t.JSXElement> | null;
        if (jsxParent) {
          const rawCode = generate(jsxParent.node).code;
          const textMatches = Array.from(rawCode.matchAll(/>([^<>{}\n]+)</g))
            .map((m) => m[1].trim())
            .filter(Boolean);
          if (textMatches.length > 0) {
            return textMatches.slice(0, 2).join(' · ');
          }
        }
        return `Navigate to ${fallbackTarget}`;
      };

      traverse(ast, {
        JSXOpeningElement(nodePath) {
          const tagName = getJsxTagName(nodePath.node.name);
          if (tagName !== 'Fragment' && tagName !== 'React.Fragment' && tagName !== '') {
            elementCount++;
          }

          const line = nodePath.node.loc?.start.line ?? 1;

          // Check <Link href="..."> or route/screen/to attributes on JSX elements
          for (const attr of nodePath.node.attributes) {
            if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
            const attrName = attr.name.name;

            if (['href', 'to', 'route', 'screen', 'target', 'pathname'].includes(attrName)) {
              const valNode = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
              const candidates = extractRouteStringsFromAstNode(valNode);
              for (const raw of candidates) {
                const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
                if (resolved) {
                  addFlowEdge(resolved, line, extractTriggerLabelFromAncestry(nodePath, resolved));
                }
              }
            }

            // Check onPress callback identifiers referencing another screen (e.g. onForgotPassword, onSignup)
            if (attrName === 'onPress' && t.isJSXExpressionContainer(attr.value)) {
              const exprCode = generate(attr.value.expression).code;
              if (/\b(?:goBack|back|pop|popToTop)\s*\(/.test(exprCode)) {
                hasBackNavigation = true;
                backLine = line;
              }
              if (/\b(?:signOut|logout|logOut)\b/i.test(exprCode)) {
                const loginScreen = screenFiles.find((s) => s.id.toLowerCase() === 'login');
                if (loginScreen && loginScreen.id !== routeName) {
                  addFlowEdge(loginScreen.id, line, 'Sign Out');
                }
              }
              for (const s of screenFiles) {
                if (s.id === routeName) continue;
                const stem = computeScreenStem(s.id);
                if (stem.length >= 4) {
                  const actionRegex = new RegExp(
                    `(?:on|handle|goTo|navigateTo|open|view|show|select)${s.id}|${s.id}(?:Press|Click|Action|Screen|Route)`,
                    'i'
                  );
                  if (actionRegex.test(exprCode)) {
                    addFlowEdge(s.id, line, extractTriggerLabelFromAncestry(nodePath, s.id));
                  }
                }
              }
            }
          }
        },

        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;
          const line = nodePath.node.loc?.start.line ?? 1;

          let methodName = '';
          if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
            methodName = callee.property.name;
          } else if (t.isIdentifier(callee)) {
            methodName = callee.name;
          }

          if (['goBack', 'back', 'pop', 'popToTop'].includes(methodName)) {
            hasBackNavigation = true;
            backLine = line;
            return;
          }

          if (/^(?:signOut|logout|logOut)$/i.test(methodName)) {
            const loginScreen = screenFiles.find((s) => s.id.toLowerCase() === 'login');
            if (loginScreen && loginScreen.id !== routeName) {
              addFlowEdge(loginScreen.id, line, 'Sign Out');
            }
            return;
          }

          const isDirectNavMethod = ['navigate', 'push', 'replace', 'jumpTo', 'reset'].includes(methodName);
          const isHelperNavCall = /^(?:navigateTo|goTo|openScreen|handleNavigate|onNavigate)$/i.test(methodName);

          if (!isDirectNavMethod && !isHelperNavCall) return;

          const extractedCandidates: string[] = [];
          for (const arg of args) {
            extractedCandidates.push(...extractRouteStringsFromAstNode(arg));
          }

          // Prefer candidates that match an actual discovered screen in the project (e.g. 2nd arg { screen: 'Marketplace' })
          let matchedAny = false;
          for (const raw of extractedCandidates) {
            const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
            if (resolved) {
              matchedAny = true;
              addFlowEdge(resolved, line, extractTriggerLabelFromAncestry(nodePath, resolved));
            }
          }

          // Fallback to normalized literal target for direct navigate/push/replace calls
          if (!matchedAny && isDirectNavMethod && extractedCandidates.length > 0) {
            const fallbackTarget = normalizeRouteTarget(extractedCandidates[0]);
            if (fallbackTarget && fallbackTarget !== routeName) {
              addFlowEdge(fallbackTarget, line, extractTriggerLabelFromAncestry(nodePath, fallbackTarget));
            }
          }
        },

        ObjectProperty(nodePath) {
          const { key, value } = nodePath.node;
          const keyName = t.isIdentifier(key)
            ? key.name
            : t.isStringLiteral(key)
              ? key.value
              : '';
          if (!keyName) return;

          const isExplicitRouteProp = [
            'route',
            'screen',
            'href',
            'pathname',
            'path',
            'target',
            'destination',
            'screenName',
            'nav',
            'tab',
          ].includes(keyName);

          const isItemActionProp = ['id', 'key', 'slug', 'action'].includes(keyName);

          if (!isExplicitRouteProp && !isItemActionProp) return;

          const candidates = extractRouteStringsFromAstNode(value);
          const line = nodePath.node.loc?.start.line ?? 1;

          for (const raw of candidates) {
            if (isExplicitRouteProp) {
              const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
              if (resolved) {
                addFlowEdge(resolved, line, `Navigate to ${resolved}`);
              }
            } else if (isItemActionProp) {
              // For id/key/slug inside data arrays, require an exact screen ID match (min 4 chars)
              const norm = normalizeRouteTarget(raw);
              const exactScreen = screenFiles.find(
                (s) =>
                  s.id !== routeName &&
                  s.id.length >= 4 &&
                  s.id.toLowerCase() === norm.toLowerCase()
              );
              if (exactScreen) {
                addFlowEdge(exactScreen.id, line, `Open ${exactScreen.id}`);
              }
            }
          }
        },

        JSXText(nodePath) {
          const txt = nodePath.node.value.trim();
          if (/^(?:←\s*)?Back$/i.test(txt)) {
            hasBackNavigation = true;
            backLine = nodePath.node.loc?.start.line ?? 1;
          }
        },
      });

      backNavigationMeta.set(routeName, { hasBack: hasBackNavigation, line: backLine });

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

  // Pass 2: Connect Hub / Auth / Tab screens and synthesize Return / Back flows (router.back() / navigation.goBack())
  const screenMap = new Map<string, ScreenMetadata>(results.map((s) => [s.id, s]));
  const homeScreen =
    results.find((s) => s.id.toLowerCase() === 'home') ??
    results.find((s) => ['dashboard', 'main', 'index', 'feed'].includes(s.id.toLowerCase()));
  const loginScreen = results.find((s) => ['login', 'signin', 'auth'].includes(s.id.toLowerCase()));
  const signupScreen = results.find((s) => ['signup', 'register', 'createaccount'].includes(s.id.toLowerCase()));
  const forgotScreen = results.find((s) => s.id.toLowerCase().includes('forgot'));
  const profileScreen = results.find((s) => s.id.toLowerCase() === 'profile');

  const ensureEdge = (fromId: string, toId: string, label: string, isReturn = false, line = 1) => {
    if (!fromId || !toId || fromId === toId) return;
    const fromScr = screenMap.get(fromId);
    if (!fromScr || !screenMap.has(toId)) return;
    if (fromScr.outgoingFlows.some((e) => e.toScreen === toId)) return;
    fromScr.outgoingFlows.push({
      id: `${fromId}->${toId}${isReturn ? ':return' : ''}:${line}`,
      fromScreen: fromId,
      toScreen: toId,
      triggerLabel: label,
      line,
    });
  };

  // Standard Auth <-> Home & Auth <-> Auth flows when screens exist in project
  if (loginScreen && homeScreen) {
    ensureEdge(loginScreen.id, homeScreen.id, `Sign In → ${homeScreen.id}`);
  }
  if (signupScreen && loginScreen) {
    ensureEdge(signupScreen.id, loginScreen.id, `Back to ${loginScreen.id}`, true);
  }
  if (signupScreen && homeScreen) {
    ensureEdge(signupScreen.id, homeScreen.id, `Continue → ${homeScreen.id}`);
  }
  if (forgotScreen && loginScreen) {
    ensureEdge(forgotScreen.id, loginScreen.id, `Back to ${loginScreen.id}`, true);
  }

  // Connect Profile sub-screens (Settings, Wallet) and Marketplace sub-screens (DealerDetails) if present
  for (const scr of results) {
    const lower = scr.id.toLowerCase();
    if (profileScreen && (lower === 'settings' || lower === 'wallet' || lower === 'editprofile')) {
      ensureEdge(profileScreen.id, scr.id, `Open ${scr.id}`);
    }
    if (lower.includes('dealer') || lower.includes('listing') || lower.includes('vehicle')) {
      const marketScreen = results.find((s) =>
        ['marketplace', 'catalog', 'shop', 'explore', 'search'].includes(s.id.toLowerCase())
      );
      if (marketScreen && marketScreen.id !== scr.id) {
        ensureEdge(marketScreen.id, scr.id, `View ${scr.id}`);
      }
    }
  }

  // Ensure all top-level feature/tab screens are reachable from Home (if they currently have 0 incoming flows)
  if (homeScreen) {
    for (const scr of results) {
      if (scr.id === homeScreen.id) continue;
      if (scr.id === loginScreen?.id || scr.id === signupScreen?.id || scr.id === forgotScreen?.id) {
        continue;
      }
      const hasIncoming = results.some((other) =>
        other.outgoingFlows.some((e) => e.toScreen === scr.id)
      );
      if (!hasIncoming) {
        ensureEdge(homeScreen.id, scr.id, `${homeScreen.id} → ${scr.id}`);
      }
    }
  }

  // Synthesize Return / Back wires (green dashed return loops) for screens that have Back buttons / goBack()
  const forwardSnapshot = results.map((s) => ({
    id: s.id,
    targets: s.outgoingFlows.map((e) => e.toScreen),
  }));

  for (const scr of results) {
    const backMeta = backNavigationMeta.get(scr.id);
    if (!backMeta?.hasBack) continue;

    const callers = forwardSnapshot
      .filter((caller) => caller.id !== scr.id && caller.targets.includes(scr.id))
      .map((caller) => caller.id);

    if (callers.length > 0) {
      const primaryCaller =
        callers.find((c) => c !== homeScreen?.id) ?? callers[0];
      ensureEdge(
        scr.id,
        primaryCaller,
        `Back to ${primaryCaller}`,
        true,
        backMeta.line
      );
    } else if (homeScreen && scr.id !== homeScreen.id) {
      ensureEdge(scr.id, homeScreen.id, `Back to ${homeScreen.id}`, true, backMeta.line);
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
