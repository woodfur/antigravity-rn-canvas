# Zelune (`zelune`)

**Zelune** is a **Figma-style multi-screen visual canvas** and **bi-directional Babel AST sync MCP server** for React Native & Expo applications in **Google Antigravity**.

View all of your mobile screens side-by-side on clean `393 × 852` rectangular artboards in the browser, inspect any `<View>`, `<Text>`, or `<TouchableOpacity>` element, and edit copy or `StyleSheet.create` styles with instant write-back to your `.tsx` source code.

---

## Quick Start (Any React Native / Expo Project)

Run directly inside any React Native or Expo project directory:

```bash
npx zelune
```

Or specify a target project folder and custom port:

```bash
npx zelune --project /path/to/your/react-native-app --port 5173
```

Then open **`http://127.0.0.1:5173`** in your browser.

---

## Google Antigravity Integration (Zelune MCP Server)

### 1. MCP Server Setup
Add the **Zelune** MCP server to your Google Antigravity `mcp_config.json`:

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
