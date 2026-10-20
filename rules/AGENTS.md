# Zelune React Native Visual Canvas & Craft Rules

When modifying React Native/Expo screens or the Zelune Studio Canvas:

1. **Design System & Product Truth (`pbakaus/impeccable`)**:
   - Always consult `PRODUCT.md` and `DESIGN.md` before modifying colors, typography, or layout.
   - **Anti-Slop Enforcement**: Never introduce default `Inter` font stacks, purple-to-cyan/violet button gradients (`linear-gradient(135deg, #4F46E5, #7C3AED)`), untinted pure grays, or raw emoji icons (`🎧`, `⌨️`) inside rounded squares.
   - Apply `font-variant-numeric: tabular-nums` (`.tabular-nums`) to all coordinates, line numbers, dimensions (`393 × 852`), zoom percentages, and prices.

2. **Motion & Touch Ergonomics (`emilkowalski/skills`)**:
   - Use `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for interactive hover/press states and `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)` for programmatic camera focus/fit transitions.
   - Maintain `0ms` transition override during direct pointer canvas panning and wheel zooming.
   - Every React Native `<TouchableOpacity>` must include `activeOpacity={0.78}` and ergonomic vertical touch padding.

3. **Parametric Taste Dials (`leonxlnx/taste-skill`)**:
   - Keep Studio Chrome at `Design Variance: 2/10`, `Motion Intensity: 6/10`, `Visual Density: 8/10` (supporting reactive `data-density="compact" | "spacious"` tokens).
   - Keep Mobile Reference Screens at `Design Variance: 7/10`, `Motion Intensity: 7/10`, `Visual Density: 4/10`.

4. **AST Engine Invariants**:
   - Preserve `StyleSheet.create` declarations at the bottom of screen `.tsx` files so Tier-1 AST inspection and surgical style patching remain deterministic.
   - Use `useNavigation()` (`navigation.navigate('RouteName')`) or Expo Router (`router.push('/route')`) for screen transitions so the canvas automatically extracts SVG navigation flow arrows.
