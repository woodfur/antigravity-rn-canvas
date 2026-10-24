import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractStaticAstValue(node: any, scope: Map<string, unknown>, depth = 0): unknown {
  if (!node || depth > 12) return undefined;

  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'UnaryExpression': {
      const arg = extractStaticAstValue(node.argument, scope, depth + 1);
      if (typeof arg === 'number') {
        if (node.operator === '-') return -arg;
        if (node.operator === '+') return +arg;
      }
      return undefined;
    }
    case 'TemplateLiteral': {
      if (Array.isArray(node.expressions) && node.expressions.length === 0) {
        return node.quasis?.[0]?.value?.cooked ?? node.quasis?.[0]?.value?.raw ?? '';
      }
      return undefined;
    }
    case 'ArrayExpression': {
      const items: unknown[] = [];
      for (const el of node.elements ?? []) {
        if (!el) continue;
        if (el.type === 'SpreadElement') {
          const spreadVal = extractStaticAstValue(el.argument, scope, depth + 1);
          if (Array.isArray(spreadVal)) items.push(...spreadVal);
        } else {
          const val = extractStaticAstValue(el, scope, depth + 1);
          if (val !== undefined) items.push(val);
        }
      }
      return items;
    }
    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};
      for (const prop of node.properties ?? []) {
        if (prop.type === 'SpreadElement') {
          const spreadObj = extractStaticAstValue(prop.argument, scope, depth + 1);
          if (spreadObj && typeof spreadObj === 'object' && !Array.isArray(spreadObj)) {
            Object.assign(result, spreadObj);
          }
          continue;
        }
        if (prop.type !== 'ObjectProperty' || prop.computed) continue;
        const key =
          prop.key?.type === 'Identifier'
            ? prop.key.name
            : prop.key?.type === 'StringLiteral' || prop.key?.type === 'NumericLiteral'
              ? String(prop.key.value)
              : null;
        if (!key) continue;
        const val = extractStaticAstValue(prop.value, scope, depth + 1);
        if (val !== undefined) {
          result[key] = val;
        }
      }
      return result;
    }
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
    case 'ParenthesizedExpression':
      return extractStaticAstValue(node.expression, scope, depth + 1);
    case 'Identifier':
      return scope.get(node.name);
    default:
      return undefined;
  }
}

export function parseTailwindConfigSource(raw: string): Record<string, unknown> {
  try {
    const ast = parse(raw, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
      errorRecovery: true,
    });

    const scope = new Map<string, unknown>();
    let exportedConfig: unknown;

    for (const stmt of ast.program.body) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.id.type === 'Identifier' && decl.init) {
            const val = extractStaticAstValue(decl.init, scope);
            if (val !== undefined) {
              scope.set(decl.id.name, val);
            }
          }
        }
      } else if (stmt.type === 'ExportDefaultDeclaration') {
        exportedConfig = extractStaticAstValue(stmt.declaration, scope);
      } else if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'AssignmentExpression'
      ) {
        const left = stmt.expression.left;
        if (
          left.type === 'MemberExpression' &&
          left.object.type === 'Identifier' &&
          left.property.type === 'Identifier' &&
          ((left.object.name === 'module' && left.property.name === 'exports') ||
            (left.object.name === 'exports' && left.property.name === 'default'))
        ) {
          exportedConfig = extractStaticAstValue(stmt.expression.right, scope);
        }
      }
    }

    const cfg = exportedConfig as
      | { theme?: Record<string, unknown> & { extend?: Record<string, unknown> } }
      | undefined;

    if (cfg?.theme && typeof cfg.theme === 'object') {
      const baseTheme = { ...cfg.theme };
      const extendTheme =
        cfg.theme.extend && typeof cfg.theme.extend === 'object' ? cfg.theme.extend : {};
      delete baseTheme.extend;
      const merged: Record<string, unknown> = { ...baseTheme };
      for (const [k, v] of Object.entries(extendTheme)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          merged[k] = {
            ...((baseTheme[k] as Record<string, unknown>) ?? {}),
            ...(v as Record<string, unknown>),
          };
        } else {
          merged[k] = v;
        }
      }
      return merged;
    }
  } catch {
    // Ignore tailwind config parse errors
  }
  return {};
}

export function loadProjectTailwindTheme(roots: string[]): Record<string, unknown> {
  const candidates = [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts',
  ];
  const uniqueRoots = Array.from(new Set(roots.map((r) => path.resolve(r))));
  for (const rootDir of uniqueRoots) {
    for (const fileName of candidates) {
      const fullPath = path.join(rootDir, fileName);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsedTheme = parseTailwindConfigSource(raw);
        if (Object.keys(parsedTheme).length > 0) {
          return parsedTheme;
        }
      } catch {
        // Ignore unreadable tailwind config files
      }
    }
  }
  return {};
}
