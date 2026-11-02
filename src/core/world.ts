// Изменение состояния мира: юниты, движение, бой, города, видимость, дипломатия.
import { BUILDINGS, CHARTERS, CHARTER_IDS, IMPROVEMENTS, NATIONS, TECHS, TERRAIN, UNITS, UnitDef } from './data';
import { rint, rnd } from './rng';
import {
  Breakdown, assignTiles, atWar, attackStrength, borderNeed, canBuild, cityAt, cityById, cityMaxHp, cityStrength,
  cityYields, civAt, damage, defenseStrength, devNeed, dist, goldIncome, growthNeed, hasTech, improvementFor, isMil,
  itemCost, itemName, levelFromXp, milAt, mods, nbOf, playerCities, radius, researchPath, techCost, tileYield,
  unitMaxMoves, availableTechs, unitById, buyCost, canBuy,
} from './rules';
import type { BuildItem, City, Game, NoteKind, Player, Unit } from './types';

// ───────── Уведомления ─────────
export function notify(g: Game, pid: number, text: string, kind: NoteKind = 'info', at?: number) {
  if (g.players[pid]?.human) g.notes.push({ pid, text, kind, at });
}
export function fx(g: Game, at: number, text: string, color: string) {
  g.fx.push({ at, text, color });
}
export const nationName = (g: Game, pid: number) => g.players[pid].name;

// ───────── Юниты ─────────
export function addUnit(g: Game, owner: number, type: string, at: number): Unit {
  const m = mods(g, owner);
  const u: Unit = {
    id: g.nextId++, owner, type, at, hp: 100, mv: 0, xp: 0, lvl: 0, fort: 0, sleep: false, acted: false, path: null,
  };
  u.mv = unitMaxMoves(g, u);
  if (isMil(u) && m.freeLvl) u.lvl = Math.min(3, m.freeLvl);
  g.units.push(u);
  return u;
}
export function removeUnit(g: Game, u: Unit) {
  const k = g.units.indexOf(u);
  if (k >= 0) g.units.splice(k, 1);
}
export function addXp(u: Unit, amt: number) {
  u.xp += amt;
  u.lvl = Math.min(4, Math.max(u.lvl, levelFromXp(u.xp)));
}

export function moveCostFor(g: Game, d: UnitDef, n: number): number {
  const t = g.tiles[n];
  const T = TERRAIN[t.t];
  if (!T.pass) return 99;
  if (d.cls === 'recon') return 1;
  return t.f ? 2 : T.move;
}

/** Можно ли пройти через клетку (не учитывая остановку) */
function passable(g: Game, u: Unit, n: number, occ: Occ): boolean {
  const o = occ.owner[n];
  if (o >= 0 && o !== u.owner) return false;
  const c = occ.city[n];
  if (c >= 0 && c !== u.owner) return false;
  return true;
}

interface Occ { owner: Int16Array; mil: Uint8Array; civ: Uint8Array; city: Int16Array }
function buildOcc(g: Game): Occ {
  const N = g.W * g.H;
  const occ: Occ = { owner: new Int16Array(N).fill(-1), mil: new Uint8Array(N), civ: new Uint8Array(N), city: new Int16Array(N).fill(-1) };
  for (const u of g.units) {
    occ.owner[u.at] = u.owner;
    if (isMil(u)) occ.mil[u.at] = 1; else occ.civ[u.at] = 1;
  }
  for (const c of g.cities) occ.city[c.at] = c.owner;
  return occ;
}

export interface Paths { start: number; turns: Int16Array; left: Int8Array; prev: Int32Array; noStop: Uint8Array }

