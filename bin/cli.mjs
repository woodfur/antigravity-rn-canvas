#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isMcpMode = args.includes('--mcp');

let targetProject = process.cwd();
const projectFlagIdx = args.indexOf('--project');
if (projectFlagIdx !== -1 && args[projectFlagIdx + 1]) {
  targetProject = path.resolve(args[projectFlagIdx + 1]);
}

let port = '5173';
const portFlagIdx = args.indexOf('--port');
if (portFlagIdx !== -1 && args[portFlagIdx + 1]) {
  port = String(args[portFlagIdx + 1]);
}

const env = {
  ...process.env,
  ANTIGRAVITY_TARGET_PROJECT: targetProject,
};

if (isMcpMode) {
  const mcpServerPath = path.join(packageRoot, 'mcp/server.ts');
  const child = spawn('npx', ['tsx', mcpServerPath], {
    cwd: packageRoot,
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  console.log(`\n🚀 Zelune — React Native Visual Canvas & MCP`);
  console.log(`📂 Target Project: ${targetProject}`);
  console.log(`🌐 Studio URL:     http://127.0.0.1:${port}\n`);

  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port], {
    cwd: packageRoot,
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
