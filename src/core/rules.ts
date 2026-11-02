// Чистые расчёты правил: доходность, стоимость, доступность, сила юнитов.
import {
  BUILDINGS, CHARTERS, ERA_COST, FEATURES, IMPROVEMENTS, Mods, NATIONS, RESOURCES, TECHS, TECH_LIST, TERRAIN,
  UNITS, UnitDef, ZERO_MODS,
} from './data';
import { hexDist, inRadius, neighborsOf } from './hex';
import type { BuildItem, City, Game, Player, Tile, Unit } from './types';

export const SPEED = { blitz: 0.5, quick: 0.7, standard: 1 } as const;
export const SPEED_INFO = {
  blitz: { name: 'Блиц', limit: 110, hint: '≈ 30–40 минут' },
  quick: { name: 'Быстрая', limit: 160, hint: '≈ 1–1,5 часа' },
  standard: { name: 'Стандарт', limit: 250, hint: '≈ 3–4 часа' },
} as const;
export const MAPS = {
  small: { W: 40, H: 26, max: 4, name: 'Малая' },
  standard: { W: 52, H: 34, max: 6, name: 'Средняя' },
  large: { W: 64, H: 42, max: 8, name: 'Большая' },
} as const;
export const DIFF = {
  easy: { name: 'Поселенец', ai: 0.75, extra: 0, war: 0.5 },
  normal: { name: 'Правитель', ai: 1, extra: 0, war: 1 },
  hard: { name: 'Император', ai: 1.25, extra: 1, war: 1.2 },
  deity: { name: 'Легенда', ai: 1.5, extra: 2, war: 1.4 },
} as const;

export const speedOf = (g: Game) => SPEED[g.settings.speed];
export const nbOf = (g: Game) => neighborsOf(g.W, g.H);
export const dist = (g: Game, a: number, b: number) => hexDist(a, b, g.W);
export const radius = (g: Game, i: number, r: number) => inRadius(i, r, g.W, g.H);

export function hasTech(p: Player, t: string | undefined): boolean {
  return !t || p.techs.includes(t);
}

export function cityById(g: Game, id: number): City | undefined {
  return g.cities.find((c) => c.id === id);
}
export function cityAt(g: Game, i: number): City | undefined {
  return g.cities.find((c) => c.at === i);
}
export function unitById(g: Game, id: number): Unit | undefined {
  return g.units.find((u) => u.id === id);
}
export function unitsAt(g: Game, i: number): Unit[] {
  return g.units.filter((u) => u.at === i);
}
export const isMil = (u: Unit) => UNITS[u.type].cls !== 'civ';
export function milAt(g: Game, i: number): Unit | undefined {
  return g.units.find((u) => u.at === i && isMil(u));
}
export function civAt(g: Game, i: number): Unit | undefined {
  return g.units.find((u) => u.at === i && !isMil(u));
}
export function playerCities(g: Game, pid: number): City[] {
  return g.cities.filter((c) => c.owner === pid);
}
export function playerUnits(g: Game, pid: number): Unit[] {
  return g.units.filter((u) => u.owner === pid);
}
export function atWar(g: Game, a: number, b: number): boolean {
  return a !== b && g.players[a].rel[b].war;
}

// ───────── Модификаторы ─────────
function addMods(m: Mods, add: Partial<Mods>) {
  for (const k in add) (m as any)[k] += (add as any)[k];
}
export function mods(g: Game, pid: number): Mods {
  const p = g.players[pid];
  const m: Mods = { ...ZERO_MODS };
  addMods(m, NATIONS[p.nation].mods);
  for (const c of p.charters) addMods(m, CHARTERS[c].mods);
  if (!p.human) {
    const d = DIFF[g.settings.difficulty].ai - 1;
    m.prodPct += d * 100;
    m.sciPct += d * 100;
    m.goldPct += d * 100;
  }
  return m;
}

// ───────── Клетки ─────────
export interface Yield { f: number; p: number; g: number }

