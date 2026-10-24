#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = path.resolve(__dirname, '..');

const SCREEN_DIR_CANDIDATES = ['src/screens', 'screens', 'app', 'src/app'];
const IGNORED_SCAN_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.expo',
  '.turbo',
  'ios',
  'android',
  'vendor',
  'coverage',
  '.agents',
  '.gemini',
]);

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

function countScreenFilesInDirectory(screensDir, maxDepth = 4) {
  let count = 0;
  function walk(curr, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(curr, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '__tests__' ||
          entry.name === 'components'
        ) {
          continue;
        }
        walk(path.join(curr, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const f = entry.name;
        if (f.startsWith('_') || f.startsWith('+')) continue;
        if (f === 'index.ts' || f === 'index.js') continue;
        if (f.includes('.test.') || f.includes('.spec.') || f.endsWith('.d.ts')) continue;
        if (f.endsWith('.tsx') || f.endsWith('.jsx')) {
          count++;
        }
      }
    }
  }
  walk(screensDir, 0);
  return count;
}

function hasDirectScreens(dirPath) {
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(dirPath, rel);
    try {
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        const count = countScreenFilesInDirectory(full);
        if (count > 0) {
          return { found: true, relDir: rel, count };
        }
      }
    } catch {
      // Ignore
    }
  }
  return { found: false, relDir: null, count: 0 };
}

function scoreMobileCandidate(dirPath, screenCount) {
  let score = screenCount;
  const folderName = path.basename(dirPath).toLowerCase();
  if (/mobile|native|expo|app|client/.test(folderName)) {
    score += 10;
  }
  if (fs.existsSync(path.join(dirPath, 'app.json')) || fs.existsSync(path.join(dirPath, 'eas.json'))) {
    score += 25;
  }
  try {
    const pkgPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgRaw = fs.readFileSync(pkgPath, 'utf8');
      if (pkgRaw.includes('"react-native"') || pkgRaw.includes('"expo"')) {
        score += 20;
      }
    }
  } catch {
    // Ignore
  }
  return score;
}

export function findMobileAppRoot(rawRoot) {
  const normalizedRoot = path.resolve(rawRoot);
  if (!fs.existsSync(normalizedRoot)) {
    return normalizedRoot;
  }

  const direct = hasDirectScreens(normalizedRoot);
  if (direct.found) {
    return normalizedRoot;
  }

  let bestCandidate = null;
  let bestScore = -1;

  function scanSubdirs(parentDir, depth) {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(parentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (IGNORED_SCAN_DIRS.has(entry.name)) continue;

      const subPath = path.join(parentDir, entry.name);
      const check = hasDirectScreens(subPath);
      if (check.found) {
        const score = scoreMobileCandidate(subPath, check.count);
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

function detectScreensDirectory(targetProject) {
  const mobileRoot = findMobileAppRoot(targetProject);
  // First check directories with .tsx/.jsx screen files
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(mobileRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory() && countScreenFilesInDirectory(full) > 0) {
      const relFromTarget = path.relative(targetProject, full).replace(/\\/g, '/');
      return relFromTarget || rel;
    }
  }
  // Fallback to existing empty candidate directory (e.g. newly initialized project)
  for (const rel of SCREEN_DIR_CANDIDATES) {
    const full = path.join(mobileRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      const relFromTarget = path.relative(targetProject, full).replace(/\\/g, '/');
      return relFromTarget || rel;
    }
  }
  return null;
}

function addCanvasScriptToPackageJson(dirPath) {
  const pkgJsonPath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    if (pkg.name !== 'zelune') {
      let modified = false;
      if (!pkg.scripts.zelune || String(pkg.scripts.zelune).includes('npx')) {
        pkg.scripts.zelune = 'zelune';
        modified = true;
      }
      if (!pkg.scripts.canvas || String(pkg.scripts.canvas).includes('npx')) {
        pkg.scripts.canvas = 'zelune';
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        return true;
      }
    }
  } catch {
    // Ignore malformed package.json
  }
  return false;
}

export function initProject(targetProject, packageRoot = defaultPackageRoot) {
  const resolvedTarget = path.resolve(targetProject);
  const mobileRoot = findMobileAppRoot(resolvedTarget);
  const screensDir = detectScreensDirectory(resolvedTarget);

  // 1. Update package.json with "canvas": "zelune" script in target root (and nested mobile root if different)
  let updatedPackageJson = addCanvasScriptToPackageJson(resolvedTarget);
  if (mobileRoot !== resolvedTarget) {
    const updatedNested = addCanvasScriptToPackageJson(mobileRoot);
    updatedPackageJson = updatedPackageJson || updatedNested;
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
    args: ['-y', 'zelune', '--mcp', '--project', mobileRoot],
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
    mobileRoot,
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
    if (result.mobileRoot !== result.targetProject) {
      console.log(`   • Detected nested mobile app: ${result.mobileRoot}`);
    }
    console.log(`   • Screens directory: ${result.screensDir}`);
    if (result.updatedPackageJson) {
      console.log(`   • Added "zelune": "zelune" script to package.json`);
    }
    console.log(`   • Configured MCP server in mcp_config.json`);
    console.log(`   • Installed AI skill in .agents/skills/zelune/SKILL.md`);
    if (result.createdDesignMd || result.createdProductMd) {
      console.log(`   • Created starter DESIGN.md & PRODUCT.md governance docs`);
    }
    console.log(`\n👉 Run "zelune" (or "npm run zelune") to open your screens in the visual canvas!\n`);
    process.exit(0);
  }

  const resolvedMobileRoot = findMobileAppRoot(targetProject);
  process.env.ANTIGRAVITY_WORKSPACE_ROOT = targetProject;
  process.env.ANTIGRAVITY_TARGET_PROJECT = resolvedMobileRoot;

  if (isMcpMode) {
    const mcpBundleUrl = pathToFileURL(path.join(defaultPackageRoot, 'mcp/server.mjs')).href;
    const { startMcpServer } = await import(mcpBundleUrl);
    startMcpServer(resolvedMobileRoot);
    return;
  }

  const portFlagIdx = args.indexOf('--port');
  let portNumber;
  if (portFlagIdx !== -1 && args[portFlagIdx + 1]) {
    const parsedPort = Number.parseInt(String(args[portFlagIdx + 1]), 10);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      console.error(
        `Error: Invalid --port value "${args[portFlagIdx + 1]}". Must be an integer between 1 and 65535.`
      );
      process.exit(1);
    }
    portNumber = parsedPort;
  } else {
    portNumber = await findAvailablePort(5173);
  }

  const shouldOpenBrowser = !args.includes('--no-open');

  console.log(`\n🚀 Zelune — React Native Visual Canvas & MCP`);
  console.log(`📂 Workspace Root: ${targetProject}`);
  if (resolvedMobileRoot !== targetProject) {
    console.log(`📱 Mobile App Dir: ${resolvedMobileRoot}`);
  }
  console.log(`🌐 Studio Port:    127.0.0.1:${portNumber}\n`);

  const { createServer } = await import('vite');
  const server = await createServer({
    root: defaultPackageRoot,
    configFile: path.join(defaultPackageRoot, 'vite.config.ts'),
    server: {
      host: '127.0.0.1',
      port: portNumber,
      open: shouldOpenBrowser,
    },
  });
  await server.listen();
  server.printUrls();
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;

if (isDirectExecution) {
  runCli();
}