/** Дейкстра по (ходы, остаток очков). Войти в клетку можно при любом остатке очков хода. */
export function computePaths(g: Game, u: Unit, maxTurns = 30): Paths {
  const N = g.W * g.H;
  const turns = new Int16Array(N).fill(-1);
  const left = new Int8Array(N);
  const prev = new Int32Array(N).fill(-1);
  const noStop = new Uint8Array(N);
  const d = UNITS[u.type];
  const maxMv = unitMaxMoves(g, u);
  const mil = d.cls !== 'civ';
  const occ = buildOcc(g);
  const NB = nbOf(g);
  const heap: number[] = []; // пары key, idx
  const push = (k: number, i: number) => {
    heap.push(k, i);
    let c = heap.length / 2 - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p * 2] <= heap[c * 2]) break;
      [heap[p * 2], heap[c * 2]] = [heap[c * 2], heap[p * 2]];
      [heap[p * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[p * 2 + 1]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const k = heap[0], i = heap[1];
    const li = heap.pop()!; // пары хранятся как [key, idx], поэтому сначала снимается idx
    const lk = heap.pop()!;
    if (heap.length) {
      heap[0] = lk; heap[1] = li;
      let c = 0;
      const n = heap.length / 2;
      for (;;) {
        const l = c * 2 + 1, r = l + 1;
        let m = c;
        if (l < n && heap[l * 2] < heap[m * 2]) m = l;
        if (r < n && heap[r * 2] < heap[m * 2]) m = r;
        if (m === c) break;
        [heap[m * 2], heap[c * 2]] = [heap[c * 2], heap[m * 2]];
        [heap[m * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[m * 2 + 1]];
        c = m;
      }
    }
    return [k, i];
  };
  const key = (t: number, l: number) => t * 32 + (16 - l);
  turns[u.at] = 0;
  left[u.at] = u.mv;
  push(key(0, u.mv), u.at);
  while (heap.length) {
    const [k, i] = pop();
    if (k !== key(turns[i], left[i])) continue;
    const t = turns[i], l = left[i];
    for (const n of NB[i]) {
      if (n < 0) continue;
      const c = moveCostFor(g, d, n);
      if (c >= 99) continue;
      if (!passable(g, u, n, occ)) continue;
      let tt = t, ll = l;
      if (ll <= 0) { tt++; ll = maxMv; }
      if (tt > maxTurns) continue;
      const nl = Math.max(0, ll - c);
      const sameLayer = occ.owner[n] === u.owner && (mil ? occ.mil[n] : occ.civ[n]);
      if (sameLayer) {
        noStop[n] = 1;
        if (nl === 0) continue;
      }
      if (turns[n] === -1 || tt < turns[n] || (tt === turns[n] && nl > left[n])) {
        turns[n] = tt; left[n] = nl; prev[n] = i;
        push(key(tt, nl), n);
      }
    }
  }
  return { start: u.at, turns, left, prev, noStop };
}

export function pathTo(P: Paths, dest: number): number[] | null {
  if (P.turns[dest] < 0 || dest === P.start || P.noStop[dest]) return null;
  const out: number[] = [];
  let c = dest;
  while (c !== P.start && c >= 0) { out.push(c); c = P.prev[c]; }
  return c === P.start ? out.reverse() : null;
}

/** Передвинуть юнита по пути. Возвращает пройденные клетки (для анимации). */
export function moveAlong(g: Game, u: Unit, path: number[]): number[] {
  const d = UNITS[u.type];
  const visited = [u.at];
  u.fort = 0; u.sleep = false;
  let k = 0;
  for (; k < path.length; k++) {
    const n = path[k];
    if (u.mv <= 0) break;
    const c = moveCostFor(g, d, n);
    if (c >= 99) { k = path.length; break; }
    const blockers = g.units.filter((o) => o.at === n);
    if (blockers.some((o) => o.owner !== u.owner)) { k = path.length; break; }
    const city = cityAt(g, n);
    if (city && city.owner !== u.owner) { k = path.length; break; }
    const nl = Math.max(0, u.mv - c);
    const sameLayer = blockers.some((o) => isMil(o) === isMil(u));
    if (sameLayer && (nl === 0 || k === path.length - 1)) { k = path.length; break; }
    u.mv = nl; u.at = n; u.acted = true;
    visited.push(n);
  }
  u.path = k < path.length ? path.slice(k) : null;
  if (u.path && u.path.length === 0) u.path = null;
  refreshVisibility(g, u.owner);
  return visited;
}

// ───────── Видимость ─────────
const visCache = new WeakMap<Game, Uint8Array[]>();
export function visibleOf(g: Game, pid: number): Uint8Array {
  let arr = visCache.get(g);
  if (!arr) { arr = []; visCache.set(g, arr); }
  if (!arr[pid]) arr[pid] = computeVisible(g, pid);
  return arr[pid];
}
function computeVisible(g: Game, pid: number): Uint8Array {
  const vis = new Uint8Array(g.W * g.H);
  for (const u of g.units) {
    if (u.owner !== pid) continue;
    const s = (UNITS[u.type].sight || 2) + (g.tiles[u.at].t === 'hills' ? 1 : 0);
    for (const i of radius(g, u.at, s)) vis[i] = 1;
  }
  for (const c of g.cities) {
    if (c.owner !== pid) continue;
    for (const i of radius(g, c.at, 2)) vis[i] = 1;
  }
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.tiles[i].owner === pid) {
      vis[i] = 1;
      for (const n of nbOf(g)[i]) if (n >= 0) vis[n] = 1;
    }
  }
  return vis;
}
export function refreshVisibility(g: Game, pid: number) {
  let arr = visCache.get(g);
  if (!arr) { arr = []; visCache.set(g, arr); }
  const vis = computeVisible(g, pid);
  arr[pid] = vis;
  const p = g.players[pid];
  for (let i = 0; i < vis.length; i++) if (vis[i]) p.explored[i] = 1;
  // знакомства
  for (const u of g.units) if (u.owner !== pid && vis[u.at]) meet(g, pid, u.owner);
  for (const c of g.cities) if (c.owner !== pid && vis[c.at]) meet(g, pid, c.owner);
}
export function meet(g: Game, a: number, b: number) {
  if (a === b || g.players[a].rel[b].met) return;
  g.players[a].rel[b].met = true;
  g.players[b].rel[a].met = true;
  g.players[a].rel[b].since = g.turn;
  g.players[b].rel[a].since = g.turn;
  notify(g, a, `Вы встретили державу «${nationName(g, b)}»`, 'info');
  notify(g, b, `Вы встретили державу «${nationName(g, a)}»`, 'info');
}

