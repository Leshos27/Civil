// ИИ соперников: экспансия, экономика, армия, война и мир.
// Принцип: ИИ играет по тем же правилам; сложность — прозрачные бонусы к доходам.
import { BUILDINGS, CHARTERS, TECHS, TERRAIN, UNITS, UnitDef } from './data';
import { rnd } from './rng';
import {
  DIFF, atWar, availableTechs, availableUnits, buyCost, canBuild, canBuy, cityAt, dist, isMil, itemCost, militaryPower,
  nbOf, playerCities, radius, speedOf, techCost, tileYield, unitMaxMoves,
} from './rules';
import type { BuildItem, City, Game, Player, Unit } from './types';
import {
  Paths, attack, canAttackFrom, canFoundAt, computePaths, declareWar, foundCity, grantTech, makePeace, moveAlong, pathTo,
  predict, setResearch,
} from './world';
import { resolveEvent } from './events';

export function runAI(g: Game, p: Player) {
  // отложенные решения
  for (const ch of p.pending) {
    if (ch.kind === 'event') resolveEvent(g, p, ch, rnd(g) < 0.6 ? 0 : 1);
  }
  p.pending = [];
  if (!p.cur && !p.rq.length) aiResearch(g, p);
  aiDiplomacy(g, p);
  assignRoles(g, p);
  for (const u of g.units.filter((x) => x.owner === p.id)) {
    if (!g.units.includes(u)) continue;
    try { aiUnit(g, p, u); } catch (e) { u.path = null; }
  }
  for (const c of playerCities(g, p.id)) {
    if (!c.queue.length) {
      const it = chooseBuild(g, p, c);
      if (it) c.queue.push(it);
    }
  }
  aiBuy(g, p);
}

// ───────── Наука ─────────
function aiResearch(g: Game, p: Player) {
  const av = availableTechs(p);
  if (!av.length) return;
  let best = av[0], bs = -1;
  for (const t of av) {
    let w = 1;
    for (const u in UNITS) if (UNITS[u].tech === t && !UNITS[u].unique) w += 0.6 + p.pers.aggr;
    for (const b in BUILDINGS) if (BUILDINGS[b].tech === t) w += BUILDINGS[b].s || BUILDINGS[b].sPct ? 0.6 + p.pers.sci : 0.5;
    if (t === 'rocketry' || t === 'computers') w += 2;
    const s = (w / techCost(g, p, t)) * (0.8 + rnd(g) * 0.4);
    if (s > bs) { bs = s; best = t; }
  }
  setResearch(g, p, best);
}

// ───────── Дипломатия ─────────
function aiDiplomacy(g: Game, p: Player) {
  const myPow = militaryPower(g, p.id);
  const warMin = Math.round(35 * speedOf(g));
  const wars = g.players.filter((q) => q.alive && atWar(g, p.id, q.id)).length;
  for (const q of g.players) {
    if (q.id === p.id || !q.alive || !p.rel[q.id].met) continue;
    const r = p.rel[q.id];
    const theirPow = militaryPower(g, q.id);
    if (r.war) {
      const long = g.turn - r.since;
      if (long > 10 && (myPow < theirPow * 0.85 || rnd(g) < 0.04)) {
        if (q.human) {
          if (g.turn - r.offered > 8) { r.offered = g.turn; q.pending.push({ kind: 'peace', from: p.id }); }
        } else if (militaryPower(g, q.id) < militaryPower(g, p.id) * 1.6) makePeace(g, p.id, q.id);
      }
    } else {
      if (g.turn < warMin || wars > 0) continue;
      const myCap = playerCities(g, p.id).find((c) => c.capital);
      const theirCities = playerCities(g, q.id);
      if (!myCap || !theirCities.length) continue;
      const near = Math.min(...theirCities.map((c) => dist(g, c.at, myCap.at)));
      if (near > 22) continue;
      const need = 1.5 - p.pers.aggr * 0.5;
      const chance = (0.015 + p.pers.aggr * 0.035) * (q.human ? DIFF[g.settings.difficulty].war : 1);
      if (myPow > theirPow * need && rnd(g) < chance) declareWar(g, p.id, q.id);
    }
    r.grudge = Math.max(0, r.grudge - 0.5);
  }
}

