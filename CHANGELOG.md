# Changelog

All notable changes to the **Zelune — React Native Visual Canvas & MCP** project are documented in this file.

## [1.5.1] - 2026-10-21

### Fixed
- **Nested Mobile Project / Monorepo Auto-Discovery (`src/server/astEngine.ts`, `bin/cli.mjs`, `vite.config.ts`)**: Added `findMobileAppRoot` so running `zelune` or `zelune init` in a top-level parent or monorepo directory automatically scans up to 2 levels deep (`mobile/`, `apps/mobile/`, etc.) to locate the React Native / Expo app directory (`app.json`, `package.json`, and `.tsx`/`.jsx` screens).
- **Local `npm install zelune` (`node_modules/zelune`) Execution & Dependency Resolution (`vite.config.ts`, `bin/cli.mjs`)**: Configured `esbuild: { include: /\.(tsx|ts|jsx)$/, exclude: [] }` so Vite transpiles Zelune's studio `.tsx` files even when installed inside `node_modules/zelune`, resolved `react`, `react-dom`, `react-native-web`, and `lucide-react` via `createRequire(import.meta.url)` so external mobile screens do not need `react-native-web` installed locally, and resolved `vite/bin/vite.js` directly in `bin/cli.mjs`.

## [1.5.0] - 2026-10-21

### Added
- **On-Canvas Direct Manipulation Suite (`src/canvas/ScreenArtboard.tsx`, `src/canvas/CanvasApp.tsx`, `src/server/astEngine.ts`, `src/server/apiMiddleware.ts`, `mcp/server.ts`)**:
  - **8-Point Resize Handles**: Added corner and edge resize handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) on selected artboard elements with 60fps direct DOM preview, live `W × H` HUD badge, automatic `'100%'` responsive width snapping at parent edges, and surgical write-back to `StyleSheet.create`.
  - **Inner Corner `borderRadius` Handles**: Added 4 inset circular corner radius handles on selected elements to interactively round corners on the artboard.
  - **Figma Auto-Layout Hybrid Move & Reorder (`reorderElement` / `POST /api/reorder` / `reorder_screen_element`)**: Added drag-and-drop Flexbox sibling reordering with a glowing insertion line indicator, 1-click `↑`/`↓` reorder buttons on the selection pill, a 1-click **Pin/Float (`position: 'absolute'`)** toggle (plus `Option/Alt + Drag` freeform X/Y dragging with artboard center snap guides and `Shift + Drag` margin nudging), and keyboard arrow key (`↑ ↓ ← →` / `Shift + Arrow`) nudging.
  - **Double-Click Inline `<Text>` Editing**: Added direct on-artboard inline text editing when double-clicking any editable `<Text>` node (or clicking the `Type` icon on the selection toolbar).

## [1.4.1] - 2026-10-21

### Fixed
- **JSX / TypeScript Code Injection Prevention (`src/server/astEngine.ts`)**: Added `createSafeJsxTextChild` in `patchElement` so `<Text>` copy updates containing JSX control characters (`{`, `}`, `<`, `>`), newlines, or leading/trailing whitespace are wrapped as `t.jsxExpressionContainer(t.stringLiteral(payload.text))` rather than raw `t.jsxText()`, preventing arbitrary JSX expression or tag injection into `.tsx`/`.jsx` source files while maintaining lossless round-tripping in `inspectJsxTextChildren`.
- **Local API CSRF & DNS Rebinding Protection (`src/server/apiMiddleware.ts`, `src/canvas/CanvasApp.tsx`, `vite.config.ts`)**: Added `verifyApiRequestSecurity` and `isLoopbackHostHeader` to block non-loopback `Host` headers (`127.0.0.1`, `localhost`, `[::1]`), reject cross-site `Sec-Fetch-Site` and non-loopback `Origin` headers, require `Content-Type: application/json` on all `POST /api/*` routes, and set `server.cors: false` and `server.allowedHosts` in `vite.config.ts`.
- **Canonical Realpath & Symlink Traversal Guard (`src/server/astEngine.ts`)**: Hardened `resolveSafeScreenPath` using `fs.realpathSync` and `fs.lstatSync` to block symbolic links inside `src/screens/`, `screens/`, `app/`, and `src/app/` from escaping outside allowed screen directories, and added prototype-pollution/type guards (`__proto__`, `constructor`, `prototype`, `NaN`, `Infinity`) in `upsertObjectProperty`.
- **Bounded Request Body Stream & Layout Schema Validation (`src/server/apiMiddleware.ts`)**: Updated `readJsonBody` to track byte length and immediately call `req.destroy()` when payloads exceed `1,000,000` bytes (preventing stream heap exhaustion), and added `sanitizeLayoutPayload` to validate `.canvas-layout.json` screen coordinate schemas.
- **DOM Selector Escaping, `tsconfig.json` Alias Confinement & CLI Port Validation (`src/canvas/ScreenArtboard.tsx`, `vite.config.ts`, `bin/cli.mjs`)**: Added `CSS.escape` when querying `data-agy-ast-path` in `ScreenArtboard.tsx`, replaced the naive comment regex in `vite.config.ts` with a string-aware JSONC comment stripper while confining `tsconfig.json` aliases to the project root and protecting core studio packages, and added integer range validation (`1`–`65535`) for `--port` in `bin/cli.mjs`.

