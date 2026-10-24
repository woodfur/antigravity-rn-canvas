import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import { getJsxTagName } from './astEngine';

const generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate;

const ALLOWED_SCREEN_PREFIXES = ['src/screens/', 'screens/', 'app/', 'src/app/'];
const ASSET_EXT_REGEX =
  /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|ttf|otf|woff2?|mp3|mp4|wav|m4a|webm|lottie|pdf|bin)$/i;

const RESOLVABLE_EXTENSIONS = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.native.tsx',
  '.native.ts',
  '.native.jsx',
  '.native.js',
  '.ios.tsx',
  '.ios.ts',
  '.android.tsx',
  '.android.ts',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
];

const ZELUNE_JSX_REACT_IDENT = '__zeluneReact';

function stripJsonCommentsAndTrailingCommas(input: string): string {
  const withoutComments = input.replace(
    /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/.*/g,
    (_match, quotedString?: string) => quotedString ?? ''
  );
  return withoutComments.replace(/,\s*([}\]])/g, '$1');
}

export function tryResolveLocalModule(candidateBase: string): string | null {
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

export function loadTsconfigAliases(roots: string[]): Array<{ prefix: string; targetDir: string }> {
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
        for (const target of targets) {
          const cleanTarget = target.replace(/\/\*$/, '');
          const resolvedDir = path.resolve(rootDir, baseUrl, cleanTarget);
          mappings.push({ prefix: cleanPrefix, targetDir: resolvedDir });
        }
      }
    } catch {
      // Ignore malformed tsconfig
    }
  }
  return mappings;
}

function cleanJsxText(rawText: string): string | null {
  const lines = rawText.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) {
      lastNonEmptyLine = i;
    }
  }
  let str = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;
    let trimmedLine = line.replace(/\t/g, ' ');
    if (!isFirstLine) {
      trimmedLine = trimmedLine.replace(/^[ ]+/, '');
    }
    if (!isLastLine) {
      trimmedLine = trimmedLine.replace(/[ ]+$/, '');
    }
    if (trimmedLine) {
      if (!isLastNonEmptyLine) {
        trimmedLine += ' ';
      }
      str += trimmedLine;
    }
  }
  return str.length > 0 ? str : null;
}

