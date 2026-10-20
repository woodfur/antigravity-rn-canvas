# Changelog

All notable changes to the **Antigravity React Native Visual Canvas** project are documented in this file.

## [1.1.0] - 2026-10-20

### Added
- **Universal CLI Entrypoint (`bin/cli.mjs`)**: Added `npx antigravity-rn-canvas` CLI binary supporting `--project /path/to/app`, `--port`, and `--mcp` flags, plus automatic screen discovery across `src/screens/`, `screens/`, and Expo Router `app/` directories.
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
