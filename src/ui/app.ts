// Контроллер приложения: состояние UI, ввод, камера, действия игрока, сохранения.
import { aiAcceptPeace } from '../core/ai';
import { CHARTERS, TERRAIN, UNITS } from '../core/data';
import { resolveEvent } from '../core/events';
import { center, inRadius, mapPixelSize, pickTile } from '../core/hex';
import {
  MAPS, SPEED_INFO, atWar, canBuild, cityAt, cityById, dist, isMil, playerCities, unitById, unitMaxMoves,
} from '../core/rules';
import { createGame, dailySettings, defaultSettings } from '../core/setup';
import { endTurn } from '../core/turn';
import type { BuildItem, City, Game, NoteKind, Settings, Unit } from '../core/types';
import {
  attack, buyItem, canFoundAt, computePaths, declareWar, foundCity, makePeace, moveAlong, ownerAt, pathTo, refreshVisibility,
  removeUnit, setResearch, targetAt, unitNeedsOrders, visibleOf,
} from '../core/world';
import { svg } from './icons';
import { attachInput } from './input';
import {
  choiceDialog, cityPanel, combatCard, diploPanel, econDialog, logDialog, mainState, menuDialog, techTree, tileCard, topBar, unitCard,
} from './panels';
import { R, THEMES, View, draw, newView, screenToWorld, worldToScreen } from './render';
import { gameOverScreen, helpScreen, mainMenu, setupScreen, storeScreen } from './screens';

const SAVE_KEY = 'epochs.autosave.v1';
const PREFS_KEY = 'epochs.prefs.v1';
const $ = (id: string) => document.getElementById(id) as HTMLElement;

export interface Prefs { theme: string; anim: boolean; autoNext: boolean; lastSetup?: Settings }

function store(key: string, val?: string | null): string | null {
  try {
    if (val === undefined) return localStorage.getItem(key);
    if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
  } catch { /* хранилище недоступно — играем без сохранений */ }
  return null;
}

export class App {
  g: Game | null = null;
  v: View = newView();
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  dirty = true;
  busy = false;
  demo = false;
  demoBase = { x: 0, y: 0 };
  lastFrame = 0;
  prefs: Prefs = { theme: 'classic', anim: true, autoNext: true };
  log: { turn: number; text: string; kind: NoteKind; at?: number }[] = [];
  combat: { unit: number; tile: number } | null = null;
  tileInfo = -1;
  cityOpen: number | null = null;
  skipped = new Set<number>();
  confirmDisband: number | null = null;
  confirmWar: number | null = null;
  setup: Settings = defaultSettings();
  touch = matchMedia('(hover: none)').matches;
  animDone: (() => void) | null = null;
  onSnapshot: (() => void) | null = null;