function convertJsxElementNameToExpr(
  nameNode: t.JSXOpeningElement['name']
): t.Expression {
  if (t.isJSXIdentifier(nameNode)) {
    if (nameNode.name === 'this') {
      return t.thisExpression();
    }
    if (/^[a-z]/.test(nameNode.name) || nameNode.name.includes('-')) {
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
  return t.stringLiteral('div');
}

function convertJsxAttributesToExpr(
  attributes: Array<t.JSXAttribute | t.JSXSpreadAttribute>,
  onJsxSeen: () => void
): t.Expression {
  if (attributes.length === 0) {
    return t.nullLiteral();
  }
  const props: Array<t.ObjectProperty | t.SpreadElement> = [];
  for (const attr of attributes) {
    if (t.isJSXSpreadAttribute(attr)) {
      props.push(t.spreadElement(attr.argument));
      continue;
    }
    const rawKey = t.isJSXIdentifier(attr.name)
      ? attr.name.name
      : `${attr.name.namespace.name}:${attr.name.name.name}`;
    const keyNode = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(rawKey)
      ? t.identifier(rawKey)
      : t.stringLiteral(rawKey);

    let valExpr: t.Expression;
    if (attr.value === null || attr.value === undefined) {
      valExpr = t.booleanLiteral(true);
    } else if (t.isJSXExpressionContainer(attr.value)) {
      if (t.isJSXEmptyExpression(attr.value.expression)) {
        valExpr = t.booleanLiteral(true);
      } else {
        valExpr = attr.value.expression;
      }
    } else if (t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
      valExpr = transformJsxNode(attr.value, onJsxSeen);
    } else {
      valExpr = attr.value;
    }
    props.push(t.objectProperty(keyNode, valExpr));
  }
  return t.objectExpression(props);
}

function convertJsxChildrenToExprs(
  children: Array<t.Node>,
  onJsxSeen: () => void
): Array<t.Expression | t.SpreadElement> {
  const out: Array<t.Expression | t.SpreadElement> = [];
  for (const child of children) {
    if (!child) continue;
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
      out.push(transformJsxNode(child, onJsxSeen));
    } else if (t.isSpreadElement(child) || t.isExpression(child)) {
      // Child JSXElement/JSXFragment already transformed bottom-up into CallExpression
      out.push(child);
    }
  }
  return out;
}

function transformJsxNode(
  node: t.JSXElement | t.JSXFragment,
  onJsxSeen: () => void
): t.CallExpression {
  onJsxSeen();
  const createElMember = t.memberExpression(
    t.identifier(ZELUNE_JSX_REACT_IDENT),
    t.identifier('createElement')
  );
  if (t.isJSXFragment(node)) {
    const fragMember = t.memberExpression(
      t.identifier(ZELUNE_JSX_REACT_IDENT),
      t.identifier('Fragment')
    );
    const children = convertJsxChildrenToExprs(node.children as unknown as t.Node[], onJsxSeen);
    return t.callExpression(createElMember, [fragMember, t.nullLiteral(), ...children]);
  }
  const tagExpr = convertJsxElementNameToExpr(node.openingElement.name);
  const propsExpr = convertJsxAttributesToExpr(node.openingElement.attributes, onJsxSeen);
  const children = convertJsxChildrenToExprs(node.children as unknown as t.Node[], onJsxSeen);
  return t.callExpression(createElMember, [tagExpr, propsExpr, ...children]);
}

function convertTsEnumToVar(enumNode: t.TSEnumDeclaration): t.VariableDeclaration {
  const props: t.ObjectProperty[] = [];
  let nextNumericValue = 0;
  for (const member of enumNode.members) {
    const keyNode = t.isIdentifier(member.id)
      ? t.identifier(member.id.name)
      : t.stringLiteral(member.id.value);
    let initExpr: t.Expression;
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
  return t.variableDeclaration('const', [
    t.variableDeclarator(t.identifier(enumNode.id.name), t.objectExpression(props)),
  ]);
}

function isTsDeclarationOnlyNode(item: Record<string, unknown>): boolean {
  const nodeType = item.type;
  if (
    nodeType === 'TSInterfaceDeclaration' ||
    nodeType === 'TSTypeAliasDeclaration' ||
    nodeType === 'TSDeclareFunction' ||
    nodeType === 'TSDeclareMethod' ||
    nodeType === 'TSModuleDeclaration' ||
    nodeType === 'TSIndexSignature' ||
    nodeType === 'TSAbstractMethodDefinition' ||
    nodeType === 'TSAbstractPropertyDefinition' ||
    nodeType === 'TSAbstractAccessorProperty'
  ) {
    return true;
  }
  if (
    (nodeType === 'ClassMethod' ||
      nodeType === 'ClassProperty' ||
      nodeType === 'ClassPrivateProperty' ||
      nodeType === 'AccessorProperty') &&
    (item.abstract === true || item.declare === true)
  ) {
    return true;
  }
  if (nodeType === 'VariableDeclaration' && item.declare === true) {
    return true;
  }
  if (nodeType === 'ClassDeclaration' && item.declare === true) {
    return true;
  }
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stripTypeScriptAndTransformJsxAst(node: any, onJsxSeen: () => void = () => {}): any {
  if (!node || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    const nextArr = [];
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      if (!item) continue;
      if (isTsDeclarationOnlyNode(item)) {
        continue;
      }
      if (item.type === 'ImportDeclaration' && item.importKind === 'type') {
        continue;
      }
      if (item.type === 'ExportAllDeclaration' && item.exportKind === 'type') {
        continue;
      }
      if (item.type === 'ExportNamedDeclaration') {
        if (item.exportKind === 'type') continue;
        if (item.declaration && isTsDeclarationOnlyNode(item.declaration)) {
          continue;
        }
      }
      if (item.type === 'ExportDefaultDeclaration') {
        if (item.declaration && isTsDeclarationOnlyNode(item.declaration)) {
          continue;
        }
      }
      const transformed = stripTypeScriptAndTransformJsxAst(item, onJsxSeen);
      if (transformed !== null && transformed !== undefined) {
        nextArr.push(transformed);
      }
    }
    return nextArr;
  }

  // Unwrap TS expression wrappers
  while (
    node &&
    (node.type === 'TSAsExpression' ||
      node.type === 'TSSatisfiesExpression' ||
      node.type === 'TSTypeAssertion' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'TSInstantiationExpression')
  ) {
    node = node.expression;
  }

  if (!node || typeof node !== 'object') return node;

  if (node.type === 'TSEnumDeclaration') {
    return convertTsEnumToVar(node);
  }

  if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'TSEnumDeclaration') {
    node.declaration = convertTsEnumToVar(node.declaration);
  }

  if (node.type === 'ImportDeclaration' && Array.isArray(node.specifiers)) {
    const origCount = node.specifiers.length;
    node.specifiers = node.specifiers.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.importKind !== 'type'
    );
    if (origCount > 0 && node.specifiers.length === 0) {
      return null;
    }
  }

  if (node.type === 'ExportNamedDeclaration' && Array.isArray(node.specifiers)) {
    node.specifiers = node.specifiers.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.exportKind !== 'type'
    );
    if (!node.declaration && node.specifiers.length === 0) {
      return null;
    }
  }

  // Strip TypeScript-only fields on the current node (NEVER strip `optional` on OptionalMemberExpression / OptionalCallExpression!)
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
  delete node.abstract;
  delete node.importKind;
  delete node.exportKind;
  if (
    node.type !== 'OptionalMemberExpression' &&
    node.type !== 'OptionalCallExpression'
  ) {
    delete node.optional;
  }

  // Strip TypeScript `this: T` fake first parameter on functions/methods
  if (
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'ObjectMethod' ||
      node.type === 'ClassMethod' ||
      node.type === 'ClassPrivateMethod') &&
    Array.isArray(node.params) &&
    node.params[0]?.type === 'Identifier' &&
    node.params[0]?.name === 'this'
  ) {
    node.params = node.params.slice(1);
  }

  // Lower TypeScript constructor parameter properties (`constructor(private readonly api: Api)`) to `this.api = api;`
  if (
    node.type === 'ClassMethod' &&
    node.kind === 'constructor' &&
    Array.isArray(node.params) &&
    node.body?.type === 'BlockStatement' &&
    Array.isArray(node.body.body)
  ) {
    const paramPropAssignments: t.ExpressionStatement[] = [];
    for (const p of node.params) {
      if (p?.type === 'TSParameterProperty') {
        const inner = p.parameter;
        const propName =
          inner?.type === 'Identifier'
            ? inner.name
            : inner?.type === 'AssignmentPattern' && inner.left?.type === 'Identifier'
              ? inner.left.name
              : null;
        if (propName) {
          paramPropAssignments.push(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(t.thisExpression(), t.identifier(propName)),
                t.identifier(propName)
              )
            )
          );
        }
      }
    }
    if (paramPropAssignments.length > 0) {
      const superIdx = node.body.body.findIndex(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) =>
          s?.type === 'ExpressionStatement' &&
          s.expression?.type === 'CallExpression' &&
          s.expression.callee?.type === 'Super'
      );
      const insertPos = superIdx >= 0 ? superIdx + 1 : 0;
      node.body.body.splice(insertPos, 0, ...paramPropAssignments);
    }
  }

  if (node.type === 'TSParameterProperty') {
    return stripTypeScriptAndTransformJsxAst(node.parameter, onJsxSeen);
  }

  // Recursively process child keys first (bottom-up for JSX)
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'comments' ||
      key === 'leadingComments' ||
      key === 'trailingComments'
    ) {
      continue;
    }
    const val = node[key];
    if (val && typeof val === 'object') {
      node[key] = stripTypeScriptAndTransformJsxAst(val, onJsxSeen);
    }
  }

  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return transformJsxNode(node, onJsxSeen);
  }

  return node;
}

