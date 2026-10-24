# Changelog

All notable changes to the **Zelune — React Native Visual Canvas & MCP** project are documented in this file.

## [1.5.6] - 2026-10-24

### Added
- **NativeWind / Tailwind CSS `className` Runtime Engine (`src/runtime/nativewindShim.ts`, `src/runtime/reactNativeShim.ts`, `src/runtime/MockNavigationContext.tsx`, `vite.config.ts`)**:
  - Automatically loads the target project's `tailwind.config.js` / `tailwind.config.ts` (`colors`, `fontSize`, `borderRadius`, `spacing`, `opacity`, `fontFamily`) in `vite.config.ts` and injects `window.__ZELUNE_TAILWIND_THEME__`.
  - Added `resolveTailwindClassNameToStyle` and `withNativeWind` wrapper across all React Native and Expo primitives (`View`, `Text`, `Pressable`, `TouchableOpacity`, `ScrollView`, `FlatList`, `KeyboardAvoidingView`, `TextInput`, `Image`, `SafeAreaView`, `LinearGradient`, `BlurView`, `createAnimatedComponent`) so screens and UI components styled with NativeWind `className="..."` (including M3 semantic tokens like `bg-surface-container-high`, `text-on-surface`, `text-headline-md`, `text-title-sm`, `bg-primary/10`, etc.) render with full CSS styles instead of unstyled stacks.

### Fixed
- **Pinned Mobile Artboard `Dimensions` (`src/runtime/reactNativeShim.ts`, `src/runtime/MockNavigationContext.tsx`)**: Overrode `Dimensions.get('window' | 'screen')` and `useWindowDimensions()` to return `{ width: 393, height: 852, scale: 3, fontScale: 1 }` instead of the desktop browser window's `1440×900` dimensions, and upgraded the `expo-image` `<Image>` shim to use CSS `object-fit` inside an `overflow: hidden` container so carousel cards and hero images (e.g., on `HomeScreen`) size to exact 393×852 mobile proportions.
- **Wide Zoom-Out Range (`MIN_ZOOM = 0.08`), Multi-Row Grid Layout & Zero-Re-Render Pinch Zoom (`src/canvas/CanvasApp.tsx`)**:
  - Lowered `MIN_ZOOM` from `25%` (`0.25`) to `8%` (`0.08`), updated `buildDefaultLayout` ("Grid" button) to arrange 6+ screens into a balanced multi-row grid, and enabled automatic fit-all on initial load so all screens can be viewed at once.
  - Updated `applyFocalZoom` to keep full floating-point precision during active trackpad pinch/Ctrl-wheel zoom (eliminating subpixel focal-point oscillation), mutate `worldContainerRef.current.style.transform` and `zoomLabelRef.current.textContent` directly on the DOM without triggering 120Hz React re-renders of `<ScreenArtboard />`, and removed `willChange: 'transform'` bitmap caching so zooming in and out is completely smooth and vibration-free.

## [1.5.5] - 2026-10-23

### Added
- **Zod, React Hook Form & Sizing Utility Shims (`src/runtime/MockNavigationContext.tsx`, `plugins/viteReactNativeFallbackPlugin.ts`)**: Added `createSafeChainableProxy()` / `SAFE_CHAINABLE_PROXY` (wrapping a callable function target in a recursive `Proxy` for unlimited method/property chains), full Zod schema shims (`z`, `string`, `number`, `boolean`, `object`, `array`, `union`, `literal`, `record`, `tuple`, `any`, `unknown`, `optional`, `nullable`, `coerce`, `zodResolver`, `yupResolver`), React Hook Form shims (`useForm`, `useFormContext`, `FormProvider`, `useWatch`, `useFieldArray`, `Controller` supporting `render={({ field, fieldState, formState }) => ...}`), and React Native responsive sizing/classname helpers (`scale`, `verticalScale`, `moderateScale`, `RFValue`, `RFPercentage`, `wp`, `hp`, `clsx`, `cn`, `twMerge`).
- **Universal Unmounted React Context Fallback (`src/runtime/MockNavigationContext.tsx`, `src/main.tsx`)**: Wrapped `React.createContext` and `React.useContext` (after `react-native-web` initializes its internal contexts) with `SAFE_CONTEXT_FALLBACK` (pre-populated with preview `user`, `profile`, `session`, `isAuthenticated: true`, `isLoading: false`, `colors`, `items: []`, `signIn`, `signOut`, `logout`, `refresh`, etc.) so screens rendered outside their root `app/_layout.tsx` providers never throw `useAuth must be used within an AuthProvider` (or `useTheme` / `useCart` / `useNotifications` equivalents).