  init(resume?: string | null) {
    try { Object.assign(this.prefs, JSON.parse(store(PREFS_KEY) || '{}')); } catch { /* по умолчанию */ }
    if (!THEMES[this.prefs.theme]) this.prefs.theme = 'classic';
    if (this.prefs.lastSetup) this.setup = { ...this.setup, ...this.prefs.lastSetup, seed: (Date.now() % 1e9) | 0, daily: false };
    this.canvas = $('map') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    attachInput(this.canvas, {
      tap: (x, y, mouse) => { this.touch = !mouse; this.onTap(x, y, mouse); },
      order: (x, y) => this.onOrder(x, y),
      pan: (dx, dy) => this.pan(dx, dy),
      zoom: (k, x, y) => this.zoomAt(k, x, y),
      hover: (x, y) => this.onHover(x, y),
    });
    document.addEventListener('click', (e) => {
      const el = (e.target as Element).closest('[data-act]') as HTMLElement | null;
      if (el && !(el as HTMLButtonElement).disabled) this.act(el.dataset.act!, el);
    });
    document.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.change === 'seed') this.setup.seed = (parseInt(el.value.replace(/\D/g, ''), 10) || 1) | 0;
    });
    document.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    document.fonts?.ready.then(() => { this.dirty = true; });
    $('b-main').addEventListener('pointerdown', () => { this.touch = matchMedia('(hover: none)').matches; });
    document.querySelector('[data-act="zoomIn"]')!.innerHTML = svg('plus');
    document.querySelector('[data-act="zoomOut"]')!.innerHTML = svg('minus');
    requestAnimationFrame((t) => this.loop(t));
    if (resume) {
      try {
        const g = JSON.parse(resume) as Game;
        if (g && g.v === 1) { this.startGame(g, false); return; }
      } catch { /* нет снимка */ }
    }
    this.showMenu();
  }

  // ───────── Цикл отрисовки ─────────
  loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const v = this.v;
    if (!this.g) return;
    let need = this.dirty || !!v.anim || v.floats.length > 0 || !!v.cam;
    if (this.demo && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      v.cx = this.demoBase.x + Math.sin(t / 14000) * R * 7;
      v.cy = this.demoBase.y + Math.cos(t / 17000) * R * 3;
      need = t - this.lastFrame > 40;
    }
    if (v.sel !== null && !need && t - this.lastFrame > 50) need = true; // пульс выделения ~20 к/с
    if (v.cam) {
      const k = Math.min(1, (t - v.cam.t0) / v.cam.dur);
      const e = 1 - Math.pow(1 - k, 3);
      v.cx = v.cam.fx + (v.cam.tx - v.cam.fx) * e;
      v.cy = v.cam.fy + (v.cam.ty - v.cam.fy) * e;
      if (k >= 1) v.cam = null;
    }
    if (v.anim && t - v.anim.t0 >= v.anim.dur) {
      v.anim = null;
      const cb = this.animDone;
      this.animDone = null;
      cb?.();
      need = true;
    }
    if (!need) return;
    this.lastFrame = t;
    this.dirty = false;
    draw(this.ctx, this.g, v, THEMES[this.prefs.theme], t);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    Object.assign(this.v, { w, h, dpr });
    this.dirty = true;
  }

  // ───────── Камера ─────────
  clampCam() {
    if (!this.g) return;
    const s = mapPixelSize(this.g.W, this.g.H, R);
    this.v.cx = Math.max(0, Math.min(s.w, this.v.cx));
    this.v.cy = Math.max(0, Math.min(s.h, this.v.cy));
  }
  pan(dx: number, dy: number) {
    if (this.demo) return;
    this.v.cx -= dx / this.v.zoom;
    this.v.cy -= dy / this.v.zoom;
    this.v.cam = null;
    this.clampCam();
    this.dirty = true;
  }
  zoomAt(k: number, sx: number, sy: number) {
    if (this.demo) return;
    const before = screenToWorld(this.v, sx, sy);
    this.v.zoom = Math.max(0.3, Math.min(2.2, this.v.zoom * k));
    const after = screenToWorld(this.v, sx, sy);
    this.v.cx += before.x - after.x;
    this.v.cy += before.y - after.y;
    this.v.cam = null;
    this.clampCam();
    this.dirty = true;
  }
  centerOn(i: number, smooth = true, yShift = 0) {
    const g = this.g!;
    const c = center(i, g.W, R);
    const tx = c.x, ty = c.y + yShift / this.v.zoom;
    if (smooth && this.prefs.anim) this.v.cam = { fx: this.v.cx, fy: this.v.cy, tx, ty, t0: performance.now(), dur: 380 };
    else { this.v.cx = tx; this.v.cy = ty; this.clampCam(); }
    this.dirty = true;
  }
  ensureVisible(i: number) {
    const g = this.g!;
    const c = center(i, g.W, R);
    const s = worldToScreen(this.v, c.x, c.y);
    if (s.x < this.v.w * 0.15 || s.x > this.v.w * 0.85 || s.y < this.v.h * 0.18 || s.y > this.v.h * 0.72) this.centerOn(i, true, this.v.h * 0.08);
  }

  // ───────── Партия ─────────
  startGame(g: Game, fresh: boolean) {
    this.g = g;
    this.demo = false;
    const keep = { w: this.v.w, h: this.v.h, dpr: this.v.dpr };
    this.v = { ...newView(), ...keep, human: g.players.findIndex((p) => p.human), zoom: this.v.w < 700 ? 0.82 : 1 };
    this.skipped.clear();
    this.combat = null; this.cityOpen = null; this.tileInfo = -1;
    if (fresh) this.log = [];
    $('screen').innerHTML = '';
    $('hud').hidden = false;
    $('sheet').hidden = true;
    this.closeModal();
    refreshVisibility(g, this.v.human);
    const me = g.players[this.v.human];
    const first = g.units.find((u) => u.owner === me.id && u.type === 'settler') || g.units.find((u) => u.owner === me.id);
    const cap = playerCities(g, me.id).find((c) => c.capital);
    const focus = first ? first.at : cap ? cap.at : 0;
    this.centerOn(focus, false, this.v.h * 0.06);
    this.drainNotes();
    if (fresh) this.toast(g.settings.daily ? 'Испытание дня: наберите максимум очков за 60 ходов' : 'Основайте столицу: выберите поселенцев и нажмите «Основать»', 'info');
    if (first && fresh) this.selectUnit(first, false);
    this.refresh();
    if (me.pending.length) this.showChoice();
    this.save();
  }

  newGame(s: Settings) {
    this.prefs.lastSetup = { ...s };
    this.savePrefs();
    const settings = { ...s, turnLimit: s.daily ? 60 : SPEED_INFO[s.speed].limit };
    const g = createGame(settings);
    this.startGame(g, true);
  }

  savedInfo(): { turn: number; nation: string } | null {
    const raw = store(SAVE_KEY);
    if (!raw) return null;
    try {
      const g = JSON.parse(raw) as Game;
      if (g.v !== 1 || g.winner) return null;
      return { turn: g.turn, nation: g.players.find((p) => p.human)!.nation };
    } catch { return null; }
  }
  save() {
    const g = this.g;
    if (!g || this.demo) return;
    g.notes = []; g.fx = [];
    if (g.winner) { store(SAVE_KEY, null); return; }
    store(SAVE_KEY, JSON.stringify(g));
    this.onSnapshot?.();
  }
  savePrefs() { store(PREFS_KEY, JSON.stringify(this.prefs)); }
  themeName() { return THEMES[this.prefs.theme].name; }

  showMenu() {
    $('hud').hidden = true;
    this.closeModal();
    $('screen').innerHTML = mainMenu(this, this.savedInfo());
    if (!this.g || !this.demo) this.startDemo();
  }
  startDemo() {
    const s: Settings = { ...defaultSettings(), seed: ((Date.now() / 1000) | 0) % 100000, size: 'small', players: 4, speed: 'standard', turnLimit: 999 };
    const g = createGame(s);
    for (const p of g.players) p.human = false;
    this.g = g;
    this.demo = true;
    this.v = { ...newView(), w: this.v.w, h: this.v.h, dpr: this.v.dpr, revealAll: true, zoom: this.v.w < 700 ? 0.62 : 0.85 };
    const sz = mapPixelSize(g.W, g.H, R);
    this.demoBase = { x: sz.w / 2, y: sz.h / 2 };
    this.v.cx = this.demoBase.x; this.v.cy = this.demoBase.y;
    let n = 0;
    const step = () => {
      if (this.g !== g || n >= 45) return;
      for (let k = 0; k < 3 && n < 45; k++, n++) { endTurn(g); g.notes = []; g.fx = []; }
      this.dirty = true;
      setTimeout(step, 16);
    };
    setTimeout(step, 50);
  }

  // ───────── Выбор и действия ─────────
  me() { return this.g!.players[this.v.human]; }

  selectUnit(u: Unit | null, center = true) {
    this.combat = null;
    this.tileInfo = -1;
    this.confirmDisband = null;
    const v = this.v;
    if (!u) {
      v.sel = null; v.paths = null; v.targets = []; v.preview = null;
    } else {
      v.sel = u.id;
      v.paths = computePaths(this.g!, u);
      v.targets = this.targetsFor(u);
      v.preview = null;
      if (center) this.ensureVisible(u.at);
    }
    this.renderCard();
    this.renderMain();
    this.dirty = true;
  }

  bestAttackFrom(u: Unit, tile: number): number {
    const P = this.v.paths;
    if (!P) return -1;
    let best = -1, bl = -1;
    for (const n of inRadius(tile, 1, this.g!.W, this.g!.H)) {
      if (n === tile) continue;
      if (n === u.at && u.mv > 0) return u.at;
      if (P.turns[n] !== 0 || P.left[n] <= 0 || P.noStop[n]) continue;
      if (P.left[n] > bl) { bl = P.left[n]; best = n; }
    }
    return best;
  }

  targetsFor(u: Unit): number[] {
    const g = this.g!;
    const d = UNITS[u.type];
    if (d.cls === 'civ' || u.mv <= 0) return [];
    const vis = visibleOf(g, this.v.human);
    const out: number[] = [];
    const rad = d.rs ? d.range || 2 : unitMaxMoves(g, u) + 1;
    for (const i of inRadius(u.at, rad, g.W, g.H)) {
      if (!vis[i] || !targetAt(g, u, i) || !atWar(g, u.owner, ownerAt(g, i))) continue;
      if (d.rs) { out.push(i); continue; }
      if (!TERRAIN[g.tiles[i].t].pass) continue;
      if (this.bestAttackFrom(u, i) >= 0) out.push(i);
    }
    return out;
  }

  selected(): Unit | undefined {
    return this.v.sel !== null ? unitById(this.g!, this.v.sel) : undefined;
  }

  tileAt(sx: number, sy: number): number {
    const w = screenToWorld(this.v, sx, sy);
    return pickTile(w.x, w.y, R, this.g!.W, this.g!.H);
  }

  onHover(sx: number, sy: number) {
    if (!this.g || this.demo || this.busy) return;
    const i = sx < 0 ? -1 : this.tileAt(sx, sy);
    if (i === this.v.hover) return;
    this.v.hover = i;
    const u = this.selected();
    if (u && u.owner === this.v.human && this.v.paths && i >= 0 && !this.v.targets.includes(i)) {
      const path = pathTo(this.v.paths, i);
      this.v.preview = path ? { dest: i, path } : null;
    } else if (this.v.preview && !this.touch) this.v.preview = null;
    this.dirty = true;
  }

  onTap(sx: number, sy: number, mouse: boolean) {
    const g = this.g;
    if (!g || this.busy || this.demo || this.v.anim) return;
    if (!$('sheet').hidden) { this.closeSheet(); if (!mouse || window.innerWidth < 900) return; }
    const i = this.tileAt(sx, sy);
    if (i < 0) return;
    const human = this.v.human;
    const u = this.selected();
    if (u && u.owner === human) {
      if (this.v.targets.includes(i)) { this.combat = { unit: u.id, tile: i }; this.renderCard(); return; }
      const ownHere = g.units.some((x) => x.at === i && x.owner === human);
      if (i !== u.at && !ownHere && this.v.paths) {
        const path = pathTo(this.v.paths, i);
        if (path) {
          if (mouse || (this.v.preview && this.v.preview.dest === i)) this.moveTo(u, i);
          else { this.v.preview = { dest: i, path }; this.combat = null; this.renderCard(); this.dirty = true; }
          return;
        }
      }
    }
    const own = g.units.filter((x) => x.at === i && x.owner === human).sort((a, b) => Number(isMil(b)) - Number(isMil(a)));
    const city = cityAt(g, i);
    if (own.length) {
      const k = u ? own.findIndex((x) => x.id === u.id) : -1;
      if (k === -1) return this.selectUnit(own[0], false);
      if (k < own.length - 1) return this.selectUnit(own[k + 1], false);
      if (city && city.owner === human) return this.openCity(city);
      if (own.length > 1) return this.selectUnit(own[0], false);
      return this.selectUnit(null);
    }
    if (city && city.owner === human) return this.openCity(city);
    this.selectUnit(null);
    if (this.me().explored[i]) { this.tileInfo = i; this.renderCard(); }
  }

  onOrder(sx: number, sy: number) {
    const g = this.g;
    if (!g || this.busy || this.demo || this.v.anim) return;
    const i = this.tileAt(sx, sy);
    const u = this.selected();
    if (i < 0) return;
    if (!u || u.owner !== this.v.human) return this.onTap(sx, sy, true);
    if (this.v.targets.includes(i)) { this.combat = { unit: u.id, tile: i }; this.doAttack(); return; }
    if (this.v.paths && pathTo(this.v.paths, i)) this.moveTo(u, i);
    else this.onTap(sx, sy, true);
  }

  animate(u: Unit, visited: number[], done: () => void) {
    if (this.prefs.anim && visited.length > 1) {
      const g = this.g!;
      this.v.anim = { unit: u.id, pts: visited.map((i) => center(i, g.W, R)), t0: performance.now(), dur: Math.min(1000, 140 * (visited.length - 1)) };
      this.animDone = done;
      this.dirty = true;
    } else done();
  }

  moveTo(u: Unit, dest: number) {
    const path = pathTo(this.v.paths!, dest);
    if (!path) return;
    const visited = moveAlong(this.g!, u, path);
    this.v.preview = null;
    this.v.targets = [];
    this.animate(u, visited, () => this.afterAction(u));
  }

  afterAction(u: Unit) {
    this.drainFx();
    this.drainNotes();
    const g = this.g!;
    if (g.winner) return this.showGameOver();
    if (!g.units.includes(u)) { this.selectUnit(null); this.refresh(); return; }
    if (u.mv > 0 && !u.path && !u.fort && !u.sleep) this.selectUnit(u, false);
    else if (this.prefs.autoNext) this.nextUnit();
    else this.selectUnit(u, false);
    this.refresh();
  }

  doAttack() {
    const g = this.g!;
    if (!this.combat) return;
    const u = unitById(g, this.combat.unit);
    const tile = this.combat.tile;
    this.combat = null;
    if (!u) return;
    let visited = [u.at];
    const d = UNITS[u.type];
    if (!d.rs && dist(g, u.at, tile) > 1) {
      const from = this.bestAttackFrom(u, tile);
      const path = from >= 0 ? pathTo(this.v.paths!, from) : null;
      if (!path) return;
      visited = moveAlong(g, u, path);
      if (u.at !== from || u.mv <= 0) { this.animate(u, visited, () => this.afterAction(u)); return; }
    }
    this.v.targets = [];
    this.animate(u, visited, () => {
      attack(g, u, tile);
      if (navigator.vibrate) navigator.vibrate(20);
      this.afterAction(u);
    });
  }

  nextUnit() {
    const g = this.g!;
    const mine = g.units.filter((u) => u.owner === this.v.human && unitNeedsOrders(u) && !this.skipped.has(u.id));
    if (!mine.length) { this.selectUnit(null); this.refresh(); return; }
    const cur = this.v.sel ?? -1;
    const next = mine.find((u) => u.id > cur) || mine[0];
    this.selectUnit(next, true);
  }

  openCity(c: City) {
    this.cityOpen = c.id;
    this.v.sel = null; this.v.paths = null; this.v.targets = []; this.v.preview = null;
    this.combat = null; this.tileInfo = -1;
    const desk = window.innerWidth >= 900;
    this.centerOn(c.at, true, desk ? 0 : this.v.h * 0.3);
    if (desk) { this.v.cam && (this.v.cam.tx += 200 / this.v.zoom); }
    this.renderCity();
    this.renderCard();
    this.renderMain();
  }
  renderCity() {
    const c = this.cityOpen !== null ? cityById(this.g!, this.cityOpen) : undefined;
    const el = $('sheet');
    if (!c || c.owner !== this.v.human) { el.hidden = true; this.cityOpen = null; return; }
    const top = el.scrollTop;
    el.innerHTML = cityPanel(this, c);
    el.hidden = false;
    el.scrollTop = top;
  }
  closeSheet() {
    $('sheet').hidden = true;
    this.cityOpen = null;
    this.renderMain();
  }

  // ───────── Конец хода ─────────
  mainAction() {
    const st = mainState(this);
    const g = this.g!;
    switch (st.act) {
      case 'gameover': return this.showGameOver();
      case 'choice': return this.showChoice();
      case 'tech': return this.openModal(techTree(this));
      case 'idleCity': { const c = playerCities(g, this.v.human).find((x) => !x.queue.length); if (c) this.openCity(c); return; }
      case 'next': return this.nextUnit();
      default: return this.endTurn();
    }
  }

  endTurn() {
    const g = this.g!;
    if (this.busy || g.winner) return;
    this.busy = true;
    this.selectUnit(null);
    this.closeSheet();
    $('busy').hidden = false;
    setTimeout(() => {
      try { endTurn(g); }
      catch (e) { console.error(e); this.toast('Ошибка при обработке хода: ' + (e as Error).message, 'bad'); }
      this.skipped.clear();
      this.busy = false;
      $('busy').hidden = true;
      this.drainFx();
      this.drainNotes();
      this.save();
      if (g.winner) { this.refresh(); this.showGameOver(); return; }
      this.refresh();
      const me = this.me();
      if (me.pending.length) this.showChoice();
      else {
        const first = g.units.find((u) => u.owner === me.id && unitNeedsOrders(u));
        if (first) this.selectUnit(first, true);
      }
    }, 30);
  }

  // ───────── Уведомления ─────────
  drainNotes() {
    const g = this.g!;
    const mine = g.notes.filter((n) => n.pid === this.v.human);
    g.notes = [];
    for (const n of mine) this.log.push({ turn: g.turn, text: n.text, kind: n.kind, at: n.at });
    const show = mine.slice(-4);
    for (const n of show) this.toast(n.text, n.kind, n.at);
    if (mine.length > 4) this.toast(`И ещё ${mine.length - 4} — в журнале событий`, 'info');
  }
  drainFx() {
    const g = this.g!;
    const vis = visibleOf(g, this.v.human);
    const now = performance.now();
    for (const f of g.fx) {
      if (!vis[f.at]) continue;
      const c = center(f.at, g.W, R);
      this.v.floats.push({ x: c.x, y: c.y, text: f.text, color: f.color, t0: now });
    }
    g.fx = [];
    this.dirty = true;
  }
  toast(text: string, kind: NoteKind = 'info', at?: number) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast k-' + kind;
    const icon = { info: 'book', good: 'check', bad: 'heart', war: 'swords', tech: 'flask', city: 'castle' }[kind];
    el.innerHTML = `${svg(icon)}<span>${text.replace(/</g, '&lt;')}</span>`;
    el.onclick = () => { if (at !== undefined && this.g && !this.demo) this.centerOn(at); el.remove(); };
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild!.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200 + box.children.length * 300);
  }

  // ───────── Рендер HUD ─────────
  refresh() {
    if (!this.g || this.demo) return;
    $('top').innerHTML = topBar(this);
    this.renderCard();
    this.renderMain();
    if (this.cityOpen !== null) this.renderCity();
    this.dirty = true;
  }
  renderCard() {
    const el = $('card');
    const g = this.g;
    if (!g || this.demo) { el.hidden = true; return; }
    let html = '';
    const u = this.selected();
    if (this.combat) {
      const cu = unitById(g, this.combat.unit);
      if (cu) html = combatCard(this, cu, this.combat.tile);
    } else if (u) html = unitCard(this, u);
    else if (this.tileInfo >= 0) html = tileCard(this, this.tileInfo);
    el.innerHTML = html;
    el.hidden = !html;
  }
  renderMain() {
    if (!this.g || this.demo) return;
    const st = mainState(this);
    const b = $('b-main');
    b.innerHTML = `${svg(st.icon)}<span><span class="t">${st.t}</span><span class="s">${st.s}</span></span>`;
    b.classList.toggle('pulse', !!st.pulse);
    b.title = st.act === 'end' ? 'Завершить ход (Enter)' : 'Следующий шаг (Enter)';
    const f = $('b-force');
    f.hidden = !st.force;
    f.innerHTML = `${svg('hourglass')}Завершить ход`;
  }

  // ───────── Модальные окна ─────────
  openModal(html: string) {
    const m = $('modal');
    m.innerHTML = html;
    m.hidden = false;
    (m.querySelector('button:not([disabled])') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  closeModal() {
    const m = $('modal');
    m.hidden = true;
    m.innerHTML = '';
  }
  showChoice(): void {
    const me = this.me();
    const ch = me.pending[0];
    if (!ch) { this.closeModal(); this.refresh(); return; }
    const html = choiceDialog(this, ch);
    if (!html) { me.pending.shift(); return this.showChoice(); }
    this.openModal(html);
  }
  showGameOver() {
    this.closeModal();
    this.closeSheet();
    this.selectUnit(null);
    this.v.revealAll = true;
    this.dirty = true;
    $('screen').innerHTML = gameOverScreen(this);
    store(SAVE_KEY, null);
  }

  // ───────── Делегирование кликов ─────────
  act(name: string, el: HTMLElement) {
    const g = this.g;
    const ds = el.dataset;
    const me = g && !this.demo ? this.me() : null;
    const u = g && !this.demo ? this.selected() : undefined;
    switch (name) {
      // меню и экраны
      case 'continue': {
        const raw = store(SAVE_KEY);
        if (raw) { try { this.startGame(JSON.parse(raw), false); } catch { this.toast('Сохранение повреждено', 'bad'); } }
        return;
      }
      case 'setup': $('screen').innerHTML = setupScreen(this, this.setup); if (!this.demo) { $('hud').hidden = true; this.startDemo(); } return;
      case 'set': {
        const k = ds.k as keyof Settings;
        (this.setup as any)[k] = ds.v;
        if (k === 'size') this.setup.players = Math.min(this.setup.players, MAPS[this.setup.size].max);
        $('screen').innerHTML = setupScreen(this, this.setup);
        return;
      }
      case 'opp': {
        const max = MAPS[this.setup.size].max;
        this.setup.players = Math.max(2, Math.min(max, this.setup.players + Number(ds.d)));
        $('screen').innerHTML = setupScreen(this, this.setup);
        return;
      }
      case 'start': {
        const inp = document.getElementById('seed') as HTMLInputElement | null;
        if (inp) this.setup.seed = (parseInt(inp.value.replace(/\D/g, ''), 10) || 1) | 0;
        return this.newGame({ ...this.setup, daily: false });
      }
      case 'daily': return this.newGame(dailySettings());
      case 'store': $('screen').innerHTML = storeScreen(this); return;
      case 'setTheme': this.prefs.theme = ds.id!; this.savePrefs(); this.dirty = true; $('screen').innerHTML = storeScreen(this); return;
      case 'help':
        this.closeModal();
        $('screen').innerHTML = helpScreen(!!g && !this.demo && !g.winner);
        return;
      case 'closeScreen': $('screen').innerHTML = ''; return;
      case 'toMenu': this.save(); this.showMenu(); return;
      case 'viewMap': $('screen').innerHTML = ''; $('hud').hidden = true; this.toast('Нажмите «Esc» или кнопку «Назад» браузера, чтобы вернуться в меню', 'info'); this.viewing = true; return;
      // HUD
      case 'main': return this.mainAction();
      case 'forceEnd': return this.endTurn();
      case 'zoomIn': return this.zoomAt(1.25, this.v.w / 2, this.v.h / 2);
      case 'zoomOut': return this.zoomAt(0.8, this.v.w / 2, this.v.h / 2);
      case 'tech': return this.openModal(techTree(this));
      case 'diplo': this.confirmWar = null; return this.openModal(diploPanel(this));
      case 'econ': return this.openModal(econDialog(this));
      case 'menu': return this.openModal(menuDialog(this));
      case 'log': return this.openModal(logDialog(this));
      case 'cycleTheme': {
        const ids = Object.keys(THEMES);
        this.prefs.theme = ids[(ids.indexOf(this.prefs.theme) + 1) % ids.length];
        this.savePrefs(); this.dirty = true;
        return this.openModal(menuDialog(this));
      }
      case 'toggleAnim': this.prefs.anim = !this.prefs.anim; this.savePrefs(); return this.openModal(menuDialog(this));
      case 'closeModal': this.closeModal(); this.refresh(); return;
      case 'closeSheet': return this.closeSheet();
      case 'deselect': this.selectUnit(null); return;
      // юниты
      case 'go': if (u && this.v.preview) this.moveTo(u, this.v.preview.dest); return;
      case 'found': {
        if (!u || !g || !canFoundAt(g, u.at).ok) return;
        const c = foundCity(g, u);
        this.selectUnit(null);
        this.drainNotes();
        if (c) this.openCity(c);
        this.refresh();
        return;
      }
      case 'fortify': if (u) { u.fort = 1; this.afterAction(u); } return;
      case 'sleep': if (u) { u.sleep = true; this.afterAction(u); } return;
      case 'wake': if (u) { u.fort = 0; u.sleep = false; this.selectUnit(u, false); this.refresh(); } return;
      case 'cancelPath': if (u) { u.path = null; this.selectUnit(u, false); this.refresh(); } return;
      case 'skip': if (u) { this.skipped.add(u.id); this.nextUnit(); this.refresh(); } return;
      case 'disband':
        if (!u || !g) return;
        if (this.confirmDisband !== u.id) { this.confirmDisband = u.id; this.renderCard(); return; }
        removeUnit(g, u);
        this.confirmDisband = null;
        this.selectUnit(null);
        this.refresh();
        return;
      case 'cancelCombat': this.combat = null; this.renderCard(); return;
      case 'attack': return this.doAttack();
      // город
      case 'build': case 'enqueue': {
        const c = this.cityOpen !== null && g ? cityById(g, this.cityOpen) : undefined;
        if (!c) return;
        const it: BuildItem = { kind: ds.kind as 'unit' | 'bld', id: ds.id! };
        if (!canBuild(g!, c, it).ok) return;
        if (name === 'build' || !c.queue.length) {
          if (c.queue.length && name === 'build') c.queue[0] = it; else c.queue.push(it);
        } else c.queue.push(it);
        this.refresh();
        return;
      }
      case 'unqueue': {
        const c = this.cityOpen !== null && g ? cityById(g, this.cityOpen) : undefined;
        if (c) { c.queue.splice(Number(ds.k), 1); this.refresh(); }
        return;
      }
      case 'buy': {
        const c = this.cityOpen !== null && g ? cityById(g, this.cityOpen) : undefined;
        if (c && buyItem(g!, c)) { this.drainNotes(); this.refresh(); }
        return;
      }
      case 'focus': {
        const c = this.cityOpen !== null && g ? cityById(g, this.cityOpen) : undefined;
        if (c) { c.focus = ds.f as City['focus']; this.refresh(); }
        return;
      }
      case 'cityNav': {
        if (!g || this.cityOpen === null) return;
        const all = playerCities(g, this.v.human);
        const k = all.findIndex((c) => c.id === this.cityOpen);
        const next = all[(k + Number(ds.d) + all.length) % all.length];
        if (next) this.openCity(next);
        return;
      }
      // наука и дипломатия
      case 'research': if (me && g) { setResearch(g, me, ds.id!); this.openModal(techTree(this)); this.refresh(); } return;
      case 'declareWar': {
        const id = Number(ds.id);
        if (!g || !me) return;
        if (this.confirmWar !== id) { this.confirmWar = id; return this.openModal(diploPanel(this)); }
        declareWar(g, me.id, id);
        this.confirmWar = null;
        this.drainNotes();
        this.openModal(diploPanel(this));
        this.refresh();
        return;
      }
      case 'proposePeace': {
        if (!g || !me) return;
        const ai = g.players[Number(ds.id)];
        const r = aiAcceptPeace(g, ai, me.id);
        if (r.ok) makePeace(g, me.id, ai.id);
        else this.toast(r.why, 'war');
        this.drainNotes();
        this.openModal(diploPanel(this));
        this.refresh();
        return;
      }
      case 'pickCharter': {
        if (!me) return;
        const ch = me.pending[0];
        if (ch?.kind === 'charter' && ch.options.includes(ds.id!)) {
          me.charters.push(ds.id!);
          me.pending.shift();
          this.toast(`Принята хартия «${CHARTERS[ds.id!].name}»`, 'good');
        }
        return this.showChoice();
      }
      case 'pickEvent': {
        if (!me || !g) return;
        const ch = me.pending.shift();
        if (ch) resolveEvent(g, me, ch, Number(ds.k));
        this.drainNotes();
        return this.showChoice();
      }
      case 'peaceAnswer': {
        if (!me || !g) return;
        const ch = me.pending.shift();
        if (ch?.kind === 'peace' && ds.ok === '1') makePeace(g, me.id, ch.from);
        this.drainNotes();
        return this.showChoice();
      }
      case 'gameover': return this.showGameOver();
    }
  }
  viewing = false;

  key(e: KeyboardEvent) {
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    const g = this.g;
    if (e.key === 'Escape') {
      if (this.viewing) { this.viewing = false; this.showMenu(); return; }
      if (!$('modal').hidden && !this.me().pending.length) { this.closeModal(); this.refresh(); return; }
      if (!$('sheet').hidden) return this.closeSheet();
      if (this.combat) { this.combat = null; this.renderCard(); return; }
      if (this.v.sel !== null || this.tileInfo >= 0) return this.selectUnit(null);
      if (g && !this.demo && !g.winner && !$('screen').innerHTML) this.openModal(menuDialog(this));
      return;
    }
    if (!g || this.demo || this.busy || g.winner || !$('modal').hidden || $('screen').innerHTML) return;
    const u = this.selected();
    const k = e.key.toLowerCase();
    const pan = 90;
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) this.endTurn(); else this.mainAction(); return; }
    if (e.key === ' ') { e.preventDefault(); if (u) this.act('skip', document.body); return; }
    if (e.key === 'ArrowLeft') return this.pan(pan, 0);
    if (e.key === 'ArrowRight') return this.pan(-pan, 0);
    if (e.key === 'ArrowUp') return this.pan(0, pan);
    if (e.key === 'ArrowDown') return this.pan(0, -pan);
    if (k === '+' || k === '=') return this.zoomAt(1.2, this.v.w / 2, this.v.h / 2);
    if (k === '-' || k === '_') return this.zoomAt(0.83, this.v.w / 2, this.v.h / 2);
    const map: Record<string, string> = { f: 'fortify', s: 'sleep', b: 'found', а: 'fortify', ы: 'sleep', и: 'found' };
    if (map[k] && u) return this.act(map[k], document.body);
    if (k === 'n' || k === 'т') return this.nextUnit();
    if (k === 't' || k === 'е') return this.act('tech', document.body);
    if (k === 'd' || k === 'в') return this.act('diplo', document.body);
    if (k === 'c' || k === 'с') {
      const cap = playerCities(g, this.v.human).find((c) => c.capital);
      if (cap) this.centerOn(cap.at);
    }
  }
}

export const app = new App();