function injectScreenAgyAttributes(ast: t.File, relPath: string): boolean {
  let jsxIndex = 0;
  let hasJsx = false;

  // Canonical preorder traversal using t.VISITOR_KEYS so astPath indices match astEngine.ts 100%
  function visit(node: unknown) {
    if (!node || typeof node !== 'object' || typeof (node as t.Node).type !== 'string') return;
    const typed = node as t.Node;
    if (typed.type === 'JSXFragment') {
      hasJsx = true;
    } else if (typed.type === 'JSXOpeningElement') {
      hasJsx = true;
      const tagName = getJsxTagName(typed.name);
      if (tagName !== 'Fragment' && tagName !== 'React.Fragment' && tagName !== '') {
        const hasAgyAttr = typed.attributes.some(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name, { name: 'data-agy-ast-path' })
        );
        if (!hasAgyAttr) {
          const currentIndex = String(jsxIndex++);
          const line = String(typed.loc?.start.line ?? 1);
          const col = String(typed.loc?.start.column ?? 0);
          const dataSetProps: t.ObjectProperty[] = [
            t.objectProperty(t.identifier('agyFile'), t.stringLiteral(relPath)),
            t.objectProperty(t.identifier('agyLine'), t.stringLiteral(line)),
            t.objectProperty(t.identifier('agyCol'), t.stringLiteral(col)),
            t.objectProperty(t.identifier('agyAstPath'), t.stringLiteral(currentIndex)),
            t.objectProperty(t.identifier('agyTag'), t.stringLiteral(tagName)),
          ];
          typed.attributes.push(
            t.jsxAttribute(
              t.jsxIdentifier('dataSet'),
              t.jsxExpressionContainer(t.objectExpression(dataSetProps))
            ),
            t.jsxAttribute(t.jsxIdentifier('data-agy-file'), t.stringLiteral(relPath)),
            t.jsxAttribute(t.jsxIdentifier('data-agy-line'), t.stringLiteral(line)),
            t.jsxAttribute(t.jsxIdentifier('data-agy-col'), t.stringLiteral(col)),
            t.jsxAttribute(t.jsxIdentifier('data-agy-ast-path'), t.stringLiteral(currentIndex)),
            t.jsxAttribute(t.jsxIdentifier('data-agy-tag'), t.stringLiteral(tagName))
          );
        }
      }
    }
    const keys = t.VISITOR_KEYS[typed.type];
    if (!keys) return;
    const rec = typed as unknown as Record<string, unknown>;
    for (const key of keys) {
      const child = rec[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (child[i]) visit(child[i]);
        }
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    }
  }

  visit(ast);
  return hasJsx;
}