export function improvementFor(t: Tile): string | null {
  const T = TERRAIN[t.t];
  if (T.water) return t.r === 'fish' ? 'boats' : null;
  if (t.t === 'mountain' || t.t === 'snow') return null;
  if (t.r === 'cattle' || t.r === 'horses') return 'pasture';
  if (t.f === 'forest') return 'lumber';
  if (t.f === 'jungle') return t.r === 'gems' || t.r === 'spices' ? 'plantation' : null;
  if (t.t === 'hills') return 'mine';
  if (t.r === 'spices') return 'plantation';
  return 'farm';
}

export function tileYield(g: Game, i: number, p?: Player | null, m?: Mods): Yield {
  const t = g.tiles[i];
  const T = TERRAIN[t.t];
  const base = t.f ? FEATURES[t.f] : T;
  const y = { f: base.f, p: base.p, g: base.g };
  if (t.r) {
    const R = RESOURCES[t.r];
    y.f += R.f; y.p += R.p; y.g += R.g;
  }
  if (t.imp) {
    const I = IMPROVEMENTS[t.imp];
    y.f += I.f; y.p += I.p; y.g += I.g;
    if (p) {
      if ((t.imp === 'mine' || t.imp === 'lumber') && hasTech(p, 'steam')) y.p += 1;
      if (t.imp === 'farm' && hasTech(p, 'electricity')) y.f += 1;
    }
  }
  if (m && m.tundraProd && t.t === 'tundra') y.p += m.tundraProd;
  return y;
}

export function devNeed(g: Game): number {
  return Math.max(2, Math.round(5 * speedOf(g)));
}

// ───────── Города ─────────
export function growthNeed(g: Game, pop: number): number {
  return Math.floor((15 + 8 * (pop - 1) + Math.pow(pop - 1, 1.5)) * speedOf(g));
}
export function borderNeed(g: Game, claims: number): number {
  return Math.floor((10 + 7 * claims + Math.pow(claims, 1.6)) * speedOf(g));
}
export function cityMaxHp(c: City): number {
  return 200 + (c.blds.includes('walls') ? 100 : 0);
}
export function isCoastal(g: Game, i: number): boolean {
  return nbOf(g)[i].some((n) => n >= 0 && TERRAIN[g.tiles[n].t].water);
}

export interface CityYields {
  food: number; need: number; surplus: number; prod: number; gold: number; sci: number; cult: number; spec: number;
  lines: Record<'f' | 'p' | 'g' | 's' | 'c', string[]>;
}

const sgn = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(Math.round(n * 10) / 10);

