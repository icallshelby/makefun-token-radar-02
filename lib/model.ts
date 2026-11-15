// The token radar model "radar-3": category-calibrated valuation, full house-exclusion rule,
// logarithmic maturity curve, asymmetric growth weighting, and multi-chain breadth.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  max_breadth_chains: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_weight: 0.02,
  max_breadth_chains: 10,
};

export const MODEL_VERSION = 'radar-3';

export interface CalibrationCategory {
  category: string;
  n: number;
  multiple: number;
  source: 'category' | 'global';
  comps?: { name: string; ratio: number }[];
}

export interface CalibrationData {
  global_median: number;
  min_n: number;
  floor: number;
  cap: number;
  tokenized_count: number;
  categories: CalibrationCategory[];
}

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  comps_n: number;
  multiple_source: 'category' | 'global';
  model: {
    category_multiple: number;
    comps_n: number;
    multiple_source: 'category' | 'global';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  comps_n: number;
  multiple_source: 'category' | 'global';
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: CalibrationData;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

function computeMedian(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  } else {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
}

export function computeCalibration(protocols: SnapshotProtocol[]): CalibrationData {
  const tokenized = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const globalRatios = tokenized.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedianRaw = computeMedian(globalRatios);
  const globalMedian = round4(Math.min(0.80, Math.max(0.03, globalMedianRaw)));

  const byCat = new Map<string, { ratios: number[]; comps: { name: string; ratio: number }[] }>();
  for (const p of tokenized) {
    const cat = p.category ?? 'General';
    let entry = byCat.get(cat);
    if (!entry) {
      entry = { ratios: [], comps: [] };
      byCat.set(cat, entry);
    }
    const ratio = round4(p.mcap_usd! / p.tvl_usd);
    entry.ratios.push(p.mcap_usd! / p.tvl_usd);
    entry.comps.push({ name: p.name, ratio });
  }

  const categories: CalibrationCategory[] = [];
  for (const [cat, entry] of byCat.entries()) {
    const ratios = entry.ratios;
    const n = ratios.length;
    const rawMedian = computeMedian(ratios);
    const clampedCat = Math.min(0.80, Math.max(0.03, rawMedian));
    const useCat = n >= 5;
    const multiple = round4(useCat ? clampedCat : globalMedian);
    const source: 'category' | 'global' = useCat ? 'category' : 'global';
    entry.comps.sort((a, b) => b.ratio - a.ratio);
    categories.push({ category: cat, n, multiple, source, comps: entry.comps });
  }

  categories.sort((a, b) => b.n - a.n || a.category.localeCompare(b.category));

  return {
    global_median: globalMedian,
    min_n: 5,
    floor: 0.03,
    cap: 0.80,
    tokenized_count: tokenized.length,
    categories,
  };
}

export function getCategoryMultiple(p: SnapshotProtocol, calibration: CalibrationData): { multiple: number; comps_n: number; multiple_source: 'category' | 'global' } {
  const cat = p.category ?? 'General';
  const found = calibration.categories.find((c) => c.category === cat);
  if (found && found.n >= 5) {
    return { multiple: found.multiple, comps_n: found.n, multiple_source: 'category' };
  } else {
    return { multiple: calibration.global_median, comps_n: found ? found.n : 0, multiple_source: 'global' };
  }
}

export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, calibration: CalibrationData) {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  let growthMult: number;
  if (growthPct >= 0) {
    growthMult = 1 + (growthPct / 100) * model.growth_weight;
  } else {
    growthMult = 1 + (growthPct / 100) * 0.9;
  }
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (Math.log(1 + Math.min(ageForModel, model.maturity_days)) / Math.log(1 + model.maturity_days));
  const chainsCount = protocol.chains.length;
  const breadthMult = 1 + model.breadth_weight * Math.min(Math.max(chainsCount - 1, 0), model.max_breadth_chains);
  
  const { multiple, comps_n, multiple_source } = getCategoryMultiple(protocol, calibration);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age, multiple, comps_n, multiple_source };
}