### Fixed
- **Eliminated Canvas Panning Vibration / Jitter (`src/canvas/CanvasApp.tsx`, `src/canvas/ScreenArtboard.tsx`, `src/canvas/FlowArrowsLayer.tsx`)**:
  - Updated `handleCanvasWheel` and `handleCanvasPointerDown` in `CanvasApp.tsx` to mutate `worldContainerRef.current.style.transform` (`translate3d(...) scale(...)`) directly on the DOM node with device-pixel rounding (`snapToDevicePixel`) and debounce `setPan` state synchronization to 120ms after movement stops, eliminating 120Hz React re-renders of all artboards while panning.
  - Wrapped `ScreenArtboard` and `FlowArrowsLayer` in `React.memo`, scoped `selectedElement` and `inspectedElement` props to only the active screen, and suppressed `handlePointerMoveCapture` (`computeRelativeBox` / `setHoverBox`) while the canvas is moving or pointer buttons are pressed.
  - Stabilized `useFocusEffect`, `useSegments`, `useQuery`, `useInfiniteQuery`, `useMutation`, and `useQueryClient` in `MockNavigationContext.tsx` so screens with inline `useFocusEffect` or `useEffect` dependencies do not trigger continuous re-render loops.
- **Light-Themed Screen Root Background & Image Overflow (`src/canvas/ScreenArtboard.tsx`)**: Set `backgroundColor: '#FFFFFF'`, `color: '#0F172A'`, `overflowY: 'auto'`, `overflowX: 'hidden'`, `minWidth: 0`, and `minHeight: 0` on the inner `<ScreenComponent />` mount container so screens that rely on React Native's default white root window background render with proper contrast and horizontally overflowing images are clipped to the 393px device frame.

## [1.5.4] - 2026-10-23

### Added
- **Full React Native API Web Shim (`src/runtime/reactNativeShim.ts`)**: Added a dedicated `'react-native'` ESM wrapper that re-exports all of `react-native-web`, provides a `default` export (`import RN from 'react-native'`), and shims React Native APIs missing from `react-native-web@0.19.13` (`useAnimatedValue`, `PermissionsAndroid`, `ToastAndroid`, `ActionSheetIOS`, `InputAccessoryView`, `DrawerLayoutAndroid`, `TurboModuleRegistry`, `requireNativeComponent`, `codegenNativeComponent`, `PlatformColor`, `DynamicColorIOS`, `DevSettings`, `Systrace`, `Networking`, `Settings`).
- **Zustand, TanStack React Query & Supabase Client Shims (`src/runtime/MockNavigationContext.tsx`)**: Added built-in web shims for Zustand (`create` supporting both standard and curried TypeScript `create<T>()(...)` invocations, plus `useStore`), TanStack React Query (`useQuery`, `useInfiniteQuery`, `useMutation`, `useQueryClient`, `QueryClient`, `QueryClientProvider`), and Supabase (`createClient` with chainable `.from()`, `.auth`, `.storage`, `.channel()`, `.functions`).
- **Top-Level Studio Recovery Boundary (`src/main.tsx`)**: Wrapped `<CanvasApp />` in `StudioRootErrorBoundary` so `#root` can never unmount into a blank white screen.

### Fixed
- **External Project Blank Screen Root-Cause Fixes (`vite.config.ts`, `bin/cli.mjs`, `plugins/viteVirtualScreensPlugin.ts`, `plugins/viteReactNativeFallbackPlugin.ts`, `src/runtime/MockNavigationContext.tsx`)**:
  - **Vite Dependency Scanner Isolation (`vite.config.ts`, `plugins/viteVirtualScreensPlugin.ts`)**: Configured `optimizeDeps: { noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-native-web', 'lucide-react'] }` and emitted `/@fs/...` URLs with `/* @vite-ignore */` in dev mode so Vite's startup `esbuild` scanner never crawls external project `node_modules` (which contain Flow syntax, native modules, or duplicate React instances that previously crashed `optimizeDeps` before `src/main.tsx` could mount).
  - **AST-Based Named Import & Re-Export Extraction (`plugins/viteReactNativeFallbackPlugin.ts`)**: Replaced the semicolon-dependent regex in `extractNamedImportsFromImporter` with `@babel/parser` AST traversal (`ImportDeclaration` and `ExportNamedDeclaration`) so semicolon-free (`semi: false`) and multiline files never miss named exports, and switched query parsing in `load(id)` to `URLSearchParams` so Vite's `?import&exports=...` injection never drops synthesized exports.
  - **Callable Default Export Proxy (`src/runtime/MockNavigationContext.tsx`)**: Changed `defaultExportProxy` to wrap a callable React component function (`UniversalDefaultExportComponent`) so default-imported components (`import Ionicons from '@expo/vector-icons/Ionicons'`, `import Svg from 'react-native-svg'`, `import LottieView from 'lottie-react-native'`) render as valid React components without throwing `Element type is invalid: expected a string or class/function but got: object`.
  - **Missing Lucide Icon & Local File Fallbacks (`plugins/viteReactNativeFallbackPlugin.ts`)**: Added automatic fallback icon synthesis for any icon name imported from `lucide-react` or `lucide-react-native` not present in `lucide-react@0.469.0`, trailing-comma-safe `tsconfig.json` alias resolution across `targetProjectRoot` and `workspaceRoot`, and automatic virtual-stub fallback for missing/ungenerated local imports.
  - **Nested Monorepo Workspace & `npm run zelune` Script (`bin/cli.mjs`, `vite.config.ts`)**: Passed both `ANTIGRAVITY_WORKSPACE_ROOT` and `ANTIGRAVITY_TARGET_PROJECT` from `bin/cli.mjs`, enabled `server.fs.strict: false` with canonical `realpathSync` roots in `vite.config.ts`, and added `"zelune": "zelune"` alongside `"canvas": "zelune"` during `zelune init`.