export function cityYields(g: Game, c: City): CityYields {
  const p = g.players[c.owner];
  const m = mods(g, c.owner);
  const L: CityYields['lines'] = { f: [], p: [], g: [], s: [], c: [] };

  const cy = tileYield(g, c.at, p, m);
  cy.f = Math.max(cy.f, 2); cy.p = Math.max(cy.p, 1); cy.g = Math.max(cy.g, 1);
  const pal = c.capital ? 1 : 0; // Дворец: +1 производство, +1 золото, +2 науки
  cy.p += pal; cy.g += pal;
  const harbor = c.blds.includes('harbor');
  let tf = 0, tp = 0, tg = 0;
  for (const i of c.worked) {
    const y = tileYield(g, i, p, m);
    tf += y.f + (harbor && TERRAIN[g.tiles[i].t].water ? 1 : 0);
    tp += y.p; tg += y.g;
  }
  const spec = Math.max(0, c.pop - c.worked.length);

  let bf = 0, bp = 0, bg = 0, bs = 0, bc = 0, pPct = 0, gPct = 0, sPct = 0;
  for (const b of c.blds) {
    const B = BUILDINGS[b];
    bf += B.f || 0; bp += B.p || 0; bg += B.g || 0; bs += B.s || 0; bc += B.c || 0;
    pPct += B.pPct || 0; gPct += B.gPct || 0; sPct += B.sPct || 0;
  }
  let wf = 0, wp = 0, wg = 0, ws = 0, wc = 0;
  for (const w in g.wonders) {
    const B = BUILDINGS[w];
    if (!B.global) continue;
    const wcity = cityById(g, g.wonders[w]);
    if (!wcity || wcity.owner !== c.owner) continue;
    wf += B.global.f || 0; wp += B.global.p || 0; wg += B.global.g || 0; ws += B.global.s || 0; wc += B.global.c || 0;
  }

  // Еда
  const food = cy.f + tf + bf + wf + m.foodFlat;
  const need = c.pop * 2;
  L.f.push(`Центр города ${sgn(cy.f)}`, `Клетки ${sgn(tf)}`);
  if (pal) L.p.push('Дворец +1');
  if (bf) L.f.push(`Здания ${sgn(bf)}`);
  if (wf + m.foodFlat) L.f.push(`Чудеса и хартии ${sgn(wf + m.foodFlat)}`);
  L.f.push(`Жители едят ${sgn(-need)}`);

  // Производство
  const pBase = cy.p + tp + bp + wp;
  const pMul = pPct + m.prodPct;
  const prod = Math.max(1, Math.round(pBase * (1 + pMul / 100)));
  L.p.push(`Центр города ${sgn(cy.p)}`, `Клетки ${sgn(tp)}`);
  if (bp) L.p.push(`Здания ${sgn(bp)}`);
  if (wp) L.p.push(`Чудеса ${sgn(wp)}`);
  if (pMul) L.p.push(`Бонусы ${sgn(pMul)}%`);

  // Золото
  const gBase = cy.g + tg + bg + wg + m.goldFlat;
  const gMul = gPct + m.goldPct;
  const gold = Math.round(gBase * (1 + gMul / 100));
  L.g.push(`Центр и клетки ${sgn(cy.g + tg)}`);
  if (bg) L.g.push(`Здания ${sgn(bg)}`);
  if (wg + m.goldFlat) L.g.push(`Чудеса и хартии ${sgn(wg + m.goldFlat)}`);
  if (gMul) L.g.push(`Бонусы ${sgn(gMul)}%`);

  // Наука
  const sPop = Math.round(c.pop * 0.7);
  const sBase = 1 + pal * 2 + sPop + spec * 2 + bs + ws + m.sciFlat;
  const sMul = sPct + m.sciPct;
  const sci = Math.round(sBase * (1 + sMul / 100));
  L.s.push(`Город ${sgn(1)}`, `Жители ${sgn(sPop)}`);
  if (pal) L.s.push(`Дворец ${sgn(2)}`);
  if (spec) L.s.push(`Учёные (${spec}) ${sgn(spec * 2)}`);
  if (bs + ws + m.sciFlat) L.s.push(`Здания и бонусы ${sgn(bs + ws + m.sciFlat)}`);
  if (sMul) L.s.push(`Бонусы ${sgn(sMul)}%`);

  // Культура
  const cBase = 1 + bc + wc + m.cultFlat;
  const cult = Math.round(cBase * (1 + m.cultPct / 100));
  L.c.push(`Город ${sgn(1)}`);
  if (bc + wc + m.cultFlat) L.c.push(`Здания и бонусы ${sgn(bc + wc + m.cultFlat)}`);
  if (m.cultPct) L.c.push(`Бонусы ${sgn(m.cultPct)}%`);

  return { food, need, surplus: food - need, prod, gold, sci, cult, spec, lines: L };
}

/** Распределение жителей по клеткам с учётом фокуса города */
export function assignTiles(g: Game, c: City) {
  const p = g.players[c.owner];
  const m = mods(g, c.owner);
  const cand: { i: number; y: Yield }[] = [];
  const taken = new Set<number>();
  for (const oc of g.cities) if (oc.id !== c.id) for (const w of oc.worked) taken.add(w);
  for (const i of radius(g, c.at, 3)) {
    const t = g.tiles[i];
    if (i === c.at || t.city !== c.id || taken.has(i) || t.t === 'mountain') continue;
    const enemy = g.units.find((u) => u.at === i && u.owner !== c.owner && atWar(g, c.owner, u.owner));
    if (enemy) continue;
    const y = tileYield(g, i, p, m);
    if (c.blds.includes('harbor') && TERRAIN[t.t].water) y.f += 1;
    cand.push({ i, y });
  }
  const W = {
    bal: { f: 1.5, p: 1.3, g: 0.8, spec: 1.4 },
    food: { f: 3, p: 1, g: 0.5, spec: 0.6 },
    prod: { f: 1.1, p: 3, g: 0.5, spec: 0.9 },
    gold: { f: 1.1, p: 0.8, g: 3, spec: 1.2 },
  }[c.focus];
  const cy = tileYield(g, c.at, p, m);
  const baseFood = Math.max(2, cy.f) + c.blds.reduce((s, b) => s + (BUILDINGS[b].f || 0), 0) + m.foodFlat;
  let wf = W.f;
  let chosen: number[] = [];
  for (let iter = 0; iter < 4; iter++) {
    const scored = cand
      .map((x) => ({ i: x.i, f: x.y.f, s: x.y.f * wf + x.y.p * W.p + x.y.g * W.g + (g.tiles[x.i].r ? 0.1 : 0) }))
      .filter((x) => x.s > W.spec)
      .sort((a, b) => b.s - a.s);
    chosen = scored.slice(0, c.pop).map((x) => x.i);
    const food = baseFood + scored.slice(0, c.pop).reduce((s, x) => s + x.f, 0);
    const target = c.focus === 'prod' || c.focus === 'gold' ? 0 : 2;
    if (food - c.pop * 2 >= target) break;
    wf += 1.2;
  }
  c.worked = chosen;
}