// ───────── Роли ─────────
function assignRoles(g: Game, p: Player) {
  const cities = playerCities(g, p.id);
  const garrisoned = new Set<number>();
  for (const u of g.units) {
    if (u.owner !== p.id || !isMil(u) || UNITS[u.type].cls === 'recon') continue;
    const c = cityAt(g, u.at);
    if (u.role === 'garrison' && c && c.owner === p.id && !garrisoned.has(c.id)) { garrisoned.add(c.id); continue; }
    if (u.role === 'garrison') u.role = 'army';
  }
  for (const c of cities) {
    if (garrisoned.has(c.id)) continue;
    const here = g.units.find((u) => u.at === c.at && u.owner === p.id && isMil(u) && UNITS[u.type].cls !== 'recon');
    if (here) { here.role = 'garrison'; garrisoned.add(c.id); continue; }
    // ближайший свободный юнит идёт в город
    const free = g.units
      .filter((u) => u.owner === p.id && isMil(u) && u.role !== 'garrison' && UNITS[u.type].cls !== 'recon')
      .sort((a, b) => dist(g, a.at, c.at) - dist(g, b.at, c.at))[0];
    if (free && dist(g, free.at, c.at) < 8) { free.role = 'garrison'; free.target = c.at; garrisoned.add(c.id); }
  }
}

function stepToward(g: Game, u: Unit, dest: number, P?: Paths, stopAdjacent = false): boolean {
  P = P || computePaths(g, u, 25);
  let best = -1;
  if (stopAdjacent) {
    let bt = 1e9;
    for (const n of nbOf(g)[dest]) {
      if (n < 0 || P.turns[n] < 0 || P.noStop[n]) continue;
      const score = P.turns[n] * 10 - P.left[n];
      if (n === u.at) return false;
      if (score < bt) { bt = score; best = n; }
    }
  } else if (P.turns[dest] >= 0 && !P.noStop[dest]) best = dest;
  if (best < 0) {
    // ближайшая достижимая клетка к цели
    let bd = 1e9;
    for (const i of radius(g, dest, 4)) {
      if (P.turns[i] < 0 || P.noStop[i] || i === u.at) continue;
      const d = dist(g, i, dest) * 3 + P.turns[i];
      if (d < bd) { bd = d; best = i; }
    }
  }
  if (best < 0) return false;
  const path = pathTo(P, best);
  if (!path) return false;
  moveAlong(g, u, path);
  return true;
}

// ───────── Юниты ─────────
function aiUnit(g: Game, p: Player, u: Unit) {
  const d = UNITS[u.type];
  if (u.type === 'settler') return aiSettler(g, p, u);
  if (d.cls === 'recon') return aiScout(g, p, u);
  if (u.mv <= 0) return;

  // 1. атака, если выгодно
  if (tryAttack(g, p, u)) return;

  const city = cityAt(g, u.at);
  // 2. гарнизон стоит на месте
  if (u.role === 'garrison') {
    if (city && city.owner === p.id) { u.fort = 1; return; }
    if (u.target !== undefined) { stepToward(g, u, u.target); if (u.mv > 0 && tryAttack(g, p, u)) return; return; }
  }
  // 3. лечение
  if (u.hp < 45) {
    const home = playerCities(g, p.id).sort((a, b) => dist(g, a.at, u.at) - dist(g, b.at, u.at))[0];
    if (home && dist(g, home.at, u.at) > 1 && dist(g, home.at, u.at) < 6) stepToward(g, u, home.at, undefined, true);
    u.fort = u.mv > 0 ? 1 : u.fort;
    return;
  }
  // 4. война: идём к ближайшему вражескому городу
  const enemies = g.players.filter((q) => q.alive && atWar(g, p.id, q.id)).map((q) => q.id);
  if (enemies.length) {
    let target: City | undefined, td = 1e9;
    for (const c of g.cities) {
      if (!enemies.includes(c.owner)) continue;
      const dd = dist(g, c.at, u.at) + c.hp / 40;
      if (dd < td) { td = dd; target = c; }
    }
    // также вражеские отряды рядом с нашими городами
    const threat = g.units.find((e) => enemies.includes(e.owner) && isMil(e) && playerCities(g, p.id).some((c) => dist(g, c.at, e.at) <= 3));
    const dest = threat && dist(g, threat.at, u.at) < 8 ? threat.at : target?.at;
    if (dest !== undefined) {
      const ranged = !!d.rs;
      if (ranged && dist(g, u.at, dest) <= (d.range || 2)) { u.fort = 1; return; }
      stepToward(g, u, dest, undefined, true);
      if (u.mv > 0) tryAttack(g, p, u);
      return;
    }
  }
  // 5. мирное время: держаться у своих городов
  if (city && city.owner === p.id) {
    const others = g.units.filter((x) => x.at === u.at && x !== u);
    if (!others.length) { u.fort = 1; return; }
  }
  if (g.tiles[u.at].owner === p.id && !u.path) { u.fort = 1; return; }
  const home = playerCities(g, p.id).sort((a, b) => dist(g, a.at, u.at) - dist(g, b.at, u.at))[0];
  if (home) {
    const spots = radius(g, home.at, 2).filter((i) => TERRAIN[g.tiles[i].t].pass && !g.units.some((x) => x.at === i) && !cityAt(g, i));
    if (spots.length) stepToward(g, u, spots[Math.floor(rnd(g) * spots.length)]);
    u.fort = 1;
  }
}