// ───────── Дипломатия ─────────
export function declareWar(g: Game, a: number, b: number) {
  const A = g.players[a], B = g.players[b];
  if (A.rel[b].war) return;
  A.rel[b].war = B.rel[a].war = true;
  A.rel[b].since = B.rel[a].since = g.turn;
  B.rel[a].grudge += 40;
  A.rel[b].met = B.rel[a].met = true;
  const text = `${A.name} объявляет войну державе «${B.name}»!`;
  for (const p of g.players) if (p.human && (p.id === a || p.id === b || p.rel[a].met)) notify(g, p.id, text, 'war');
}
export function makePeace(g: Game, a: number, b: number) {
  const A = g.players[a], B = g.players[b];
  if (!A.rel[b].war) return;
  A.rel[b].war = B.rel[a].war = false;
  A.rel[b].since = B.rel[a].since = g.turn;
  const text = `${A.name} и ${B.name} заключили мир`;
  for (const p of g.players) if (p.human && (p.id === a || p.id === b || p.rel[a].met)) notify(g, p.id, text, 'good');
}

export function relationScore(g: Game, a: number, b: number): { score: number; reasons: string[] } {
  const A = g.players[a];
  const r = A.rel[b];
  const reasons: string[] = [];
  let s = 0;
  if (r.war) { s -= 50; reasons.push('Мы воюем (−50)'); }
  else {
    const peace = Math.min(20, Math.floor((g.turn - r.since) / 8));
    if (peace) { s += peace; reasons.push(`Долгий мир (+${peace})`); }
  }
  if (r.grudge) { s -= Math.round(r.grudge); reasons.push(`Помнят ваше вероломство (−${Math.round(r.grudge)})`); }
  const ca = playerCities(g, a).find((c) => c.capital), cb = playerCities(g, b).find((c) => c.capital);
  if (ca && cb && dist(g, ca.at, cb.at) < 12) { s -= 10; reasons.push('Слишком близкие соседи (−10)'); }
  const commonEnemy = g.players.some((p) => p.alive && p.id !== a && p.id !== b && A.rel[p.id].war && g.players[b].rel[p.id].war);
  if (commonEnemy) { s += 15; reasons.push('Общий враг (+15)'); }
  if (!reasons.length) reasons.push('Нейтральные отношения');
  return { score: s, reasons };
}

// ───────── Города ─────────
export function canFoundAt(g: Game, i: number): { ok: boolean; why?: string } {
  const t = g.tiles[i];
  if (!TERRAIN[t.t].pass) return { ok: false, why: 'Непригодная местность' };
  for (const c of g.cities) if (dist(g, c.at, i) < 3) return { ok: false, why: 'Слишком близко к другому городу' };
  return { ok: true };
}

