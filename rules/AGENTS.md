# Zelune React Native Visual Canvas Rules

When modifying React Native or Expo screens linked to the Zelune Visual Canvas:
1. Preserve `StyleSheet.create` declarations at the bottom of screen `.tsx` files so Tier-1 AST inspection and surgical style patching remain clean and deterministic.
2. Prefer `useNavigation()` (`navigation.navigate('RouteName')`) or Expo Router (`router.push('/route')`) for screen transitions so the canvas automatically renders SVG navigation flow arrows between artboards.
3. Use the `zelune` MCP tools (`list_canvas_screens`, `inspect_screen_element`, `patch_screen_element`) when asked to audit or update screen UI properties across the mobile app.
