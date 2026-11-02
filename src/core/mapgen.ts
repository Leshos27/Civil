// Процедурная генерация карты: материки из нескольких «ядер», шумовой рельеф,
// климат по широте и влажности, ресурсы и честная расстановка стартов.
import { TERRAIN } from './data';
import { hexDist, inRadius, neighborsOf } from './hex';
import { Rng } from './rng';
import type { Tile } from './types';

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4): number {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, s + o * 1013);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

export interface MapResult { tiles: Tile[]; starts: number[] }

const FOOD_RES = ['wheat', 'cattle', 'fish', 'deer', 'oasis'];

export function generateMap(W: number, H: number, seed: number, nPlayers: number): MapResult {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = tryGenerate(W, H, seed + attempt * 7919, nPlayers);
    if (r) return r;
  }
  return tryGenerate(W, H, seed, nPlayers, true)!;
}

function tryGenerate(W: number, H: number, seed: number, nPlayers: number, force = false): MapResult | null {
  const rng = new Rng(seed);
  const N = W * H;
  const NB = neighborsOf(W, H);
  const s1 = rng.int(1e6), s2 = rng.int(1e6), s3 = rng.int(1e6), s4 = rng.int(1e6);
  const aspect = (W * 1.732) / (H * 1.5);
  const blobs = Array.from({ length: 2 + rng.int(3) }, () => ({ x: rng.range(0.22, 0.78), y: rng.range(0.3, 0.7), r: rng.range(0.3, 0.42) }));

  const elev = new Float32Array(N);
  const ridge = new Float32Array(N);
  const moist = new Float32Array(N);
  const temp = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / W), col = i % W;
    const nx = (col + 0.5 * (row & 1)) / W, ny = row / H;
    const px = nx * aspect * 3.2, py = ny * 3.2;
    let mask = 0;
    for (const b of blobs) {
      const dx = (nx - b.x) * aspect, dy = ny - b.y;
      mask = Math.max(mask, 1 - Math.sqrt(dx * dx + dy * dy) / b.r);
    }
    let e = fbm(px, py, s1, 5) * 0.75 + mask * 0.85;
    const edge = Math.min(col / 3, (W - 1 - col) / 3, row / 2.5, (H - 1 - row) / 2.5);
    if (edge < 1) e -= (1 - edge) * 0.9;
    elev[i] = e;
    ridge[i] = 1 - Math.abs(fbm(px * 1.6, py * 1.6, s2, 4) * 2 - 1);
    moist[i] = fbm(px * 1.3, py * 1.3, s3, 4);
    const lat = Math.abs(ny - 0.5) * 2;
    temp[i] = 1 - lat + (fbm(px, py, s4, 3) - 0.5) * 0.35;
  }
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(N * 0.56)];

  const tiles: Tile[] = [];
  const landIdx: number[] = [];
  for (let i = 0; i < N; i++) {
    tiles.push({ t: 'ocean', f: null, r: null, owner: -1, city: -1, dev: 0, imp: null });
    if (elev[i] > seaLevel) landIdx.push(i);
  }
  const ridgeSorted = landIdx.map((i) => ridge[i]).sort((a, b) => b - a);
  const mtn = ridgeSorted[Math.floor(landIdx.length * 0.06)] ?? 2;
  const hill = ridgeSorted[Math.floor(landIdx.length * 0.2)] ?? 2;

  for (const i of landIdx) {
    const t = tiles[i];
    const tp = temp[i], mo = moist[i];
    if (ridge[i] >= mtn) { t.t = 'mountain'; continue; }
    if (tp < 0.1) t.t = 'snow';
    else if (tp < 0.27) { t.t = 'tundra'; if (rng.chance(0.3)) t.f = 'forest'; }
    else if (tp > 0.62 && mo < 0.38) t.t = 'desert';
    else if (mo > 0.6 && tp > 0.6) { t.t = 'grass'; if (rng.chance(0.75)) t.f = 'jungle'; }
    else if (mo > 0.54) { t.t = 'grass'; if (rng.chance(0.55)) t.f = 'forest'; }
    else if (mo > 0.44) { t.t = 'grass'; if (rng.chance(0.15)) t.f = 'forest'; }
    else { t.t = 'plains'; if (rng.chance(0.15)) t.f = 'forest'; }
    if (ridge[i] >= hill && t.t !== 'snow') { t.t = 'hills'; t.f = null; }
  }
  // Вода: мелководье у суши
  for (let i = 0; i < N; i++) {
    if (tiles[i].t !== 'ocean') continue;
    if (NB[i].some((n) => n >= 0 && !TERRAIN[tiles[n].t].water)) tiles[i].t = 'coast';
  }
  // Ресурсы
  for (let i = 0; i < N; i++) {
    const t = tiles[i];
    let opts: string[] = [];
    if (t.t === 'coast') { if (rng.chance(0.13)) t.r = 'fish'; continue; }
    if (t.t === 'ocean' || t.t === 'mountain') continue;
    if (!rng.chance(0.13)) continue;
    if (t.f === 'forest') opts = t.t === 'tundra' ? ['deer', 'furs'] : ['deer', 'furs', 'spices'];
    else if (t.f === 'jungle') opts = ['gems', 'spices'];
    else if (t.t === 'grass') opts = ['wheat', 'cattle', 'cattle', 'horses', 'spices'];
    else if (t.t === 'plains') opts = ['wheat', 'wheat', 'horses', 'stone', 'iron'];
    else if (t.t === 'hills') opts = ['iron', 'stone', 'gold', 'gems'];
    else if (t.t === 'desert') opts = ['oasis', 'gold', 'stone'];
    else if (t.t === 'tundra') opts = ['deer', 'furs', 'iron'];
    else if (t.t === 'snow') opts = ['furs'];
    if (opts.length) t.r = rng.pick(opts);
  }

  // Связность: крупнейший сухопутный массив
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !TERRAIN[tiles[i].t].pass) continue;
    const stack = [i];
    comp[i] = cid;
    let size = 0;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const n of NB[c]) if (n >= 0 && comp[n] < 0 && TERRAIN[tiles[n].t].pass) { comp[n] = cid; stack.push(n); }
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  if (!force && bestSize < landIdx.length * 0.55) return null;

  // Старты
  const siteScore = (i: number) => {
    let s = 0;
    for (const n of inRadius(i, 2, W, H)) {
      const t = tiles[n];
      const T = TERRAIN[t.t];
      if (t.t === 'mountain') continue;
      if (T.water) { s += t.r ? 3 : 0.8; continue; }
      if (t.f === 'forest') s += 2.2; else if (t.f === 'jungle') s += 1.2;
      else s += T.f * 1.4 + T.p + T.g * 0.5;
      if (t.r) s += 1.5;
    }
    return s;
  };
  const cands: { i: number; s: number }[] = [];
  for (let i = 0; i < N; i++) {
    const t = tiles[i];
    if (comp[i] !== best || (t.t !== 'grass' && t.t !== 'plains') || t.f === 'jungle') continue;
    const row = Math.floor(i / W), col = i % W;
    if (row < 3 || row > H - 4 || col < 3 || col > W - 4) continue;
    cands.push({ i, s: siteScore(i) });
  }
  if (cands.length < nPlayers) return force ? fallbackStarts(tiles, cands.map((c) => c.i), nPlayers) : null;
  cands.sort((a, b) => b.s - a.s);
  const good = cands.slice(0, Math.max(nPlayers * 6, Math.floor(cands.length * 0.45)));
  const starts: number[] = [good[rng.int(Math.min(good.length, 8))].i];
  while (starts.length < nPlayers) {
    let bi = -1, bs = -1e9;
    for (const c of good) {
      if (starts.includes(c.i)) continue;
      const md = Math.min(...starts.map((s) => hexDist(s, c.i, W)));
      const sc = md * 1.0 + c.s * 0.12;
      if (sc > bs) { bs = sc; bi = c.i; }
    }
    if (bi < 0) break;
    starts.push(bi);
  }
  if (starts.length < nPlayers) return force ? fallbackStarts(tiles, cands.map((c) => c.i), nPlayers) : null;
  const minD = Math.min(...starts.flatMap((a, k) => starts.slice(k + 1).map((b) => hexDist(a, b, W))));
  if (!force && minD < 6) return null;

  // Гарантия еды и производства у старта
  for (const s of starts) {
    tiles[s].r = null;
    const area = inRadius(s, 2, W, H).filter((n) => n !== s);
    if (!area.some((n) => tiles[n].r && FOOD_RES.includes(tiles[n].r!))) {
      const spot = area.find((n) => (tiles[n].t === 'grass' || tiles[n].t === 'plains') && !tiles[n].f && !tiles[n].r);
      if (spot !== undefined) tiles[spot].r = 'wheat';
    }
    if (!area.some((n) => tiles[n].t === 'hills' || tiles[n].f === 'forest')) {
      const spot = area.find((n) => (tiles[n].t === 'grass' || tiles[n].t === 'plains') && !tiles[n].r && !tiles[n].f);
      if (spot !== undefined) tiles[spot].f = 'forest';
    }
  }
  return { tiles, starts };
}

function fallbackStarts(tiles: Tile[], cands: number[], n: number): MapResult {
  const starts = cands.slice(0, n);
  let k = 0;
  while (starts.length < n) {
    while (k < tiles.length && !TERRAIN[tiles[k].t].pass) k++;
    starts.push(k++);
  }
  return { tiles, starts };
}