export function foundCity(g: Game, u: Unit): City | null {
  const p = g.players[u.owner];
  if (!canFoundAt(g, u.at).ok) return null;
  const used = new Set(g.cities.map((c) => c.name));
  const names = NATIONS[p.nation].cities.filter((n) => !used.has(n));
  const name = names[0] || `${NATIONS[p.nation].cities[0]}-${g.nextId}`;
  const first = playerCities(g, p.id).length === 0;
  const c: City = {
    id: g.nextId++, owner: p.id, name, at: u.at, pop: 1, food: 0, prod: 0, queue: [], blds: [], hp: 200, focus: 'bal',
    cult: 0, claims: 0, worked: [], capital: first, origCap: first ? p.id : -1, founded: g.turn, hit: -1, founder: p.id,
  };
  const t = g.tiles[u.at];
  t.f = null;
  g.cities.push(c);
  for (const i of radius(g, c.at, 1)) {
    const tt = g.tiles[i];
    if (tt.owner === -1 || i === c.at) { tt.owner = p.id; tt.city = c.id; }
  }
  removeUnit(g, u);
  assignTiles(g, c);
  refreshVisibility(g, p.id);
  notify(g, p.id, `Основан город ${c.name}`, 'city', c.at);
  return c;
}

function claimNext(g: Game, c: City): boolean {
  const p = g.players[c.owner];
  let best = -1, bs = -1e9;
  for (const i of radius(g, c.at, 3)) {
    const t = g.tiles[i];
    if (t.owner !== -1) continue;
    if (!nbOf(g)[i].some((n) => n >= 0 && g.tiles[n].city === c.id)) continue;
    const y = tileYield(g, i, p);
    const s = y.f * 1.5 + y.p * 1.3 + y.g + (t.r ? 3 : 0) - dist(g, c.at, i) * 0.6 + rnd(g) * 0.3;
    if (s > bs) { bs = s; best = i; }
  }
  if (best < 0) return false;
  g.tiles[best].owner = c.owner;
  g.tiles[best].city = c.id;
  return true;
}

export function findSpawn(g: Game, c: City, d: UnitDef): number {
  const mil = d.cls !== 'civ';
  const free = (i: number) => !g.units.some((u) => u.at === i && (u.owner !== c.owner || isMil(u) === mil));
  if (free(c.at)) return c.at;
  for (const n of nbOf(g)[c.at]) {
    if (n < 0 || !TERRAIN[g.tiles[n].t].pass) continue;
    const oc = cityAt(g, n);
    if (oc && oc.owner !== c.owner) continue;
    if (free(n)) return n;
  }
  return -1;
}

function completeItem(g: Game, c: City, it: BuildItem): boolean {
  const p = g.players[c.owner];
  if (it.kind === 'unit') {
    const d = UNITS[it.id];
    if (it.id === 'settler' && c.pop < 2) return false;
    const at = findSpawn(g, c, d);
    if (at < 0) return false;
    if (it.id === 'settler') { c.pop--; assignTiles(g, c); }
    const u = addUnit(g, c.owner, it.id, at);
    if (isMil(u) && c.blds.includes('barracks')) addXp(u, BUILDINGS.barracks.xp || 15);
    notify(g, p.id, `${c.name}: обучен юнит «${d.name}»`, 'city', at);
    return true;
  }
  const B = BUILDINGS[it.id];
  if (B.project) {
    g.winner = { pid: p.id, type: 'science' };
    c.blds.push(it.id);
    for (const q of g.players) if (q.human) notify(g, q.id, `${p.name} запускает «${B.name}»!`, q.id === p.id ? 'good' : 'bad');
    return true;
  }
  c.blds.push(it.id);
  if (it.id === 'walls') c.hp += 100;
  if (B.wonder) {
    g.wonders[it.id] = c.id;
    for (const q of g.players) if (q.human) notify(g, q.id, q.id === p.id ? `Возведено чудо света: ${B.name}!` : `${p.name} возводит чудо света «${B.name}»`, q.id === p.id ? 'good' : 'info', c.at);
    if (it.id === 'greatlib') {
      const av = availableTechs(p);
      if (av.length) grantTech(g, p, av[rint(g, av.length)]);
    }
    if (it.id === 'terracotta') for (const u of g.units) if (u.owner === p.id && isMil(u)) u.lvl = Math.min(4, u.lvl + 1);
  } else notify(g, p.id, `${c.name}: построено «${B.name}»`, 'city', c.at);
  return true;
}

