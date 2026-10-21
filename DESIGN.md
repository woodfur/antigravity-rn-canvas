---
system: zelune-design-system
version: 1.2.0
frameworks:
  - pbakaus/impeccable
  - emilkowalski/skills
  - leonxlnx/taste-skill
taste_dials:
  studio_chrome:
    design_variance: 2
    motion_intensity: 6
    visual_density: 5
  mobile_reference_screens:
    design_variance: 7
    motion_intensity: 7
    visual_density: 4
tokens:
  fonts:
    sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
  colors:
    studio_canvas_bg: "#08090C"
    studio_surface_1: "#0D0F14"
    studio_surface_2: "#13161E"
    studio_surface_3: "#191D28"
    studio_border_hairline: "rgba(255, 255, 255, 0.07)"
    studio_border_subtle: "#1E2330"
    studio_border_focus: "#38BDF8"
    studio_text_primary: "#F1F5F9"
    studio_text_secondary: "#94A3B8"
    studio_text_muted: "#64748B"
    studio_accent_primary: "#38BDF8"
    studio_accent_Select: "#6366F1"
    studio_accent_interact: "#10B981"
    studio_accent_warning: "#F59E0B"
    studio_accent_danger: "#F43F5E"
  motion:
    ease_out: "cubic-bezier(0.23, 1, 0.32, 1)"
    ease_out_expo: "cubic-bezier(0.16, 1, 0.3, 1)"
    ease_in_out: "cubic-bezier(0.65, 0, 0.35, 1)"
    duration_press: "120ms"
    duration_micro: "160ms"
    duration_panel: "220ms"
    duration_camera: "380ms"
    press_scale: 0.97
---

# DESIGN.md — Zelune Visual & Motion System

This specification governs visual craftsmanship, parametric taste dials, physics-based motion curves, and anti-slop guardrails across **Zelune**.

---

## 1. Parametric Taste Dials (`leonxlnx/taste-skill`)

Before modifying any component, configure the three gating dials according to the target surface:

| Surface | Design Variance (1–10) | Motion Intensity (1–10) | Visual Density (1–10) | Aesthetic Mandate |
| :--- | :---: | :---: | :---: | :--- |
| **Zelune Studio Chrome** (`src/canvas/`) | **2 / 10** | **6 / 10** | **8 / 10** | **Pilot Cockpit Precision**: Strict orthogonal alignment, `1px` hairline borders (`rgba(255,255,255,0.07)`), `tabular-nums` coordinate readouts, and switchable `compact` / `spacious` inspector density. |
| **Chronos Mobile Suite** (`src/screens/`) | **7 / 10** | **7 / 10** | **4 / 10** | **Industrial Editorial**: Asymmetric spec grids, technical model numbers (`CH-01 // BERYLLIUM`), high-contrast typographic hierarchy, and generous negative space. |

---

## 2. Motion & Touch Ergonomics (`emilkowalski/skills`)

### 2.1 Easing & Timing Tokens
- **Never use `ease-in` on entering or interactive UI elements.** Built-in CSS `ease` and `linear` are prohibited for UI feedback.
- **`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`**: Default curve for button hovers, inspector pills, and bounding-box overlays (`140ms–180ms`).
- **`--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`**: High-velocity decelerating curve for programmatic canvas camera focus (`focusOnScreen`, `handleFitAllScreens`, `380ms`) and `<dialog>` modal entry (`200ms`).
- **Direct Manipulation Override (`0ms`)**: When the user is actively dragging the canvas (`isPanning`) or scrolling the wheel (`onWheel`), `transition` on the world transform container **must be `none`** so the canvas tracks the cursor with zero latency.

### 2.2 Tactile Press Feedback & Stacking Context Stability
- All interactive studio buttons, swatches, and pills apply an identity transform (`scale: 1; translate: 0 0;`) at rest to prevent stacking-context shifts, and compress to `scale: 0.97` on `:active` over `120ms var(--ease-out)`.
- Respect `prefers-reduced-motion: reduce` by collapsing camera and micro-interaction durations.

### 2.3 Mobile Touch Ergonomics (`src/screens/`)
- Every `<TouchableOpacity>` on the `393 × 852` artboards must provide a minimum `40px–48px` vertical touch target (`paddingVertical: 10–16`) and explicit `activeOpacity={0.78}` for tactile mobile responsiveness.

---

## 3. Anti-Slop Rules (`pbakaus/impeccable`)

The following AI-generated design clichés are **strictly banned** in this repository:

1. **No Default `Inter` Monoculture**: Use `'Plus Jakarta Sans'` for UI/display copy paired with `'JetBrains Mono'` (`font-variant-numeric: tabular-nums`) for AST paths, line numbers, dimensions, zoom percentages, and prices.
2. **No Cliché Purple-to-Cyan / Indigo-to-Violet Button Gradients**: Do not slap `linear-gradient(135deg, #4F46E5, #7C3AED)` or `#06B6D4` gradients onto studio logos or primary CTAs. Use solid, high-craft tinted surfaces (`#13161E`), crisp 1px hairlines, and deliberate single-hue signal accents (`#38BDF8` sky cyan for inspection, `#6366F1` precision indigo for AST selection, `#10B981` emerald for live navigation flows).
3. **No Emoji-in-a-Rounded-Square Placeholders**: Never place raw emojis (`🎧`, `⌨️`) inside rounded colored squares as substitute product photography or feature icons. Use technical typographic monograms, model codes (`CH-01`, `KS-75`), or vector geometry.
4. **No Untinted Pure Grays or Muddy Borders**: All dark neutrals must carry a subtle cool-obsidian tint (`#08090C` canvas, `#0D0F14` chrome, `#13161E` elevated controls) separated by `1px solid rgba(255, 255, 255, 0.07)` hairlines and soft diffusion shadows (`0 24px 48px -12px rgba(0, 0, 0, 0.72)`).
5. **No Numeric Layout Jitter**: Every counter, zoom readout (`68%`), coordinate (`L142:8`), artboard dimension (`393 × 852`), and price (`$349.00`) must enforce `tabular-nums`.
