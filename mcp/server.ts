import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  discoverScreens,
  inspectElement,
  patchElement,
  type StyleValue,
} from '../src/server/astEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const server = new Server(
  {
    name: 'antigravity-rn-canvas-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_canvas_screens',
        description:
          'Lists all discovered React Native screens on the visual canvas along with their element counts and outgoing navigation flow edges.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'inspect_screen_element',
        description:
          'Inspects a specific JSX element inside a React Native screen by its relative file path and AST index path.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)',
            },
            astPath: {
              type: 'string',
              description: 'Preorder AST index of the JSX element (e.g. "0", "4")',
            },
          },
          required: ['file', 'astPath'],
        },
      },
      {
        name: 'patch_screen_element',
        description:
          'Surgically patches the text copy or StyleSheet properties of a React Native JSX element.',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)',
            },
            astPath: {
              type: 'string',
              description: 'Preorder AST index of the JSX element',
            },
            text: {
              type: 'string',
              description: 'Optional new static text content for <Text> elements',
            },
            styles: {
              type: 'object',
              description: 'Optional map of React Native style properties to update',
            },
          },
          required: ['file', 'astPath'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'list_canvas_screens') {
    const screens = await discoverScreens(WORKSPACE_ROOT);
    return {
      content: [{ type: 'text', text: JSON.stringify(screens, null, 2) }],
    };
  }

  if (name === 'inspect_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '0');
    const element = await inspectElement(WORKSPACE_ROOT, { file, astPath });
    return {
      content: [{ type: 'text', text: JSON.stringify(element, null, 2) }],
    };
  }

  if (name === 'patch_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '0');
    const text = typeof args?.text === 'string' ? args.text : undefined;
    const styles = (args?.styles as Record<string, StyleValue> | undefined) ?? undefined;

    const result = await patchElement(WORKSPACE_ROOT, {
      file,
      astPath,
      text,
      styles,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP Server Error:', err);
  process.exit(1);
});
