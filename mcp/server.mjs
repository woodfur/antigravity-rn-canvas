import fs$1 from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import { parse } from "@babel/parser";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import http from "node:http";
const generate$1 = _generate.default ?? _generate;
function getJsxTagName(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    return nameNode.name;
  }
  if (t.isJSXMemberExpression(nameNode)) {
    return `${getJsxTagName(nameNode.object)}.${nameNode.property.name}`;
  }
  if (t.isJSXNamespacedName(nameNode)) {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }
  return "Unknown";
}
function traverse(rootNode, visitors) {
  function createPath(node, parentPath) {
    return {
      node,
      parentPath,
      isJSXElement() {
        return t.isJSXElement(node);
      },
      isJSXFragment() {
        return t.isJSXFragment(node);
      },
      findParent(predicate) {
        let curr = parentPath;
        while (curr) {
          if (predicate(curr)) return curr;
          curr = curr.parentPath;
        }
        return null;
      }
    };
  }
  function visit(node, parentPath) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;
    const typedNode = node;
    const pathObj = createPath(typedNode, parentPath);
    const handler = visitors[typedNode.type];
    if (typeof handler === "function") {
      handler(pathObj);
    }
    const keys = t.VISITOR_KEYS[typedNode.type];
    if (!keys) return;
    const rec = typedNode;
    for (const key of keys) {
      const child = rec[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (child[i]) visit(child[i], pathObj);
        }
      } else if (child && typeof child === "object") {
        visit(child, pathObj);
      }
    }
  }
  visit(rootNode, null);
}
const MAX_HISTORY = 50;
const undoStack = [];
const redoStack = [];
const fileWriteLocks = /* @__PURE__ */ new Map();
function withFileLock(filePath, task) {
  const prev = fileWriteLocks.get(filePath) ?? Promise.resolve();
  const next = prev.then(task, task);
  fileWriteLocks.set(
    filePath,
    next.catch(() => void 0)
  );
  return next;
}
const SCREEN_DIR_CANDIDATES = ["src/screens", "screens", "app", "src/app"];
const IGNORED_SCAN_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".expo",
  ".turbo",
  "ios",
  "android",
  "vendor",
  "coverage",
  ".agents",
  ".gemini"
]);
function countScreenFilesInDirectory(screensDir, maxDepth = 4) {
  let count = 0;
  function walk(curr, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs$1.readdirSync(curr, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "components") {
          continue;
        }
        walk(path.join(curr, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const f = entry.name;
        if (f.startsWith("_") || f.startsWith("+")) continue;
        if (f === "index.ts" || f === "index.js") continue;
        if (f.includes(".test.") || f.includes(".spec.") || f.endsWith(".d.ts")) continue;
        if (f.endsWith(".tsx") || f.endsWith(".jsx")) {
          count++;
        }
      }
    }
  }
  walk(screensDir, 0);
  return count;
}
function hasDirectScreenFiles(dirPath) {
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(dirPath, rel);
    try {
      if (fs$1.existsSync(full) && fs$1.statSync(full).isDirectory()) {
        const count = countScreenFilesInDirectory(full);
        if (count > 0) {
          return { found: true, screenCount: count };
        }
      }
    } catch {
    }
  }
  return { found: false, screenCount: 0 };
}
function scoreMobileCandidate(dirPath, screenCount) {
  let score = screenCount;
  const folderName = path.basename(dirPath).toLowerCase();
  if (/mobile|native|expo|app|client/.test(folderName)) {
    score += 10;
  }
  if (fs$1.existsSync(path.join(dirPath, "app.json")) || fs$1.existsSync(path.join(dirPath, "eas.json"))) {
    score += 25;
  }
  try {
    const pkgPath = path.join(dirPath, "package.json");
    if (fs$1.existsSync(pkgPath)) {
      const pkgRaw = fs$1.readFileSync(pkgPath, "utf-8");
      if (pkgRaw.includes('"react-native"') || pkgRaw.includes('"expo"')) {
        score += 20;
      }
    }
  } catch {
  }
  return score;
}
function findMobileAppRoot(rawRoot) {
  const normalizedRoot = path.resolve(rawRoot);
  if (!fs$1.existsSync(normalizedRoot)) {
    return normalizedRoot;
  }
  const direct = hasDirectScreenFiles(normalizedRoot);
  if (direct.found) {
    return normalizedRoot;
  }
  let bestCandidate = null;
  let bestScore = -1;
  function scanSubdirs(parentDir, depth) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs$1.readdirSync(parentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
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
function getActiveProjectRoot(fallbackRoot) {
  const envTarget = process.env.ANTIGRAVITY_TARGET_PROJECT;
  const baseRoot = envTarget && fs$1.existsSync(envTarget) ? path.resolve(envTarget) : path.resolve(fallbackRoot);
  return findMobileAppRoot(baseRoot);
}
function resolveScreensDirectory(projectRoot) {
  const normalizedRoot = findMobileAppRoot(projectRoot);
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(normalizedRoot, rel);
    if (fs$1.existsSync(full) && fs$1.statSync(full).isDirectory() && countScreenFilesInDirectory(full) > 0) {
      return { dirPath: full, relDir: rel };
    }
  }
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(normalizedRoot, rel);
    if (fs$1.existsSync(full) && fs$1.statSync(full).isDirectory()) {
      return { dirPath: full, relDir: rel };
    }
  }
  return {
    dirPath: path.join(normalizedRoot, "src/screens"),
    relDir: "src/screens"
  };
}
const FORBIDDEN_OBJECT_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function safeRealpath(targetPath) {
  try {
    return fs$1.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}
function resolveSafeScreenPath(workspaceRoot, relativeFile) {
  const normalizedRoot = safeRealpath(getActiveProjectRoot(workspaceRoot));
  const cleanRel = String(relativeFile ?? "").replace(/^[/\\]+/, "");
  const resolved = path.resolve(normalizedRoot, cleanRel);
  const allowedDirs = ["src/screens", "screens", "app", "src/app"].map((d) => {
    const candidate = path.resolve(normalizedRoot, d);
    return fs$1.existsSync(candidate) ? safeRealpath(candidate) : candidate;
  });
  const isLexicallyAllowed = allowedDirs.some(
    (dir) => resolved.startsWith(dir + path.sep) || resolved === dir
  );
  if (!isLexicallyAllowed) {
    throw new Error(
      `Security violation: File path "${relativeFile}" is outside allowed screen directories (src/screens, screens, app)`
    );
  }
  if (!resolved.endsWith(".tsx") && !resolved.endsWith(".jsx")) {
    throw new Error(`Invalid file extension for "${relativeFile}". Only .tsx and .jsx are allowed.`);
  }
  if (fs$1.existsSync(resolved)) {
    const stat = fs$1.lstatSync(resolved);
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
function normalizeRouteTarget(rawTarget) {
  const trimmed = rawTarget.replace(/^\/+/, "").replace(/\([^)]+\)\/?/g, "").replace(/\[\.\.\.([^\]]+)\]/g, "CatchAll_$1").replace(/\[([^\]]+)\]/g, "By_$1").replace(/Screen$/, "").replace(/\/index$/, "");
  if (!trimmed || trimmed === "index") return "Home";
  if (trimmed.includes("-") || trimmed.includes("/") || trimmed.includes("_") || trimmed === trimmed.toLowerCase()) {
    return trimmed.split(/[-_/]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  }
  return trimmed;
}
function extractLiteralValue(node) {
  if (!node) return void 0;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isUnaryExpression(node) && node.operator === "-" && t.isNumericLiteral(node.argument)) {
    return -node.argument.value;
  }
  return void 0;
}
function collectStyleSheetMap(ast) {
  let identifierName = "styles";
  const styleObjects = /* @__PURE__ */ new Map();
  const valuesMap = /* @__PURE__ */ new Map();
  traverse(ast, {
    VariableDeclarator(nodePath) {
      const { id, init } = nodePath.node;
      if (!t.isIdentifier(id) || !init) return;
      const isStyleSheetCreate = t.isCallExpression(init) && t.isMemberExpression(init.callee) && t.isIdentifier(init.callee.object, { name: "StyleSheet" }) && t.isIdentifier(init.callee.property, { name: "create" }) && init.arguments.length > 0 && t.isObjectExpression(init.arguments[0]);
      if (!isStyleSheetCreate) return;
      identifierName = id.name;
      const rootObj = init.arguments[0];
      for (const prop of rootObj.properties) {
        if (t.isObjectProperty(prop) && t.isObjectExpression(prop.value)) {
          const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
          if (!keyName) continue;
          styleObjects.set(keyName, prop.value);
          const styleRecord = {};
          for (const rule of prop.value.properties) {
            if (t.isObjectProperty(rule)) {
              const ruleKey = t.isIdentifier(rule.key) ? rule.key.name : t.isStringLiteral(rule.key) ? rule.key.value : null;
              const val = extractLiteralValue(rule.value);
              if (ruleKey && val !== void 0) {
                styleRecord[ruleKey] = val;
              }
            }
          }
          valuesMap.set(keyName, styleRecord);
        }
      }
    }
  });
  return { identifierName, styleObjects, valuesMap };
}
function inspectJsxTextChildren(jsxElement) {
  const tagName = getJsxTagName(jsxElement.openingElement.name);
  const isTextComponent = tagName === "Text" || tagName.endsWith(".Text");
  let hasDynamicText = false;
  const textParts = [];
  let hasChildElements = false;
  for (const child of jsxElement.children) {
    if (t.isJSXText(child)) {
      const cleaned = child.value.replace(/\s+/g, " ").trim();
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
      isTextEditable: false
    };
  }
  const joined = textParts.join(" ").trim();
  const isTextEditable = (isTextComponent || joined.length > 0) && !hasDynamicText && !hasChildElements;
  return {
    textContent: joined.length > 0 || isTextComponent ? joined : null,
    hasDynamicText,
    isTextEditable
  };
}
function extractElementNavigationTarget(openingElement) {
  for (const attr of openingElement.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && ["onPress", "href", "to"].includes(attr.name.name)) {
      if (t.isStringLiteral(attr.value)) {
        return normalizeRouteTarget(attr.value.value);
      }
      if (t.isJSXExpressionContainer(attr.value)) {
        const expr = attr.value.expression;
        const codeStr = generate$1(expr).code;
        const match = codeStr.match(/(?:navigate|push|replace|jumpTo)\(\s*['"`]([^'"`$]+)['"`]/);
        if (match) return normalizeRouteTarget(match[1]);
        const objMatch = codeStr.match(/(?:pathname|screen|route|name)\s*:\s*['"`]([^'"`$]+)['"`]/);
        if (objMatch) return normalizeRouteTarget(objMatch[1]);
      }
    }
  }
  return null;
}
function resolveElementStyles(openingElement, styleSheetInfo) {
  let styleSource = "none";
  let styleSheetKey = null;
  let inlineObject = null;
  const styles = {};
  const styleAttr = openingElement.attributes.find(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: "style" })
  );
  if (!styleAttr || !t.isJSXExpressionContainer(styleAttr.value)) {
    return { styleSource, styleSheetKey, inlineObject, styles };
  }
  const expr = styleAttr.value.expression;
  const processExpression = (node) => {
    if (t.isMemberExpression(node) && t.isIdentifier(node.object, { name: styleSheetInfo.identifierName }) && t.isIdentifier(node.property)) {
      const key = node.property.name;
      styleSheetKey = key;
      styleSource = "stylesheet";
      const sheetStyles = styleSheetInfo.valuesMap.get(key);
      if (sheetStyles) {
        Object.assign(styles, sheetStyles);
      }
    } else if (t.isObjectExpression(node)) {
      inlineObject = node;
      if (styleSource === "none") {
        styleSource = "inline";
      }
      for (const prop of node.properties) {
        if (t.isObjectProperty(prop)) {
          const propKey = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
          const val = extractLiteralValue(prop.value);
          if (propKey && val !== void 0) {
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
function discoverScreenFilesSync(workspaceRoot) {
  const activeRoot = getActiveProjectRoot(workspaceRoot);
  const { dirPath: screensDir, relDir } = resolveScreensDirectory(activeRoot);
  const collectedRelFromScreensDir = [];
  function walk(currDir, relPrefix, depth) {
    if (depth > 4) return;
    let dirents = [];
    try {
      dirents = fs$1.readdirSync(currDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirents) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "components") {
          continue;
        }
        walk(
          path.join(currDir, entry.name),
          relPrefix ? `${relPrefix}/${entry.name}` : entry.name,
          depth + 1
        );
      } else if (entry.isFile()) {
        const f = entry.name;
        if (f.startsWith("_") || f.startsWith("+")) continue;
        if (f === "index.ts" || f === "index.js") continue;
        if (f.includes(".test.") || f.includes(".spec.") || f.endsWith(".d.ts")) continue;
        if (!f.endsWith(".tsx") && !f.endsWith(".jsx")) continue;
        collectedRelFromScreensDir.push(relPrefix ? `${relPrefix}/${f}` : f);
      }
    }
  }
  walk(screensDir, "", 0);
  collectedRelFromScreensDir.sort();
  const seenIds = /* @__PURE__ */ new Set();
  const files = [];
  for (const subRel of collectedRelFromScreensDir) {
    const relPath = `${relDir}/${subRel}`.replace(/\\/g, "/");
    const fullPath = path.join(screensDir, subRel);
    const noExt = subRel.replace(/\.(tsx|jsx)$/, "");
    const baseFileName = path.basename(noExt);
    let routeName = normalizeRouteTarget(noExt);
    if (seenIds.has(routeName)) {
      routeName = normalizeRouteTarget(noExt.replace(/[()]/g, ""));
    }
    if (seenIds.has(routeName)) {
      let suffix = 2;
      while (seenIds.has(`${routeName}${suffix}`)) {
        suffix++;
      }
      routeName = `${routeName}${suffix}`;
    }
    seenIds.add(routeName);
    const displayName = baseFileName.endsWith("Screen") ? baseFileName : `${routeName}Screen`;
    files.push({
      id: routeName,
      name: displayName,
      routeName,
      relPath,
      fullPath
    });
  }
  return files;
}
function computeScreenStem(idOrName) {
  return idOrName.toLowerCase().replace(/(?:screen|page|view|tab|modal|stack|details|detail|list)$/i, "").replace(/[-_/\s]+/g, "").replace(/s$/, "");
}
function unwrapAstNode(node) {
  let curr = node ?? null;
  while (curr) {
    if (t.isTSAsExpression(curr) || t.isTSTypeAssertion(curr) || t.isTSNonNullExpression(curr) || t.isTSSatisfiesExpression(curr) || t.isParenthesizedExpression(curr)) {
      curr = curr.expression;
    } else {
      break;
    }
  }
  return curr;
}
function extractRouteStringsFromAstNode(node, depth = 0) {
  if (depth > 4) return [];
  const unwrapped = unwrapAstNode(node);
  if (!unwrapped) return [];
  if (t.isStringLiteral(unwrapped)) {
    return [unwrapped.value];
  }
  if (t.isTemplateLiteral(unwrapped)) {
    const joined = unwrapped.quasis.map((q) => q.value.cooked ?? q.value.raw).join("id");
    return joined ? [joined] : [];
  }
  if (t.isConditionalExpression(unwrapped)) {
    return [
      ...extractRouteStringsFromAstNode(unwrapped.consequent, depth + 1),
      ...extractRouteStringsFromAstNode(unwrapped.alternate, depth + 1)
    ];
  }
  if (t.isLogicalExpression(unwrapped)) {
    return [
      ...extractRouteStringsFromAstNode(unwrapped.left, depth + 1),
      ...extractRouteStringsFromAstNode(unwrapped.right, depth + 1)
    ];
  }
  if (t.isArrayExpression(unwrapped)) {
    const out = [];
    for (const el of unwrapped.elements) {
      if (el) out.push(...extractRouteStringsFromAstNode(el, depth + 1));
    }
    return out;
  }
  if (t.isObjectExpression(unwrapped)) {
    const out = [];
    const routeKeys = /* @__PURE__ */ new Set([
      "screen",
      "pathname",
      "route",
      "href",
      "name",
      "path",
      "target",
      "to",
      "destination",
      "params",
      "routes"
    ]);
    for (const prop of unwrapped.properties) {
      if (t.isObjectProperty(prop)) {
        const keyName = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : "";
        if (routeKeys.has(keyName)) {
          out.push(...extractRouteStringsFromAstNode(prop.value, depth + 1));
        }
      }
    }
    return out;
  }
  return [];
}
function resolveCandidateToScreenId(rawCandidate, screenFiles, currentScreenId, allowUnmatchedFallback = false) {
  const trimmed = rawCandidate.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("#") || /\.(png|jpg|jpeg|svg|webp|gif|json|css)$/i.test(trimmed)) {
    return null;
  }
  const normalized = normalizeRouteTarget(trimmed);
  if (!normalized || normalized.toLowerCase() === currentScreenId.toLowerCase()) {
    return null;
  }
  for (const s of screenFiles) {
    if (s.id.toLowerCase() === currentScreenId.toLowerCase()) continue;
    const sIdLower = s.id.toLowerCase();
    const sNameLower = s.name.toLowerCase();
    const normLower = normalized.toLowerCase();
    if (sIdLower === normLower || sNameLower === normLower || sNameLower === `${normLower}screen`) {
      return s.id;
    }
  }
  const segments = trimmed.split(/[/.]/).map((seg) => seg.trim()).filter(
    (seg) => seg.length > 0 && !seg.startsWith("(") && !seg.startsWith("[") && seg.toLowerCase() !== "id" && seg.toLowerCase() !== "index" && !/^\d+$/.test(seg)
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
  const candidateStems = [
    computeScreenStem(normalized),
    ...segments.map((seg) => computeScreenStem(seg))
  ].filter((st) => st.length >= 4);
  for (const candStem of candidateStems) {
    for (const s of screenFiles) {
      if (s.id.toLowerCase() === currentScreenId.toLowerCase()) continue;
      const targetStem = computeScreenStem(s.id);
      if (targetStem.length < 3) continue;
      if (targetStem === candStem || candStem.length >= 4 && s.id.toLowerCase().startsWith(candStem) || targetStem.length >= 4 && candStem.endsWith(targetStem)) {
        return s.id;
      }
    }
  }
  return allowUnmatchedFallback ? normalized : null;
}
async function discoverScreens(workspaceRoot) {
  const screenFiles = discoverScreenFilesSync(workspaceRoot);
  const results = [];
  const backNavigationMeta = /* @__PURE__ */ new Map();
  for (const item of screenFiles) {
    const { id: routeName, name, relPath, fullPath } = item;
    try {
      const code = await fs.readFile(fullPath, "utf-8");
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"]
      });
      let elementCount = 0;
      const outgoingFlows = [];
      let hasBackNavigation = false;
      let backLine = 1;
      const addFlowEdge = (targetScreenId, line, customLabel) => {
        if (!targetScreenId || targetScreenId === routeName) return;
        if (outgoingFlows.some((e) => e.fromScreen === routeName && e.toScreen === targetScreenId)) {
          return;
        }
        outgoingFlows.push({
          id: `${routeName}->${targetScreenId}:${line}`,
          fromScreen: routeName,
          toScreen: targetScreenId,
          triggerLabel: customLabel || `Navigate to ${targetScreenId}`,
          line
        });
      };
      const extractTriggerLabelFromAncestry = (nodePath, fallbackTarget) => {
        const jsxParent = nodePath.findParent((p) => p.isJSXElement());
        if (jsxParent) {
          const rawCode = generate$1(jsxParent.node).code;
          const textMatches = Array.from(rawCode.matchAll(/>([^<>{}\n]+)</g)).map((m) => m[1].trim()).filter(Boolean);
          if (textMatches.length > 0) {
            return textMatches.slice(0, 2).join(" · ");
          }
        }
        return `Navigate to ${fallbackTarget}`;
      };
      traverse(ast, {
        JSXOpeningElement(nodePath) {
          var _a;
          const tagName = getJsxTagName(nodePath.node.name);
          if (tagName !== "Fragment" && tagName !== "React.Fragment" && tagName !== "") {
            elementCount++;
          }
          const line = ((_a = nodePath.node.loc) == null ? void 0 : _a.start.line) ?? 1;
          for (const attr of nodePath.node.attributes) {
            if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;
            const attrName = attr.name.name;
            if (["href", "to", "route", "screen", "target", "pathname"].includes(attrName)) {
              const valNode = t.isJSXExpressionContainer(attr.value) ? attr.value.expression : attr.value;
              const candidates = extractRouteStringsFromAstNode(valNode);
              for (const raw of candidates) {
                const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
                if (resolved) {
                  addFlowEdge(resolved, line, extractTriggerLabelFromAncestry(nodePath, resolved));
                }
              }
            }
            if (attrName === "onPress" && t.isJSXExpressionContainer(attr.value)) {
              const exprCode = generate$1(attr.value.expression).code;
              if (/\b(?:goBack|back|pop|popToTop)\s*\(/.test(exprCode)) {
                hasBackNavigation = true;
                backLine = line;
              }
              if (/\b(?:signOut|logout|logOut)\b/i.test(exprCode)) {
                const loginScreen2 = screenFiles.find((s) => s.id.toLowerCase() === "login");
                if (loginScreen2 && loginScreen2.id !== routeName) {
                  addFlowEdge(loginScreen2.id, line, "Sign Out");
                }
              }
              for (const s of screenFiles) {
                if (s.id === routeName) continue;
                const stem = computeScreenStem(s.id);
                if (stem.length >= 4) {
                  const actionRegex = new RegExp(
                    `(?:on|handle|goTo|navigateTo|open|view|show|select)${s.id}|${s.id}(?:Press|Click|Action|Screen|Route)`,
                    "i"
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
          var _a;
          const { callee, arguments: args } = nodePath.node;
          const line = ((_a = nodePath.node.loc) == null ? void 0 : _a.start.line) ?? 1;
          let methodName = "";
          if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
            methodName = callee.property.name;
          } else if (t.isIdentifier(callee)) {
            methodName = callee.name;
          }
          if (["goBack", "back", "pop", "popToTop"].includes(methodName)) {
            hasBackNavigation = true;
            backLine = line;
            return;
          }
          if (/^(?:signOut|logout|logOut)$/i.test(methodName)) {
            const loginScreen2 = screenFiles.find((s) => s.id.toLowerCase() === "login");
            if (loginScreen2 && loginScreen2.id !== routeName) {
              addFlowEdge(loginScreen2.id, line, "Sign Out");
            }
            return;
          }
          const isDirectNavMethod = ["navigate", "push", "replace", "jumpTo", "reset"].includes(methodName);
          const isHelperNavCall = /^(?:navigateTo|goTo|openScreen|handleNavigate|onNavigate)$/i.test(methodName);
          if (!isDirectNavMethod && !isHelperNavCall) return;
          const extractedCandidates = [];
          for (const arg of args) {
            extractedCandidates.push(...extractRouteStringsFromAstNode(arg));
          }
          let matchedAny = false;
          for (const raw of extractedCandidates) {
            const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
            if (resolved) {
              matchedAny = true;
              addFlowEdge(resolved, line, extractTriggerLabelFromAncestry(nodePath, resolved));
            }
          }
          if (!matchedAny && isDirectNavMethod && extractedCandidates.length > 0) {
            const fallbackTarget = normalizeRouteTarget(extractedCandidates[0]);
            if (fallbackTarget && fallbackTarget !== routeName) {
              addFlowEdge(fallbackTarget, line, extractTriggerLabelFromAncestry(nodePath, fallbackTarget));
            }
          }
        },
        ObjectProperty(nodePath) {
          var _a;
          const { key, value } = nodePath.node;
          const keyName = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : "";
          if (!keyName) return;
          const isExplicitRouteProp = [
            "route",
            "screen",
            "href",
            "pathname",
            "path",
            "target",
            "destination",
            "screenName",
            "nav",
            "tab"
          ].includes(keyName);
          const isItemActionProp = ["id", "key", "slug", "action"].includes(keyName);
          if (!isExplicitRouteProp && !isItemActionProp) return;
          const candidates = extractRouteStringsFromAstNode(value);
          const line = ((_a = nodePath.node.loc) == null ? void 0 : _a.start.line) ?? 1;
          for (const raw of candidates) {
            if (isExplicitRouteProp) {
              const resolved = resolveCandidateToScreenId(raw, screenFiles, routeName, false);
              if (resolved) {
                addFlowEdge(resolved, line, `Navigate to ${resolved}`);
              }
            } else if (isItemActionProp) {
              const norm = normalizeRouteTarget(raw);
              const exactScreen = screenFiles.find(
                (s) => s.id !== routeName && s.id.length >= 4 && s.id.toLowerCase() === norm.toLowerCase()
              );
              if (exactScreen) {
                addFlowEdge(exactScreen.id, line, `Open ${exactScreen.id}`);
              }
            }
          }
        },
        JSXText(nodePath) {
          var _a;
          const txt = nodePath.node.value.trim();
          if (/^(?:←\s*)?Back$/i.test(txt)) {
            hasBackNavigation = true;
            backLine = ((_a = nodePath.node.loc) == null ? void 0 : _a.start.line) ?? 1;
          }
        }
      });
      backNavigationMeta.set(routeName, { hasBack: hasBackNavigation, line: backLine });
      results.push({
        id: routeName,
        name,
        routeName,
        filePath: relPath,
        elementCount,
        outgoingFlows
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
        parseError: msg
      });
    }
  }
  const screenMap = new Map(results.map((s) => [s.id, s]));
  const homeScreen = results.find((s) => s.id.toLowerCase() === "home") ?? results.find((s) => ["dashboard", "main", "index", "feed"].includes(s.id.toLowerCase()));
  const loginScreen = results.find((s) => ["login", "signin", "auth"].includes(s.id.toLowerCase()));
  const signupScreen = results.find((s) => ["signup", "register", "createaccount"].includes(s.id.toLowerCase()));
  const forgotScreen = results.find((s) => s.id.toLowerCase().includes("forgot"));
  const profileScreen = results.find((s) => s.id.toLowerCase() === "profile");
  const ensureEdge = (fromId, toId, label, isReturn = false, line = 1) => {
    if (!fromId || !toId || fromId === toId) return;
    const fromScr = screenMap.get(fromId);
    if (!fromScr || !screenMap.has(toId)) return;
    if (fromScr.outgoingFlows.some((e) => e.toScreen === toId)) return;
    fromScr.outgoingFlows.push({
      id: `${fromId}->${toId}${isReturn ? ":return" : ""}:${line}`,
      fromScreen: fromId,
      toScreen: toId,
      triggerLabel: label,
      line
    });
  };
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
  for (const scr of results) {
    const lower = scr.id.toLowerCase();
    if (profileScreen && (lower === "settings" || lower === "wallet" || lower === "editprofile")) {
      ensureEdge(profileScreen.id, scr.id, `Open ${scr.id}`);
    }
    if (lower.includes("dealer") || lower.includes("listing") || lower.includes("vehicle")) {
      const marketScreen = results.find(
        (s) => ["marketplace", "catalog", "shop", "explore", "search"].includes(s.id.toLowerCase())
      );
      if (marketScreen && marketScreen.id !== scr.id) {
        ensureEdge(marketScreen.id, scr.id, `View ${scr.id}`);
      }
    }
  }
  if (homeScreen) {
    for (const scr of results) {
      if (scr.id === homeScreen.id) continue;
      if (scr.id === (loginScreen == null ? void 0 : loginScreen.id) || scr.id === (signupScreen == null ? void 0 : signupScreen.id) || scr.id === (forgotScreen == null ? void 0 : forgotScreen.id)) {
        continue;
      }
      const hasIncoming = results.some(
        (other) => other.outgoingFlows.some((e) => e.toScreen === scr.id)
      );
      if (!hasIncoming) {
        ensureEdge(homeScreen.id, scr.id, `${homeScreen.id} → ${scr.id}`);
      }
    }
  }
  const forwardSnapshot = results.map((s) => ({
    id: s.id,
    targets: s.outgoingFlows.map((e) => e.toScreen)
  }));
  for (const scr of results) {
    const backMeta = backNavigationMeta.get(scr.id);
    if (!(backMeta == null ? void 0 : backMeta.hasBack)) continue;
    const callers = forwardSnapshot.filter((caller) => caller.id !== scr.id && caller.targets.includes(scr.id)).map((caller) => caller.id);
    if (callers.length > 0) {
      const primaryCaller = callers.find((c) => c !== (homeScreen == null ? void 0 : homeScreen.id)) ?? callers[0];
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
async function inspectElement(workspaceRoot, params) {
  var _a, _b;
  const fullPath = resolveSafeScreenPath(workspaceRoot, params.file);
  const code = await fs.readFile(fullPath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"]
  });
  const styleSheetInfo = collectStyleSheetMap(ast);
  let matchedElement = null;
  let matchedIndex = -1;
  let currentIndex = 0;
  const targetIndex = Number.parseInt(params.astPath, 10);
  traverse(ast, {
    JSXOpeningElement(nodePath) {
      var _a2;
      const tagName2 = getJsxTagName(nodePath.node.name);
      if (tagName2 === "Fragment" || tagName2 === "React.Fragment" || tagName2 === "") {
        return;
      }
      const idx = currentIndex++;
      const parentJsx = nodePath.parentPath.isJSXElement() ? nodePath.parentPath.node : null;
      if (!parentJsx) return;
      if (!Number.isNaN(targetIndex) && idx === targetIndex) {
        matchedElement = parentJsx;
        matchedIndex = idx;
      } else if (!matchedElement && params.line && ((_a2 = nodePath.node.loc) == null ? void 0 : _a2.start.line) === params.line) {
        matchedElement = parentJsx;
        matchedIndex = idx;
      }
    }
  });
  if (!matchedElement) {
    throw new Error(`Element at astPath=${params.astPath} (line=${params.line ?? "?"}) not found in ${params.file}`);
  }
  const element = matchedElement;
  const opening = element.openingElement;
  const tagName = getJsxTagName(opening.name);
  const line = ((_a = opening.loc) == null ? void 0 : _a.start.line) ?? 1;
  const col = ((_b = opening.loc) == null ? void 0 : _b.start.column) ?? 0;
  const textInfo = inspectJsxTextChildren(element);
  const styleInfo = resolveElementStyles(opening, styleSheetInfo);
  const navigationTarget = extractElementNavigationTarget(opening);
  const snippetRaw = generate$1(element, { concise: false }).code;
  const codeSnippet = snippetRaw.length > 600 ? `${snippetRaw.slice(0, 600)}
  /* ... */` : snippetRaw;
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
    navigationTarget
  };
}
function createSafeJsxTextChild(text) {
  if (/[{}<>]|[\r\n]|^\s|\s$/.test(text)) {
    return t.jsxExpressionContainer(t.stringLiteral(text));
  }
  return t.jsxText(text);
}
function upsertObjectProperty(objExpr, key, val) {
  if (!key || FORBIDDEN_OBJECT_KEYS.has(key) || key.length > 80) {
    throw new Error(`Security violation: Invalid style property name "${key}"`);
  }
  const existingIndex = objExpr.properties.findIndex((prop) => {
    if (!t.isObjectProperty(prop)) return false;
    const k = t.isIdentifier(prop.key) ? prop.key.name : t.isStringLiteral(prop.key) ? prop.key.value : null;
    return k === key;
  });
  if (val === null || val === void 0 || val === "") {
    if (existingIndex !== -1) {
      objExpr.properties.splice(existingIndex, 1);
    }
    return;
  }
  if (typeof val !== "number" && typeof val !== "string") {
    throw new Error(`Security violation: Style value for "${key}" must be a string or finite number`);
  }
  if (typeof val === "number" && !Number.isFinite(val)) {
    throw new Error(`Security violation: Style value for "${key}" must be a finite number`);
  }
  if (typeof val === "string" && val.length > 500) {
    throw new Error(`Security violation: Style value for "${key}" exceeds maximum length`);
  }
  const valueNode = typeof val === "number" ? val < 0 ? t.unaryExpression("-", t.numericLiteral(Math.abs(val))) : t.numericLiteral(val) : t.stringLiteral(val);
  if (existingIndex !== -1) {
    const existingProp = objExpr.properties[existingIndex];
    existingProp.value = valueNode;
  } else {
    const keyNode = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? t.identifier(key) : t.stringLiteral(key);
    objExpr.properties.push(t.objectProperty(keyNode, valueNode));
  }
}
async function patchElement(workspaceRoot, payload) {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);
  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, "utf-8");
    const ast = parse(previousContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    });
    const styleSheetInfo = collectStyleSheetMap(ast);
    const targetIndex = Number.parseInt(payload.astPath, 10);
    let matchedElement = null;
    let currentIndex = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        var _a;
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = currentIndex++;
        const parentJsx = nodePath.parentPath.isJSXElement() ? nodePath.parentPath.node : null;
        if (!parentJsx) return;
        if (!Number.isNaN(targetIndex) && idx === targetIndex) {
          matchedElement = parentJsx;
        } else if (!matchedElement && payload.line && ((_a = nodePath.node.loc) == null ? void 0 : _a.start.line) === payload.line) {
          matchedElement = parentJsx;
        }
      }
    });
    if (!matchedElement) {
      throw new Error(`Target JSX element (astPath=${payload.astPath}) not found in ${payload.file}`);
    }
    const element = matchedElement;
    const opening = element.openingElement;
    if (payload.text !== void 0) {
      if (typeof payload.text !== "string") {
        throw new Error("Invalid text payload: must be a string.");
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
      let targetObject = null;
      if (styleInfo.styleSheetKey && styleSheetInfo.styleObjects.has(styleInfo.styleSheetKey)) {
        targetObject = styleSheetInfo.styleObjects.get(styleInfo.styleSheetKey);
      } else if (styleInfo.inlineObject) {
        targetObject = styleInfo.inlineObject;
      } else {
        const newObj = t.objectExpression([]);
        const existingStyleAttrIndex = opening.attributes.findIndex(
          (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: "style" })
        );
        if (existingStyleAttrIndex !== -1) {
          const existingAttr = opening.attributes[existingStyleAttrIndex];
          if (t.isJSXExpressionContainer(existingAttr.value) && t.isExpression(existingAttr.value.expression)) {
            existingAttr.value = t.jsxExpressionContainer(
              t.arrayExpression([existingAttr.value.expression, newObj])
            );
          }
        } else {
          opening.attributes.push(
            t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(newObj))
          );
        }
        targetObject = newObj;
      }
      for (const [styleKey, styleVal] of Object.entries(payload.styles)) {
        upsertObjectProperty(targetObject, styleKey, styleVal);
      }
    }
    const output = generate$1(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true }
    });
    const nextContent = output.code + "\n";
    if (nextContent !== previousContent) {
      await fs.writeFile(fullPath, nextContent, "utf-8");
      undoStack.push({
        file: payload.file,
        previousContent,
        nextContent,
        description: `Updated ${getJsxTagName(opening.name)} in ${path.basename(payload.file)}`,
        timestamp: Date.now()
      });
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
    }
    const updatedElement = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: payload.astPath
    });
    return {
      element: updatedElement,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length
    };
  });
}
async function reorderElement(workspaceRoot, payload) {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);
  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, "utf-8");
    const ast = parse(previousContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    });
    const byIndex = /* @__PURE__ */ new Map();
    const parentByElement = /* @__PURE__ */ new Map();
    let currentIndex = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        var _a;
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = currentIndex++;
        const jsxElPath = nodePath.parentPath;
        if (!jsxElPath.isJSXElement()) return;
        const element = jsxElPath.node;
        const parentNode = (_a = jsxElPath.parentPath) == null ? void 0 : _a.node;
        const parent = t.isJSXElement(parentNode) || t.isJSXFragment(parentNode) ? parentNode : null;
        byIndex.set(idx, { index: idx, element, parent });
        parentByElement.set(element, parent);
      }
    });
    const sourceIdx = Number.parseInt(payload.astPath, 10);
    const sourceInfo = byIndex.get(sourceIdx);
    if (!sourceInfo || !sourceInfo.parent) {
      throw new Error(`Element at astPath=${payload.astPath} cannot be reordered (no JSX parent container).`);
    }
    const parentContainer = sourceInfo.parent;
    const sourceElement = sourceInfo.element;
    const jsxSiblings = parentContainer.children.filter(
      (c) => t.isJSXElement(c)
    );
    if (jsxSiblings.length < 2) {
      throw new Error("Element has no sibling elements inside its parent container to reorder with.");
    }
    let targetSibling = null;
    let placement = payload.placement === "after" ? "after" : "before";
    if (payload.direction === "up" || payload.direction === "down") {
      const currPos = jsxSiblings.indexOf(sourceElement);
      if (currPos === -1) {
        throw new Error("Could not locate element inside parent children list.");
      }
      if (payload.direction === "up") {
        if (currPos === 0) {
          throw new Error("Element is already first in its container.");
        }
        targetSibling = jsxSiblings[currPos - 1];
        placement = "before";
      } else {
        if (currPos >= jsxSiblings.length - 1) {
          throw new Error("Element is already last in its container.");
        }
        targetSibling = jsxSiblings[currPos + 1];
        placement = "after";
      }
    } else if (payload.targetAstPath !== void 0) {
      const targetIdx = Number.parseInt(payload.targetAstPath, 10);
      const rawTargetInfo = byIndex.get(targetIdx);
      if (!rawTargetInfo) {
        throw new Error(`Target sibling at astPath=${payload.targetAstPath} not found.`);
      }
      let candidate = rawTargetInfo.element;
      while (candidate && parentByElement.get(candidate) !== parentContainer) {
        const p = parentByElement.get(candidate);
        candidate = p && t.isJSXElement(p) ? p : null;
      }
      if (!candidate || candidate === sourceElement) {
        throw new Error("Target drop element is not a sibling inside the same Flexbox container.");
      }
      targetSibling = candidate;
    }
    if (!targetSibling || targetSibling === sourceElement) {
      throw new Error("Invalid reorder target sibling.");
    }
    const meaningfulChildren = parentContainer.children.filter(
      (child) => !(t.isJSXText(child) && child.value.trim() === "")
    );
    const withoutSource = meaningfulChildren.filter((child) => child !== sourceElement);
    const targetPos = withoutSource.indexOf(targetSibling);
    if (targetPos === -1) {
      throw new Error("Target sibling not found in parent children.");
    }
    const insertIdx = placement === "after" ? targetPos + 1 : targetPos;
    withoutSource.splice(insertIdx, 0, sourceElement);
    parentContainer.children = withoutSource;
    let newSourceAstPath = payload.astPath;
    let reindexCounter = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = reindexCounter++;
        if (nodePath.parentPath.isJSXElement() && nodePath.parentPath.node === sourceElement) {
          newSourceAstPath = String(idx);
        }
      }
    });
    const output = generate$1(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true }
    });
    const nextContent = output.code + "\n";
    if (nextContent !== previousContent) {
      await fs.writeFile(fullPath, nextContent, "utf-8");
      undoStack.push({
        file: payload.file,
        previousContent,
        nextContent,
        description: `Reordered ${getJsxTagName(sourceElement.openingElement.name)} in ${path.basename(payload.file)}`,
        timestamp: Date.now()
      });
      if (undoStack.length > MAX_HISTORY) {
        undoStack.shift();
      }
      redoStack.length = 0;
    }
    const updatedElement = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: newSourceAstPath
    });
    return {
      element: updatedElement,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length
    };
  });
}
const CONTAINER_TAG_NAMES = /* @__PURE__ */ new Set([
  "View",
  "ScrollView",
  "SafeAreaView",
  "KeyboardAvoidingView",
  "Pressable",
  "TouchableOpacity",
  "ImageBackground"
]);
function buildStyleObjectExpression(styles) {
  return t.objectExpression(
    Object.entries(styles).map(
      ([k, v]) => t.objectProperty(
        t.identifier(k),
        typeof v === "number" ? t.numericLiteral(v) : t.stringLiteral(v)
      )
    )
  );
}
function buildInlineStyleAttr(styles) {
  return t.jsxAttribute(
    t.jsxIdentifier("style"),
    t.jsxExpressionContainer(buildStyleObjectExpression(styles))
  );
}
function ensureReactNativeImports(ast, requiredComponents) {
  const needed = new Set(requiredComponents);
  if (needed.size === 0) return;
  let rnImportDecl = null;
  for (const stmt of ast.program.body) {
    if (t.isImportDeclaration(stmt) && stmt.source.value === "react-native" && stmt.importKind !== "type") {
      rnImportDecl = stmt;
      break;
    }
  }
  if (rnImportDecl) {
    const existing = /* @__PURE__ */ new Set();
    for (const spec of rnImportDecl.specifiers) {
      if (t.isImportSpecifier(spec)) {
        const importedName = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
        existing.add(importedName);
        existing.add(spec.local.name);
      }
    }
    for (const comp of needed) {
      if (!existing.has(comp)) {
        rnImportDecl.specifiers.push(
          t.importSpecifier(t.identifier(comp), t.identifier(comp))
        );
      }
    }
  } else {
    const specifiers = Array.from(needed).map(
      (comp) => t.importSpecifier(t.identifier(comp), t.identifier(comp))
    );
    ast.program.body.unshift(
      t.importDeclaration(specifiers, t.stringLiteral("react-native"))
    );
  }
}
function buildPresetJsxElement(preset, options) {
  const cleanLabel = (options.label ?? "").trim();
  const cleanNav = (options.navigateTo ?? "").trim();
  switch (preset) {
    case "button": {
      const btnText = cleanLabel || (cleanNav ? `Go to ${cleanNav}` : "Continue");
      const attrs = [
        t.jsxAttribute(
          t.jsxIdentifier("activeOpacity"),
          t.jsxExpressionContainer(t.numericLiteral(0.8))
        ),
        buildInlineStyleAttr({
          backgroundColor: "#0F3460",
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 12
        })
      ];
      if (cleanNav) {
        if (options.hasNavigationInScope) {
          attrs.push(
            t.jsxAttribute(
              t.jsxIdentifier("onPress"),
              t.jsxExpressionContainer(
                t.arrowFunctionExpression(
                  [],
                  t.callExpression(
                    t.memberExpression(t.identifier("navigation"), t.identifier("navigate")),
                    [t.stringLiteral(cleanNav)]
                  )
                )
              )
            )
          );
        } else if (options.hasRouterInScope) {
          attrs.push(
            t.jsxAttribute(
              t.jsxIdentifier("onPress"),
              t.jsxExpressionContainer(
                t.arrowFunctionExpression(
                  [],
                  t.callExpression(
                    t.memberExpression(t.identifier("router"), t.identifier("push")),
                    [t.stringLiteral(`/${cleanNav.toLowerCase()}`)]
                  )
                )
              )
            )
          );
        } else {
          attrs.push(t.jsxAttribute(t.jsxIdentifier("route"), t.stringLiteral(cleanNav)));
        }
      }
      const textChild = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: "700"
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText(btnText)],
        false
      );
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(t.jsxIdentifier("TouchableOpacity"), attrs, false),
          t.jsxClosingElement(t.jsxIdentifier("TouchableOpacity")),
          [textChild],
          false
        ),
        requiredImports: ["TouchableOpacity", "Text"]
      };
    }
    case "section": {
      const sectionTitle = cleanLabel || "Featured Section";
      const titleNode = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              fontSize: 16,
              fontWeight: "700",
              color: "#0F172A",
              marginBottom: 4
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText(sectionTitle)],
        false
      );
      const subtitleNode = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              fontSize: 13,
              lineHeight: 19,
              color: "#64748B"
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText("Add details, metrics, or actions inside this section card.")],
        false
      );
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("View"),
            [
              buildInlineStyleAttr({
                backgroundColor: "#F8FAFC",
                borderRadius: 16,
                padding: 16,
                marginTop: 12,
                borderWidth: 1,
                borderColor: "#E2E8F0"
              })
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier("View")),
          [titleNode, subtitleNode],
          false
        ),
        requiredImports: ["View", "Text"]
      };
    }
    case "row": {
      const leftLabel = cleanLabel || "Row Item Title";
      const leftText = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              fontSize: 14,
              fontWeight: "600",
              color: "#0F172A"
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText(leftLabel)],
        false
      );
      const rightText = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              fontSize: 13,
              fontWeight: "600",
              color: "#6366F1"
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText("Details →")],
        false
      );
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("View"),
            [
              buildInlineStyleAttr({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#F8FAFC",
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                marginTop: 8,
                borderWidth: 1,
                borderColor: "#E2E8F0"
              })
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier("View")),
          [leftText, rightText],
          false
        ),
        requiredImports: ["View", "Text"]
      };
    }
    case "heading": {
      const headingText = cleanLabel || "New Heading";
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("Text"),
            [
              buildInlineStyleAttr({
                fontSize: 20,
                fontWeight: "700",
                color: "#0F172A",
                marginTop: 12,
                marginBottom: 4
              })
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier("Text")),
          [t.jsxText(headingText)],
          false
        ),
        requiredImports: ["Text"]
      };
    }
    case "text": {
      const bodyCopy = cleanLabel || "Add your supporting paragraph description here.";
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("Text"),
            [
              buildInlineStyleAttr({
                fontSize: 14,
                lineHeight: 20,
                color: "#475569",
                marginTop: 6
              })
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier("Text")),
          [t.jsxText(bodyCopy)],
          false
        ),
        requiredImports: ["Text"]
      };
    }
    case "input": {
      const placeholderText = cleanLabel || "Enter value...";
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("TextInput"),
            [
              t.jsxAttribute(t.jsxIdentifier("placeholder"), t.stringLiteral(placeholderText)),
              t.jsxAttribute(t.jsxIdentifier("placeholderTextColor"), t.stringLiteral("#94A3B8")),
              buildInlineStyleAttr({
                backgroundColor: "#F1F5F9",
                borderWidth: 1,
                borderColor: "#CBD5E1",
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 14,
                color: "#0F172A",
                marginTop: 10
              })
            ],
            true
          ),
          null,
          [],
          true
        ),
        requiredImports: ["TextInput"]
      };
    }
    case "badge": {
      const badgeLabel = cleanLabel || "NEW BADGE";
      const badgeText = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("Text"),
          [
            buildInlineStyleAttr({
              fontSize: 11,
              fontWeight: "700",
              color: "#4F46E5",
              letterSpacing: 0.4
            })
          ],
          false
        ),
        t.jsxClosingElement(t.jsxIdentifier("Text")),
        [t.jsxText(badgeLabel)],
        false
      );
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("View"),
            [
              buildInlineStyleAttr({
                alignSelf: "flex-start",
                backgroundColor: "#EEF2FF",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                marginTop: 8
              })
            ],
            false
          ),
          t.jsxClosingElement(t.jsxIdentifier("View")),
          [badgeText],
          false
        ),
        requiredImports: ["View", "Text"]
      };
    }
    case "divider":
    default: {
      return {
        element: t.jsxElement(
          t.jsxOpeningElement(
            t.jsxIdentifier("View"),
            [
              buildInlineStyleAttr({
                height: 1,
                backgroundColor: "#E2E8F0",
                marginVertical: 14,
                width: "100%"
              })
            ],
            true
          ),
          null,
          [],
          true
        ),
        requiredImports: ["View"]
      };
    }
  }
}
async function insertElement(workspaceRoot, payload) {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);
  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, "utf-8");
    const ast = parse(previousContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    });
    const byIndex = /* @__PURE__ */ new Map();
    let currentIndex = 0;
    let hasNavigationInScope = false;
    let hasRouterInScope = false;
    traverse(ast, {
      Identifier(nodePath) {
        if (nodePath.node.name === "navigation") hasNavigationInScope = true;
        if (nodePath.node.name === "router") hasRouterInScope = true;
      },
      JSXOpeningElement(nodePath) {
        var _a;
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = currentIndex++;
        const jsxElPath = nodePath.parentPath;
        if (!jsxElPath.isJSXElement()) return;
        const element = jsxElPath.node;
        const parentNode = (_a = jsxElPath.parentPath) == null ? void 0 : _a.node;
        const parent = t.isJSXElement(parentNode) || t.isJSXFragment(parentNode) ? parentNode : null;
        byIndex.set(idx, { index: idx, tagName, element, parent });
      }
    });
    if (byIndex.size === 0) {
      throw new Error(`No JSX elements found in ${payload.file} to insert into.`);
    }
    const { element: newElement, requiredImports } = buildPresetJsxElement(payload.preset, {
      label: payload.label,
      navigateTo: payload.navigateTo,
      hasNavigationInScope,
      hasRouterInScope
    });
    ensureReactNativeImports(ast, requiredImports);
    const ensureOpenContainer = (container) => {
      if (container.openingElement.selfClosing) {
        container.openingElement.selfClosing = false;
        container.selfClosing = false;
        container.closingElement = t.jsxClosingElement(
          t.cloneNode(container.openingElement.name, true)
        );
      }
    };
    const targetIdx = payload.astPath !== void 0 && payload.astPath !== "" ? Number.parseInt(payload.astPath, 10) : -1;
    const targetInfo = targetIdx >= 0 ? byIndex.get(targetIdx) : void 0;
    const requestedPlacement = payload.placement ?? "after";
    if (targetInfo) {
      const baseTag = targetInfo.tagName.split(".").pop() ?? targetInfo.tagName;
      const isContainer = CONTAINER_TAG_NAMES.has(baseTag);
      if (requestedPlacement === "inside" && isContainer || !targetInfo.parent) {
        ensureOpenContainer(targetInfo.element);
        targetInfo.element.children.push(newElement);
      } else {
        const parentContainer = targetInfo.parent;
        const pos = parentContainer.children.indexOf(targetInfo.element);
        if (pos === -1) {
          parentContainer.children.push(newElement);
        } else {
          const insertAt = requestedPlacement === "before" ? pos : pos + 1;
          parentContainer.children.splice(insertAt, 0, newElement);
        }
      }
    } else {
      let defaultContainer = byIndex.get(0).element;
      for (const info of byIndex.values()) {
        const base = info.tagName.split(".").pop() ?? info.tagName;
        if (base === "ScrollView") {
          defaultContainer = info.element;
          break;
        }
      }
      ensureOpenContainer(defaultContainer);
      defaultContainer.children.push(newElement);
    }
    let insertedAstPath = "0";
    let reindexCounter = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = reindexCounter++;
        if (nodePath.parentPath.isJSXElement() && nodePath.parentPath.node === newElement) {
          insertedAstPath = String(idx);
        }
      }
    });
    const output = generate$1(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true }
    });
    const nextContent = output.code + "\n";
    await fs.writeFile(fullPath, nextContent, "utf-8");
    undoStack.push({
      file: payload.file,
      previousContent,
      nextContent,
      description: `Inserted ${payload.preset} in ${path.basename(payload.file)}`,
      timestamp: Date.now()
    });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0;
    const inspected = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: insertedAstPath
    });
    return {
      element: inspected,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length
    };
  });
}
async function duplicateElement(workspaceRoot, payload) {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);
  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, "utf-8");
    const ast = parse(previousContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    });
    let targetElement = null;
    let parentContainer = null;
    let currentIndex = 0;
    const requestedIdx = Number.parseInt(payload.astPath, 10);
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        var _a;
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = currentIndex++;
        if (idx === requestedIdx && nodePath.parentPath.isJSXElement()) {
          targetElement = nodePath.parentPath.node;
          const p = (_a = nodePath.parentPath.parentPath) == null ? void 0 : _a.node;
          parentContainer = t.isJSXElement(p) || t.isJSXFragment(p) ? p : null;
        }
      }
    });
    if (!targetElement || !parentContainer) {
      throw new Error("Cannot duplicate the root screen container.");
    }
    const cloned = t.cloneNode(targetElement, true);
    const siblings = parentContainer.children;
    const pos = siblings.indexOf(targetElement);
    siblings.splice(pos + 1, 0, cloned);
    let clonedAstPath = payload.astPath;
    let reindexCounter = 0;
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = reindexCounter++;
        if (nodePath.parentPath.isJSXElement() && nodePath.parentPath.node === cloned) {
          clonedAstPath = String(idx);
        }
      }
    });
    const output = generate$1(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true }
    });
    const nextContent = output.code + "\n";
    await fs.writeFile(fullPath, nextContent, "utf-8");
    undoStack.push({
      file: payload.file,
      previousContent,
      nextContent,
      description: `Duplicated <${getJsxTagName(targetElement.openingElement.name)}> in ${path.basename(payload.file)}`,
      timestamp: Date.now()
    });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0;
    const inspected = await inspectElement(workspaceRoot, {
      file: payload.file,
      astPath: clonedAstPath
    });
    return {
      element: inspected,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length
    };
  });
}
async function deleteElement(workspaceRoot, payload) {
  const fullPath = resolveSafeScreenPath(workspaceRoot, payload.file);
  return withFileLock(fullPath, async () => {
    const previousContent = await fs.readFile(fullPath, "utf-8");
    const ast = parse(previousContent, {
      sourceType: "module",
      plugins: ["typescript", "jsx"]
    });
    let targetElement = null;
    let parentContainer = null;
    let currentIndex = 0;
    const requestedIdx = Number.parseInt(payload.astPath, 10);
    if (requestedIdx === 0) {
      throw new Error("Cannot delete the root screen container element.");
    }
    traverse(ast, {
      JSXOpeningElement(nodePath) {
        var _a;
        const tagName = getJsxTagName(nodePath.node.name);
        if (tagName === "Fragment" || tagName === "React.Fragment" || tagName === "") {
          return;
        }
        const idx = currentIndex++;
        if (idx === requestedIdx && nodePath.parentPath.isJSXElement()) {
          targetElement = nodePath.parentPath.node;
          const p = (_a = nodePath.parentPath.parentPath) == null ? void 0 : _a.node;
          parentContainer = t.isJSXElement(p) || t.isJSXFragment(p) ? p : null;
        }
      }
    });
    if (!targetElement || !parentContainer) {
      throw new Error(`Element at astPath=${payload.astPath} cannot be deleted.`);
    }
    const siblings = parentContainer.children;
    const pos = siblings.indexOf(targetElement);
    if (pos === -1) {
      throw new Error("Could not find element inside parent children.");
    }
    siblings.splice(pos, 1);
    const output = generate$1(ast, {
      retainLines: false,
      comments: true,
      jsescOption: { minimal: true }
    });
    const nextContent = output.code + "\n";
    await fs.writeFile(fullPath, nextContent, "utf-8");
    undoStack.push({
      file: payload.file,
      previousContent,
      nextContent,
      description: `Deleted <${getJsxTagName(targetElement.openingElement.name)}> in ${path.basename(payload.file)}`,
      timestamp: Date.now()
    });
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }
    redoStack.length = 0;
    return {
      deletedAstPath: payload.astPath,
      undoAvailable: undoStack.length,
      redoAvailable: redoStack.length
    };
  });
}
async function undoLastPatch(workspaceRoot) {
  const entry = undoStack.pop();
  if (!entry) {
    return {
      restoredFile: null,
      description: null,
      undoAvailable: 0,
      redoAvailable: redoStack.length
    };
  }
  const fullPath = resolveSafeScreenPath(workspaceRoot, entry.file);
  await withFileLock(fullPath, async () => {
    await fs.writeFile(fullPath, entry.previousContent, "utf-8");
  });
  redoStack.push(entry);
  return {
    restoredFile: entry.file,
    description: entry.description,
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length
  };
}
async function redoLastPatch(workspaceRoot) {
  const entry = redoStack.pop();
  if (!entry) {
    return {
      restoredFile: null,
      description: null,
      undoAvailable: undoStack.length,
      redoAvailable: 0
    };
  }
  const fullPath = resolveSafeScreenPath(workspaceRoot, entry.file);
  await withFileLock(fullPath, async () => {
    await fs.writeFile(fullPath, entry.nextContent, "utf-8");
  });
  undoStack.push(entry);
  return {
    restoredFile: entry.file,
    description: entry.description,
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length
  };
}
function getHistoryStatus() {
  return {
    undoAvailable: undoStack.length,
    redoAvailable: redoStack.length
  };
}
const MAX_BODY_BYTES = 1e6;
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function isLoopbackHostHeader(hostHeader) {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    if (closeIdx === -1) return false;
    const ipv6Host = trimmed.slice(0, closeIdx + 1);
    return LOOPBACK_HOSTS.has(ipv6Host);
  }
  const hostname = trimmed.split(":")[0];
  return LOOPBACK_HOSTS.has(hostname);
}
function verifyApiRequestSecurity(req) {
  const host = typeof req.headers.host === "string" ? req.headers.host : void 0;
  if (!isLoopbackHostHeader(host)) {
    return {
      allowed: false,
      reason: "Forbidden Host header: Local API only accepts loopback connections (127.0.0.1, localhost, [::1])"
    };
  }
  const secFetchSite = typeof req.headers["sec-fetch-site"] === "string" ? req.headers["sec-fetch-site"].toLowerCase() : void 0;
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return {
      allowed: false,
      reason: `Forbidden cross-site request (Sec-Fetch-Site: ${secFetchSite})`
    };
  }
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : void 0;
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (!LOOPBACK_HOSTS.has(parsedOrigin.hostname.toLowerCase())) {
        return {
          allowed: false,
          reason: `Forbidden cross-origin request from ${origin}`
        };
      }
    } catch {
      return {
        allowed: false,
        reason: "Malformed Origin header"
      };
    }
  }
  if (req.method === "POST") {
    const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"].toLowerCase() : "";
    if (!contentType.startsWith("application/json")) {
      return {
        allowed: false,
        reason: "POST requests to /api/* must specify Content-Type: application/json"
      };
    }
  }
  return { allowed: true };
}
function sanitizeLayoutPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid layout payload: expected an object map of screen coordinates");
  }
  const sanitized = /* @__PURE__ */ Object.create(null);
  const entries = Object.entries(input);
  if (entries.length > 200) {
    throw new Error("Invalid layout payload: too many screen entries");
  }
  for (const [screenId, rawBox] of entries) {
    if (!screenId || FORBIDDEN_KEYS.has(screenId) || screenId.length > 120) {
      throw new Error(`Invalid screen key in layout payload: "${screenId}"`);
    }
    if (!rawBox || typeof rawBox !== "object" || Array.isArray(rawBox)) {
      throw new Error(`Invalid layout coordinates for screen "${screenId}"`);
    }
    const box = rawBox;
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5 || width < 100 || width > 5e3 || height < 100 || height > 5e3) {
      throw new Error(`Out-of-bounds layout coordinates for screen "${screenId}"`);
    }
    sanitized[screenId] = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height)
    };
  }
  return sanitized;
}
async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let byteCount = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      const chunkBytes = typeof chunk === "string" ? Buffer.byteLength(chunk, "utf-8") : chunk.length;
      byteCount += chunkBytes;
      if (byteCount > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
        reject(new Error("Request payload too large"));
        return;
      }
      raw += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
    });
    req.on("end", () => {
      if (aborted) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => {
      if (!aborted) {
        aborted = true;
        reject(err);
      }
    });
  });
}
const generate = _generate.default ?? _generate;
const ALLOWED_SCREEN_PREFIXES = ["src/screens/", "screens/", "app/", "src/app/"];
const RESOLVABLE_EXTENSIONS = [
  ".web.tsx",
  ".web.ts",
  ".web.jsx",
  ".web.js",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".json",
  ".css"
];
function stripJsonCommentsAndTrailingCommas(input) {
  const withoutComments = input.replace(
    /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*/g,
    (_match, quotedString) => quotedString ?? ""
  );
  return withoutComments.replace(/,\s*([}\]])/g, "$1");
}
function tryResolveLocalModule(candidateBase) {
  try {
    const cleanBase = candidateBase.split("?")[0];
    if (fs$1.existsSync(cleanBase) && fs$1.statSync(cleanBase).isFile()) {
      return cleanBase;
    }
    for (const ext of RESOLVABLE_EXTENSIONS) {
      const withExt = cleanBase + ext;
      if (fs$1.existsSync(withExt) && fs$1.statSync(withExt).isFile()) {
        return withExt;
      }
    }
    if (fs$1.existsSync(cleanBase) && fs$1.statSync(cleanBase).isDirectory()) {
      for (const ext of RESOLVABLE_EXTENSIONS) {
        const indexFile = path.join(cleanBase, `index${ext}`);
        if (fs$1.existsSync(indexFile) && fs$1.statSync(indexFile).isFile()) {
          return indexFile;
        }
      }
    }
  } catch {
  }
  return null;
}
function loadTsconfigAliases(roots) {
  var _a, _b;
  const mappings = [];
  for (const rootDir of roots) {
    try {
      const tsconfigPath = path.join(rootDir, "tsconfig.json");
      if (!fs$1.existsSync(tsconfigPath)) continue;
      const raw = fs$1.readFileSync(tsconfigPath, "utf-8");
      const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw));
      const baseUrl = ((_a = parsed.compilerOptions) == null ? void 0 : _a.baseUrl) ?? ".";
      const paths = ((_b = parsed.compilerOptions) == null ? void 0 : _b.paths) ?? {};
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets)) continue;
        const cleanPrefix = pattern.replace(/\/\*$/, "");
        if (!cleanPrefix) continue;
        for (const target of targets) {
          const cleanTarget = target.replace(/\/\*$/, "");
          const resolvedDir = path.resolve(rootDir, baseUrl, cleanTarget);
          mappings.push({ prefix: cleanPrefix, targetDir: resolvedDir });
        }
      }
    } catch {
    }
  }
  return mappings;
}
function cleanJsxText(rawText) {
  const lines = rawText.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) {
      lastNonEmptyLine = i;
    }
  }
  let str = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;
    let trimmedLine = line.replace(/\t/g, " ");
    if (!isFirstLine) {
      trimmedLine = trimmedLine.replace(/^[ ]+/, "");
    }
    if (!isLastLine) {
      trimmedLine = trimmedLine.replace(/[ ]+$/, "");
    }
    if (trimmedLine) {
      if (!isLastNonEmptyLine) {
        trimmedLine += " ";
      }
      str += trimmedLine;
    }
  }
  return str.length > 0 ? str : null;
}
function convertJsxElementNameToExpr(nameNode) {
  if (t.isJSXIdentifier(nameNode)) {
    if (nameNode.name === "this") {
      return t.thisExpression();
    }
    if (/^[a-z]/.test(nameNode.name) || nameNode.name.includes("-")) {
      return t.stringLiteral(nameNode.name);
    }
    return t.identifier(nameNode.name);
  }
  if (t.isJSXMemberExpression(nameNode)) {
    return t.memberExpression(
      convertJsxElementNameToExpr(nameNode.object),
      t.identifier(nameNode.property.name)
    );
  }
  if (t.isJSXNamespacedName(nameNode)) {
    return t.stringLiteral(`${nameNode.namespace.name}:${nameNode.name.name}`);
  }
  return t.stringLiteral("div");
}
function convertJsxAttributesToExpr(attributes) {
  if (attributes.length === 0) {
    return t.nullLiteral();
  }
  const props = [];
  for (const attr of attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      props.push(t.spreadElement(attr.argument));
      continue;
    }
    const rawKey = t.isJSXIdentifier(attr.name) ? attr.name.name : `${attr.name.namespace.name}:${attr.name.name.name}`;
    const keyNode = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rawKey) ? t.identifier(rawKey) : t.stringLiteral(rawKey);
    let valExpr;
    if (attr.value === null || attr.value === void 0) {
      valExpr = t.booleanLiteral(true);
    } else if (t.isJSXExpressionContainer(attr.value)) {
      if (t.isJSXEmptyExpression(attr.value.expression)) {
        valExpr = t.booleanLiteral(true);
      } else {
        valExpr = attr.value.expression;
      }
    } else if (t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
      valExpr = transformJsxNode(attr.value);
    } else {
      valExpr = attr.value;
    }
    props.push(t.objectProperty(keyNode, valExpr));
  }
  return t.objectExpression(props);
}
function convertJsxChildrenToExprs(children) {
  const out = [];
  for (const child of children) {
    if (t.isJSXText(child)) {
      const cleaned = cleanJsxText(child.value);
      if (cleaned !== null) {
        out.push(t.stringLiteral(cleaned));
      }
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) {
        out.push(child.expression);
      }
    } else if (t.isJSXSpreadChild(child)) {
      out.push(child.expression);
    } else if (t.isJSXElement(child) || t.isJSXFragment(child)) {
      out.push(transformJsxNode(child));
    }
  }
  return out;
}
function transformJsxNode(node) {
  const createElMember = t.memberExpression(
    t.identifier("React"),
    t.identifier("createElement")
  );
  if (t.isJSXFragment(node)) {
    const fragMember = t.memberExpression(
      t.identifier("React"),
      t.identifier("Fragment")
    );
    const children2 = convertJsxChildrenToExprs(node.children);
    return t.callExpression(createElMember, [fragMember, t.nullLiteral(), ...children2]);
  }
  const tagExpr = convertJsxElementNameToExpr(node.openingElement.name);
  const propsExpr = convertJsxAttributesToExpr(node.openingElement.attributes);
  const children = convertJsxChildrenToExprs(node.children);
  return t.callExpression(createElMember, [tagExpr, propsExpr, ...children]);
}
function convertTsEnumToVar(enumNode) {
  const props = [];
  let nextNumericValue = 0;
  for (const member of enumNode.members) {
    const keyNode = t.isIdentifier(member.id) ? t.identifier(member.id.name) : t.stringLiteral(member.id.value);
    let initExpr;
    if (member.initializer) {
      initExpr = member.initializer;
      if (t.isNumericLiteral(member.initializer)) {
        nextNumericValue = member.initializer.value + 1;
      }
    } else {
      initExpr = t.numericLiteral(nextNumericValue++);
    }
    props.push(t.objectProperty(keyNode, initExpr));
  }
  return t.variableDeclaration("const", [
    t.variableDeclarator(t.identifier(enumNode.id.name), t.objectExpression(props))
  ]);
}
function stripTypeScriptAndTransformJsxAst(node) {
  var _a;
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    const nextArr = [];
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      if (!item) continue;
      if (item.type === "TSInterfaceDeclaration" || item.type === "TSTypeAliasDeclaration" || item.type === "TSDeclareFunction" || item.type === "TSDeclareMethod" || item.type === "TSModuleDeclaration" || item.type === "TSIndexSignature") {
        continue;
      }
      if (item.type === "ImportDeclaration" && item.importKind === "type") {
        continue;
      }
      if (item.type === "ExportNamedDeclaration") {
        if (item.exportKind === "type") continue;
        if (item.declaration && (item.declaration.type === "TSInterfaceDeclaration" || item.declaration.type === "TSTypeAliasDeclaration" || item.declaration.type === "TSDeclareFunction" || item.declaration.type === "TSModuleDeclaration")) {
          continue;
        }
      }
      const transformed = stripTypeScriptAndTransformJsxAst(item);
      if (transformed !== null && transformed !== void 0) {
        nextArr.push(transformed);
      }
    }
    return nextArr;
  }
  while (node && (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" || node.type === "TSTypeAssertion" || node.type === "TSNonNullExpression" || node.type === "TSInstantiationExpression")) {
    node = node.expression;
  }
  if (!node || typeof node !== "object") return node;
  if (node.type === "TSEnumDeclaration") {
    return convertTsEnumToVar(node);
  }
  if (node.type === "ExportNamedDeclaration" && ((_a = node.declaration) == null ? void 0 : _a.type) === "TSEnumDeclaration") {
    node.declaration = convertTsEnumToVar(node.declaration);
  }
  if (node.type === "ImportDeclaration" && Array.isArray(node.specifiers)) {
    const origCount = node.specifiers.length;
    node.specifiers = node.specifiers.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.importKind !== "type"
    );
    if (origCount > 0 && node.specifiers.length === 0) {
      return null;
    }
  }
  if (node.type === "ExportNamedDeclaration" && Array.isArray(node.specifiers)) {
    node.specifiers = node.specifiers.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s) => s.exportKind !== "type"
    );
    if (!node.declaration && node.specifiers.length === 0) {
      return null;
    }
  }
  delete node.typeAnnotation;
  delete node.returnType;
  delete node.typeParameters;
  delete node.typeArguments;
  delete node.implements;
  delete node.superTypeParameters;
  delete node.definite;
  delete node.accessibility;
  delete node.readonly;
  delete node.declare;
  delete node.override;
  delete node.optional;
  if (node.type === "TSParameterProperty") {
    return stripTypeScriptAndTransformJsxAst(node.parameter);
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "comments" || key === "leadingComments" || key === "trailingComments") {
      continue;
    }
    const val = node[key];
    if (val && typeof val === "object") {
      node[key] = stripTypeScriptAndTransformJsxAst(val);
    }
  }
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return transformJsxNode(node);
  }
  return node;
}
function injectScreenAgyAttributes(ast, relPath) {
  let jsxIndex = 0;
  let hasJsx = false;
  function visit(node) {
    var _a, _b;
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;
    const typed = node;
    if (typed.type === "JSXFragment") {
      hasJsx = true;
    } else if (typed.type === "JSXOpeningElement") {
      hasJsx = true;
      const tagName = getJsxTagName(typed.name);
      if (tagName !== "Fragment" && tagName !== "React.Fragment" && tagName !== "") {
        const hasAgyAttr = typed.attributes.some(
          (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: "data-agy-ast-path" })
        );
        if (!hasAgyAttr) {
          const currentIndex = String(jsxIndex++);
          const line = String(((_a = typed.loc) == null ? void 0 : _a.start.line) ?? 1);
          const col = String(((_b = typed.loc) == null ? void 0 : _b.start.column) ?? 0);
          const dataSetProps = [
            t.objectProperty(t.identifier("agyFile"), t.stringLiteral(relPath)),
            t.objectProperty(t.identifier("agyLine"), t.stringLiteral(line)),
            t.objectProperty(t.identifier("agyCol"), t.stringLiteral(col)),
            t.objectProperty(t.identifier("agyAstPath"), t.stringLiteral(currentIndex)),
            t.objectProperty(t.identifier("agyTag"), t.stringLiteral(tagName))
          ];
          typed.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier("dataSet"),
              t.jsxExpressionContainer(t.objectExpression(dataSetProps))
            ),
            t.jsxAttribute(t.jsxIdentifier("data-agy-file"), t.stringLiteral(relPath)),
            t.jsxAttribute(t.jsxIdentifier("data-agy-line"), t.stringLiteral(line)),
            t.jsxAttribute(t.jsxIdentifier("data-agy-col"), t.stringLiteral(col)),
            t.jsxAttribute(t.jsxIdentifier("data-agy-ast-path"), t.stringLiteral(currentIndex)),
            t.jsxAttribute(t.jsxIdentifier("data-agy-tag"), t.stringLiteral(tagName))
          );
        }
      }
    }
    const keys = t.VISITOR_KEYS[typed.type];
    if (!keys) return;
    const rec = typed;
    for (const key of keys) {
      const child = rec[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (child[i]) visit(child[i]);
        }
      } else if (child && typeof child === "object") {
        visit(child);
      }
    }
  }
  visit(ast);
  return hasJsx;
}
function compileModuleForBrowser(options) {
  const { filePath, targetProjectRoot, workspaceRoot = targetProjectRoot } = options;
  const cleanFilePath = filePath.split("?")[0];
  const ext = path.extname(cleanFilePath).toLowerCase();
  if (ext === ".css") {
    return "export default {};\n";
  }
  if (ext === ".json") {
    const rawJson = fs$1.readFileSync(cleanFilePath, "utf-8");
    return `export default ${rawJson};
`;
  }
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(ext)) {
    const assetUrl = `/@zelune/asset?file=${encodeURIComponent(cleanFilePath)}`;
    return `export default { uri: ${JSON.stringify(assetUrl)} };
`;
  }
  const code = fs$1.readFileSync(cleanFilePath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx", "decorators-legacy"],
    errorRecovery: true
  });
  const normalizedTargetRoot = path.resolve(targetProjectRoot);
  const relPath = path.relative(normalizedTargetRoot, path.resolve(cleanFilePath)).replace(/\\/g, "/");
  const isScreenFile = ALLOWED_SCREEN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
  const hadJsx = isScreenFile ? injectScreenAgyAttributes(ast, relPath) : true;
  const uniqueRoots = Array.from(
    /* @__PURE__ */ new Set([path.resolve(targetProjectRoot), path.resolve(workspaceRoot)])
  );
  const tsconfigAliases = loadTsconfigAliases(uniqueRoots);
  function resolveAlias(specifier) {
    for (const mapping of tsconfigAliases) {
      if (specifier === mapping.prefix) {
        const found = tryResolveLocalModule(mapping.targetDir);
        if (found) return found;
      } else if (specifier.startsWith(mapping.prefix + "/")) {
        const rel = specifier.slice(mapping.prefix.length + 1);
        const found = tryResolveLocalModule(path.join(mapping.targetDir, rel));
        if (found) return found;
      }
    }
    if (specifier.startsWith("@/") || specifier.startsWith("~/")) {
      const rel = specifier.slice(2);
      for (const r of uniqueRoots) {
        const direct = tryResolveLocalModule(path.join(r, rel));
        if (direct) return direct;
        const inSrc = tryResolveLocalModule(path.join(r, "src", rel));
        if (inSrc) return inSrc;
      }
    }
    return null;
  }
  function rewriteSpecifier(specifier, requestedExports) {
    if (specifier === "react" || specifier === "react/jsx-runtime" || specifier === "react/jsx-dev-runtime") {
      return "/@zelune/shim/react.js";
    }
    if (specifier === "react-dom" || specifier === "react-dom/client") {
      return "/@zelune/shim/react-dom.js";
    }
    if (specifier === "react-native" || specifier === "react-native-web") {
      return "/@zelune/shim/react-native.js";
    }
    if (specifier === "lucide-react" || specifier === "lucide-react-native") {
      return `/@zelune/shim/lucide.js?exports=${encodeURIComponent(requestedExports.join(","))}`;
    }
    if (specifier.startsWith(".")) {
      const candidate = path.resolve(path.dirname(cleanFilePath), specifier);
      const resolved = tryResolveLocalModule(candidate);
      if (resolved) {
        return `/@zelune/module?file=${encodeURIComponent(resolved)}`;
      }
      return `/@zelune/shim/stub.js?pkg=${encodeURIComponent(specifier)}&exports=${encodeURIComponent(
        requestedExports.join(",")
      )}`;
    }
    if (specifier.startsWith("@/") || specifier.startsWith("~/") || tsconfigAliases.some((m) => specifier === m.prefix || specifier.startsWith(m.prefix + "/"))) {
      const resolved = resolveAlias(specifier);
      if (resolved) {
        return `/@zelune/module?file=${encodeURIComponent(resolved)}`;
      }
      return `/@zelune/shim/stub.js?pkg=${encodeURIComponent(specifier)}&exports=${encodeURIComponent(
        requestedExports.join(",")
      )}`;
    }
    return `/@zelune/shim/stub.js?pkg=${encodeURIComponent(specifier)}&exports=${encodeURIComponent(
      requestedExports.join(",")
    )}`;
  }
  stripTypeScriptAndTransformJsxAst(ast);
  let hasReactIdentifierInScope = false;
  for (const stmt of ast.program.body) {
    if (stmt.type === "ImportDeclaration") {
      const requested = [];
      for (const spec of stmt.specifiers) {
        if (spec.local.name === "React") {
          hasReactIdentifierInScope = true;
        }
        if (spec.type === "ImportSpecifier") {
          const importedName = spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
          if (importedName && importedName !== "default") {
            requested.push(importedName);
          }
        }
      }
      stmt.source.value = rewriteSpecifier(stmt.source.value, requested);
    } else if ((stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportAllDeclaration") && stmt.source) {
      const requested = [];
      if (stmt.type === "ExportNamedDeclaration") {
        for (const spec of stmt.specifiers) {
          if (spec.type === "ExportSpecifier") {
            const localName = spec.local.type === "Identifier" ? spec.local.name : spec.local.value;
            const exportedName = spec.exported.type === "Identifier" ? spec.exported.name : spec.exported.value;
            if (localName && localName !== "default") requested.push(localName);
            if (exportedName && exportedName !== "default") requested.push(exportedName);
          }
        }
      }
      stmt.source.value = rewriteSpecifier(stmt.source.value, requested);
    }
  }
  if (hadJsx && !hasReactIdentifierInScope) {
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier("React"))],
        t.stringLiteral("/@zelune/shim/react.js")
      )
    );
  }
  const out = generate(ast, {
    retainLines: false,
    compact: false
  });
  return out.code;
}
function extractStaticAstValue(node, scope, depth = 0) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  if (!node || depth > 12) return void 0;
  switch (node.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return node.value;
    case "NullLiteral":
      return null;
    case "UnaryExpression": {
      const arg = extractStaticAstValue(node.argument, scope, depth + 1);
      if (typeof arg === "number") {
        if (node.operator === "-") return -arg;
        if (node.operator === "+") return +arg;
      }
      return void 0;
    }
    case "TemplateLiteral": {
      if (Array.isArray(node.expressions) && node.expressions.length === 0) {
        return ((_c = (_b = (_a = node.quasis) == null ? void 0 : _a[0]) == null ? void 0 : _b.value) == null ? void 0 : _c.cooked) ?? ((_f = (_e = (_d = node.quasis) == null ? void 0 : _d[0]) == null ? void 0 : _e.value) == null ? void 0 : _f.raw) ?? "";
      }
      return void 0;
    }
    case "ArrayExpression": {
      const items = [];
      for (const el of node.elements ?? []) {
        if (!el) continue;
        if (el.type === "SpreadElement") {
          const spreadVal = extractStaticAstValue(el.argument, scope, depth + 1);
          if (Array.isArray(spreadVal)) items.push(...spreadVal);
        } else {
          const val = extractStaticAstValue(el, scope, depth + 1);
          if (val !== void 0) items.push(val);
        }
      }
      return items;
    }
    case "ObjectExpression": {
      const result = {};
      for (const prop of node.properties ?? []) {
        if (prop.type === "SpreadElement") {
          const spreadObj = extractStaticAstValue(prop.argument, scope, depth + 1);
          if (spreadObj && typeof spreadObj === "object" && !Array.isArray(spreadObj)) {
            Object.assign(result, spreadObj);
          }
          continue;
        }
        if (prop.type !== "ObjectProperty" || prop.computed) continue;
        const key = ((_g = prop.key) == null ? void 0 : _g.type) === "Identifier" ? prop.key.name : ((_h = prop.key) == null ? void 0 : _h.type) === "StringLiteral" || ((_i = prop.key) == null ? void 0 : _i.type) === "NumericLiteral" ? String(prop.key.value) : null;
        if (!key) continue;
        const val = extractStaticAstValue(prop.value, scope, depth + 1);
        if (val !== void 0) {
          result[key] = val;
        }
      }
      return result;
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
    case "ParenthesizedExpression":
      return extractStaticAstValue(node.expression, scope, depth + 1);
    case "Identifier":
      return scope.get(node.name);
    default:
      return void 0;
  }
}
function parseTailwindConfigSource(raw) {
  try {
    const ast = parse(raw, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
      errorRecovery: true
    });
    const scope = /* @__PURE__ */ new Map();
    let exportedConfig;
    for (const stmt of ast.program.body) {
      if (stmt.type === "VariableDeclaration") {
        for (const decl of stmt.declarations) {
          if (decl.id.type === "Identifier" && decl.init) {
            const val = extractStaticAstValue(decl.init, scope);
            if (val !== void 0) {
              scope.set(decl.id.name, val);
            }
          }
        }
      } else if (stmt.type === "ExportDefaultDeclaration") {
        exportedConfig = extractStaticAstValue(stmt.declaration, scope);
      } else if (stmt.type === "ExpressionStatement" && stmt.expression.type === "AssignmentExpression") {
        const left = stmt.expression.left;
        if (left.type === "MemberExpression" && left.object.type === "Identifier" && left.property.type === "Identifier" && (left.object.name === "module" && left.property.name === "exports" || left.object.name === "exports" && left.property.name === "default")) {
          exportedConfig = extractStaticAstValue(stmt.expression.right, scope);
        }
      }
    }
    const cfg = exportedConfig;
    if ((cfg == null ? void 0 : cfg.theme) && typeof cfg.theme === "object") {
      const baseTheme = { ...cfg.theme };
      const extendTheme = cfg.theme.extend && typeof cfg.theme.extend === "object" ? cfg.theme.extend : {};
      delete baseTheme.extend;
      const merged = { ...baseTheme };
      for (const [k, v] of Object.entries(extendTheme)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          merged[k] = {
            ...baseTheme[k] ?? {},
            ...v
          };
        } else {
          merged[k] = v;
        }
      }
      return merged;
    }
  } catch {
  }
  return {};
}
function loadProjectTailwindTheme(roots) {
  const candidates = [
    "tailwind.config.js",
    "tailwind.config.cjs",
    "tailwind.config.mjs",
    "tailwind.config.ts"
  ];
  const uniqueRoots = Array.from(new Set(roots.map((r) => path.resolve(r))));
  for (const rootDir of uniqueRoots) {
    for (const fileName of candidates) {
      const fullPath = path.join(rootDir, fileName);
      try {
        if (!fs$1.existsSync(fullPath)) continue;
        const raw = fs$1.readFileSync(fullPath, "utf-8");
        const parsedTheme = parseTailwindConfigSource(raw);
        if (Object.keys(parsedTheme).length > 0) {
          return parsedTheme;
        }
      } catch {
      }
    }
  }
  return {};
}
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon"
};
const REACT_EXPORTS = [
  "Children",
  "Component",
  "Fragment",
  "Profiler",
  "PureComponent",
  "StrictMode",
  "Suspense",
  "cloneElement",
  "createContext",
  "createElement",
  "createFactory",
  "createRef",
  "forwardRef",
  "isValidElement",
  "lazy",
  "memo",
  "startTransition",
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
  "version"
];
const REACT_NATIVE_EXPORTS = [
  "View",
  "Text",
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "ScrollView",
  "FlatList",
  "SectionList",
  "VirtualizedList",
  "KeyboardAvoidingView",
  "TextInput",
  "Image",
  "ImageBackground",
  "SafeAreaView",
  "ActivityIndicator",
  "Switch",
  "Modal",
  "Button",
  "RefreshControl",
  "StatusBar",
  "StyleSheet",
  "Platform",
  "Dimensions",
  "useWindowDimensions",
  "PixelRatio",
  "Animated",
  "useAnimatedValue",
  "Easing",
  "Alert",
  "Linking",
  "Share",
  "Vibration",
  "Keyboard",
  "BackHandler",
  "AppState",
  "Appearance",
  "useColorScheme",
  "PanResponder",
  "LayoutAnimation",
  "UIManager",
  "InteractionManager",
  "NativeEventEmitter",
  "DeviceEventEmitter",
  "NativeAppEventEmitter",
  "NativeModules",
  "I18nManager",
  "AccessibilityInfo",
  "LogBox",
  "YellowBox",
  "findNodeHandle",
  "processColor",
  "PermissionsAndroid",
  "ToastAndroid",
  "ActionSheetIOS",
  "InputAccessoryView",
  "DrawerLayoutAndroid",
  "TurboModuleRegistry",
  "requireNativeComponent",
  "codegenNativeComponent",
  "PlatformColor",
  "DynamicColorIOS",
  "DevSettings",
  "Systrace",
  "Networking",
  "Settings"
];
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}
function sendJs(res, code) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(code);
}
function buildReactShimModule() {
  const lines = [
    `const R = window.__ZELUNE_RUNTIME__.React;`,
    `export default R;`,
    `export const jsx = R.createElement;`,
    `export const jsxs = R.createElement;`,
    `export const jsxDEV = R.createElement;`
  ];
  for (const name of REACT_EXPORTS) {
    lines.push(`export const ${name} = R.${name};`);
  }
  return lines.join("\n");
}
function buildReactDomShimModule() {
  return [
    `const RD = window.__ZELUNE_RUNTIME__.ReactDOM;`,
    `export default RD;`,
    `export const createRoot = RD.createRoot;`,
    `export const hydrateRoot = RD.hydrateRoot;`,
    `export const flushSync = RD.flushSync;`,
    `export const createPortal = RD.createPortal;`
  ].join("\n");
}
function buildReactNativeShimModule() {
  const lines = [
    `const RN = window.__ZELUNE_RUNTIME__.ReactNative;`,
    `export default RN.default || RN;`
  ];
  for (const name of REACT_NATIVE_EXPORTS) {
    lines.push(`export const ${name} = RN.${name};`);
  }
  return lines.join("\n");
}
function buildLucideShimModule(requestedNames) {
  const lines = [
    `const L = window.__ZELUNE_RUNTIME__.LucideIcons || {};`,
    `const M = window.__ZELUNE_RUNTIME__.MockNav || {};`,
    `export default L;`
  ];
  const unique = Array.from(
    new Set(
      requestedNames.map((s) => s.trim()).filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== "default")
    )
  );
  for (const name of unique) {
    lines.push(
      `export const ${name} = L[${JSON.stringify(name)}] || M.createVectorIconComponent(${JSON.stringify(name)});`
    );
  }
  return lines.join("\n");
}
function buildUniversalStubModule(requestedNames) {
  const lines = [
    `const React = window.__ZELUNE_RUNTIME__.React;`,
    `const RN = window.__ZELUNE_RUNTIME__.ReactNative;`,
    `const M = window.__ZELUNE_RUNTIME__.MockNav;`,
    `export default M.default || M;`,
    `const COMPOUND_SUB_NAMES = ['Item', 'Header', 'Footer', 'Title', 'Content', 'Trigger', 'Portal', 'Overlay', 'Close', 'Action', 'Cancel', 'Description', 'Label', 'Group', 'Separator', 'Value', 'Icon', 'Viewport', 'Root', 'Screen', 'Navigator', 'Provider', 'Consumer'];`,
    `function createSubStub(displayName) {`,
    `  const Sub = React.forwardRef(function SubComp(props, ref) {`,
    `    const content = typeof props?.children === 'function' ? props.children(M.SAFE_CHAINABLE_PROXY) : props?.children;`,
    `    return React.createElement(RN.View, { style: props?.style, className: props?.className, ref }, content);`,
    `  });`,
    `  Sub.displayName = displayName;`,
    `  return Sub;`,
    `}`,
    `function createComponentStub(displayName) {`,
    `  const Comp = React.forwardRef(function StubComp(props, ref) {`,
    `    if (typeof props?.render === 'function') {`,
    `      return props.render({`,
    `        field: { name: props?.name ?? '', value: props?.defaultValue ?? '', onChange: () => undefined, onBlur: () => undefined, ref: () => undefined },`,
    `        fieldState: { invalid: false, isTouched: false, isDirty: false, error: undefined },`,
    `        formState: { errors: {}, isSubmitting: false, isValid: true },`,
    `      });`,
    `    }`,
    `    const content = typeof props?.children === 'function' ? props.children(M.SAFE_CHAINABLE_PROXY) : props?.children;`,
    `    return React.createElement(RN.View, { style: props?.style, className: props?.className, ref }, content);`,
    `  });`,
    `  Comp.displayName = displayName;`,
    `  for (const sub of COMPOUND_SUB_NAMES) {`,
    `    Comp[sub] = createSubStub(displayName + '.' + sub);`,
    `  }`,
    `  return Comp;`,
    `}`,
    `function resolveExport(name) {`,
    `  if (name in M) return M[name];`,
    `  if (M.default && name in M.default) return M.default[name];`,
    `  if (/^use[A-Z]/.test(name)) return () => M.SAFE_CHAINABLE_PROXY;`,
    `  if (/^[A-Z]/.test(name)) return createComponentStub(name);`,
    `  return M.SAFE_CHAINABLE_PROXY;`,
    `}`
  ];
  const unique = Array.from(
    new Set(
      requestedNames.map((s) => s.trim()).filter((s) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && s !== "default")
    )
  );
  for (const name of unique) {
    lines.push(`export const ${name} = resolveExport(${JSON.stringify(name)});`);
  }
  return lines.join("\n");
}
async function resolveConnectedProjectName(workspaceRoot) {
  var _a;
  const activeRoot = getActiveProjectRoot(workspaceRoot);
  const dirName = path.basename(activeRoot);
  try {
    const appJsonRaw = await fs.readFile(path.join(activeRoot, "app.json"), "utf-8");
    const appJson = JSON.parse(appJsonRaw);
    if ((_a = appJson == null ? void 0 : appJson.expo) == null ? void 0 : _a.name) return appJson.expo.name;
    if (appJson == null ? void 0 : appJson.name) return appJson.name;
  } catch {
  }
  try {
    const pkgRaw = await fs.readFile(path.join(activeRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw);
    if ((pkg == null ? void 0 : pkg.name) && pkg.name.toLowerCase() !== "zelune") {
      return pkg.name;
    }
  } catch {
  }
  return dirName;
}
async function startStudioHttpServer(options) {
  const { packageRoot, targetProjectRoot, workspaceRoot } = options;
  const distDir = path.resolve(packageRoot, "dist");
  const allowedRoots = Array.from(
    /* @__PURE__ */ new Set([
      path.resolve(packageRoot),
      path.resolve(targetProjectRoot),
      path.resolve(workspaceRoot)
    ])
  );
  function isPathAllowed(candidatePath) {
    const resolved = path.resolve(candidatePath);
    return allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep));
  }
  const requestHandler = async (req, res) => {
    const rawUrl = req.url ?? "/";
    const qIdx = rawUrl.indexOf("?");
    const pathname = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
    const searchParams = new URLSearchParams(qIdx === -1 ? "" : rawUrl.slice(qIdx + 1));
    if (pathname.startsWith("/api/")) {
      const securityCheck = verifyApiRequestSecurity(req);
      if (!securityCheck.allowed) {
        return sendJson(res, 403, { ok: false, error: securityCheck.reason });
      }
      const activeRoot = getActiveProjectRoot(targetProjectRoot);
      const layoutFilePath = path.resolve(activeRoot, ".canvas-layout.json");
      try {
        if (req.method === "GET" && pathname === "/api/screens") {
          const [screens, projectName] = await Promise.all([
            discoverScreens(targetProjectRoot),
            resolveConnectedProjectName(targetProjectRoot)
          ]);
          const history = getHistoryStatus();
          return sendJson(res, 200, { ok: true, projectName, screens, history });
        }
        if (req.method === "GET" && pathname === "/api/inspect") {
          const file = searchParams.get("file") ?? "";
          const astPath = searchParams.get("astPath") ?? "";
          const lineParam = searchParams.get("line");
          const line = lineParam ? Number.parseInt(lineParam, 10) : void 0;
          const element = await inspectElement(targetProjectRoot, { file, astPath, line });
          const history = getHistoryStatus();
          return sendJson(res, 200, { ok: true, element, history });
        }
        if (req.method === "POST" && pathname === "/api/patch") {
          const body = await readJsonBody(req);
          const result = await patchElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable
            }
          });
        }
        if (req.method === "POST" && pathname === "/api/reorder") {
          const body = await readJsonBody(req);
          const result = await reorderElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable
            }
          });
        }
        if (req.method === "POST" && pathname === "/api/insert") {
          const body = await readJsonBody(req);
          const result = await insertElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable
            }
          });
        }
        if (req.method === "POST" && pathname === "/api/duplicate") {
          const body = await readJsonBody(req);
          const result = await duplicateElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            element: result.element,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable
            }
          });
        }
        if (req.method === "POST" && pathname === "/api/delete") {
          const body = await readJsonBody(req);
          const result = await deleteElement(targetProjectRoot, body);
          return sendJson(res, 200, {
            ok: true,
            deletedAstPath: result.deletedAstPath,
            history: {
              undoAvailable: result.undoAvailable,
              redoAvailable: result.redoAvailable
            }
          });
        }
        if (req.method === "POST" && pathname === "/api/undo") {
          const result = await undoLastPatch(targetProjectRoot);
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (req.method === "POST" && pathname === "/api/redo") {
          const result = await redoLastPatch(targetProjectRoot);
          return sendJson(res, 200, { ok: true, ...result });
        }
        if (req.method === "GET" && pathname === "/api/layout") {
          try {
            const raw = await fs.readFile(layoutFilePath, "utf-8");
            const validated = sanitizeLayoutPayload(JSON.parse(raw));
            return sendJson(res, 200, { ok: true, layout: validated });
          } catch {
            return sendJson(res, 200, { ok: true, layout: null });
          }
        }
        if (req.method === "POST" && pathname === "/api/layout") {
          const body = await readJsonBody(req);
          const validated = sanitizeLayoutPayload(body);
          await fs.writeFile(layoutFilePath, JSON.stringify(validated, null, 2), "utf-8");
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 404, { ok: false, error: `Unknown API route: ${pathname}` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return sendJson(res, 400, { ok: false, error: message });
      }
    }
    if (pathname === "/@zelune/shim/react.js") {
      return sendJs(res, buildReactShimModule());
    }
    if (pathname === "/@zelune/shim/react-dom.js") {
      return sendJs(res, buildReactDomShimModule());
    }
    if (pathname === "/@zelune/shim/react-native.js") {
      return sendJs(res, buildReactNativeShimModule());
    }
    if (pathname === "/@zelune/shim/lucide.js") {
      const exportsParam = searchParams.get("exports") ?? "";
      return sendJs(res, buildLucideShimModule(exportsParam.split(",")));
    }
    if (pathname === "/@zelune/shim/stub.js") {
      const exportsParam = searchParams.get("exports") ?? "";
      return sendJs(res, buildUniversalStubModule(exportsParam.split(",")));
    }
    if (pathname === "/@zelune/module") {
      const fileParam = searchParams.get("file") ?? "";
      if (!fileParam || !isPathAllowed(fileParam) || !fs$1.existsSync(fileParam)) {
        res.statusCode = 404;
        return res.end("// Module not found\nexport default {};\n");
      }
      try {
        const compiled = compileModuleForBrowser({
          filePath: fileParam,
          targetProjectRoot,
          workspaceRoot
        });
        return sendJs(res, compiled);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.statusCode = 500;
        return res.end(`throw new Error(${JSON.stringify(msg)});
`);
      }
    }
    if (pathname === "/@zelune/asset") {
      const fileParam = searchParams.get("file") ?? "";
      if (!fileParam || !isPathAllowed(fileParam) || !fs$1.existsSync(fileParam)) {
        res.statusCode = 404;
        return res.end("Not found");
      }
      const ext = path.extname(fileParam).toLowerCase();
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      return fs$1.createReadStream(fileParam).pipe(res);
    }
    if (pathname === "/" || pathname === "/index.html") {
      const indexHtmlPath = path.join(distDir, "index.html");
      if (!fs$1.existsSync(indexHtmlPath)) {
        res.statusCode = 500;
        return res.end("Zelune dist/index.html not found.");
      }
      const rawHtml = await fs.readFile(indexHtmlPath, "utf-8");
      const tailwindTheme = loadProjectTailwindTheme([targetProjectRoot, workspaceRoot]);
      const discoveredManifest = discoverScreenFilesSync(targetProjectRoot);
      const runtimeScript = `<script>window.__ZELUNE_TAILWIND_THEME__ = ${JSON.stringify(
        tailwindTheme
      )}; window.__ZELUNE_SCREEN_MANIFEST__ = ${JSON.stringify(discoveredManifest)};<\/script>`;
      const injectedHtml = rawHtml.replace("<head>", `<head>
    ${runtimeScript}`);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      return res.end(injectedHtml);
    }
    const relativeAsset = pathname.replace(/^\/+/, "");
    const assetCandidate = path.resolve(distDir, relativeAsset);
    if (assetCandidate.startsWith(distDir + path.sep) && fs$1.existsSync(assetCandidate) && fs$1.statSync(assetCandidate).isFile()) {
      const ext = path.extname(assetCandidate).toLowerCase();
      res.statusCode = 200;
      res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
      return fs$1.createReadStream(assetCandidate).pipe(res);
    }
    res.statusCode = 404;
    res.end("Not found");
  };
  const basePort = options.port ?? 5173;
  for (let offset = 0; offset < 25; offset++) {
    const candidatePort = basePort + offset;
    try {
      const srv = await new Promise((resolve, reject) => {
        const s = http.createServer(requestHandler);
        s.once("error", reject);
        s.listen(candidatePort, "127.0.0.1", () => {
          s.removeListener("error", reject);
          resolve(s);
        });
      });
      return { server: srv, port: candidatePort };
    } catch (err) {
      const code = err == null ? void 0 : err.code;
      if (code === "EADDRINUSE" && !options.port) {
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Unable to bind Studio HTTP server starting from port ${basePort}`);
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname$1, "..");
const MCP_TOOLS = [
  {
    name: "list_canvas_screens",
    description: "Lists all discovered React Native screens on the visual canvas along with their element counts and outgoing navigation flow edges.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "inspect_screen_element",
    description: "Inspects a specific JSX element inside a React Native screen by its relative file path and AST index path.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)"
        },
        astPath: {
          type: "string",
          description: 'Preorder AST index of the JSX element (e.g. "0", "4")'
        }
      },
      required: ["file", "astPath"]
    }
  },
  {
    name: "patch_screen_element",
    description: "Surgically patches the text copy or StyleSheet properties of a React Native JSX element.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)"
        },
        astPath: {
          type: "string",
          description: "Preorder AST index of the JSX element"
        },
        text: {
          type: "string",
          description: "Optional new static text content for <Text> elements"
        },
        styles: {
          type: "object",
          description: "Optional map of React Native style properties to update"
        }
      },
      required: ["file", "astPath"]
    }
  },
  {
    name: "reorder_screen_element",
    description: "Surgically reorders a React Native JSX element among its Flexbox siblings in the .tsx AST.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)"
        },
        astPath: {
          type: "string",
          description: "Preorder AST index of the JSX element to move"
        },
        direction: {
          type: "string",
          enum: ["up", "down"],
          description: 'Optional relative direction ("up" or "down") among siblings'
        },
        targetAstPath: {
          type: "string",
          description: "Optional AST index of the sibling to place before/after"
        },
        placement: {
          type: "string",
          enum: ["before", "after"],
          description: "Whether to insert before or after targetAstPath"
        }
      },
      required: ["file", "astPath"]
    }
  },
  {
    name: "insert_screen_element",
    description: "Surgically inserts a new React Native component/section preset (button, section, row, heading, text, input, badge, divider) into a screen .tsx AST and auto-injects required react-native imports.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)"
        },
        astPath: {
          type: "string",
          description: "Optional AST index of the reference JSX element"
        },
        placement: {
          type: "string",
          enum: ["inside", "after", "before"],
          description: 'Placement relative to astPath (defaults to "after" or "inside")'
        },
        preset: {
          type: "string",
          enum: ["button", "section", "row", "heading", "text", "input", "badge", "divider"],
          description: "Component preset to insert"
        },
        label: {
          type: "string",
          description: "Optional custom label/text/placeholder for the inserted component"
        },
        navigateTo: {
          type: "string",
          description: "Optional target screen ID if inserting a navigation button"
        }
      },
      required: ["file", "preset"]
    }
  },
  {
    name: "duplicate_screen_element",
    description: "Duplicates a JSX element right after itself in the screen .tsx AST.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        astPath: { type: "string" }
      },
      required: ["file", "astPath"]
    }
  },
  {
    name: "delete_screen_element",
    description: "Deletes a non-root JSX element from the screen .tsx AST.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string" },
        astPath: { type: "string" }
      },
      required: ["file", "astPath"]
    }
  }
];
async function executeMcpTool(workspaceRoot, name, args) {
  if (name === "list_canvas_screens") {
    const screens = await discoverScreens(workspaceRoot);
    return {
      content: [{ type: "text", text: JSON.stringify(screens, null, 2) }]
    };
  }
  if (name === "inspect_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const astPath = String((args == null ? void 0 : args.astPath) ?? "0");
    const element = await inspectElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: "text", text: JSON.stringify(element, null, 2) }]
    };
  }
  if (name === "patch_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const astPath = String((args == null ? void 0 : args.astPath) ?? "0");
    const text = typeof (args == null ? void 0 : args.text) === "string" ? args.text : void 0;
    const styles = (args == null ? void 0 : args.styles) ?? void 0;
    const result = await patchElement(workspaceRoot, {
      file,
      astPath,
      text,
      styles
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  if (name === "reorder_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const astPath = String((args == null ? void 0 : args.astPath) ?? "0");
    const direction = (args == null ? void 0 : args.direction) === "up" || (args == null ? void 0 : args.direction) === "down" ? args.direction : void 0;
    const targetAstPath = typeof (args == null ? void 0 : args.targetAstPath) === "string" ? args.targetAstPath : void 0;
    const placement = (args == null ? void 0 : args.placement) === "before" || (args == null ? void 0 : args.placement) === "after" ? args.placement : void 0;
    const result = await reorderElement(workspaceRoot, {
      file,
      astPath,
      direction,
      targetAstPath,
      placement
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  if (name === "insert_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const preset = String((args == null ? void 0 : args.preset) ?? "button");
    const astPath = typeof (args == null ? void 0 : args.astPath) === "string" ? args.astPath : void 0;
    const placement = (args == null ? void 0 : args.placement) === "inside" || (args == null ? void 0 : args.placement) === "after" || (args == null ? void 0 : args.placement) === "before" ? args.placement : void 0;
    const label = typeof (args == null ? void 0 : args.label) === "string" ? args.label : void 0;
    const navigateTo = typeof (args == null ? void 0 : args.navigateTo) === "string" ? args.navigateTo : void 0;
    const result = await insertElement(workspaceRoot, {
      file,
      astPath,
      placement,
      preset,
      label,
      navigateTo
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  if (name === "duplicate_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const astPath = String((args == null ? void 0 : args.astPath) ?? "1");
    const result = await duplicateElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  if (name === "delete_screen_element") {
    const file = String((args == null ? void 0 : args.file) ?? "");
    const astPath = String((args == null ? void 0 : args.astPath) ?? "1");
    const result = await deleteElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  }
  throw new Error(`Unknown MCP tool: ${name}`);
}
async function handleMcpJsonRpcRequest(request, customWorkspaceRoot) {
  var _a, _b, _c;
  if (request.id === void 0) {
    return null;
  }
  const workspaceRoot = customWorkspaceRoot || process.env.ANTIGRAVITY_TARGET_PROJECT || process.env.ANTIGRAVITY_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT;
  const method = request.method ?? "";
  try {
    if (method === "initialize") {
      const requestedProtocol = typeof ((_a = request.params) == null ? void 0 : _a.protocolVersion) === "string" ? request.params.protocolVersion : "2024-11-05";
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: requestedProtocol,
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "zelune",
            version: "1.6.4"
          }
        }
      };
    }
    if (method === "ping") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {}
      };
    }
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: MCP_TOOLS
        }
      };
    }
    if (method === "resources/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resources: []
        }
      };
    }
    if (method === "prompts/list") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          prompts: []
        }
      };
    }
    if (method === "tools/call") {
      const toolName = String(((_b = request.params) == null ? void 0 : _b.name) ?? "");
      const toolArgs = ((_c = request.params) == null ? void 0 : _c.arguments) ?? void 0;
      const toolResult = await executeMcpTool(workspaceRoot, toolName, toolArgs);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: toolResult
      };
    }
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message
      }
    };
  }
}
function startMcpServer(customWorkspaceRoot) {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const parseErr = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" }
      };
      process.stdout.write(`${JSON.stringify(parseErr)}
`);
      return;
    }
    const response = await handleMcpJsonRpcRequest(parsed, customWorkspaceRoot);
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}
`);
    }
  });
}
const isDirectExecution = Boolean(process.argv[1]) && (() => {
  try {
    return import.meta.url === pathToFileURL(fs$1.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (isDirectExecution) {
  startMcpServer();
}
export {
  MCP_TOOLS,
  handleMcpJsonRpcRequest,
  startMcpServer,
  startStudioHttpServer
};
