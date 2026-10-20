---
name: rn-canvas
description: Launch, inspect, and surgically patch React Native / Expo screens on the Figma-style multi-screen visual canvas. Activate when the user wants to view all mobile screens side-by-side, inspect element AST styles/copy, or visualize navigation flows.
---

# React Native Visual Canvas (`rn-canvas`)

Use this skill when working with React Native or Expo mobile applications in Google Antigravity to provide a live multi-screen Figma-style visual canvas synchronized with `.tsx` source files.

## Available MCP Tools (`antigravity-rn-canvas-mcp`)

1. **`list_canvas_screens`**
   - Lists all discovered React Native screens (`src/screens/`, `screens/`, or Expo Router `app/`), their JSX element counts, and outgoing navigation flow edges (`navigation.navigate` / `router.push`).
2. **`inspect_screen_element`**
   - Given `{ file, astPath }`, returns the exact JSX element's tag name, line/column coordinates, static text copy, resolved `StyleSheet.create` or inline style properties, and JSX snippet.
3. **`patch_screen_element`**
   - Surgically patches `{ file, astPath, text, styles }` directly in the `.tsx` source file while preserving comments, formatting, and dynamic expressions.

## Launching the Browser Canvas

To open the interactive browser studio for the active project:
```bash
npx antigravity-rn-canvas --project /path/to/react-native-app
```
Then open `http://127.0.0.1:5173`.