function collectNamespaceMemberAccesses(
  ast: t.File,
  namespaceLocalNames: Set<string>
): Map<string, Set<string>> {
  const accesses = new Map<string, Set<string>>();
  if (namespaceLocalNames.size === 0) return accesses;
  for (const name of namespaceLocalNames) {
    accesses.set(name, new Set());
  }

  function visit(node: unknown) {
    if (!node || typeof node !== 'object' || typeof (node as t.Node).type !== 'string') return;
    const typed = node as t.Node;
    if (
      (typed.type === 'MemberExpression' || typed.type === 'OptionalMemberExpression') &&
      !typed.computed &&
      typed.object.type === 'Identifier' &&
      namespaceLocalNames.has(typed.object.name) &&
      typed.property.type === 'Identifier'
    ) {
      accesses.get(typed.object.name)?.add(typed.property.name);
    }
    const keys = t.VISITOR_KEYS[typed.type];
    if (!keys) return;
    const rec = typed as unknown as Record<string, unknown>;
    for (const key of keys) {
      const child = rec[key];
      if (Array.isArray(child)) {
        for (let i = 0; i < child.length; i++) {
          if (child[i]) visit(child[i]);
        }
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    }
  }

  visit(ast);
  return accesses;
}

function collectRuntimeReferencedIdentifiers(stmts: t.Statement[]): Set<string> {
  const refs = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i]) walk(node[i]);
      }
      return;
    }
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      refs.add(node.name);
    }
    for (const key of Object.keys(node)) {
      if (
        key === 'loc' ||
        key === 'comments' ||
        key === 'leadingComments' ||
        key === 'trailingComments'
      ) {
        continue;
      }
      const val = node[key];
      if (val && typeof val === 'object') {
        walk(val);
      }
    }
  }
  for (const stmt of stmts) {
    if (stmt && stmt.type !== 'ImportDeclaration') {
      walk(stmt);
    }
  }
  return refs;
}

