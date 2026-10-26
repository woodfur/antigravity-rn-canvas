import type {
  ArtboardLayoutMap,
  DetectedUserFlow,
  FlowAccentTone,
  FlowSwimlaneLayoutResult,
  ScreenMetadata,
} from './types';

export const DEFAULT_ARTBOARD_WIDTH = 393;
export const DEFAULT_ARTBOARD_HEIGHT = 852;
export const ARTBOARD_HEADER_HEIGHT = 38;
export const FLOW_COL_GAP = 180;
export const FLOW_SUB_ROW_GAP = 180;
export const FLOW_LANE_GAP = 220;
export const FLOW_INITIAL_X = 110;
export const FLOW_INITIAL_Y = 120;
export const MAX_COLS_PER_SWIMLANE_ROW = 6;

const IGNORED_PATH_SEGMENTS = new Set([
  'src',
  'app',
  'screens',
  'screen',
  'pages',
  'page',
  'views',
  'view',
  'routes',
  'navigation',
  'modules',
  'features',
  'containers',
  'ui',
  'components',
]);

const NAVIGATION_SHELL_GROUPS = new Set([
  'tabs',
  'tab',
  'main',
  'root',
  'app',
  'drawer',
  'stack',
  'protected',
  'private',
  'public',
  'authenticated',
  'home-tabs',
]);

const CORE_ACCENTS: FlowAccentTone[] = ['indigo', 'violet', 'amber', 'sky'];

function humanizeToken(raw: string): string {
  const cleaned = raw
    .replace(/^\(+|\)+$/g, '')
    .replace(/\[|\]|\.\.\./g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!cleaned) return 'General';
  return cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeStem(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/screen$|page$|view$|modal$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .replace(/s$/, '');
}

export function extractFeatureGroupFromPath(filePath: string): {
  slug: string;
  label: string;
} | null {
  const parts = filePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
  if (parts.length <= 1) return null;

  for (let i = parts.length - 2; i >= 0; i--) {
    const rawSeg = parts[i].trim();
    if (!rawSeg) continue;
    const stripped = rawSeg.replace(/^\(+|\)+$/g, '').toLowerCase();
    if (!stripped || stripped.startsWith('[')) continue;
    if (IGNORED_PATH_SEGMENTS.has(stripped) || NAVIGATION_SHELL_GROUPS.has(stripped)) continue;
    return {
      slug: stripped.replace(/[^a-z0-9]+/g, '-'),
      label: humanizeToken(stripped),
    };
  }
  return null;
}

function isAuthScreen(screenId: string, folderSlug: string | null): boolean {
  if (folderSlug && /^(auth|authentication|onboarding|login|welcome)$/i.test(folderSlug)) {
    return true;
  }
  return /^(onboarding|welcome|splash|intro|getstarted|login|signin|sign_in|signup|sign_up|register|createaccount|forgot|forgotpassword|resetpassword|verify|otp|twofactor|passcode|biometric|auth)/i.test(
    screenId
  );
}

function isAccountScreen(screenId: string, folderSlug: string | null): boolean {
  if (folderSlug && /^(account|profile|settings|preferences|security)$/i.test(folderSlug)) {
    return true;
  }
  return /^(profile|editprofile|myprofile|account|myaccount|settings|preferences|security|privacy|changepassword|subscription|billing)$/i.test(
    screenId
  );
}

function isReturnOrEscapeEdge(fromId: string, toId: string, edgeId: string, label: string): boolean {
  if (!fromId || !toId || fromId === toId) return true;
  if (edgeId.includes(':return')) return true;
  const trimmed = label.trim();
  if (/^(?:←|‹|<)\s*/.test(trimmed)) return true;
  if (/^(?:back|return|go\s+back)\b/i.test(trimmed)) return true;
  if (/\b(?:sign\s*out|log\s*out)\b/i.test(trimmed)) return true;
  return false;
}

function getEntryRank(screenId: string, preferredStem?: string): number {
  const lower = screenId.toLowerCase();
  if (preferredStem && normalizeStem(screenId) === preferredStem) return 0;
  if (/^(splash|onboarding|welcome|intro|getstarted)/.test(lower)) return 0;
  if (/^(home|dashboard|main|index|feed|overview)$/.test(lower)) return 1;
  if (/^(login|signin|sign_in|auth|profile|account)$/.test(lower)) return 1;
  if (/^(signup|sign_up|register|createaccount|edit)/.test(lower)) return 2;
  if (/^(forgot|reset|settings)/.test(lower)) return 3;
  if (/^(otp|verify|twofactor)/.test(lower)) return 4;
  return 5;
}

/**
 * Cycle-safe Kahn topological ordering within a single flow row so funnels
 * (e.g. Home -> ProductDetail -> Checkout) always read cleanly left-to-right.
 */
function orderScreensInFlowLeftToRight(
  memberIds: string[],
  forwardAdj: Map<string, string[]>,
  preferredStem?: string
): string[] {
  if (memberIds.length <= 1) return [...memberIds];

  const memberSet = new Set(memberIds);
  const dagTargets = new Map<string, Set<string>>();
  const unplacedPredCount = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const id of memberIds) {
    dagTargets.set(id, new Set());
    unplacedPredCount.set(id, 0);
    outDegree.set(id, 0);
  }

  for (const id of memberIds) {
    const srcRank = getEntryRank(id, preferredStem);
    for (const target of forwardAdj.get(id) ?? []) {
      if (!memberSet.has(target) || target === id) continue;
      if (getEntryRank(target, preferredStem) < srcRank) continue;
      const set = dagTargets.get(id)!;
      if (!set.has(target)) {
        set.add(target);
        outDegree.set(id, (outDegree.get(id) ?? 0) + 1);
        unplacedPredCount.set(target, (unplacedPredCount.get(target) ?? 0) + 1);
      }
    }
  }

  const placed = new Set<string>();
  const ordered: string[] = [];

  while (ordered.length < memberIds.length) {
    const remaining = memberIds.filter((id) => !placed.has(id));
    const ready = remaining.filter((id) => (unplacedPredCount.get(id) ?? 0) <= 0);
    const pool = ready.length > 0 ? ready : remaining;

    pool.sort(
      (a, b) =>
        getEntryRank(a, preferredStem) - getEntryRank(b, preferredStem) ||
        (unplacedPredCount.get(a) ?? 0) - (unplacedPredCount.get(b) ?? 0) ||
        (outDegree.get(b) ?? 0) - (outDegree.get(a) ?? 0) ||
        a.localeCompare(b)
    );

    const chosen = pool[0];
    placed.add(chosen);
    ordered.push(chosen);

    for (const target of dagTargets.get(chosen) ?? []) {
      if (!placed.has(target)) {
        unplacedPredCount.set(target, Math.max(0, (unplacedPredCount.get(target) ?? 0) - 1));
      }
    }
  }

  return ordered;
}