// ───────── Стоимость ─────────
export function unitCost(g: Game, pid: number, id: string): number {
  const d = UNITS[id];
  let c = d.cost * speedOf(g);
  if (id === 'settler') {
    const n = playerCities(g, pid).length;
    c *= (1 + 0.3 * Math.max(0, n - 1)) * (1 - mods(g, pid).settlerPct / 100);
  }
  return Math.max(5, Math.round(c));
}
export function buildingCost(g: Game, pid: number, id: string): number {
  const B = BUILDINGS[id];
  let c = B.cost * speedOf(g);
  if (!B.wonder && !B.project) c *= 1 - mods(g, pid).bldCostPct / 100;
  return Math.max(5, Math.round(c));
}
export function itemCost(g: Game, pid: number, it: BuildItem): number {
  return it.kind === 'unit' ? unitCost(g, pid, it.id) : buildingCost(g, pid, it.id);
}
export function itemName(it: BuildItem): string {
  return it.kind === 'unit' ? UNITS[it.id].name : BUILDINGS[it.id].name;
}
export function buyCost(g: Game, c: City, it: BuildItem): number {
  const rem = Math.max(0, itemCost(g, c.owner, it) - c.prod);
  return Math.ceil(rem * 2.2 + 8);
}
export function canBuy(it: BuildItem): boolean {
  if (it.kind === 'unit') return true;
  const B = BUILDINGS[it.id];
  return !B.wonder && !B.project;
}

/** Юниты, которые игрок может строить (с учётом уникальных юнитов нации и устаревания) */
export function availableUnits(g: Game, p: Player): UnitDef[] {
  const nat = NATIONS[p.nation];
  const out: UnitDef[] = [];
  for (const id in UNITS) {
    const d = UNITS[id];
    if (d.unique && d.unique !== p.nation) continue;
    if (!d.unique && nat.uu.replaces === id) continue;
    if (!hasTech(p, d.tech)) continue;
    if (d.obs && hasTech(p, d.obs)) continue;
    out.push(d);
  }
  return out;
}

export function canBuild(g: Game, c: City, it: BuildItem): { ok: boolean; why?: string } {
  const p = g.players[c.owner];
  if (it.kind === 'unit') {
    const d = UNITS[it.id];
    if (!availableUnits(g, p).includes(d)) return { ok: false, why: 'Недоступно' };
    if (it.id === 'settler' && c.pop < 2) return { ok: false, why: 'Нужно население 2+' };
    return { ok: true };
  }
  const B = BUILDINGS[it.id];
  if (!hasTech(p, B.tech)) return { ok: false, why: 'Нужна технология' };
  if (c.blds.includes(it.id)) return { ok: false, why: 'Уже построено' };
  if (B.coastal && !isCoastal(g, c.at)) return { ok: false, why: 'Только у воды' };
  if (B.wonder && g.wonders[it.id] !== undefined) return { ok: false, why: 'Уже построено в мире' };
  if (B.wonder || B.project) {
    const other = playerCities(g, c.owner).find((oc) => oc.id !== c.id && oc.queue.some((q) => q.kind === 'bld' && q.id === it.id));
    if (other) return { ok: false, why: `Строится в г. ${other.name}` };
  }
  return { ok: true };
}

