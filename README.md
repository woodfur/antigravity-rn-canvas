# Zelune (`zelune`)

**Zelune** is a **Figma-style multi-screen visual canvas** and **bi-directional Babel AST sync MCP server** for React Native & Expo applications in **Google Antigravity**, Cursor, and Claude Code.

View all of your mobile screens side-by-side on clean `393 × 852` rectangular artboards in the browser, inspect any `<View>`, `<Text>`, or `<TouchableOpacity>` element, and resize, reorder, or edit copy and `StyleSheet.create` styles with instant write-back to your `.tsx` source code.

---

## Global Installation & Effortless Project Setup

### 1. Install Globally Once
```bash
npm install -g zelune
```

### 2. Initialize & Launch in Any React Native / Expo Project
Inside any React Native or Expo project folder (or a parent monorepo directory):

```bash
cd /path/to/your/react-native-app

# Optional one-time project setup (adds "npm run canvas", mcp_config.json, AI skill, DESIGN.md & PRODUCT.md):
zelune init

# Launch the visual canvas (auto-selects a free port and opens your browser automatically):
zelune
```

You can also run it without installing globally:
```bash
npx zelune init
npx zelune
```

---

## Google Antigravity Integration (Zelune MCP Server)

### 1. MCP Server Setup
Running `zelune init` automatically configures `mcp_config.json`, or you can add the **Zelune** MCP server manually:

```json
{
  "mcpServers": {
    "zelune": {
      "command": "npx",
      "args": ["-y", "zelune", "--mcp"]
    }
  }
}
```

### 2. Available Zelune MCP Tools
- `list_canvas_screens` — Lists all discovered screens (`src/screens/`, `screens/`, or Expo Router `app/`), element counts, and outgoing navigation flows.
- `inspect_screen_element` — Returns the resolved `StyleSheet.create` / inline styles, static text copy, and JSX snippet for any element by `file` and `astPath`.
- `patch_screen_element` — Surgically patches text copy or style rules in `.tsx` source files while preserving comments and formatting.
- `reorder_screen_element` — Surgically reorders a React Native JSX element among its Flexbox siblings in the `.tsx` AST.