function processProduction(g: Game, c: City, prod: number) {
  const p = g.players[c.owner];
  const m = mods(g, c.owner);
  while (c.queue.length && !canBuild(g, c, c.queue[0]).ok) {
    const it = c.queue.shift()!;
    if (!(it.kind === 'unit' && it.id === 'settler')) notify(g, p.id, `${c.name}: «${itemName(it)}» больше нельзя построить`, 'bad', c.at);
    else { c.queue.unshift(it); break; }
  }
  const it = c.queue[0];
  if (!it) {
    c.prod = Math.min(c.prod + prod, 60 * (p.era + 1));
    return;
  }
  let eff = prod;
  if (it.kind === 'bld') {
    const B = BUILDINGS[it.id];
    if (B.wonder || B.project) eff *= 1 + m.wonderProdPct / 100;
    else eff *= 1 + m.bldProdPct / 100;
  }
  c.prod += Math.round(eff);
  const cost = itemCost(g, c.owner, it);
  if (c.prod >= cost && completeItem(g, c, it)) {
    c.prod -= cost;
    c.queue.shift();
  }
}

function cityBombard(g: Game, c: City) {
  const targets = g.units.filter((u) => isMil(u) && atWar(g, c.owner, u.owner) && dist(g, u.at, c.at) <= (c.blds.includes('walls') ? 2 : 1));
  if (!targets.length) return;
  targets.sort((a, b) => a.hp - b.hp);
  const t = targets[0];
  const a = cityStrength(g, c).total * 0.6;
  const dmg = Math.round(damage(a / defenseStrength(g, t, t).total) * (0.85 + rnd(g) * 0.3));
  t.hp -= dmg;
  fx(g, t.at, `−${dmg}`, '#ff6b5a');
  const name = UNITS[t.type].name;
  if (t.hp <= 0) {
    removeUnit(g, t);
    g.players[t.owner].losses++;
    notify(g, c.owner, `${c.name} уничтожил вражеский отряд «${name}»`, 'good', t.at);
    notify(g, t.owner, `Ваш отряд «${name}» погиб под стенами г. ${c.name}`, 'bad', t.at);
  } else {
    notify(g, t.owner, `Город ${c.name} обстрелял ваш отряд «${name}» (−${dmg})`, 'bad', t.at);
  }
}

function processCity(g: Game, c: City) {
  const p = g.players[c.owner];
  const m = mods(g, c.owner);
  assignTiles(g, c);
  const y = cityYields(g, c);
  c.food += y.surplus;
  const need = growthNeed(g, c.pop);
  if (c.food >= need) {
    c.pop++;
    c.food -= need;
    if (c.pop % 3 === 0 || c.pop <= 3) notify(g, p.id, `${c.name} вырос до ${c.pop}`, 'city', c.at);
    assignTiles(g, c);
  } else if (c.food < 0) {
    if (c.pop > 1) { c.pop--; notify(g, p.id, `${c.name}: голод! Население сократилось`, 'bad', c.at); assignTiles(g, c); }
    c.food = 0;
  }
  c.cult += y.cult;
  const bn = borderNeed(g, c.claims);
  if (c.cult >= bn) {
    if (claimNext(g, c)) { c.cult -= bn; c.claims++; } else c.cult = bn;
  }
  for (const i of c.worked) {
    const t = g.tiles[i];
    if (t.imp) continue;
    const imp = improvementFor(t);
    if (!imp || !hasTech(p, IMPROVEMENTS[imp].tech)) continue;
    t.dev += 1 + m.devBonus;
    if (t.dev >= devNeed(g)) { t.imp = imp; t.dev = 0; }
  }
  processProduction(g, c, y.prod);
  const max = cityMaxHp(c);
  if (c.hp < max) c.hp = Math.min(max, c.hp + (c.hit === g.turn ? 8 : 20));
  cityBombard(g, c);
}

// ───────── Исследования ─────────
export function setResearch(g: Game, p: Player, target: string) {
  const path = researchPath(p, target);
  if (!path.length) return;
  p.rq = path.slice(1);
  p.cur = path[0];
  if (p.bank) { p.prog[p.cur] = (p.prog[p.cur] || 0) + p.bank; p.bank = 0; }
}