## [1.4.0] - 2026-10-21

### Added
- **One-Command Project Installer (`zelune init` in `bin/cli.mjs`)**: Running `zelune init` inside any React Native or Expo repository automatically detects its screens directory (`src/screens/`, `screens/`, `app/`, `src/app/`), adds `"canvas": "zelune"` to `package.json`, configures the `zelune` MCP server in `mcp_config.json`, installs the AI agent skill to `.agents/skills/zelune/SKILL.md`, creates starter `DESIGN.md` and `PRODUCT.md` governance docs if missing, and adds `.canvas-layout.json` to `.gitignore`.
- **Smart Zero-Flag CLI Launch (`bin/cli.mjs`)**: Running `zelune` with no flags automatically probes both IPv4 (`127.0.0.1`) and IPv6 (`::1`) interfaces starting at port `5173` to select a conflict-free port and opens the browser automatically via `--open` (disable with `--no-open`).
- **Public npm Registry Metadata (`package.json`)**: Added `license`, `repository`, `homepage`, and `bugs` fields for publishing `zelune` to the public npm registry.

## [1.3.0] - 2026-10-21

### Added
- **Universal Vite Virtual Screen Loader (`plugins/viteVirtualScreensPlugin.ts`, `src/screens/index.ts`, `vite.config.ts`)**: Replaced static screen imports with `virtual:zelune-screens` so running `zelune --project /path/to/app` dynamically discovers and mounts `.tsx` and `.jsx` screens from any React Native or Expo project (`src/screens/`, `screens/`, `app/`, `src/app/`, including nested route folders like `app/(tabs)/index.tsx`).
- **Expo Router, React Navigation & Safe Area Browser Shims (`src/runtime/MockNavigationContext.tsx`, `vite.config.ts`)**: Added built-in web shims for `@react-navigation/native`, `expo-router` (`useRouter`, `useLocalSearchParams`, `Link`, `Stack`, `Tabs`), `react-native-safe-area-context` (`SafeAreaView`, `useSafeAreaInsets`), `expo-status-bar`, `lucide-react-native`, and automatic `tsconfig.json` `paths` alias (`@/`) resolution for external projects.

## [1.2.1] - 2026-10-21

### Added
- **Collapsible Studio Side Panels (`src/canvas/CanvasApp.tsx`, `src/canvas/InspectorPanel.tsx`, `src/styles.css`)**: Added collapsible left (Screens Navigator) and right (AST Visual Inspector) sidebars with top-bar toggles, inline panel close buttons, floating canvas restore pills when collapsed, `[` and `]` keyboard shortcuts, auto-expand on element selection, and `220ms` `--ease-out-expo` width choreography.
- **Minimal Studio Header Identity & Icon-First Hover-Reveal Toolbar (`src/canvas/CanvasApp.tsx`, `src/styles.css`, `src/server/apiMiddleware.ts`, `vite.config.ts`)**: Simplified the top-left studio brand header to display **Zelune** and the connected project name (`projectName`), set studio visual density permanently to `5/10` (`spacious`), and converted toolbar buttons (`Inspect & Edit`, `Interact & Navigate`, `Flow Graph`, `Fit`, `Grid`) into compact icon buttons that smoothly expand to reveal their text labels on hover/focus using `interpolate-size: allow-keywords` and `calc-size(max-content, size)`.

### Fixed
- **Browser Whole-Page Trackpad Pinch-Zoom Leak (`src/canvas/CanvasApp.tsx`, `src/styles.css`)**: Replaced React's passive `onWheel` handler with non-passive (`{ passive: false }`) native `wheel` and WebKit `gesturestart`/`gesturechange`/`gestureend` listeners plus `touch-action: none` and `overscroll-behavior: none`, preventing native browser page zoom anywhere in the studio and routing two-finger trackpad pinches into cursor-centered focal canvas zooming.

## [1.2.0] - 2026-10-20