// ───────── Наука ─────────
export function techCost(g: Game, p: Player, id: string): number {
  const t = TECHS[id];
  const size = g.settings.size === 'small' ? 0.9 : g.settings.size === 'large' ? 1.15 : 1;
  let known = 0;
  for (const q of g.players) if (q.id !== p.id && q.alive && p.rel[q.id].met && q.techs.includes(id)) known++;
  const discount = 1 - 0.1 * Math.min(3, known);
  return Math.round(ERA_COST[t.era] * speedOf(g) * size * discount);
}
export function availableTechs(p: Player): string[] {
  return TECH_LIST.filter((t) => !p.techs.includes(t.id) && t.req.every((r) => p.techs.includes(r))).map((t) => t.id);
}
/** Путь исследования до цели (в порядке изучения) */
export function researchPath(p: Player, target: string): string[] {
  const out: string[] = [];
  const visit = (id: string) => {
    if (p.techs.includes(id) || out.includes(id)) return;
    for (const r of TECHS[id].req) visit(r);
    out.push(id);
  };
  visit(target);
  return out;
}
export function playerScience(g: Game, pid: number): number {
  return playerCities(g, pid).reduce((s, c) => s + cityYields(g, c).sci, 0);
}
export function unlocksOf(id: string): string[] {
  const out: string[] = [];
  for (const u in UNITS) if (UNITS[u].tech === id && !UNITS[u].unique) out.push(UNITS[u].name);
  for (const b in BUILDINGS) if (BUILDINGS[b].tech === id) out.push(BUILDINGS[b].name);
  return out;
}

// ───────── Экономика ─────────
export function upkeep(g: Game, pid: number): { units: number; blds: number } {
  const mil = g.units.filter((u) => u.owner === pid && isMil(u)).length;
  const cities = playerCities(g, pid);
  const free = 3 + cities.length;
  const units = Math.max(0, mil - free);
  let blds = 0;
  for (const c of cities) for (const b of c.blds) blds += BUILDINGS[b].maint;
  return { units, blds };
}
export function goldIncome(g: Game, pid: number): { gross: number; net: number; units: number; blds: number } {
  const gross = playerCities(g, pid).reduce((s, c) => s + cityYields(g, c).gold, 0);
  const u = upkeep(g, pid);
  return { gross, net: gross - u.units - u.blds, ...u };
}

// ───────── Бой ─────────
export interface Breakdown { base: number; mods: { label: string; pct: number }[]; total: number }

export function unitMaxMoves(g: Game, u: Unit): number {
  const d = UNITS[u.type];
  return d.mv + (d.cls === 'mounted' ? mods(g, u.owner).mountedMv : 0);
}
export function levelFromXp(xp: number): number {
  return xp >= 60 ? 3 : xp >= 30 ? 2 : xp >= 10 ? 1 : 0;
}

function finish(base: number, list: { label: string; pct: number }[]): Breakdown {
  const pct = list.reduce((s, x) => s + x.pct, 0);
  return { base, mods: list, total: Math.max(0.5, base * (1 + pct / 100)) };
}

export function tileDefense(g: Game, i: number): number {
  const t = g.tiles[i];
  return (t.f ? FEATURES[t.f].def : 0) + TERRAIN[t.t].def;
}

export function attackStrength(g: Game, u: Unit, targetTile: number, ranged: boolean): Breakdown {
  const d = UNITS[u.type];
  const base = ranged ? d.rs || 0 : d.s;
  const L: { label: string; pct: number }[] = [];
  if (u.hp < 100) L.push({ label: 'Раны', pct: -Math.round((100 - u.hp) / 2) });
  if (u.lvl) L.push({ label: `Опыт ×${u.lvl}`, pct: 10 * u.lvl });
  const m = mods(g, u.owner);
  if (m.unitPct) L.push({ label: 'Военная доктрина', pct: m.unitPct });
  const city = cityAt(g, targetTile);
  const def = city ? undefined : milAt(g, targetTile) || civAt(g, targetTile);
  if (city && d.cls === 'siege') L.push({ label: 'Осада города', pct: 50 });
  if (city && d.cls === 'mounted') L.push({ label: 'Конница против стен', pct: -25 });
  if (def && d.anti && UNITS[def.type].cls === 'mounted') L.push({ label: 'Против конницы', pct: 50 });
  if (!ranged) {
    let flank = 0;
    for (const n of nbOf(g)[targetTile]) {
      if (n < 0 || n === u.at) continue;
      const f = milAt(g, n);
      if (f && f.owner === u.owner) flank++;
    }
    if (flank) L.push({ label: `Фланг ×${Math.min(3, flank)}`, pct: 10 * Math.min(3, flank) });
  }
  return finish(base, L);
}