function getLocalTypeOnlyDeclaredNames(localFilePath: string): Set<string> {
  const typeNames = new Set<string>();
  const valueNames = new Set<string>();
  try {
    if (!/\.(tsx?|mts|cts)$/i.test(localFilePath) || !fs.existsSync(localFilePath)) {
      return typeNames;
    }
    const raw = fs.readFileSync(localFilePath, 'utf-8');
    const parsed = parse(raw, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx', 'decorators-legacy'],
      errorRecovery: true,
    });
    for (const stmt of parsed.program.body) {
      if (stmt.type === 'ExportNamedDeclaration') {
        if (stmt.exportKind === 'type') {
          if (stmt.declaration && 'id' in stmt.declaration && stmt.declaration.id?.type === 'Identifier') {
            typeNames.add(stmt.declaration.id.name);
          }
          for (const s of stmt.specifiers) {
            if (s.type === 'ExportSpecifier') {
              const exp = s.exported.type === 'Identifier' ? s.exported.name : s.exported.value;
              typeNames.add(exp);
            }
          }
          continue;
        }
        const decl = stmt.declaration;
        if (decl) {
          if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') {
            typeNames.add(decl.id.name);
          } else if (
            (decl.type === 'FunctionDeclaration' ||
              decl.type === 'ClassDeclaration' ||
              decl.type === 'TSEnumDeclaration') &&
            decl.id
          ) {
            valueNames.add(decl.id.name);
          } else if (decl.type === 'VariableDeclaration') {
            for (const d of decl.declarations) {
              if (d.id.type === 'Identifier') valueNames.add(d.id.name);
            }
          }
        }
      }
    }
    for (const v of valueNames) {
      typeNames.delete(v);
    }
  } catch {
    // Ignore parse errors
  }
  return typeNames;
}

export interface CompileModuleOptions {
  filePath: string;
  targetProjectRoot: string;
  workspaceRoot?: string;
  versionTag?: string;
}

