---
name: zelune
description: Launch, inspect, and surgically patch React Native / Expo screens on the Zelune Figma-style multi-screen visual canvas. Enforces pbakaus/impeccable anti-slop rules, emilkowalski/skills motion physics, and leonxlnx/taste-skill parametric dials via PRODUCT.md and DESIGN.md.
---

# Zelune — React Native Visual Canvas & Craft Governance (`zelune`)

Use this skill when working with React Native or Expo mobile applications in Google Antigravity to provide a live multi-screen Figma-style visual canvas synchronized with `.tsx` source files via the **Zelune** MCP server.

## 1. Mandatory Pre-Flight Context (`pbakaus/impeccable`)
Before generating or patching any UI component, read:
- **`PRODUCT.md`** — Durable product truth, target audience, and dual-surface architecture.
- **`DESIGN.md`** — Governed color tokens, typography hierarchy, motion curves, and anti-slop guardrails.

## 2. Parametric Taste Dials (`leonxlnx/taste-skill`)
Configure your structural and visual choices according to the surface:
- **Studio Chrome (`src/canvas/`)**: `Design Variance: 2/10`, `Motion Intensity: 6/10`, `Visual Density: 8/10` (Cockpit precision, `1px` hairlines, `tabular-nums`, switchable `compact`/`spacious` density).
- **Mobile Artboards (`src/screens/`)**: `Design Variance: 7/10`, `Motion Intensity: 7/10`, `Visual Density: 4/10` (Editorial hardware hierarchy, technical spec monograms, generous negative space).

## 3. Motion & Touch Ergonomics (`emilkowalski/skills`)
- **Easing Curves**: Never use `ease-in` for entering elements. Use `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` (`120ms–160ms`) for micro-interactions and `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` (`380ms`) for camera focus transitions.
- **Tactile Feedback**: Apply `scale: 0.97` on `:active` (with base `scale: 1` to preserve stacking context) for web studio controls, and `activeOpacity={0.78}` with ≥44pt vertical targets on React Native `<TouchableOpacity>` elements.

## 4. Available Zelune MCP Tools (`zelune`)
1. **`list_canvas_screens`** — Lists all discovered React Native screens (`src/screens/`, `screens/`, or Expo Router `app/`), their JSX element counts, and outgoing navigation flow edges.
2. **`inspect_screen_element`** — Given `{ file, astPath }`, returns the exact JSX element's tag name, line/column coordinates, static text copy, resolved `StyleSheet.create` or inline style properties, and JSX snippet.
3. **`patch_screen_element`** — Surgically patches `{ file, astPath, text, styles }` directly in the `.tsx` source file while preserving comments, formatting, and dynamic expressions.

## 5. Launching the Zelune Browser Canvas
```bash
npx zelune --project /path/to/react-native-app
```
Then open `http://127.0.0.1:5173`.