function formatUniversalFlowTitle(orderedIds: string[], folderLabel?: string): string {
  if (folderLabel) return folderLabel;
  if (orderedIds.length === 1) return humanizeToken(orderedIds[0]);
  return `${humanizeToken(orderedIds[0])} → ${humanizeToken(orderedIds[orderedIds.length - 1])}`;
}

export function computeFlowSwimlaneLayout(screens: ScreenMetadata[]): FlowSwimlaneLayoutResult {
  if (screens.length === 0) {
    return { flows: [], positions: {}, screenFlowMap: {}, orderedScreens: [] };
  }

  const screenById = new Map<string, ScreenMetadata>();
  const folderByScreen = new Map<string, { slug: string; label: string } | null>();
  for (const scr of screens) {
    screenById.set(scr.id, scr);
    folderByScreen.set(scr.id, extractFeatureGroupFromPath(scr.filePath));
  }

  const authIds: string[] = [];
  const accountIds: string[] = [];
  const coreIds: string[] = [];

  for (const scr of screens) {
    const slug = folderByScreen.get(scr.id)?.slug ?? null;
    if (isAuthScreen(scr.id, slug)) authIds.push(scr.id);
    else if (isAccountScreen(scr.id, slug)) accountIds.push(scr.id);
    else coreIds.push(scr.id);
  }

  const authSet = new Set(authIds);
  const accountSet = new Set(accountIds);
  const forwardAdj = new Map<string, string[]>();

  for (const scr of screens) {
    const targets: string[] = [];
    for (const edge of scr.outgoingFlows) {
      const toId = edge.toScreen;
      if (!screenById.has(toId)) continue;
      if (isReturnOrEscapeEdge(scr.id, toId, edge.id, edge.triggerLabel)) continue;
      if (!authSet.has(scr.id) && authSet.has(toId)) continue;
      if (!accountSet.has(scr.id) && accountSet.has(toId)) continue;
      targets.push(toId);
    }
    forwardAdj.set(scr.id, targets);
  }

  const rawFlows: Array<{
    id: string;
    title: string;
    accent: FlowAccentTone;
    screenIds: string[];
  }> = [];

  // 1. Authentication Row
  if (authIds.length > 0) {
    rawFlows.push({
      id: 'flow-auth',
      title: 'Authentication',
      accent: 'sky',
      screenIds: orderScreensInFlowLeftToRight(authIds, forwardAdj),
    });
  }

  // 2. Explicit Feature Subfolder Rows (e.g. app/marketplace/*, src/screens/checkout/*)
  const assignedCore = new Set<string>();
  let accentIdx = 0;
  const nextCoreAccent = (): FlowAccentTone => CORE_ACCENTS[accentIdx++ % CORE_ACCENTS.length];

  const folderBuckets = new Map<string, { label: string; ids: string[] }>();
  for (const id of coreIds) {
    const folder = folderByScreen.get(id);
    if (!folder) continue;
    const bucket = folderBuckets.get(folder.slug);
    if (bucket) bucket.ids.push(id);
    else folderBuckets.set(folder.slug, { label: folder.label, ids: [id] });
  }

  for (const [slug, bucket] of folderBuckets.entries()) {
    const stem = normalizeStem(slug);
    for (const id of coreIds) {
      if (folderByScreen.get(id) === null && normalizeStem(id) === stem && !bucket.ids.includes(id)) {
        bucket.ids.unshift(id);
      }
    }
    for (const id of bucket.ids) assignedCore.add(id);
    const ordered = orderScreensInFlowLeftToRight(bucket.ids, forwardAdj, stem);
    rawFlows.push({
      id: `flow-${slug}`,
      title: formatUniversalFlowTitle(ordered, bucket.label),
      accent: nextCoreAccent(),
      screenIds: ordered,
    });
  }

  // 3. Remaining Core Screens (connected components among unassigned core screens)
  const remaining = coreIds.filter((id) => !assignedCore.has(id));
  const remainingSet = new Set(remaining);
  const visited = new Set<string>();
  const standalone: string[] = [];

  // Undirected adjacency inside remaining core screens to group connected journeys cleanly
  const undirected = new Map<string, Set<string>>();
  for (const id of remaining) undirected.set(id, new Set());
  for (const id of remaining) {
    for (const toId of forwardAdj.get(id) ?? []) {
      if (remainingSet.has(toId) && toId !== id) {
        undirected.get(id)!.add(toId);
        undirected.get(toId)!.add(id);
      }
    }
  }

  const sortedRemaining = [...remaining].sort(
    (a, b) => getEntryRank(a) - getEntryRank(b) || a.localeCompare(b)
  );

  for (const startId of sortedRemaining) {
    if (visited.has(startId)) continue;
    const component: string[] = [];
    const queue = [startId];
    visited.add(startId);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      for (const nxt of undirected.get(curr) ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }

    if (component.length === 1 && remaining.length > 1 && getEntryRank(component[0]) >= 5) {
      standalone.push(component[0]);
    } else {
      const ordered = orderScreensInFlowLeftToRight(component, forwardAdj);
      rawFlows.push({
        id: `flow-${ordered[0].toLowerCase()}`,
        title: formatUniversalFlowTitle(ordered),
        accent: nextCoreAccent(),
        screenIds: ordered,
      });
    }
  }

  // 4. Account & Profile Row
  if (accountIds.length > 0) {
    rawFlows.push({
      id: 'flow-account',
      title: 'Account & Profile',
      accent: 'emerald',
      screenIds: orderScreensInFlowLeftToRight(accountIds, forwardAdj),
    });
  }

  // 5. Consolidated Standalone Utility Row (if any)
  if (standalone.length > 0) {
    rawFlows.push({
      id: 'flow-utility',
      title: 'Utility Screens',
      accent: 'slate',
      screenIds: standalone.sort((a, b) => a.localeCompare(b)),
    });
  }

  // 6. Assign Horizontal Row Coordinates (wrapping at MAX_COLS_PER_SWIMLANE_ROW = 6)
  const positions: ArtboardLayoutMap = {};
  const screenFlowMap: Record<string, string> = {};
  const orderedScreens: ScreenMetadata[] = [];
  const flows: DetectedUserFlow[] = [];

  let currentTopY = FLOW_INITIAL_Y;
  const fullArtboardHeight = DEFAULT_ARTBOARD_HEIGHT + ARTBOARD_HEADER_HEIGHT;

  rawFlows.forEach((flow, idx) => {
    const subRows = Math.max(1, Math.ceil(flow.screenIds.length / MAX_COLS_PER_SWIMLANE_ROW));

    flow.screenIds.forEach((screenId, itemIdx) => {
      const col = itemIdx % MAX_COLS_PER_SWIMLANE_ROW;
      const subRow = Math.floor(itemIdx / MAX_COLS_PER_SWIMLANE_ROW);
      positions[screenId] = {
        x: FLOW_INITIAL_X + col * (DEFAULT_ARTBOARD_WIDTH + FLOW_COL_GAP),
        y: currentTopY + subRow * (fullArtboardHeight + FLOW_SUB_ROW_GAP),
        width: DEFAULT_ARTBOARD_WIDTH,
        height: DEFAULT_ARTBOARD_HEIGHT,
      };
      screenFlowMap[screenId] = flow.id;
      const meta = screenById.get(screenId);
      if (meta) orderedScreens.push(meta);
    });

    flows.push({
      id: flow.id,
      index: idx + 1,
      title: flow.title,
      accent: flow.accent,
      screenIds: flow.screenIds,
    });

    currentTopY +=
      subRows * fullArtboardHeight + Math.max(0, subRows - 1) * FLOW_SUB_ROW_GAP + FLOW_LANE_GAP;
  });

  return { flows, positions, screenFlowMap, orderedScreens };
}