### Added
- **Design Craft & Product Truth System (`PRODUCT.md`, `DESIGN.md`)**: Established `pbakaus/impeccable` product truth and YAML-governed design tokens, `leonxlnx/taste-skill` dual-surface parametric dials (`Design Variance`, `Motion Intensity`, `Visual Density`), and `emilkowalski/skills` motion and touch ergonomics contracts.
- **Interactive Taste Density Switcher (`src/canvas/CanvasApp.tsx`, `src/styles.css`)**: Added a live `Density 8/10 (Cockpit)` vs. `Density 5/10 (Comfort)` toggle using CSS `data-density` + `@container style(--density: ...)` reactive tokens.
- **Physics-Inspired Camera Transitions & Micro-Interactions (`src/canvas/CanvasApp.tsx`, `src/canvas/ScreenArtboard.tsx`, `src/styles.css`)**: Added `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` camera interpolation for screen focus/fit actions (with a `0ms` direct-manipulation override during pointer drag/wheel zoom), `scale: 0.97` tactile press feedback, `<dialog>` entry choreography, and `tabular-nums` alignment across all coordinate and zoom readouts.

### Changed
- **Anti-Slop Visual Overhaul (`index.html`, `src/canvas/*`, `src/screens/*`)**: Replaced generic `Inter` typography with `Plus Jakarta Sans` + `JetBrains Mono`, removed cliché purple-to-cyan/violet button gradients in favor of tinted obsidian surfaces (`#08090C` / `#0D0F14` / `#13161E`) and `1px` hairlines, and replaced emoji card placeholders (`🎧`, `⌨️`) across the React Native reference screens with industrial hardware monograms (`CH-01`, `KS-75`) and `activeOpacity={0.78}` mobile touch ergonomics.

## [1.1.1] - 2026-10-20

### Changed
- **Zelune MCP & Package Branding (`mcp/server.ts`, `mcp_config.json`, `plugin.json`, `package.json`, `src/canvas/`)**: Renamed the MCP server, CLI binary (`npx zelune`), plugin manifest, and canvas studio header to **Zelune** (`zelune`).

## [1.1.0] - 2026-10-20

### Added
- **Universal CLI Entrypoint (`bin/cli.mjs`)**: Added CLI binary supporting `--project /path/to/app`, `--port`, and `--mcp` flags, plus automatic screen discovery across `src/screens/`, `screens/`, and Expo Router `app/` directories.
- **Google Antigravity Plugin Bundle (`plugin.json`, `mcp_config.json`, `skills/rn-canvas/SKILL.md`, `rules/AGENTS.md`, `assets/logo.svg`)**: Packaged the workspace as a complete installable Antigravity Plugin and public npm package.

## [1.0.0] - 2026-10-20

### Added
- **Browser Infinite Canvas (`src/canvas/CanvasApp.tsx`, `src/canvas/ScreenArtboard.tsx`)**: Built a 60fps Figma-style pan-and-zoom visual canvas rendering all React Native screens side-by-side on clean rectangular `393 × 852` artboards without bulky hardware device bezels.
- **Compile-Time JSX Source & AST Path Injector (`plugins/viteRnSourceInject.ts`)**: Created a custom Babel/Vite transform that injects deterministic `dataSet` and `data-agy-*` source coordinates into React Native elements so `react-native-web` DOM nodes map directly back to `.tsx` AST nodes.
- **Two-Tier Bi-Directional AST Engine (`src/server/astEngine.ts`, `src/server/apiMiddleware.ts`)**:
  - **Tier 1 (Surgical AST Patching)**: Live inspection and mutation of `StyleSheet.create` rules, inline styles, and static `<Text>` copy with per-file write mutex locking and a 50-step Undo/Redo history stack (`Cmd+Z` / `Cmd+Shift+Z`).
  - **Tier 2 (Google Antigravity Agent Bridge & MCP Server)**: Added an in-canvas "Ask Antigravity to Refactor" modal (`<dialog closedby="any">`) and a standalone MCP server (`mcp/server.ts`) exposing `list_canvas_screens`, `inspect_screen_element`, and `patch_screen_element`.
- **Automatic Navigation Flow Graph (`src/canvas/FlowArrowsLayer.tsx`)**: Extracts `navigation.navigate(...)` and `router.push(...)` calls from screen ASTs and renders interactive cubic-bezier SVG flow connectors across the infinite canvas.
- **Multi-Screen React Native Starter Suite (`src/screens/`)**: Added `LoginScreen.tsx`, `HomeScreen.tsx`, `ProductDetailScreen.tsx`, `CheckoutScreen.tsx`, and `ProfileScreen.tsx` wrapped in `MockNavigationProvider` and `ScreenErrorBoundary`.
