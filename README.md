# Zelune (`zelune`)

**Zelune** is a **Figma-style multi-screen visual canvas** and **bi-directional Babel AST sync MCP server** for React Native & Expo applications in **Google Antigravity**, Cursor, and Claude Code.

View all of your mobile screens side-by-side on clean `393 × 852` rectangular artboards in the browser, inspect any `<View>`, `<Text>`, or `<TouchableOpacity>` element, and edit copy or `StyleSheet.create` styles with instant write-back to your `.tsx` source code.

---

## Global Installation & Quick Start (Any React Native / Expo Project)

### Option A: Run Directly via GitHub / npx (Zero Clone Required)
Run directly inside any React Native or Expo project directory:

```bash
npx github:woodfur/antigravity-rn-canvas
```
*(Or once published to npm: `npx zelune`)*

To target a specific project folder and custom port:

```bash
npx github:woodfur/antigravity-rn-canvas --project /path/to/your/react-native-app --port 5174
```

Then open **`http://127.0.0.1:5174`** in your browser.

### Option B: Install the Zelune AI Agent Skill
Install the Zelune skill (`skills/rn-canvas/SKILL.md`), design system (`DESIGN.md`, `PRODUCT.md`), and AST rules (`rules/AGENTS.md`) into your AI coding agent:

```bash
npx skills add woodfur/antigravity-rn-canvas
```

---

## Google Antigravity Integration (Zelune MCP Server)

### 1. MCP Server Setup
Add the **Zelune** MCP server to your `mcp_config.json`:

```json
{
  "mcpServers": {
    "zelune": {
      "command": "npx",
      "args": ["-y", "github:woodfur/antigravity-rn-canvas", "--mcp"]
    }
  }
}
```

### 2. Available Zelune MCP Tools
- `list_canvas_screens` — Lists all discovered screens (`src/screens/`, `screens/`, or Expo Router `app/`), element counts, and outgoing navigation flows.
- `inspect_screen_element` — Returns the resolved `StyleSheet.create` / inline styles, static text copy, and JSX snippet for any element by `file` and `astPath`.
- `patch_screen_element` — Surgically patches text copy or style rules in `.tsx` source files while preserving comments and formatting.
