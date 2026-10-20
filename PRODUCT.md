# PRODUCT.md — Zelune (`zelune`)

> Durable product truth anchored per the [`pbakaus/impeccable`](https://github.com/pbakaus/impeccable) context specification. All UI, motion, and agent-driven AST modifications must align with this document.

## 1. Product Purpose
**Zelune** is a **Figma-style multi-screen React Native visual canvas** and **bi-directional Babel AST synchronization MCP server** built for **Google Antigravity**. It eliminates the blind spot between mobile codebases (`.tsx`) and visual spatial architecture by rendering every screen side-by-side as pure `393 × 852` artboards with live navigation flow graphs and surgical AST write-back.

## 2. Target Audience
- **Design Engineers & Mobile Product Builders** working in React Native or Expo who demand Linear/Figma-grade precision tooling.
- **AI Coding Agents (Google Antigravity)** operating via the `zelune` MCP server (`list_canvas_screens`, `inspect_screen_element`, `patch_screen_element`) that need deterministic spatial and style context.

## 3. Operating Context & Dual-Surface Architecture
Zelune contains two distinct visual surfaces that must never be conflated:

1. **Surface A — Zelune Studio Chrome (`src/canvas/`)**
   - **Context**: Desktop browser IDE/Canvas companion (`1280px–2560px+` viewports), used alongside a code editor for hours at a time.
   - **Priority**: High information density, zero visual fatigue, instant spatial orientation, 1:1 pointer tracking during drag/zoom, and unambiguous AST source coordinates (`file:line:col`).
2. **Surface B — Chronos Acoustics Reference Mobile Suite (`src/screens/`)**
   - **Context**: `393 × 852` iOS/Android mobile artboards demonstrating multi-screen React Native inspection, live `StyleSheet.create` patching, and SVG navigation flow extraction.
   - **Priority**: Industrial-grade hardware commerce aesthetic (inspired by Teenage Engineering / Bang & Olufsen), 44pt+ mobile touch ergonomics, and editorial typographic hierarchy.

## 4. Core Constraints & Technical Invariants
- **No Hardware Bezels**: Screens render on clean rectangular `393 × 852` artboards with `1px` architectural frames—never inside skeuomorphic phone clay frames or fake notches.
- **Compile-Time AST Determinism**: Every React Native element maps back to its `.tsx` source node via `data-agy-ast-path`. Screen components must maintain a clean `StyleSheet.create` block at the bottom of the file.
- **Two-Tier Edit Safety**:
  - **Tier 1**: Surgical AST mutations for static `<Text>` copy and `StyleSheet.create` / inline style properties with per-file mutex locking and a 50-step Undo/Redo stack.
  - **Tier 2**: Native `<dialog closedby="any">` structural refactor bridge + stdio MCP server for complex stateful or multi-node changes.

## 5. Voice & Craft Tone
- **Studio Chrome**: Clinical, technical, understated, and exact. Labels use concise engineering terminology (`AST Node`, `L42:8`, `styles.heroBanner`, `393 × 852`) rather than marketing fluff.
- **Reference Mobile App**: Tactile, acoustic-engineering precision, confident editorial restraint.
