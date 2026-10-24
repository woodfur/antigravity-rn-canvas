import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  discoverScreens,
  getActiveProjectRoot,
  inspectElement,
  patchElement,
  reorderElement,
  insertElement,
  duplicateElement,
  deleteElement,
  undoLastPatch,
  redoLastPatch,
  getHistoryStatus,
  type PatchPayload,
  type ReorderPayload,
  type InsertElementPayload,
  type DuplicateElementPayload,
  type DeleteElementPayload,
} from './astEngine';

const MAX_BODY_BYTES = 1_000_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const trimmed = hostHeader.trim().toLowerCase();
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) return false;
    const ipv6Host = trimmed.slice(0, closeIdx + 1);
    return LOOPBACK_HOSTS.has(ipv6Host);
  }
  const hostname = trimmed.split(':')[0];
  return LOOPBACK_HOSTS.has(hostname);
}

export function verifyApiRequestSecurity(req: {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}): { allowed: boolean; reason?: string } {
  const host = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  if (!isLoopbackHostHeader(host)) {
    return {
      allowed: false,
      reason: 'Forbidden Host header: Local API only accepts loopback connections (127.0.0.1, localhost, [::1])',
    };
  }

  const secFetchSite =
    typeof req.headers['sec-fetch-site'] === 'string'
      ? req.headers['sec-fetch-site'].toLowerCase()
      : undefined;
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return {
      allowed: false,
      reason: `Forbidden cross-site request (Sec-Fetch-Site: ${secFetchSite})`,
    };
  }

  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (origin) {
    try {
      const parsedOrigin = new URL(origin);
      if (!LOOPBACK_HOSTS.has(parsedOrigin.hostname.toLowerCase())) {
        return {
          allowed: false,
          reason: `Forbidden cross-origin request from ${origin}`,
        };
      }
    } catch {
      return {
        allowed: false,
        reason: 'Malformed Origin header',
      };
    }
  }

  if (req.method === 'POST') {
    const contentType =
      typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type'].toLowerCase()
        : '';
    if (!contentType.startsWith('application/json')) {
      return {
        allowed: false,
        reason: 'POST requests to /api/* must specify Content-Type: application/json',
      };
    }
  }

  return { allowed: true };
}

export function sanitizeLayoutPayload(
  input: unknown
): Record<string, { x: number; y: number; width: number; height: number }> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid layout payload: expected an object map of screen coordinates');
  }

  const sanitized: Record<string, { x: number; y: number; width: number; height: number }> =
    Object.create(null);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 200) {
    throw new Error('Invalid layout payload: too many screen entries');
  }

  for (const [screenId, rawBox] of entries) {
    if (!screenId || FORBIDDEN_KEYS.has(screenId) || screenId.length > 120) {
      throw new Error(`Invalid screen key in layout payload: "${screenId}"`);
    }
    if (!rawBox || typeof rawBox !== 'object' || Array.isArray(rawBox)) {
      throw new Error(`Invalid layout coordinates for screen "${screenId}"`);
    }
    const box = rawBox as Record<string, unknown>;
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      Math.abs(x) > 100_000 ||
      Math.abs(y) > 100_000 ||
      width < 100 ||
      width > 5_000 ||
      height < 100 ||
      height > 5_000
    ) {
      throw new Error(`Out-of-bounds layout coordinates for screen "${screenId}"`);
    }

    sanitized[screenId] = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  return sanitized;
}

export async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = '';
    let byteCount = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer | string) => {
      if (aborted) return;
      const chunkBytes =
        typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf-8') : chunk.length;
      byteCount += chunkBytes;

      if (byteCount > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
        reject(new Error('Request payload too large'));
        return;
      }

      raw += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    });

    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (!aborted) {
        aborted = true;
        reject(err);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

export function viteCanvasApiMiddleware(workspaceRoot: string): Plugin {
  async function resolveConnectedProjectName(): Promise<string> {
    const activeRoot = getActiveProjectRoot(workspaceRoot);
    const dirName = path.basename(activeRoot);
    try {
      const appJsonRaw = await fs.readFile(path.join(activeRoot, 'app.json'), 'utf-8');
      const appJson = JSON.parse(appJsonRaw) as {
        expo?: { name?: string };
        name?: string;
      };
      if (appJson?.expo?.name) return appJson.expo.name;
      if (appJson?.name) return appJson.name;
    } catch {
      // No app.json present
    }
    try {
      const pkgRaw = await fs.readFile(path.join(activeRoot, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw) as { name?: string };
      if (pkg?.name && pkg.name.toLowerCase() !== 'zelune') {
        return pkg.name;
      }
    } catch {
      // Fallback to directory name
    }
    return dirName;
  }

  return {
    name: 'vite-canvas-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }

        const securityCheck = verifyApiRequestSecurity(req);
        if (!securityCheck.allowed) {
          return sendJson(res, 403, { ok: false, error: securityCheck.reason });
        }

        const activeRoot = getActiveProjectRoot(workspaceRoot);
        const layoutFilePath = path.resolve(activeRoot, '.canvas-layout.json');
        const urlObj = new URL(req.url, 'http://127.0.0.1');
        const pathname = urlObj.pathname;

        try {
          // GET /api/screens
          if (req.method === 'GET' && pathname === '/api/screens') {
            const [screens, projectName] = await Promise.all([
              discoverScreens(workspaceRoot),
              resolveConnectedProjectName(),
            ]);
            const history = getHistoryStatus();
            return sendJson(res, 200, { ok: true, projectName, screens, history });
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

          // POST /api/reorder
          if (req.method === 'POST' && pathname === '/api/reorder') {
            const body = await readJsonBody<ReorderPayload>(req);
            const result = await reorderElement(workspaceRoot, body);
            return sendJson(res, 200, {
              ok: true,
              element: result.element,
              history: {
                undoAvailable: result.undoAvailable,
                redoAvailable: result.redoAvailable,
              },
            });
          }

          // POST /api/insert
          if (req.method === 'POST' && pathname === '/api/insert') {
            const body = await readJsonBody<InsertElementPayload>(req);
            const result = await insertElement(workspaceRoot, body);
            return sendJson(res, 200, {
              ok: true,
              element: result.element,
              history: {
                undoAvailable: result.undoAvailable,
                redoAvailable: result.redoAvailable,
              },
            });
          }

          // POST /api/duplicate
          if (req.method === 'POST' && pathname === '/api/duplicate') {
            const body = await readJsonBody<DuplicateElementPayload>(req);
            const result = await duplicateElement(workspaceRoot, body);
            return sendJson(res, 200, {
              ok: true,
              element: result.element,
              history: {
                undoAvailable: result.undoAvailable,
                redoAvailable: result.redoAvailable,
              },
            });
          }

          // POST /api/delete
          if (req.method === 'POST' && pathname === '/api/delete') {
            const body = await readJsonBody<DeleteElementPayload>(req);
            const result = await deleteElement(workspaceRoot, body);
            return sendJson(res, 200, {
              ok: true,
              deletedAstPath: result.deletedAstPath,
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
              const validated = sanitizeLayoutPayload(JSON.parse(raw));
              return sendJson(res, 200, { ok: true, layout: validated });
            } catch {
              return sendJson(res, 200, { ok: true, layout: null });
            }
          }

          // POST /api/layout
          if (req.method === 'POST' && pathname === '/api/layout') {
            const body = await readJsonBody<Record<string, unknown>>(req);
            const validated = sanitizeLayoutPayload(body);
            await fs.writeFile(layoutFilePath, JSON.stringify(validated, null, 2), 'utf-8');
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
