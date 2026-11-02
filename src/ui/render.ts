// Отрисовка карты на Canvas 2D. Перерисовка только по запросу (dirty-флаг) — бережёт батарею.
import { BUILDINGS, IMPROVEMENTS, NATIONS, RESOURCES, TERRAIN, UNITS } from '../core/data';
import { SQ3, center, neighborsOf } from '../core/hex';
import { cityMaxHp, cityYields, isMil, itemCost } from '../core/rules';
import type { City, Game, Unit } from '../core/types';
import { Paths, visibleOf } from '../core/world';
import { drawIcon } from './icons';

export const R = 40;

export interface Theme {
  id: string; name: string; fog: string; grid: string; ink: string; tree: [string, string]; jungle: [string, string];
  rock: [string, string]; snowcap: string; shore: string; plaza: string; t: Record<string, string>;
}
export const THEMES: Record<string, Theme> = {
  classic: {
    id: 'classic', name: 'Классика', fog: '#0a0f17', grid: 'rgba(10,20,10,0.16)', ink: 'rgba(30,26,18,0.75)',
    tree: ['#2c6136', '#3f8148'], jungle: ['#1f6a3d', '#33905a'], rock: ['#8a8580', '#625d59'], snowcap: '#f4f6f8',
    shore: 'rgba(240,226,180,0.85)', plaza: '#d8c9a3',
    t: { ocean: '#1c4a73', coast: '#2c74a0', grass: '#6aa651', plains: '#a7ae58', desert: '#ddc387', tundra: '#93a092', snow: '#e3eaee', hills: '#8b9852', mountain: '#7a756f' },
  },
  parchment: {
    id: 'parchment', name: 'Пергамент', fog: '#211a12', grid: 'rgba(80,60,30,0.25)', ink: 'rgba(70,52,30,0.85)',
    tree: ['#6c7346', '#87905a'], jungle: ['#5f6d40', '#7c8a52'], rock: ['#9a8b70', '#7a6c55'], snowcap: '#f5efe0',
    shore: 'rgba(110,85,50,0.55)', plaza: '#e6d5ae',
    t: { ocean: '#8ea7a2', coast: '#a8bfb5', grass: '#c5c18a', plains: '#d6c690', desert: '#e8d6a2', tundra: '#c0bba3', snow: '#efe9da', hills: '#bba977', mountain: '#9b8d76' },
  },
  dusk: {
    id: 'dusk', name: 'Сумерки', fog: '#05070c', grid: 'rgba(0,0,0,0.25)', ink: 'rgba(230,220,200,0.7)',
    tree: ['#1c3b29', '#2a573a'], jungle: ['#16422c', '#215e3d'], rock: ['#5b5862', '#403e46'], snowcap: '#c9d3dc',
    shore: 'rgba(200,190,150,0.45)', plaza: '#8d826b',
    t: { ocean: '#0f2742', coast: '#1b4163', grass: '#3d6743', plains: '#666740', desert: '#978257', tundra: '#58635e', snow: '#b2bec6', hills: '#57603e', mountain: '#524f58' },
  },
};

export interface Float { x: number; y: number; text: string; color: string; t0: number }
export interface View {
  cx: number; cy: number; zoom: number; w: number; h: number; dpr: number;
  sel: number | null; paths: Paths | null; preview: { dest: number; path: number[] } | null; targets: number[];
  hover: number; anim: { unit: number; pts: { x: number; y: number }[]; t0: number; dur: number } | null;
  floats: Float[]; revealAll: boolean; human: number; cam: { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number } | null;
}

export function newView(): View {
  return { cx: 0, cy: 0, zoom: 1, w: 1, h: 1, dpr: 1, sel: null, paths: null, preview: null, targets: [], hover: -1, anim: null, floats: [], revealAll: false, human: 0, cam: null };
}