export function grantTech(g: Game, p: Player, id: string) {
  if (p.techs.includes(id)) return;
  p.techs.push(id);
  delete p.prog[id];
  if (p.cur === id) p.cur = null;
  p.rq = p.rq.filter((t) => t !== id);
  notify(g, p.id, `Открыто: ${TECHS[id].name}`, 'tech');
  const era = TECHS[id].era;
  if (era > p.era) {
    p.era = era;
    const opts = CHARTER_IDS.filter((c) => !p.charters.includes(c));
    const pick: string[] = [];
    while (pick.length < 3 && opts.length) pick.push(opts.splice(rint(g, opts.length), 1)[0]);
    if (p.human) p.pending.push({ kind: 'charter', options: pick, era });
    else {
      const w = (id: string) => ({ war: p.pers.aggr, sci: p.pers.sci, exp: p.pers.exp, eco: 0.5 })[CHARTERS[id].ai] + rnd(g) * 0.3;
      pick.sort((a, b) => w(b) - w(a));
      if (pick[0]) p.charters.push(pick[0]);
    }
  }
}

function processResearch(g: Game, p: Player, sci: number) {
  if (!p.cur && p.rq.length) p.cur = p.rq.shift()!;
  if (!p.cur) { p.bank += sci; return; }
  p.prog[p.cur] = (p.prog[p.cur] || 0) + sci + p.bank;
  p.bank = 0;
  const cost = techCost(g, p, p.cur);
  if (p.prog[p.cur] >= cost) {
    const over = p.prog[p.cur] - cost;
    const done = p.cur;
    grantTech(g, p, done);
    p.cur = null;
    while (p.rq.length && !p.cur) {
      const nx = p.rq.shift()!;
      if (!p.techs.includes(nx)) p.cur = nx;
    }
    if (p.cur) p.prog[p.cur] = (p.prog[p.cur] || 0) + over;
    else p.bank = over;
  }
}

// ───────── Бой ─────────
export interface Prediction {
  ranged: boolean; a: Breakdown; d: Breakdown; toDef: number; toAtt: number; defHp: number; defMax: number;
  attHp: number; name: string; city?: City; unit?: Unit; civOnly: boolean; verdict: string; tone: 'good' | 'even' | 'bad';
}

export function targetAt(g: Game, u: Unit, i: number): { city?: City; unit?: Unit; civ?: Unit } | null {
  const city = cityAt(g, i);
  if (city && city.owner !== u.owner) return { city };
  const m = milAt(g, i);
  if (m && m.owner !== u.owner) return { unit: m };
  const c = civAt(g, i);
  if (c && c.owner !== u.owner) return { civ: c };
  return null;
}
export function ownerAt(g: Game, i: number): number {
  const city = cityAt(g, i);
  if (city) return city.owner;
  const u = g.units.find((x) => x.at === i);
  return u ? u.owner : -1;
}

export function predict(g: Game, u: Unit, i: number): Prediction | null {
  const tg = targetAt(g, u, i);
  if (!tg) return null;
  const d = UNITS[u.type];
  const ranged = !!d.rs;
  if (tg.civ) {
    return { ranged, a: attackStrength(g, u, i, ranged), d: { base: 0, mods: [], total: 0 }, toDef: 100, toAtt: 0, defHp: 100, defMax: 100,
      attHp: u.hp, name: UNITS[tg.civ.type].name, unit: tg.civ, civOnly: true, verdict: 'Захват без боя', tone: 'good' };
  }
  const a = attackStrength(g, u, i, ranged);
  let dB: Breakdown, defHp: number, defMax: number, name: string;
  if (tg.city) { dB = cityStrength(g, tg.city); defHp = tg.city.hp; defMax = cityMaxHp(tg.city); name = `г. ${tg.city.name}`; }
  else { dB = defenseStrength(g, tg.unit!, u); defHp = tg.unit!.hp; defMax = 100; name = UNITS[tg.unit!.type].name; }
  const r = a.total / dB.total;
  let toDef = Math.round(damage(r));
  const toAtt = ranged ? 0 : Math.round(damage(1 / r));
  if (tg.city && ranged) toDef = Math.min(toDef, Math.max(0, defHp - 1));
  let verdict = 'Равный бой', tone: Prediction['tone'] = 'even';
  if (toAtt >= u.hp) { verdict = 'Отряд погибнет'; tone = 'bad'; }
  else if (toDef >= defHp) { verdict = tg.city ? 'Город будет взят' : 'Враг будет уничтожен'; tone = 'good'; }
  else if (toDef - toAtt > 12) { verdict = 'Преимущество'; tone = 'good'; }
  else if (toAtt - toDef > 12) { verdict = 'Тяжёлые потери'; tone = 'bad'; }
  return { ranged, a, d: dB, toDef, toAtt, defHp, defMax, attHp: u.hp, name, city: tg.city, unit: tg.unit, civOnly: false, verdict, tone };
}

