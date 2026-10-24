import { parse } from '@babel/parser';
import _generate from '@babel/generator';
import * as t from '@babel/types';
import path from 'node:path';
import type { Plugin } from 'vite';
import { getJsxTagName, traverse } from '../src/server/astEngine';

export { getJsxTagName };

// Handle ESM/CJS default export interop for @babel/generator
const generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate;

const ALLOWED_SCREEN_PREFIXES = ['src/screens/', 'screens/', 'app/', 'src/app/'];

export function viteRnSourceInject(workspaceRoot: string): Plugin {
  const normalizedRoot = path.resolve(workspaceRoot);

  return {
    name: 'vite-rn-source-inject',
    enforce: 'pre',
    transform(code: string, id: string) {
      const cleanId = id.split('?')[0];
      if (!cleanId.endsWith('.tsx') && !cleanId.endsWith('.jsx')) {
        return null;
      }

      const resolvedFile = path.resolve(cleanId);
      const relPath = path.relative(normalizedRoot, resolvedFile).replace(/\\/g, '/');

      // Instrument screen files across src/screens/, screens/, app/, and src/app/
      const isScreenFile = ALLOWED_SCREEN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
      if (!isScreenFile) {
        return null;
      }

      try {
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
        });

        let jsxIndex = 0;

        traverse(ast, {
          JSXOpeningElement(nodePath) {
            const { node } = nodePath;
            const tagName = getJsxTagName(node.name);

            // Skip React.Fragment or Fragment since fragments do not accept DOM/dataSet props
            if (tagName === 'Fragment' || tagName === 'React.Fragment' || tagName === '') {
              return;
            }

            const currentIndex = String(jsxIndex++);
            const line = String(node.loc?.start.line ?? 1);
            const col = String(node.loc?.start.column ?? 0);

            // Check if already injected
            const hasAgyAttr = node.attributes.some(
              (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'data-agy-ast-path' })
            );
            if (hasAgyAttr) {
              return;
            }

            // Build dataSet={{ agyFile, agyLine, agyCol, agyAstPath, agyTag }} for react-native-web
            const dataSetProps: t.ObjectProperty[] = [
              t.objectProperty(t.identifier('agyFile'), t.stringLiteral(relPath)),
              t.objectProperty(t.identifier('agyLine'), t.stringLiteral(line)),
              t.objectProperty(t.identifier('agyCol'), t.stringLiteral(col)),
              t.objectProperty(t.identifier('agyAstPath'), t.stringLiteral(currentIndex)),
              t.objectProperty(t.identifier('agyTag'), t.stringLiteral(tagName)),
            ];

            node.attributes.push(
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
          },
        });

        const output = generate(ast, {
          retainLines: true,
          sourceMaps: true,
          sourceFileName: relPath,
        });

        return {
          code: output.code,
          map: output.map,
        };
      } catch {
        // Return untransformed code so Vite's error overlay or ScreenErrorBoundary can report it cleanly
        return null;
      }
    },
  };
}