const CORN = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 180) * (60 * k - 30);
  return [Math.cos(a), Math.sin(a)];
});
function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + CORN[0][0] * r, y + CORN[0][1] * r);
  for (let k = 1; k < 6; k++) ctx.lineTo(x + CORN[k][0] * r, y + CORN[k][1] * r);
  ctx.closePath();
}
const hash = (i: number, s = 0) => (((Math.imul(i + s * 7919, 2654435761) ^ (i >>> 3)) >>> 0) % 1000) / 1000;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k))));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}
const shadeCache = new Map<string, string>();
function sh(hex: string, k: number) {
  const key = hex + k;
  let v = shadeCache.get(key);
  if (!v) { v = shade(hex, k); shadeCache.set(key, v); }
  return v;
}
function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function lightColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 165;
}

export function worldToScreen(v: View, x: number, y: number) {
  return { x: (x - v.cx) * v.zoom + v.w / 2, y: (y - v.cy) * v.zoom + v.h / 2 };
}
export function screenToWorld(v: View, x: number, y: number) {
  return { x: (x - v.w / 2) / v.zoom + v.cx, y: (y - v.h / 2) / v.zoom + v.cy };
}

export function draw(ctx: CanvasRenderingContext2D, g: Game, v: View, th: Theme, now: number) {
  const W = v.w, H = v.h, z = v.zoom;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  ctx.fillStyle = th.fog;
  ctx.fillRect(0, 0, W, H);
  const wx0 = v.cx - W / 2 / z, wy0 = v.cy - H / 2 / z, wx1 = v.cx + W / 2 / z, wy1 = v.cy + H / 2 / z;
  const rowH = 1.5 * R, colW = SQ3 * R;
  const r0 = Math.max(0, Math.floor((wy0 - 2 * R) / rowH)), r1 = Math.min(g.H - 1, Math.ceil(wy1 / rowH));
  const c0 = Math.max(0, Math.floor(wx0 / colW) - 1), c1 = Math.min(g.W - 1, Math.ceil(wx1 / colW));
  const p = g.players[v.human];
  const vis = v.revealAll ? null : visibleOf(g, v.human);
  const explored = (i: number) => v.revealAll || p.explored[i] === 1;
  const seen = (i: number) => !vis || vis[i] === 1;
  const detail = z > 0.5;
  const NB = neighborsOf(g.W, g.H);

  const list: number[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) list.push(r * g.W + c);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(z, z);
  ctx.translate(-v.cx, -v.cy);

  // 1. Основа клеток
  for (const i of list) {
    const { x, y } = center(i, g.W, R);
    if (!explored(i)) {
      hexPath(ctx, x, y, R + 0.6);
      ctx.fillStyle = sh(th.fog, hash(i) * 0.06);
      ctx.fill();
      continue;
    }
    const t = g.tiles[i];
    const base = th.t[t.t];
    hexPath(ctx, x, y, R + 0.6);
    ctx.fillStyle = sh(base, (hash(i) - 0.5) * 0.08);
    ctx.fill();
  }
  // 2. Детали рельефа
  for (const i of list) {
    if (!explored(i)) continue;
    const { x, y } = center(i, g.W, R);
    drawTerrainDetail(ctx, g, i, x, y, th, detail, NB);
  }
  // 3. Сетка
  if (detail) {
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    for (const i of list) {
      if (!explored(i)) continue;
      const { x, y } = center(i, g.W, R);
      hexPath(ctx, x, y, R);
      ctx.stroke();
    }
  }
  // 4. Территории
  for (const i of list) {
    const t = g.tiles[i];
    if (t.owner < 0 || !explored(i)) continue;
    const col = g.players[t.owner].color;
    const { x, y } = center(i, g.W, R);
    hexPath(ctx, x, y, R);
    ctx.fillStyle = alpha(col, 0.13);
    ctx.fill();
    ctx.strokeStyle = alpha(col, 0.95);
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const ri = R - 2.5;
    for (let k = 0; k < 6; k++) {
      const n = NB[i][k];
      if (n >= 0 && g.tiles[n].owner === t.owner) continue;
      ctx.beginPath();
      ctx.moveTo(x + CORN[k][0] * ri, y + CORN[k][1] * ri);
      ctx.lineTo(x + CORN[(k + 1) % 6][0] * ri, y + CORN[(k + 1) % 6][1] * ri);
      ctx.stroke();
    }
  }
  // 5. Туман для разведанных, но не видимых клеток
  ctx.fillStyle = 'rgba(8,12,20,0.42)';
  for (const i of list) {
    if (!explored(i) || seen(i)) continue;
    const { x, y } = center(i, g.W, R);
    hexPath(ctx, x, y, R + 0.6);
    ctx.fill();
  }
  // 6. Подсветка ходов выбранного юнита
  const selU = v.sel !== null ? g.units.find((u) => u.id === v.sel) : undefined;
  if (selU && v.paths && !v.anim) {
    ctx.fillStyle = 'rgba(255,248,220,0.16)';
    for (const i of list) {
      if (i === v.paths.start || v.paths.turns[i] !== 0 || v.paths.noStop[i]) continue;
      const { x, y } = center(i, g.W, R);
      hexPath(ctx, x, y, R - 3);
      ctx.fill();
    }
  }
  for (const ti of v.targets) {
    const { x, y } = center(ti, g.W, R);
    hexPath(ctx, x, y, R - 3);
    ctx.strokeStyle = '#ff5a48';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (v.hover >= 0 && explored(v.hover)) {
    const { x, y } = center(v.hover, g.W, R);
    hexPath(ctx, x, y, R - 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 7. Города
  for (const c of g.cities) {
    if (!explored(c.at)) continue;
    const { x, y } = center(c.at, g.W, R);
    if (x < wx0 - R * 2 || x > wx1 + R * 2 || y < wy0 - R * 2 || y > wy1 + R * 2) continue;
    drawCity(ctx, g, c, x, y, th);
  }

  // 8. Путь
  if (selU && v.preview && !v.anim) drawPath(ctx, g, v, selU);

  // 9. Юниты
  const anim = v.anim;
  let animPos: { x: number; y: number } | null = null;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.dur);
    const seg = k * (anim.pts.length - 1);
    const s = Math.min(anim.pts.length - 2, Math.floor(seg));
    const f = seg - s;
    const a = anim.pts[Math.max(0, s)], b = anim.pts[Math.max(0, s) + 1] || a;
    animPos = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }
  for (const u of g.units) {
    if (!seen(u.at) && u.owner !== v.human) continue;
    const { x, y } = center(u.at, g.W, R);
    if (x < wx0 - R * 2 || x > wx1 + R * 2 || y < wy0 - R * 2 || y > wy1 + R * 2) {
      if (!(anim && anim.unit === u.id)) continue;
    }
    const inCity = g.cities.some((c) => c.at === u.at);
    const mil = isMil(u);
    const other = g.units.some((o) => o !== u && o.at === u.at && isMil(o) !== mil);
    let ox = 0, oy = 0.02 * R, r = 0.36 * R;
    if (inCity) { ox = mil ? 0.4 * R : -0.4 * R; oy = 0.32 * R; r = 0.27 * R; }
    else if (other) { ox = mil ? 0.2 * R : -0.27 * R; oy = mil ? -0.08 * R : 0.27 * R; r = mil ? 0.33 * R : 0.26 * R; }
    r = Math.max(r, 9 / z);
    let px = x + ox, py = y + oy;
    if (anim && anim.unit === u.id && animPos) { px = animPos.x + ox; py = animPos.y + oy; }
    drawUnit(ctx, g, u, px, py, r, v, now);
  }

  // 10. Всплывающие числа
  v.floats = v.floats.filter((f) => now - f.t0 < 1400);
  for (const f of v.floats) {
    const k = (now - f.t0) / 1400;
    ctx.globalAlpha = Math.min(1, 2 - k * 2);
    ctx.font = `700 ${Math.max(14, 16 / z) | 0}px "Golos Text", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 / Math.max(z, 0.6);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, f.x, f.y - 20 - k * 40);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 20 - k * 40);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 11. Плашки городов (в экранных координатах — всегда читаемы)
  for (const c of g.cities) {
    if (!explored(c.at)) continue;
    const { x, y } = center(c.at, g.W, R);
    const s = worldToScreen(v, x, y - R * 0.78);
    if (s.x < -120 || s.x > W + 120 || s.y < -40 || s.y > H + 40) continue;
    drawBanner(ctx, g, c, s.x, s.y, v.human, z);
  }
}

function drawTerrainDetail(ctx: CanvasRenderingContext2D, g: Game, i: number, x: number, y: number, th: Theme, detail: boolean, NB: number[][]) {
  const t = g.tiles[i];
  const h1 = hash(i, 1), h2 = hash(i, 2);
  const T = TERRAIN[t.t];
  if (T.water) {
    // береговая линия
    ctx.strokeStyle = th.shore;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const ri = R - 1.5;
    for (let k = 0; k < 6; k++) {
      const n = NB[i][k];
      if (n < 0 || TERRAIN[g.tiles[n].t].water) continue;
      ctx.beginPath();
      ctx.moveTo(x + CORN[k][0] * ri, y + CORN[k][1] * ri);
      ctx.lineTo(x + CORN[(k + 1) % 6][0] * ri, y + CORN[(k + 1) % 6][1] * ri);
      ctx.stroke();
    }
    if (detail && h1 < 0.55) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.6;
      const wx = x + (h2 - 0.5) * R * 0.8, wy = y + (h1 - 0.3) * R * 0.6;
      ctx.beginPath();
      ctx.moveTo(wx - 8, wy);
      ctx.quadraticCurveTo(wx - 4, wy - 4, wx, wy);
      ctx.quadraticCurveTo(wx + 4, wy + 4, wx + 8, wy);
      ctx.stroke();
    }
  } else if (t.t === 'mountain') {
    const [c1, c2] = th.rock;
    const peak = (px: number, py: number, s: number) => {
      ctx.beginPath(); ctx.moveTo(px - s, py + s * 0.8); ctx.lineTo(px, py - s * 0.9); ctx.lineTo(px + s, py + s * 0.8); ctx.closePath();
      ctx.fillStyle = c1; ctx.fill();
      ctx.beginPath(); ctx.moveTo(px, py - s * 0.9); ctx.lineTo(px + s, py + s * 0.8); ctx.lineTo(px + s * 0.15, py + s * 0.8); ctx.closePath();
      ctx.fillStyle = c2; ctx.fill();
      ctx.beginPath(); ctx.moveTo(px, py - s * 0.9); ctx.lineTo(px - s * 0.32, py - s * 0.32); ctx.lineTo(px - s * 0.05, py - s * 0.42); ctx.lineTo(px + s * 0.12, py - s * 0.3); ctx.lineTo(px + s * 0.32, py - s * 0.35); ctx.closePath();
      ctx.fillStyle = th.snowcap; ctx.fill();
    };
    peak(x + 0.22 * R, y + 0.02 * R, R * 0.34);
    peak(x - 0.15 * R, y - 0.08 * R, R * 0.46);
  } else if (t.t === 'hills') {
    const mound = (px: number, py: number, s: number) => {
      ctx.beginPath(); ctx.moveTo(px - s, py); ctx.quadraticCurveTo(px, py - s * 1.1, px + s, py); ctx.closePath();
      ctx.fillStyle = sh(th.t.hills, 0.12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - s * 0.2, py - s * 0.52); ctx.quadraticCurveTo(px + s * 0.55, py - s * 0.35, px + s, py); ctx.lineTo(px + s * 0.2, py); ctx.closePath();
      ctx.fillStyle = sh(th.t.hills, -0.15); ctx.fill();
    };
    mound(x - 0.2 * R, y + 0.12 * R, R * 0.42);
    mound(x + 0.28 * R, y + 0.32 * R, R * 0.32);
  } else if (detail) {
    if (t.t === 'desert') {
      ctx.strokeStyle = sh(th.t.desert, -0.12); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 0.45 * R, y + 0.1 * R); ctx.quadraticCurveTo(x - 0.1 * R, y - 0.15 * R, x + 0.25 * R, y + 0.08 * R); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 0.15 * R, y + 0.4 * R); ctx.quadraticCurveTo(x + 0.15 * R, y + 0.2 * R, x + 0.45 * R, y + 0.38 * R); ctx.stroke();
    } else if (!t.f && (t.t === 'grass' || t.t === 'plains' || t.t === 'tundra')) {
      ctx.strokeStyle = sh(th.t[t.t], -0.18); ctx.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) {
        const tx = x + (hash(i, 3 + k) - 0.5) * R * 1.1, ty = y + (hash(i, 7 + k) - 0.5) * R * 0.9;
        ctx.beginPath(); ctx.moveTo(tx - 3, ty - 4); ctx.lineTo(tx, ty); ctx.lineTo(tx + 3, ty - 5); ctx.stroke();
      }
    }
  }
  if (t.f === 'forest') {
    const pts = [[-0.32, -0.05], [0.28, -0.2], [0.02, 0.3], [0.38, 0.28], [-0.3, 0.38]];
    const n = 3 + Math.floor(h1 * 3);
    const [dk, lt] = t.t === 'tundra' ? [sh(th.tree[0], -0.15), sh(th.tree[1], -0.1)] : th.tree;
    for (let k = 0; k < n; k++) {
      const tx = x + pts[k][0] * R, ty = y + pts[k][1] * R, s = R * (0.2 + hash(i, k) * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath(); ctx.ellipse(tx + 2, ty + s * 0.75, s * 0.6, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dk;
      ctx.beginPath(); ctx.moveTo(tx, ty - s * 1.1); ctx.lineTo(tx - s * 0.7, ty + s * 0.6); ctx.lineTo(tx + s * 0.7, ty + s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = lt;
      ctx.beginPath(); ctx.moveTo(tx, ty - s * 1.1); ctx.lineTo(tx - s * 0.45, ty + s * 0.05); ctx.lineTo(tx + s * 0.2, ty + s * 0.05); ctx.closePath(); ctx.fill();
    }
  } else if (t.f === 'jungle') {
    const pts = [[-0.3, 0], [0.25, -0.18], [0.05, 0.3], [0.38, 0.25]];
    for (let k = 0; k < 4; k++) {
      const tx = x + pts[k][0] * R, ty = y + pts[k][1] * R, s = R * (0.17 + hash(i, k) * 0.05);
      ctx.fillStyle = th.jungle[0];
      ctx.beginPath(); ctx.arc(tx, ty, s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = th.jungle[1];
      ctx.beginPath(); ctx.arc(tx - s * 0.3, ty - s * 0.3, s * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (t.imp && t.imp !== 'boats') {
    drawIcon(ctx, IMPROVEMENTS[t.imp].icon, x - 0.42 * R, y + 0.36 * R, R * 0.32, th.ink, 2.2);
  }
  if (t.r) {
    const Rs = RESOURCES[t.r];
    const bx = x + 0.4 * R, by = y + 0.34 * R, br = R * 0.19;
    ctx.beginPath(); ctx.arc(bx, by, br + 1.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,250,235,0.92)'; ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fillStyle = Rs.color; ctx.fill();
    drawIcon(ctx, Rs.icon, bx, by, br * 1.35, '#fff', 2.4);
  }
}

function drawCity(ctx: CanvasRenderingContext2D, g: Game, c: City, x: number, y: number, th: Theme) {
  const col = g.players[c.owner].color;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x, y + 0.12 * R, 0.62 * R, 0.42 * R, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = th.plaza;
  ctx.beginPath(); ctx.ellipse(x, y + 0.05 * R, 0.58 * R, 0.4 * R, 0, 0, Math.PI * 2); ctx.fill();
  if (c.blds.includes('walls')) {
    ctx.strokeStyle = '#a99d86'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(x, y + 0.05 * R, 0.66 * R, 0.47 * R, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#7d725e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 0.05 * R, 0.69 * R, 0.5 * R, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const n = Math.max(3, Math.min(8, 2 + Math.ceil(c.pop / 2)));
  const spots = [[-0.32, -0.02], [0.3, -0.06], [-0.05, 0.22], [0.3, 0.22], [-0.34, 0.24], [0.02, -0.16], [-0.18, 0.08], [0.16, 0.06]];
  const roof = sh(col, -0.2);
  const items = spots.slice(0, n).sort((a, b) => a[1] - b[1]);
  for (const [dx, dy] of items) {
    const hx = x + dx * R, hy = y + dy * R, w = 0.2 * R, h = 0.14 * R;
    ctx.fillStyle = '#efe5cf';
    ctx.fillRect(hx - w / 2, hy - h / 2, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(hx, hy - h / 2, w / 2, h);
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(hx - w * 0.62, hy - h / 2); ctx.lineTo(hx, hy - h * 1.35); ctx.lineTo(hx + w * 0.62, hy - h / 2); ctx.closePath(); ctx.fill();
  }
  if (c.capital) {
    const tx = x + 0.02 * R, ty = y - 0.12 * R;
    ctx.fillStyle = '#e9dfc8';
    ctx.fillRect(tx - 0.07 * R, ty - 0.32 * R, 0.14 * R, 0.36 * R);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(tx, ty - 0.32 * R, 0.07 * R, 0.36 * R);
    ctx.strokeStyle = '#5a4a36'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx, ty - 0.32 * R); ctx.lineTo(tx, ty - 0.62 * R); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(tx, ty - 0.62 * R); ctx.lineTo(tx + 0.22 * R, ty - 0.54 * R); ctx.lineTo(tx, ty - 0.46 * R); ctx.closePath(); ctx.fill();
  }
  const wonders = c.blds.filter((b) => BUILDINGS[b].wonder).length;
  if (wonders) {
    ctx.fillStyle = '#e8c766';
    ctx.beginPath(); ctx.moveTo(x - 0.5 * R, y + 0.05 * R); ctx.lineTo(x - 0.36 * R, y - 0.22 * R); ctx.lineTo(x - 0.22 * R, y + 0.05 * R); ctx.closePath(); ctx.fill();
  }
}

function drawUnit(ctx: CanvasRenderingContext2D, g: Game, u: Unit, x: number, y: number, r: number, v: View, now: number) {
  const d = UNITS[u.type];
  const pl = g.players[u.owner];
  const col = pl.color;
  const mine = u.owner === v.human;
  const done = mine && (u.mv <= 0 || u.fort || u.sleep);
  // тень
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.1, y + r * 0.95, r * 0.85, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  const civ = d.cls === 'civ';
  ctx.beginPath();
  if (civ) {
    const s = r * 0.92;
    ctx.roundRect(x - s, y - s, s * 2, s * 2, s * 0.45);
  } else ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = done ? sh(col, -0.3) : col;
  ctx.fill();
  const selected = v.sel === u.id;
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeStyle = selected ? '#ffe39a' : done ? 'rgba(255,255,255,0.45)' : '#fff';
  ctx.stroke();
  if (selected) {
    const ph = (now / 600) % 1;
    ctx.beginPath(); ctx.arc(x, y, r + 4 + ph * 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,227,154,${0.8 - ph * 0.8})`; ctx.lineWidth = 2; ctx.stroke();
  }
  drawIcon(ctx, d.icon, x, y, r * 1.2, lightColor(col) ? '#2a2112' : '#fff', 2.2);
  if (d.unique) {
    ctx.fillStyle = '#ffd56a';
    ctx.beginPath(); ctx.arc(x + r * 0.72, y - r * 0.72, r * 0.2, 0, Math.PI * 2); ctx.fill();
  }
  for (let k = 0; k < u.lvl; k++) {
    ctx.fillStyle = '#ffd56a';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - (u.lvl - 1) * r * 0.22 + k * r * 0.44, y - r - r * 0.18, r * 0.14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (u.hp < 100) {
    const w = r * 1.7, h = Math.max(3, r * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2 - 1, y + r + 2, w + 2, h + 2);
    ctx.fillStyle = u.hp > 60 ? '#6fcf6a' : u.hp > 30 ? '#f0c24b' : '#ff5a48';
    ctx.fillRect(x - w / 2, y + r + 3, (w * u.hp) / 100, h);
  }
  if (mine && u.fort) drawIcon(ctx, 'shield', x - r * 0.85, y - r * 0.6, r * 0.6, '#cfe3ff');
  if (mine && u.sleep) drawIcon(ctx, 'zz', x - r * 0.85, y - r * 0.6, r * 0.6, '#cfe3ff');
  if (mine && u.path) drawIcon(ctx, 'boot', x - r * 0.85, y - r * 0.6, r * 0.6, '#ffe39a', 3);
}

function drawPath(ctx: CanvasRenderingContext2D, g: Game, v: View, u: Unit) {
  const pv = v.preview!;
  const P = v.paths!;
  const pts = [u.at, ...pv.path].map((i) => center(i, g.W, R));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 7;
  ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.strokeStyle = '#ffe39a'; ctx.lineWidth = 3; ctx.setLineDash([2, 7]);
  ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  ctx.setLineDash([]);
  for (const i of pv.path) {
    const nextTurn = P.left[i] === 0 && i !== pv.dest;
    if (!nextTurn) continue;
    const c = center(i, g.W, R);
    ctx.fillStyle = '#ffe39a';
    ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.fill();
  }
  const e = center(pv.dest, g.W, R);
  const turns = P.turns[pv.dest] + (P.left[pv.dest] === 0 ? 1 : 0);
  ctx.fillStyle = '#ffe39a';
  ctx.beginPath(); ctx.arc(e.x, e.y, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#2a2112';
  ctx.font = '700 13px "Golos Text", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.max(1, turns)), e.x, e.y + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawBanner(ctx: CanvasRenderingContext2D, g: Game, c: City, x: number, y: number, human: number, z: number) {
  const pl = g.players[c.owner];
  const mine = c.owner === human;
  const small = z < 0.45;
  ctx.font = `600 ${small ? 11 : 12.5}px "Golos Text", system-ui, sans-serif`;
  const name = c.name;
  const tw = ctx.measureText(name).width;
  const h = small ? 18 : 22;
  let extra = 0;
  let turnsTxt = '';
  if (mine && !small) {
    const it = c.queue[0];
    if (it) {
      const y2 = cityYields(g, c);
      const left = Math.max(0, itemCost(g, c.owner, it) - c.prod);
      turnsTxt = String(Math.max(1, Math.ceil(left / Math.max(1, y2.prod))));
    } else turnsTxt = '!';
    extra = 26;
  }
  const w = tw + h + 14 + extra;
  const bx = x - w / 2, by = y - h / 2;
  ctx.fillStyle = 'rgba(12,17,26,0.86)';
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = pl.color; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = pl.color;
  ctx.beginPath(); ctx.arc(bx + h / 2, y, h / 2 - 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lightColor(pl.color) ? '#1d1608' : '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${small ? 10 : 12}px "Golos Text", system-ui, sans-serif`;
  ctx.fillText(String(c.pop), bx + h / 2, y + 0.5);
  ctx.textAlign = 'left';
  ctx.font = `600 ${small ? 11 : 12.5}px "Golos Text", system-ui, sans-serif`;
  ctx.fillStyle = '#f2ead8';
  ctx.fillText(name, bx + h + 4, y + 0.5);
  if (c.capital) drawIcon(ctx, 'star', bx + h + 4 + tw + 7, y, 10, '#ffd56a');
  if (extra) {
    const ex = bx + w - extra;
    ctx.fillStyle = turnsTxt === '!' ? '#ff8a4c' : 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.roundRect(ex, by + 3, extra - 4, h - 6, 4); ctx.fill();
    ctx.fillStyle = turnsTxt === '!' ? '#1d1206' : '#d9cfb8';
    ctx.textAlign = 'center';
    ctx.font = '700 11px "Golos Text", system-ui, sans-serif';
    ctx.fillText(turnsTxt, ex + (extra - 4) / 2, y + 0.5);
  }
  const max = cityMaxHp(c);
  if (c.hp < max) {
    const bw = Math.max(40, w * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - bw / 2 - 1, by + h + 2, bw + 2, 5);
    ctx.fillStyle = c.hp / max > 0.5 ? '#6fcf6a' : c.hp / max > 0.25 ? '#f0c24b' : '#ff5a48';
    ctx.fillRect(x - bw / 2, by + h + 3, (bw * c.hp) / max, 3);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  void NATIONS;
}