export function canAttackFrom(g: Game, u: Unit, from: number, i: number): boolean {
  const d = UNITS[u.type];
  if (d.cls === 'civ' || d.s <= 0 && !d.rs) return false;
  if (!targetAt(g, u, i)) return false;
  if (!atWar(g, u.owner, ownerAt(g, i))) return false;
  if (d.rs) return dist(g, from, i) <= (d.range || 1);
  return dist(g, from, i) === 1 && TERRAIN[g.tiles[i].t].pass;
}

export interface AttackResult { killed: boolean; died: boolean; captured: boolean; toDef: number; toAtt: number }

export function attack(g: Game, u: Unit, i: number): AttackResult | null {
  const pr = predict(g, u, i);
  if (!pr || u.mv <= 0) return null;
  const att = g.players[u.owner];
  const ma = mods(g, u.owner);
  const res: AttackResult = { killed: false, died: false, captured: false, toDef: 0, toAtt: 0 };
  u.fort = 0; u.acted = true; u.sleep = false;
  if (pr.civOnly && pr.unit) {
    const victim = pr.unit;
    removeUnit(g, victim);
    notify(g, victim.owner, `Отряд «${UNITS[victim.type].name}» захвачен врагом`, 'bad', i);
    notify(g, u.owner, `Отряд «${UNITS[victim.type].name}» рассеян`, 'good', i);
    if (!UNITS[u.type].rs) { u.at = i; }
    u.mv = 0;
    res.killed = true;
    refreshVisibility(g, u.owner);
    return res;
  }
  const rv = () => 0.8 + rnd(g) * 0.4;
  const toDef = Math.max(1, Math.round(pr.toDef * rv()));
  const toAtt = pr.ranged ? 0 : Math.round(pr.toAtt * rv());
  res.toDef = toDef; res.toAtt = toAtt;
  u.mv = 0;
  addXp(u, pr.ranged ? 3 : 5);
  if (pr.city) {
    const c = pr.city;
    c.hp = Math.max(pr.ranged ? 1 : 0, c.hp - toDef);
    c.hit = g.turn;
    fx(g, i, `−${toDef}`, '#ff6b5a');
    if (toAtt) { u.hp -= toAtt; fx(g, u.at, `−${toAtt}`, '#ff6b5a'); }
    if (u.hp <= 0) { res.died = true; killUnit(g, u, c.owner); }
    else if (c.hp <= 0 && !pr.ranged && UNITS[u.type].cls !== 'siege') {
      captureCity(g, c, u);
      res.captured = true;
    } else notify(g, c.owner, `Город ${c.name} атакован (−${toDef})`, 'war', i);
  } else if (pr.unit) {
    const dU = pr.unit;
    dU.hp -= toDef;
    addXp(dU, 4);
    fx(g, i, `−${toDef}`, '#ff6b5a');
    if (toAtt) { u.hp -= toAtt; fx(g, u.at, `−${toAtt}`, '#ff6b5a'); }
    if (dU.hp <= 0) {
      res.killed = true;
      killUnit(g, dU, u.owner);
      if (ma.goldOnKill) { att.gold += ma.goldOnKill; fx(g, u.at, `+${ma.goldOnKill} зол.`, '#f0c24b'); }
      if (ma.healOnKill && u.hp > 0) u.hp = Math.min(100, u.hp + ma.healOnKill);
    } else notify(g, dU.owner, `Отряд «${UNITS[dU.type].name}» атакован (−${toDef})`, 'war', i);
    if (u.hp <= 0) { res.died = true; killUnit(g, u, dU.owner); }
    else if (res.killed && !pr.ranged && UNITS[u.type].cls !== 'siege') {
      const civ = civAt(g, i);
      if (civ && civ.owner !== u.owner) removeUnit(g, civ);
      if (!g.units.some((x) => x.at === i)) u.at = i;
    }
  }
  refreshVisibility(g, u.owner);
  return res;
}

