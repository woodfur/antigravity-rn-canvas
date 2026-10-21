# Changelog

All notable changes to the **Zelune — React Native Visual Canvas & MCP** project are documented in this file.

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
