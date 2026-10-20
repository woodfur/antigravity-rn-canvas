import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  discoverScreens,
  inspectElement,
  patchElement,
  undoLastPatch,
  redoLastPatch,
  getHistoryStatus,
  type PatchPayload,
} from './astEngine';

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString();
      if (raw.length > 1_000_000) {
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function viteCanvasApiMiddleware(workspaceRoot: string): Plugin {
  const layoutFilePath = path.resolve(workspaceRoot, '.canvas-layout.json');

  return {
    name: 'vite-canvas-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }

        const urlObj = new URL(req.url, 'http://127.0.0.1');
        const pathname = urlObj.pathname;

        try {
          // GET /api/screens
          if (req.method === 'GET' && pathname === '/api/screens') {
            const screens = await discoverScreens(workspaceRoot);
            const history = getHistoryStatus();
            return sendJson(res, 200, { ok: true, screens, history });
          }

          // GET /api/inspect?file=...&astPath=...&line=...
          if (req.method === 'GET' && pathname === '/api/inspect') {
            const file = urlObj.searchParams.get('file') ?? '';
            const astPath = urlObj.searchParams.get('astPath') ?? '';
            const lineParam = urlObj.searchParams.get('line');
            const line = lineParam ? Number.parseInt(lineParam, 10) : undefined;

            const element = await inspectElement(workspaceRoot, { file, astPath, line });
            const history = getHistoryStatus();
            return sendJson(res, 200, { ok: true, element, history });
          }

          // POST /api/patch
          if (req.method === 'POST' && pathname === '/api/patch') {
            const body = await readJsonBody<PatchPayload>(req);
            const result = await patchElement(workspaceRoot, body);
            return sendJson(res, 200, {
              ok: true,
              element: result.element,
              history: {
                undoAvailable: result.undoAvailable,
                redoAvailable: result.redoAvailable,
              },
            });
          }

          // POST /api/undo
          if (req.method === 'POST' && pathname === '/api/undo') {
            const result = await undoLastPatch(workspaceRoot);
            return sendJson(res, 200, { ok: true, ...result });
          }

          // POST /api/redo
          if (req.method === 'POST' && pathname === '/api/redo') {
            const result = await redoLastPatch(workspaceRoot);
            return sendJson(res, 200, { ok: true, ...result });
          }

          // GET /api/layout
          if (req.method === 'GET' && pathname === '/api/layout') {
            try {
              const raw = await fs.readFile(layoutFilePath, 'utf-8');
              return sendJson(res, 200, { ok: true, layout: JSON.parse(raw) });
            } catch {
              return sendJson(res, 200, { ok: true, layout: null });
            }
          }

          // POST /api/layout
          if (req.method === 'POST' && pathname === '/api/layout') {
            const body = await readJsonBody<Record<string, unknown>>(req);
            await fs.writeFile(layoutFilePath, JSON.stringify(body, null, 2), 'utf-8');
            return sendJson(res, 200, { ok: true });
          }

          return sendJson(res, 404, { ok: false, error: `Unknown API route: ${pathname}` });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return sendJson(res, 400, { ok: false, error: message });
        }
      });
    },
  };
}