function tryAttack(g: Game, p: Player, u: Unit): boolean {
  const d = UNITS[u.type];
  if (u.mv <= 0) return false;
  const reach = d.rs ? d.range || 2 : unitMaxMoves(g, u) + 1;
  let best: { tile: number; from: number; score: number } | null = null;
  const P = d.rs ? null : computePaths(g, u, 1);
  for (const i of radius(g, u.at, reach)) {
    const pr = predict(g, u, i);
    if (!pr) continue;
    const owner = pr.city ? pr.city.owner : pr.unit!.owner;
    if (!atWar(g, p.id, owner)) continue;
    let from = u.at;
    if (!d.rs) {
      if (dist(g, u.at, i) !== 1) {
        if (u.role === 'garrison') continue;
        let bl = -1;
        from = -1;
        for (const n of nbOf(g)[i]) {
          if (n < 0 || !P || P.turns[n] !== 0 || P.left[n] <= 0 || P.noStop[n]) continue;
          if (P.left[n] > bl) { bl = P.left[n]; from = n; }
        }
        if (from < 0) continue;
      }
    } else if (!canAttackFrom(g, u, u.at, i)) continue;
    let score = pr.toDef - pr.toAtt * 0.8;
    if (pr.civOnly) score = 40;
    if (pr.toDef >= pr.defHp) score += pr.city ? 200 : 40;
    if (pr.toAtt >= u.hp - 5) score -= 200;
    if (pr.city && !d.rs && pr.toAtt > 25 && pr.toDef < pr.defHp) score -= 15;
    if (u.role === 'garrison' && !d.rs && pr.toDef < pr.defHp) score -= 100;
    if (score > 4 && (!best || score > best.score)) best = { tile: i, from, score };
  }
  if (!best) return false;
  if (best.from !== u.at && P) {
    const path = pathTo(P, best.from);
    if (!path) return false;
    moveAlong(g, u, path);
    if (u.at !== best.from || u.mv <= 0) return true;
  }
  if (!canAttackFrom(g, u, u.at, best.tile)) return false;
  attack(g, u, best.tile);
  return true;
}

function siteValue(g: Game, p: Player, i: number): number {
  if (!canFoundAt(g, i).ok) return -1;
  const t = g.tiles[i];
  if (t.owner !== -1 && t.owner !== p.id) return -1;
  let s = 0, water = 0;
  for (const n of radius(g, i, 2)) {
    const tt = g.tiles[n];
    if (tt.owner !== -1 && tt.owner !== p.id) { s -= 1; continue; }
    const y = tileYield(g, n, p);
    s += y.f * 1.3 + y.p * 1.1 + y.g * 0.6 + (tt.r ? 1.5 : 0);
    if (TERRAIN[tt.t].water) water++;
  }
  if (water > 0 && water < 8) s += 3;
  if (water >= 10) s -= 6;
  if (t.t === 'hills') s += 2;
  if (t.t === 'desert' || t.t === 'snow' || t.t === 'tundra') s -= 4;
  return s;
}

