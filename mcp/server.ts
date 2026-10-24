import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  discoverScreens,
  inspectElement,
  patchElement,
  reorderElement,
  insertElement,
  duplicateElement,
  deleteElement,
  type InsertElementPreset,
  type StyleValue,
} from '../src/server/astEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKSPACE_ROOT = path.resolve(__dirname, '..');

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export const MCP_TOOLS = [
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
  {
    name: 'reorder_screen_element',
    description:
      'Surgically reorders a React Native JSX element among its Flexbox siblings in the .tsx AST.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)',
        },
        astPath: {
          type: 'string',
          description: 'Preorder AST index of the JSX element to move',
        },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'Optional relative direction ("up" or "down") among siblings',
        },
        targetAstPath: {
          type: 'string',
          description: 'Optional AST index of the sibling to place before/after',
        },
        placement: {
          type: 'string',
          enum: ['before', 'after'],
          description: 'Whether to insert before or after targetAstPath',
        },
      },
      required: ['file', 'astPath'],
    },
  },
  {
    name: 'insert_screen_element',
    description:
      'Surgically inserts a new React Native component/section preset (button, section, row, heading, text, input, badge, divider) into a screen .tsx AST and auto-injects required react-native imports.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Relative path to the screen file (e.g. src/screens/HomeScreen.tsx)',
        },
        astPath: {
          type: 'string',
          description: 'Optional AST index of the reference JSX element',
        },
        placement: {
          type: 'string',
          enum: ['inside', 'after', 'before'],
          description: 'Placement relative to astPath (defaults to "after" or "inside")',
        },
        preset: {
          type: 'string',
          enum: ['button', 'section', 'row', 'heading', 'text', 'input', 'badge', 'divider'],
          description: 'Component preset to insert',
        },
        label: {
          type: 'string',
          description: 'Optional custom label/text/placeholder for the inserted component',
        },
        navigateTo: {
          type: 'string',
          description: 'Optional target screen ID if inserting a navigation button',
        },
      },
      required: ['file', 'preset'],
    },
  },
  {
    name: 'duplicate_screen_element',
    description: 'Duplicates a JSX element right after itself in the screen .tsx AST.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        astPath: { type: 'string' },
      },
      required: ['file', 'astPath'],
    },
  },
  {
    name: 'delete_screen_element',
    description: 'Deletes a non-root JSX element from the screen .tsx AST.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string' },
        astPath: { type: 'string' },
      },
      required: ['file', 'astPath'],
    },
  },
];

async function executeMcpTool(
  workspaceRoot: string,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (name === 'list_canvas_screens') {
    const screens = await discoverScreens(workspaceRoot);
    return {
      content: [{ type: 'text', text: JSON.stringify(screens, null, 2) }],
    };
  }

  if (name === 'inspect_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '0');
    const element = await inspectElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: 'text', text: JSON.stringify(element, null, 2) }],
    };
  }

  if (name === 'patch_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '0');
    const text = typeof args?.text === 'string' ? args.text : undefined;
    const styles = (args?.styles as Record<string, StyleValue> | undefined) ?? undefined;

    const result = await patchElement(workspaceRoot, {
      file,
      astPath,
      text,
      styles,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'reorder_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '0');
    const direction =
      args?.direction === 'up' || args?.direction === 'down' ? args.direction : undefined;
    const targetAstPath =
      typeof args?.targetAstPath === 'string' ? args.targetAstPath : undefined;
    const placement =
      args?.placement === 'before' || args?.placement === 'after' ? args.placement : undefined;

    const result = await reorderElement(workspaceRoot, {
      file,
      astPath,
      direction,
      targetAstPath,
      placement,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'insert_screen_element') {
    const file = String(args?.file ?? '');
    const preset = String(args?.preset ?? 'button') as InsertElementPreset;
    const astPath = typeof args?.astPath === 'string' ? args.astPath : undefined;
    const placement =
      args?.placement === 'inside' || args?.placement === 'after' || args?.placement === 'before'
        ? args.placement
        : undefined;
    const label = typeof args?.label === 'string' ? args.label : undefined;
    const navigateTo = typeof args?.navigateTo === 'string' ? args.navigateTo : undefined;

    const result = await insertElement(workspaceRoot, {
      file,
      astPath,
      placement,
      preset,
      label,
      navigateTo,
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'duplicate_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '1');
    const result = await duplicateElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  if (name === 'delete_screen_element') {
    const file = String(args?.file ?? '');
    const astPath = String(args?.astPath ?? '1');
    const result = await deleteElement(workspaceRoot, { file, astPath });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

export async function handleMcpJsonRpcRequest(
  request: JsonRpcRequest,
  customWorkspaceRoot?: string
): Promise<JsonRpcResponse | null> {
  if (request.id === undefined) {
    // Notification (e.g. notifications/initialized)
    return null;
  }

  const workspaceRoot =
    customWorkspaceRoot ||
    process.env.ANTIGRAVITY_TARGET_PROJECT ||
    process.env.ANTIGRAVITY_WORKSPACE_ROOT ||
    DEFAULT_WORKSPACE_ROOT;

  const method = request.method ?? '';

  try {
    if (method === 'initialize') {
      const requestedProtocol =
        typeof request.params?.protocolVersion === 'string'
          ? request.params.protocolVersion
          : '2024-11-05';
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: requestedProtocol,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'zelune',
            version: '1.6.1',
          },
        },
      };
    }

    if (method === 'ping') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {},
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: MCP_TOOLS,
        },
      };
    }

    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          resources: [],
        },
      };
    }

    if (method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          prompts: [],
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = String(request.params?.name ?? '');
      const toolArgs =
        (request.params?.arguments as Record<string, unknown> | undefined) ?? undefined;
      const toolResult = await executeMcpTool(workspaceRoot, toolName, toolArgs);
      return {
        jsonrpc: '2.0',
        id: request.id,
        result: toolResult,
      };
    }

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message,
      },
    };
  }
}

export function startMcpServer(customWorkspaceRoot?: string): void {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      const parseErr: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(`${JSON.stringify(parseErr)}\n`);
      return;
    }

    const response = await handleMcpJsonRpcRequest(parsed, customWorkspaceRoot);
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  (() => {
    try {
      return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
    } catch {
      return false;
    }
  })();

if (isDirectExecution) {
  startMcpServer();
}