const EXCLUDED_CATEGORIES = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
const EXCHANGES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED = /\b(wrapped|staked|staking)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isEligible(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  const cat = (p.category ?? '').toLowerCase();
  if (EXCLUDED_CATEGORIES.has(cat)) return false;
  const name = p.name;
  const lowerName = name.toLowerCase();
  if (WRAPPED_STAKED.test(name)) return false;
  for (const ex of EXCHANGES) {
    if (lowerName === ex || lowerName.startsWith(ex + ' ') || lowerName.startsWith(ex + '-')) return false;
  }
  if (VERSIONED.test(name)) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = computeCalibration(snapshot.protocols);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && isEligible(p)) {
      chosen.set(slug, p);
    }
  }

  for (const p of snapshot.protocols) {
    if (isEligible(p)) {
      chosen.set(p.slug, p);
    }
  }

  const scored = [...chosen.values()].map((p) => {
    const res = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, ...res };
  });

  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    category_multiple: s.multiple,
    comps_n: s.comps_n,
    multiple_source: s.multiple_source,
    model: {
      category_multiple: s.multiple,
      comps_n: s.comps_n,
      multiple_source: s.multiple_source,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold position and check protocol documentation.`;
  return s;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its primary chain';
}

function gasTokenFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('solana')) return 'SOL';
  if (c.includes('bsc') || c.includes('binance')) return 'BNB';
  if (c.includes('polygon') || c.includes('matic')) return 'POL';
  if (c.includes('avalanche')) return 'AVAX';
  if (c.includes('tron')) return 'TRX';
  if (c.includes('sui')) return 'SUI';
  if (c.includes('aptos')) return 'APT';
  if (c.includes('near')) return 'NEAR';
  if (c.includes('ton')) return 'TON';
  return 'ETH';
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC or stable assets to ${name} on ${chain} and maintain healthy collateralization.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('farm') || c.includes('liquidity')) {
    return `Provide $${capital} of liquidity to ${name} on ${chain} and stake LP tokens in their reward pool.`;
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return `Transfer $${capital} of assets via ${name} across ${chain} and utilize active route destinations.`;
  }
  if (c.includes('stake') || c.includes('restak')) {
    return `Stake $${capital} equivalent of network assets through ${name} and hold the receipt token.`;
  }
  if (c.includes('derivative') || c.includes('perpetual')) {
    return `Deposit $${capital} margin on ${name} and open a hedged delta-neutral position.`;
  }
  if (c.includes('rwa') || c.includes('stablecoin')) {
    return `Mint or deposit $${capital} of yield-bearing asset on ${name} via ${chain}.`;
  }
  return `Deposit $${capital} into ${name} on ${chain} and maintain active interaction.`;
}

function riskFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) {
    return `Monitor liquidation thresholds closely if borrowing against volatile collateral.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) {
    return `Watch for impermanent loss and shifting emission reward APRs during high volatility.`;
  }
  if (c.includes('bridge')) {
    return `Verify cross-chain validator finality and messaging security assumptions.`;
  }
  if (c.includes('stake') || c.includes('restak')) {
    return `Be mindful of validator slashing risks and unbonding delay periods.`;
  }
  return `Keep track of protocol upgrade governance proposals and smart contract security updates.`;
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasTokenFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const risk = riskFor(p);

  return [
    {
      text: `Set up a clean dedicated wallet funded exclusively with operational funds and keep seed backups offline.`,
      cost: `under 0.002 ${gas} for initial gas`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} principal plus $3 equivalent in ${gas}`,
      time: '15 minutes',
    },
    {
      text: `Perform one recurring weekly qualifying action such as compounding yields or voting.`,
      cost: `about 0.001 ${gas} per week`,
      time: '10 minutes weekly',
    },
    {
      text: `Hold the active position undisturbed for at least ${hold} consecutive days for robust snapshot capture.`,
      cost: `locked principal $${capital}`,
      time: `${hold} days`,
    },
    {
      text: `Check official reward portals strictly through verified protocol documentation links before claiming.`,
      cost: 'zero claim fee, never pay to claim',
      time: '10 minutes',
    },
    {
      text: risk,
      cost: 'vigilant risk awareness',
      time: '5 minutes',
    },
    {
      text: `Log wallet addresses, entry timestamps, and transaction hashes meticulously in your farm journal.`,
      cost: 'free local logging',
      time: '5 minutes',
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && (p.category ?? '').toLowerCase() !== 'cex')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.category_multiple,
    comps_n: row.comps_n,
    multiple_source: row.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = computeCalibration(snapshot.protocols);
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json root is not an object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json missing valid as_of date');
  }
  if (typeof o.source !== 'string') {
    throw new SnapshotError('snapshot.json missing source');
  }
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json missing floor_usd');
  }
  if (!Array.isArray(o.protocols)) {
    throw new SnapshotError('snapshot.json missing protocols array');
  }
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json missing watchlist array of strings');
  }

  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || !p.slug || typeof p.name !== 'string' || !p.name || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd) || p.tvl_usd < 0) {
      throw new SnapshotError(`snapshot protocol ${i} missing valid slug, name, or tvl_usd`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share identical implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) {
      return `${r.slug} has ${steps.length} farm steps`;
    }
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) {
        return `${r.slug} has a farm step length of ${s.length}`;
      }
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has invalid implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
