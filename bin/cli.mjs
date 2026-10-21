#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(__dirname, '..');

function isHostPortFree(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      if (err && (err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT')) {
        resolve(true);
        return;
      }
      resolve(false);
    });
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function isPortFree(port) {
  const [ipv4Free, ipv6Free] = await Promise.all([
    isHostPortFree(port, '127.0.0.1'),
    isHostPortFree(port, '::1'),
  ]);
  return ipv4Free && ipv6Free;
}

export async function findAvailablePort(startPort = 5173, maxAttempts = 25) {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const candidate = startPort + offset;
    if (await isPortFree(candidate)) {
      return candidate;
    }
  }
  return startPort;
}

function detectScreensDirectory(targetProject) {
  const candidates = ['src/screens', 'screens', 'app', 'src/app'];
  for (const rel of candidates) {
    const full = path.join(targetProject, rel);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return rel;
    }
  }
  return null;
}

export function initProject(targetProject, packageRoot = defaultPackageRoot) {
  const resolvedTarget = path.resolve(targetProject);
  const screensDir = detectScreensDirectory(resolvedTarget);

  // 1. Update package.json with "canvas": "zelune" script if present
  const pkgJsonPath = path.join(resolvedTarget, 'package.json');
  let updatedPackageJson = false;
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      pkg.scripts = pkg.scripts || {};
      if (pkg.name !== 'zelune' && !pkg.scripts.canvas) {
        pkg.scripts.canvas = 'zelune';
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        updatedPackageJson = true;
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  // 2. Create or merge mcp_config.json with the zelune MCP server entry
  const mcpConfigPath = path.join(resolvedTarget, 'mcp_config.json');
  let mcpConfig = { mcpServers: {} };
  if (fs.existsSync(mcpConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        mcpConfig = parsed;
        mcpConfig.mcpServers = mcpConfig.mcpServers || {};
      }
    } catch {
      mcpConfig = { mcpServers: {} };
    }
  }
  mcpConfig.mcpServers.zelune = {
    command: 'npx',
    args: ['-y', 'zelune', '--mcp', '--project', resolvedTarget],
  };
  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');

  // 3. Install AI Agent Skill into .agents/skills/zelune/SKILL.md
  const sourceSkillPath = path.join(packageRoot, 'skills/rn-canvas/SKILL.md');
  const destSkillDir = path.join(resolvedTarget, '.agents/skills/zelune');
  const destSkillPath = path.join(destSkillDir, 'SKILL.md');
  if (fs.existsSync(sourceSkillPath)) {
    fs.mkdirSync(destSkillDir, { recursive: true });
    fs.copyFileSync(sourceSkillPath, destSkillPath);
  }

  // 4. Copy starter DESIGN.md & PRODUCT.md if not already present
  let createdDesignMd = false;
  const sourceDesignPath = path.join(packageRoot, 'DESIGN.md');
  const destDesignPath = path.join(resolvedTarget, 'DESIGN.md');
  if (fs.existsSync(sourceDesignPath) && !fs.existsSync(destDesignPath)) {
    fs.copyFileSync(sourceDesignPath, destDesignPath);
    createdDesignMd = true;
  }

  let createdProductMd = false;
  const sourceProductPath = path.join(packageRoot, 'PRODUCT.md');
  const destProductPath = path.join(resolvedTarget, 'PRODUCT.md');
  if (fs.existsSync(sourceProductPath) && !fs.existsSync(destProductPath)) {
    fs.copyFileSync(sourceProductPath, destProductPath);
    createdProductMd = true;
  }

  // 5. Ensure .canvas-layout.json is listed in .gitignore
  const gitignorePath = path.join(resolvedTarget, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const currentIgnore = fs.readFileSync(gitignorePath, 'utf8');
    if (!currentIgnore.split(/\r?\n/).includes('.canvas-layout.json')) {
      const prefix = currentIgnore.endsWith('\n') || currentIgnore.length === 0 ? '' : '\n';
      fs.writeFileSync(
        gitignorePath,
        `${currentIgnore}${prefix}.canvas-layout.json\n`,
        'utf8'
      );
    }
  } else {
    fs.writeFileSync(gitignorePath, '.canvas-layout.json\n', 'utf8');
  }

  return {
    targetProject: resolvedTarget,
    screensDir: screensDir ?? 'src/screens (or app/)',
    updatedPackageJson,
    mcpConfigPath,
    skillPath: destSkillPath,
    createdDesignMd,
    createdProductMd,
  };
}

async function runCli() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Zelune — React Native Visual Canvas & AST Sync MCP Server

Usage:
  zelune                       Launch visual canvas for current project (auto-selects free port & opens browser)
  zelune init                  One-command setup for the current React Native / Expo project
  zelune --project <dir>       Target a specific React Native / Expo project directory
  zelune --port <number>       Use a specific port (default: auto-detects from 5173)
  zelune --no-open             Do not automatically open the browser on launch
  zelune --mcp                 Start the Zelune stdio MCP server for Google Antigravity / Cursor / Claude Code
`);
    process.exit(0);
  }

  const isMcpMode = args.includes('--mcp');
  const isInitMode = args[0] === 'init' || args[0] === 'setup';

  let targetProject = process.cwd();
  const projectFlagIdx = args.indexOf('--project');
  if (projectFlagIdx !== -1 && args[projectFlagIdx + 1]) {
    targetProject = path.resolve(args[projectFlagIdx + 1]);
  }

  if (isInitMode) {
    const result = initProject(targetProject, defaultPackageRoot);
    console.log(`\n✨ Zelune initialized in ${result.targetProject}`);
    console.log(`   • Screens directory: ${result.screensDir}`);
    if (result.updatedPackageJson) {
      console.log(`   • Added "canvas": "zelune" script to package.json`);
    }
    console.log(`   • Configured MCP server in mcp_config.json`);
    console.log(`   • Installed AI skill in .agents/skills/zelune/SKILL.md`);
    if (result.createdDesignMd || result.createdProductMd) {
      console.log(`   • Created starter DESIGN.md & PRODUCT.md governance docs`);
    }
    console.log(`\n👉 Run "npm run canvas" (or "zelune") to open your screens in the visual canvas!\n`);
    process.exit(0);
  }

  const env = {
    ...process.env,
    ANTIGRAVITY_TARGET_PROJECT: targetProject,
  };

  if (isMcpMode) {
    const mcpServerPath = path.join(defaultPackageRoot, 'mcp/server.ts');
    const child = spawn('npx', ['tsx', mcpServerPath], {
      cwd: defaultPackageRoot,
      env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const portFlagIdx = args.indexOf('--port');
  let port;
  if (portFlagIdx !== -1 && args[portFlagIdx + 1]) {
    port = String(args[portFlagIdx + 1]);
  } else {
    const resolvedPort = await findAvailablePort(5173);
    port = String(resolvedPort);
  }

  const shouldOpenBrowser = !args.includes('--no-open');
  const viteArgs = ['vite', '--host', '127.0.0.1', '--port', port];
  if (shouldOpenBrowser) {
    viteArgs.push('--open');
  }

  console.log(`\n🚀 Zelune — React Native Visual Canvas & MCP`);
  console.log(`📂 Target Project: ${targetProject}`);
  console.log(`🌐 Studio URL:     http://127.0.0.1:${port}\n`);

  const child = spawn('npx', viteArgs, {
    cwd: defaultPackageRoot,
    env,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isDirectExecution) {
  runCli();
}