export function bestStrength(g: Game, pid: number): number {
  const p = g.players[pid];
  let best = 8;
  for (const d of availableUnits(g, p)) if (d.cls !== 'civ' && d.cls !== 'siege' && d.cls !== 'ranged') best = Math.max(best, d.s);
  return best;
}

export function cityStrength(g: Game, c: City): Breakdown {
  const base = Math.round(6 + c.pop * 1.5 + bestStrength(g, c.owner) * 0.6);
  const L: { label: string; pct: number }[] = [];
  if (c.blds.includes('walls')) L.push({ label: 'Стены', pct: 50 });
  if (c.capital) L.push({ label: 'Столица', pct: 25 });
  const m = mods(g, c.owner);
  if (m.cityPct) L.push({ label: 'Ополчение', pct: m.cityPct });
  const gar = milAt(g, c.at);
  if (gar && gar.owner === c.owner) {
    const d = UNITS[gar.type];
    L.push({ label: `Гарнизон: ${d.name}`, pct: Math.round((Math.max(d.s, d.rs || 0) / base) * 40) });
  }
  const max = cityMaxHp(c);
  if (c.hp < max) L.push({ label: 'Повреждения', pct: -Math.round((1 - c.hp / max) * 30) });
  return finish(base, L);
}

export function defenseStrength(g: Game, u: Unit, attacker: Unit): Breakdown {
  const d = UNITS[u.type];
  const L: { label: string; pct: number }[] = [];
  if (d.cls === 'civ') return finish(0.5, L);
  if (u.hp < 100) L.push({ label: 'Раны', pct: -Math.round((100 - u.hp) / 2) });
  if (u.lvl) L.push({ label: `Опыт ×${u.lvl}`, pct: 10 * u.lvl });
  const td = tileDefense(g, u.at);
  if (td && d.cls !== 'mounted' && d.cls !== 'armor') L.push({ label: 'Местность', pct: td });
  if (u.fort) L.push({ label: 'Укрепление', pct: 25 });
  const m = mods(g, u.owner);
  if (m.unitPct) L.push({ label: 'Военная доктрина', pct: m.unitPct });
  if (d.anti && UNITS[attacker.type].cls === 'mounted') L.push({ label: 'Против конницы', pct: 50 });
  return finish(d.s, L);
}

/** Урон по формуле: при равных силах — 30 HP; при перевесе растёт по степенной кривой */
export function damage(ratio: number): number {
  return Math.min(100, Math.max(1, 30 * Math.pow(ratio, 1.3)));
}

export function score(g: Game, pid: number): number {
  const p = g.players[pid];
  let s = 0;
  for (const c of playerCities(g, pid)) s += 10 + c.pop * 3;
  s += p.techs.length * 4;
  for (const w in g.wonders) {
    const c = cityById(g, g.wonders[w]);
    if (c && c.owner === pid) s += 25;
  }
  let land = 0;
  for (const t of g.tiles) if (t.owner === pid) land++;
  s += Math.round(land / 2);
  return s;
}

export function militaryPower(g: Game, pid: number): number {
  let s = 0;
  for (const u of g.units) {
    if (u.owner !== pid || !isMil(u)) continue;
    const d = UNITS[u.type];
    s += Math.max(d.s, d.rs || 0) * (0.5 + u.hp / 200);
  }
  return s + playerCities(g, pid).length * 4;
}

export function yearOf(g: Game): string {
  const p = Math.min(1, (g.turn - 1) / g.settings.turnLimit);
  let y = -4000 + 6050 * (0.75 * (1 - (1 - p) * (1 - p)) + 0.25 * p);
  y = y < 1500 ? Math.round(y / 10) * 10 : Math.round(y);
  if (y === 0) y = 1;
  return y < 0 ? `${-y} до н. э.` : `${y} н. э.`;
}