function killUnit(g: Game, u: Unit, by: number) {
  removeUnit(g, u);
  g.players[u.owner].losses++;
  if (by >= 0) g.players[by].kills++;
  notify(g, u.owner, `Потерян отряд «${UNITS[u.type].name}»`, 'bad', u.at);
  if (by >= 0) notify(g, by, `Вражеский отряд «${UNITS[u.type].name}» уничтожен`, 'good', u.at);
}

export function captureCity(g: Game, c: City, u: Unit) {
  const old = c.owner;
  const now = u.owner;
  for (const x of g.units.filter((x) => x.at === c.at && x.owner !== now)) removeUnit(g, x);
  u.at = c.at;
  c.owner = now;
  c.pop = Math.max(1, c.pop - 1);
  c.queue = [];
  c.prod = 0;
  c.hp = Math.round(cityMaxHp(c) * 0.3);
  c.focus = 'bal';
  const wasCap = c.capital;
  c.capital = false;
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i].city === c.id) g.tiles[i].owner = now;
  if (!playerCities(g, now).some((x) => x.capital && x.id !== c.id) && playerCities(g, now).length === 1) c.capital = true;
  if (wasCap) {
    const rest = playerCities(g, old).sort((a, b) => b.pop - a.pop);
    if (rest[0]) rest[0].capital = true;
  }
  assignTiles(g, c);
  notify(g, now, `Город ${c.name} захвачен!`, 'good', c.at);
  notify(g, old, `Мы потеряли город ${c.name}!`, 'bad', c.at);
  checkElimination(g, old);
  refreshVisibility(g, now);
}

export function checkElimination(g: Game, pid: number) {
  const p = g.players[pid];
  if (!p.alive) return;
  const cities = playerCities(g, pid).length;
  const settlers = g.units.some((u) => u.owner === pid && u.type === 'settler');
  if (cities === 0 && (!settlers || g.turn > 5)) {
    p.alive = false;
    for (const u of g.units.filter((x) => x.owner === pid)) removeUnit(g, u);
    for (const q of g.players) {
      q.rel[pid].war = false;
      if (q.human) notify(g, q.id, `Держава «${p.name}» пала`, q.id === pid ? 'bad' : 'war');
    }
  }
}

// ───────── Конец хода игрока ─────────
export function processPlayer(g: Game, p: Player) {
  const m = mods(g, p.id);
  for (const c of playerCities(g, p.id)) processCity(g, c);
  // наука
  const sci = playerCities(g, p.id).reduce((s, c) => s + cityYields(g, c).sci, 0);
  processResearch(g, p, sci);
  // золото
  const inc = goldIncome(g, p.id);
  p.gold += inc.net;
  if (p.gold < 0) {
    const mil = g.units.filter((u) => u.owner === p.id && isMil(u)).sort((a, b) => UNITS[a.type].cost - UNITS[b.type].cost);
    if (mil[0]) {
      notify(g, p.id, `Казна пуста: распущен отряд «${UNITS[mil[0].type].name}»`, 'bad', mil[0].at);
      removeUnit(g, mil[0]);
    }
    p.gold = 0;
  }
  // юниты: лечение и восстановление ходов
  for (const u of g.units) {
    if (u.owner !== p.id) continue;
    if (!u.acted && u.hp < 100) {
      const t = g.tiles[u.at];
      const city = cityAt(g, u.at);
      let heal = 10 + m.heal;
      if (t.owner === p.id) heal += 5;
      if (city && city.owner === p.id) heal += 15;
      u.hp = Math.min(100, u.hp + heal);
    }
    u.mv = unitMaxMoves(g, u);
    u.acted = false;
  }
  refreshVisibility(g, p.id);
}

/** Мгновенная покупка текущего проекта города за золото */
export function buyItem(g: Game, c: City): boolean {
  const it = c.queue[0];
  if (!it || !canBuy(it) || !canBuild(g, c, it).ok) return false;
  const p = g.players[c.owner];
  const cost = buyCost(g, c, it);
  if (p.gold < cost) return false;
  const saved = c.prod;
  c.prod = itemCost(g, c.owner, it);
  const n0 = g.units.length;
  if (!completeItem(g, c, it)) { c.prod = saved; return false; }
  p.gold -= cost;
  c.prod = 0;
  c.queue.shift();
  if (g.units.length > n0) g.units[g.units.length - 1].mv = 0;
  return true;
}

export function unitNeedsOrders(u: Unit): boolean {
  return u.mv > 0 && !u.fort && !u.sleep && !u.path;
}

export { unitById, cityById };