export function compileModuleForBrowser(options: CompileModuleOptions): string {
  const { filePath, targetProjectRoot, workspaceRoot = targetProjectRoot, versionTag } = options;
  const cleanFilePath = filePath.split('?')[0];
  const ext = path.extname(cleanFilePath).toLowerCase();

  if (ext === '.css') {
    return 'export default {};\n';
  }
  if (ext === '.json') {
    const rawJson = fs.readFileSync(cleanFilePath, 'utf-8');
    return `export default ${rawJson};\n`;
  }
  if (ASSET_EXT_REGEX.test(ext)) {
    const assetUrl = `/@zelune/asset?file=${encodeURIComponent(cleanFilePath)}`;
    return `export default { uri: ${JSON.stringify(assetUrl)} };\n`;
  }

  const code = fs.readFileSync(cleanFilePath, 'utf-8');
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
    errorRecovery: true,
  });

  const normalizedTargetRoot = path.resolve(targetProjectRoot);
  const relPath = path.relative(normalizedTargetRoot, path.resolve(cleanFilePath)).replace(/\\/g, '/');
  const isScreenFile = ALLOWED_SCREEN_PREFIXES.some((prefix) => relPath.startsWith(prefix));

  let emittedJsx = false;
  if (isScreenFile) {
    if (injectScreenAgyAttributes(ast, relPath)) {
      emittedJsx = true;
    }
  }

  const uniqueRoots = Array.from(
    new Set([path.resolve(targetProjectRoot), path.resolve(workspaceRoot)])
  );
  const tsconfigAliases = loadTsconfigAliases(uniqueRoots);

  function resolveAlias(specifier: string): string | null {
    for (const mapping of tsconfigAliases) {
      if (specifier === mapping.prefix) {
        const found = tryResolveLocalModule(mapping.targetDir);
        if (found) return found;
      } else if (specifier.startsWith(mapping.prefix + '/')) {
        const rel = specifier.slice(mapping.prefix.length + 1);
        const found = tryResolveLocalModule(path.join(mapping.targetDir, rel));
        if (found) return found;
      }
    }
    if (specifier.startsWith('@/') || specifier.startsWith('~/')) {
      const rel = specifier.slice(2);
      for (const r of uniqueRoots) {
        const direct = tryResolveLocalModule(path.join(r, rel));
        if (direct) return direct;
        const inSrc = tryResolveLocalModule(path.join(r, 'src', rel));
        if (inSrc) return inSrc;
      }
    }
    return null;
  }

  function resolveLocalOrAliasFile(specifier: string): string | null {
    if (specifier.startsWith('.')) {
      const candidate = path.resolve(path.dirname(cleanFilePath), specifier);
      return tryResolveLocalModule(candidate);
    }
    if (
      specifier.startsWith('@/') ||
      specifier.startsWith('~/') ||
      tsconfigAliases.some((m) => specifier === m.prefix || specifier.startsWith(m.prefix + '/'))
    ) {
      return resolveAlias(specifier);
    }
    return null;
  }

  function rewriteResolvedLocalFile(resolved: string, requestedExports: string[]): string {
    const normalized = resolved.replace(/\\/g, '/');
    if (normalized.endsWith('/src/runtime/MockNavigationContext.tsx')) {
      return `/@zelune/shim/stub.js?pkg=zelune-mock-nav&exports=${encodeURIComponent(
        requestedExports.join(',')
      )}`;
    }
    if (normalized.endsWith('/src/runtime/reactNativeShim.ts')) {
      return '/@zelune/shim/react-native.js';
    }
    const vSuffix = versionTag ? `&t=${encodeURIComponent(versionTag)}` : '';
    return `/@zelune/module?file=${encodeURIComponent(resolved)}${vSuffix}`;
  }

  function rewriteSpecifier(specifier: string, requestedExports: string[]): string {
    if (
      specifier === 'react' ||
      specifier === 'react/jsx-runtime' ||
      specifier === 'react/jsx-dev-runtime'
    ) {
      return '/@zelune/shim/react.js';
    }
    if (specifier === 'react-dom' || specifier === 'react-dom/client') {
      return '/@zelune/shim/react-dom.js';
    }
    if (specifier === 'react-native' || specifier === 'react-native-web') {
      return '/@zelune/shim/react-native.js';
    }
    if (specifier === 'lucide-react' || specifier === 'lucide-react-native') {
      return `/@zelune/shim/lucide.js?exports=${encodeURIComponent(requestedExports.join(','))}`;
    }
    if (
      specifier.startsWith('.') ||
      specifier.startsWith('@/') ||
      specifier.startsWith('~/') ||
      tsconfigAliases.some((m) => specifier === m.prefix || specifier.startsWith(m.prefix + '/'))
    ) {
      const resolved = resolveLocalOrAliasFile(specifier);
      if (resolved) {
        return rewriteResolvedLocalFile(resolved, requestedExports);
      }
      return `/@zelune/shim/stub.js?pkg=${encodeURIComponent(specifier)}&exports=${encodeURIComponent(
        requestedExports.join(',')
      )}`;
    }
    return `/@zelune/shim/stub.js?pkg=${encodeURIComponent(specifier)}&exports=${encodeURIComponent(
      requestedExports.join(',')
    )}`;
  }

  // Record genuine side-effect imports (`import './global.css'`) before TS stripping
  const sideEffectImportNodes = new WeakSet<t.Node>();
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration' && stmt.specifiers.length === 0 && stmt.importKind !== 'type') {
      sideEffectImportNodes.add(stmt);
    }
  }

  // Strip TS types and transform JSX -> __zeluneReact.createElement
  stripTypeScriptAndTransformJsxAst(ast, () => {
    emittedJsx = true;
  });

  // Transform static CommonJS require('...') calls (e.g. <Image source={require('../assets/logo.png')} />)
  const hoistedRequireImports: t.ImportDeclaration[] = [];
  let reqCounter = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function transformRequireCalls(node: any): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (node[i]) node[i] = transformRequireCalls(node[i]);
      }
      return node;
    }
    for (const key of Object.keys(node)) {
      if (
        key === 'loc' ||
        key === 'comments' ||
        key === 'leadingComments' ||
        key === 'trailingComments'
      ) {
        continue;
      }
      const val = node[key];
      if (val && typeof val === 'object') {
        node[key] = transformRequireCalls(val);
      }
    }

    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require' &&
      Array.isArray(node.arguments) &&
      node.arguments.length === 1 &&
      node.arguments[0]?.type === 'StringLiteral'
    ) {
      const rawSpec = node.arguments[0].value as string;
      const localResolved = resolveLocalOrAliasFile(rawSpec);
      if (localResolved && ASSET_EXT_REGEX.test(path.extname(localResolved))) {
        const assetUrl = `/@zelune/asset?file=${encodeURIComponent(localResolved)}`;
        return t.objectExpression([
          t.objectProperty(t.identifier('uri'), t.stringLiteral(assetUrl)),
        ]);
      }
      if (ASSET_EXT_REGEX.test(rawSpec)) {
        return t.objectExpression([
          t.objectProperty(t.identifier('uri'), t.stringLiteral('')),
        ]);
      }
      const reqIdent = t.identifier(`__zeluneReq_${reqCounter++}`);
      const rewritten = localResolved
        ? rewriteResolvedLocalFile(localResolved, [])
        : rewriteSpecifier(rawSpec, []);
      hoistedRequireImports.push(
        t.importDeclaration([t.importNamespaceSpecifier(reqIdent)], t.stringLiteral(rewritten))
      );
      return t.logicalExpression(
        '??',
        t.optionalMemberExpression(reqIdent, t.identifier('default'), false, true),
        reqIdent
      );
    }

    return node;
  }

  transformRequireCalls(ast.program.body);

  // TypeScript Import & Re-Export Elision:
  // Remove imported bindings that were only used in TypeScript type positions (e.g. `import { Vehicle } from '../types'`),
  // matching tsc/esbuild so browser ESM never throws `does not provide an export named 'Vehicle'`.
  const runtimeReferencedIds = collectRuntimeReferencedIdentifiers(ast.program.body);
  const elidedBody: t.Statement[] = [];
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      if (sideEffectImportNodes.has(stmt)) {
        elidedBody.push(stmt);
        continue;
      }
      stmt.specifiers = stmt.specifiers.filter((spec) => runtimeReferencedIds.has(spec.local.name));
      if (stmt.specifiers.length > 0) {
        elidedBody.push(stmt);
      }
      continue;
    }
    if (
      stmt.type === 'ExportNamedDeclaration' &&
      stmt.source &&
      !stmt.declaration &&
      stmt.specifiers.length > 0
    ) {
      const localTarget = resolveLocalOrAliasFile(stmt.source.value);
      if (localTarget) {
        const typeOnlyNames = getLocalTypeOnlyDeclaredNames(localTarget);
        if (typeOnlyNames.size > 0) {
          stmt.specifiers = stmt.specifiers.filter((spec) => {
            if (spec.type !== 'ExportSpecifier') return true;
            return !typeOnlyNames.has(spec.local.name);
          });
          if (stmt.specifiers.length === 0) {
            continue;
          }
        }
      }
    }
    elidedBody.push(stmt);
  }
  ast.program.body = elidedBody;

  // Collect namespace member accesses (e.g. `import * as Icons from 'lucide-react-native'` -> `Icons.Home`)
  const namespaceLocals = new Set<string>();
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      for (const spec of stmt.specifiers) {
        if (spec.type === 'ImportNamespaceSpecifier') {
          namespaceLocals.add(spec.local.name);
        }
      }
    }
  }
  const namespaceMemberMap = collectNamespaceMemberAccesses(ast, namespaceLocals);

  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      const requested: string[] = [];
      for (const spec of stmt.specifiers) {
        if (spec.type === 'ImportSpecifier') {
          const importedName =
            spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
          if (importedName && importedName !== 'default') {
            requested.push(importedName);
          }
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          const accessed = namespaceMemberMap.get(spec.local.name);
          if (accessed) {
            for (const memberName of accessed) {
              if (memberName !== 'default') requested.push(memberName);
            }
          }
        }
      }
      stmt.source.value = rewriteSpecifier(stmt.source.value, requested);
    } else if (
      (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportAllDeclaration') &&
      stmt.source
    ) {
      const requested: string[] = [];
      if (stmt.type === 'ExportNamedDeclaration') {
        for (const spec of stmt.specifiers) {
          if (spec.type === 'ExportSpecifier') {
            const localName = spec.local.name;
            const exportedName =
              spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
            if (localName && localName !== 'default') requested.push(localName);
            if (exportedName && exportedName !== 'default') requested.push(exportedName);
          }
        }
      }
      stmt.source.value = rewriteSpecifier(stmt.source.value, requested);
    }
  }

  if (hoistedRequireImports.length > 0) {
    ast.program.body.unshift(...hoistedRequireImports);
  }

  if (emittedJsx) {
    ast.program.body.unshift(
      t.importDeclaration(
        [t.importDefaultSpecifier(t.identifier(ZELUNE_JSX_REACT_IDENT))],
        t.stringLiteral('/@zelune/shim/react.js')
      )
    );
  }

  const out = generate(ast, {
    retainLines: false,
    compact: false,
  });

  return out.code;
}