function aiSettler(g: Game, p: Player, u: Unit) {
  const cities = playerCities(g, p.id);
  if (!cities.length) { // первый город — сразу
    if (canFoundAt(g, u.at).ok) { foundCity(g, u); return; }
  }
  if (u.target !== undefined && u.at === u.target && canFoundAt(g, u.at).ok) { foundCity(g, u); return; }
  const P = computePaths(g, u, 12);
  if (u.target === undefined || siteValue(g, p, u.target) < 0 || P.turns[u.target] < 0) {
    let best = -1, bs = 0;
    for (let i = 0; i < g.tiles.length; i++) {
      if (P.turns[i] < 0 || P.noStop[i] && i !== u.at) continue;
      const v = siteValue(g, p, i);
      if (v <= 0) continue;
      const near = cities.length ? Math.min(...cities.map((c) => dist(g, c.at, i))) : 0;
      if (cities.length && near > 8) continue;
      const sc = v - P.turns[i] * 2.5 - (near > 5 ? (near - 5) * 2 : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) {
      p.noSites = true;
      if (canFoundAt(g, u.at).ok && g.tiles[u.at].owner <= p.id) { foundCity(g, u); return; }
      return;
    }
    u.target = best;
  }
  if (u.at === u.target) { foundCity(g, u); return; }
  const path = pathTo(P, u.target);
  if (path) moveAlong(g, u, path);
  if (u.at === u.target && canFoundAt(g, u.at).ok && u.mv >= 0) foundCity(g, u);
}

function aiScout(g: Game, p: Player, u: Unit) {
  if (u.mv <= 0) return;
  const P = computePaths(g, u, 6);
  let best = -1, bs = -1e9;
  for (let i = 0; i < g.tiles.length; i++) {
    if (P.turns[i] < 0 || P.noStop[i] || i === u.at) continue;
    let unexplored = 0;
    for (const n of radius(g, i, 2)) if (!p.explored[n]) unexplored++;
    if (!unexplored) continue;
    const sc = unexplored * 2 - P.turns[i] * 6 + rnd(g);
    if (sc > bs) { bs = sc; best = i; }
  }
  if (best < 0) { u.fort = 1; return; }
  const path = pathTo(P, best);
  if (path) moveAlong(g, u, path);
}

// ───────── Производство ─────────
function bestUnit(g: Game, p: Player, classes: string[]): UnitDef | undefined {
  const av = availableUnits(g, p).filter((d) => classes.includes(d.cls));
  av.sort((a, b) => Math.max(b.s, b.rs || 0) - Math.max(a.s, a.rs || 0));
  return av[0];
}

function chooseBuild(g: Game, p: Player, c: City): BuildItem | null {
  const cities = playerCities(g, p.id);
  const myUnits = g.units.filter((u) => u.owner === p.id);
  const mil = myUnits.filter((u) => isMil(u) && UNITS[u.type].cls !== 'recon').length;
  const settlers = myUnits.filter((u) => u.type === 'settler').length + cities.filter((x) => x.queue.some((q) => q.id === 'settler')).length;
  const atWarNow = g.players.some((q) => q.alive && atWar(g, p.id, q.id));
  const threat = g.units.some((e) => e.owner !== p.id && isMil(e) && atWar(g, p.id, e.owner) && dist(g, e.at, c.at) <= 4);
  const garrison = g.units.some((u) => u.at === c.at && u.owner === p.id && isMil(u));
  const sizeTarget = { small: 5, standard: 7, large: 9 }[g.settings.size];
  const targetCities = Math.round(sizeTarget * (0.7 + p.pers.exp * 0.6));
  const ok = (it: BuildItem) => canBuild(g, c, it).ok;
  const unitItem = (d?: UnitDef): BuildItem | null => (d ? { kind: 'unit', id: d.id } : null);

  if ((threat || !garrison) && mil < cities.length * 2 + 2) {
    const u = unitItem(bestUnit(g, p, ['melee', 'gun', 'armor']));
    if (u) return u;
  }
  if (atWarNow && mil < cities.length * 2 + 3) {
    const r = rnd(g);
    const cls = r < 0.45 ? ['melee', 'gun', 'armor'] : r < 0.7 ? ['ranged', 'siege'] : r < 0.85 ? ['mounted', 'armor'] : ['siege'];
    const u = unitItem(bestUnit(g, p, cls) || bestUnit(g, p, ['melee', 'gun']));
    if (u) return u;
  }
  if (!p.noSites && cities.length + settlers < targetCities && settlers < 2 && c.pop >= 2 && !threat) return { kind: 'unit', id: 'settler' };
  if (cities.length === 1 && myUnits.filter((u) => UNITS[u.type].cls === 'recon').length === 0 && g.turn < 10) return { kind: 'unit', id: 'scout' };
  if (mil < Math.ceil(cities.length * (1 + p.pers.aggr)) + 1) {
    const r = rnd(g);
    const u = unitItem(bestUnit(g, p, r < 0.6 ? ['melee', 'gun', 'armor'] : r < 0.85 ? ['ranged', 'siege'] : ['mounted']) || bestUnit(g, p, ['melee', 'gun']));
    if (u) return u;
  }
  if (ok({ kind: 'bld', id: 'horizon' }) && c.capital) return { kind: 'bld', id: 'horizon' };
  const order = ['monument', 'granary', 'library', 'walls', 'market', 'harbor', 'workshop', 'temple', 'barracks', 'university', 'bank', 'factory', 'powerplant', 'lab'];
  for (const b of order) {
    if (b === 'walls' && !atWarNow && p.pers.aggr > 0.3 && cities.length > 2) continue;
    if (b === 'barracks' && p.pers.aggr < 0.55) continue;
    if (ok({ kind: 'bld', id: b })) {
      // иногда — чудо вместо здания
      if (rnd(g) < 0.18) {
        const w = Object.values(BUILDINGS).find((B) => B.wonder && ok({ kind: 'bld', id: B.id }));
        if (w) return { kind: 'bld', id: w.id };
      }
      return { kind: 'bld', id: b };
    }
  }
  const w = Object.values(BUILDINGS).find((B) => B.wonder && ok({ kind: 'bld', id: B.id }));
  if (w && rnd(g) < 0.5) return { kind: 'bld', id: w.id };
  return unitItem(bestUnit(g, p, ['melee', 'gun', 'armor', 'mounted']));
}

function aiBuy(g: Game, p: Player) {
  if (p.gold < 120) return;
  const cities = playerCities(g, p.id);
  const threatened = cities.find((c) => g.units.some((e) => isMil(e) && atWar(g, p.id, e.owner) && dist(g, e.at, c.at) <= 3));
  const c = threatened || cities.sort((a, b) => b.pop - a.pop)[0];
  if (!c || !c.queue[0] || !canBuy(c.queue[0])) return;
  const cost = buyCost(g, c, c.queue[0]);
  if (cost <= p.gold - 40) {
    p.gold -= cost;
    c.prod = itemCost(g, p.id, c.queue[0]);
  }
}

/** Ответ ИИ на предложение мира от игрока — с понятной причиной отказа */
export function aiAcceptPeace(g: Game, ai: Player, other: number): { ok: boolean; why: string } {
  const r = ai.rel[other];
  const long = g.turn - r.since;
  if (long < 6) return { ok: false, why: `${ai.name}: «Война идёт всего ${long} х. — рано говорить о мире»` };
  const my = militaryPower(g, ai.id), their = militaryPower(g, other);
  if (my > their * 1.4 && ai.pers.aggr > 0.35) return { ok: false, why: `${ai.name}: «Наши армии сильнее. Мы продолжим»` };
  return { ok: true, why: '' };
}

export { CHARTERS, TECHS, grantTech };