## [1.5.3] - 2026-10-23

### Added
- **Studio Light Mode & Dark Mode Theme Toggle (`index.html`, `src/styles.css`, `src/canvas/CanvasApp.tsx`, `src/canvas/InspectorPanel.tsx`, `src/canvas/ScreenArtboard.tsx`, `src/canvas/FlowArrowsLayer.tsx`)**: Added a studio-wide Light/Dark color-scheme toggle (`Sun` / `Moon` button in the top-right toolbar) using `<meta name="color-scheme">`, `:root:has(> head > meta[name="color-scheme"][content="light"|"dark"])`, `light-dark()` tokens with `@supports` and `@media (prefers-color-scheme: dark)` fallbacks, high-contrast semantic badge tokens (`--studio-badge-indigo-*`, `--studio-badge-emerald-*`), zero-FOUC inline `<head>` script, and cross-tab `storage` event synchronization while isolating device artboard viewports so React Native screens render faithfully.
- **Universal Expo & React Native Ecosystem Web Shims (`src/runtime/MockNavigationContext.tsx`, `plugins/viteReactNativeFallbackPlugin.ts`)**: Added built-in web shims for `@expo/vector-icons`, `expo-linear-gradient`, `expo-blur`, `expo-image`, `react-native-svg`, `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`, `expo-constants`, `expo-font`, `expo-splash-screen`, `expo-secure-store`, `expo-clipboard`, `expo-linking`, `@react-native-async-storage/async-storage`, and `@shopify/flash-list`, plus a dynamic AST-aware fallback plugin (`viteReactNativeFallbackPlugin`) that synthesizes named export stubs for any additional native or unresolved bare packages imported by external screens.

### Fixed
- **External Project Blank Screen Fix via Dynamic Per-Screen Isolation & `process.env` / `require` Polyfill (`plugins/viteVirtualScreensPlugin.ts`, `vite.config.ts`, `src/server/astEngine.ts`)**: Replaced static top-level `import *` statements in `virtual:zelune-screens` with per-screen dynamic `import()` React wrappers (`createIsolatedScreenComponent`) so a broken import or top-level error in any individual screen renders a diagnostic card inside that screen's artboard rather than blanking out `#root`. Added automatic `EXPO_PUBLIC_*` `.env` loading, a safe `window.process.env` Proxy (so SDK initializers like `createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, ...)` never throw on load), and a `window.require` polyfill for React Native asset `require('./image.png')` calls.
- **Double-Click On-Canvas Inline `<Text>` Editing (`src/canvas/ScreenArtboard.tsx`)**: Fixed an async race condition where `fetch('/api/inspect')` resolving ~15ms after the first click of a double-click reset `isEditingInlineText` back to `false` and closed the inline `<textarea>`. Gated `isEditingInlineText` resets strictly on selection identity changes (`${screenId}:${astPath}`), added synchronous DOM text extraction (`resolveTextTargetForDoubleClick`) so double-clicking `<Text>` or a parent button/badge immediately opens the inline editor, and persisted the target's `file`/`astPath`/`line` in `inlineEditTargetRef` for reliable AST commits.

## [1.5.2] - 2026-10-21

### Changed
- **npm Package Documentation (`README.md`)**: Simplified installation and MCP configuration snippets on npm to use `npm install -g zelune` and `npx zelune` directly instead of the GitHub repository URL.

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
