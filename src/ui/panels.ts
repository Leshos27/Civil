// HTML-панели игрового интерфейса (верхняя панель, карточки, город, технологии, дипломатия, диалоги).
import { BUILDINGS, CHARTERS, CLASS_NAMES, ERA_NAMES, FEATURES, IMPROVEMENTS, NATIONS, RESOURCES, TECHS, TECH_LIST, TERRAIN, UNITS } from '../core/data';
import { eventById } from '../core/events';
import {
  atWar, availableUnits, borderNeed, buildingCost, buyCost, canBuild, canBuy, cityAt, cityMaxHp, cityStrength, cityYields,
  devNeed, goldIncome, growthNeed, improvementFor, isMil, itemCost, militaryPower, playerCities, playerScience, techCost,
  tileDefense, tileYield, unitCost, unitMaxMoves, unlocksOf, yearOf,
} from '../core/rules';
import type { Choice, City, Game, Player, Unit } from '../core/types';
import { Prediction, canFoundAt, predict, relationScore, unitNeedsOrders, visibleOf } from '../core/world';
import type { App } from './app';
import { svg } from './icons';
import { lightColor } from './render';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const plural = (n: number, a: string, b: string, c: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c;
};
export const turnsStr = (n: number) => `${n} ${plural(n, 'ход', 'хода', 'ходов')}`;
const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

function yld(f: number, p: number, g: number) {
  const out: string[] = [];
  if (f) out.push(`<span class="y f">${svg('wheat')}${f}</span>`);
  if (p) out.push(`<span class="y p">${svg('hammer')}${p}</span>`);
  if (g) out.push(`<span class="y g">${svg('coin')}${g}</span>`);
  return out.length ? `<div class="yields">${out.join('')}</div>` : '<span class="hint">Ничего не даёт</span>';
}

// ───────── Верхняя панель ─────────
export function topBar(app: App) {
  const g = app.g!;
  const p = g.players[app.v.human];
  const sci = playerScience(g, p.id);
  const inc = goldIncome(g, p.id);
  let research = 'Не выбрано';
  if (p.cur) {
    const cost = techCost(g, p, p.cur);
    const left = Math.max(0, cost - (p.prog[p.cur] || 0));
    research = `${TECHS[p.cur].name} · ${Math.max(1, Math.ceil(left / Math.max(1, sci)))}`;
  }
  const wars = g.players.filter((q) => q.alive && atWar(g, p.id, q.id)).length;
  return `
  <button class="nation-chip" data-act="diplo" title="Дипломатия"><span class="dot" style="--c:${p.color}"></span><span class="nm">${esc(p.name)}</span></button>
  <button class="stat sci" data-act="tech" title="Наука и исследования">${svg('flask')}<span class="col"><b>${sign(sci)}</b><span class="sub">${esc(research)}</span></span></button>
  <button class="stat gold" data-act="econ" title="Казна: ${inc.gross} доход, −${inc.units} армия, −${inc.blds} здания">${svg('coin')}<span class="col"><b>${p.gold}</b><span class="delta ${inc.net < 0 ? 'neg' : ''}">${sign(inc.net)}<span class="per">/ход</span></span></span></button>
  <div class="stat turn"><span class="col"><b>Ход ${g.turn}<span class="lim">/${g.settings.turnLimit}</span></b><span class="sub">${yearOf(g)} · ${ERA_NAMES[p.era]}</span></span></div>
  <div class="spacer"></div>
  <button class="icon-btn" data-act="tech" aria-label="Технологии" title="Технологии (T)">${svg('flask')}</button>
  <button class="icon-btn" data-act="diplo" aria-label="Дипломатия" title="Дипломатия (D)">${svg('globe')}${wars ? `<span class="badge">${wars}</span>` : ''}</button>
  <button class="icon-btn" data-act="menu" aria-label="Меню" title="Меню (Esc)">${svg('menu')}</button>`;
}

// ───────── Главная кнопка ─────────
export interface MainState { t: string; s: string; icon: string; act: string; pulse?: boolean; force?: boolean }
export function mainState(app: App): MainState {
  const g = app.g!;
  const p = g.players[app.v.human];
  if (g.winner) return { t: 'Итоги', s: 'Партия окончена', icon: 'crown', act: 'gameover' };
  if (p.pending.length) return { t: 'Решение', s: 'Летопись ждёт', icon: 'book', act: 'choice', pulse: true };
  if (!p.cur && !p.rq.length && TECH_LIST.some((t) => !p.techs.includes(t.id))) return { t: 'Наука', s: 'Выберите исследование', icon: 'flask', act: 'tech', force: true };
  const idle = playerCities(g, p.id).find((c) => !c.queue.length);
  if (idle) return { t: 'Производство', s: idle.name, icon: 'hammer', act: 'idleCity', force: true };
  const waiting = g.units.filter((u) => u.owner === p.id && unitNeedsOrders(u) && !app.skipped.has(u.id)).length;
  if (waiting) return { t: 'Следующий', s: `Ждут приказа: ${waiting}`, icon: 'target', act: 'next', force: true };
  return { t: 'Конец хода', s: `Ход ${g.turn} → ${g.turn + 1}`, icon: 'hourglass', act: 'end', pulse: true };
}

// ───────── Карточка юнита ─────────
function siteRating(g: Game, i: number): string {
  let s = 0;
  for (const n of app_radius(g, i)) {
    const y = tileYield(g, n);
    s += y.f * 1.3 + y.p + y.g * 0.6 + (g.tiles[n].r ? 1.5 : 0);
  }
  return s > 38 ? 'отличное' : s > 30 ? 'хорошее' : s > 22 ? 'среднее' : 'бедное';
}
import { inRadius } from '../core/hex';
const app_radius = (g: Game, i: number) => inRadius(i, 2, g.W, g.H);

export function unitCard(app: App, u: Unit): string {
  const g = app.g!;
  const d = UNITS[u.type];
  const col = g.players[u.owner].color;
  const mine = u.owner === app.v.human;
  const stars = u.lvl ? `<span class="stars">${'★'.repeat(u.lvl)}</span>` : '';
  const meta: string[] = [];
  if (d.cls !== 'civ') meta.push(`<span title="Сила">${svg('sword')}${d.s}</span>`);
  if (d.rs) meta.push(`<span title="Дальний бой">${svg('bow')}${d.rs} · ${d.range}</span>`);
  meta.push(`<span title="Очки хода">${svg('boot')}${u.mv}/${unitMaxMoves(g, u)}</span>`);
  meta.push(`<span class="hp ${u.hp < 40 ? 'low' : ''}" title="Здоровье">${svg('heart')}${u.hp}</span>`);
  let hint = '';
  const acts: string[] = [];
  const act = (name: string, icon: string, label: string, cls = '', dis = false) =>
    `<button class="act ${cls}" data-act="${name}" ${dis ? 'disabled' : ''}>${svg(icon)}<span>${label}</span></button>`;
  if (mine) {
    if (app.v.preview) {
      const P = app.v.paths!;
      const t = P.turns[app.v.preview.dest] + (P.left[app.v.preview.dest] === 0 ? 1 : 0);
      hint = `Путь: ${turnsStr(Math.max(1, t))}. ${app.touch ? 'Нажмите на клетку ещё раз или «Идти».' : 'Кликните, чтобы идти.'}`;
      acts.push(act('go', 'boot', 'Идти', 'primary'));
    }
    if (u.type === 'settler') {
      const ok = canFoundAt(g, u.at);
      if (!app.v.preview) hint = ok.ok ? `Место для города: ${siteRating(g, u.at)}.` : `Здесь нельзя: ${ok.why?.toLowerCase()}.`;
      acts.push(act('found', 'house', 'Основать', app.v.preview ? '' : 'primary', !ok.ok || u.mv <= 0));
    }
    if (u.fort || u.sleep) acts.push(act('wake', 'eye', 'Подъём'));
    else if (d.cls !== 'civ') acts.push(act('fortify', 'shield', 'Укрепить', '', u.mv <= 0));
    else acts.push(act('sleep', 'zz', 'Спать'));
    if (u.path) acts.push(act('cancelPath', 'close', 'Отменить путь'));
    acts.push(act('skip', 'skip', 'Пропуск'));
    acts.push(act('disband', 'trash', app.confirmDisband === u.id ? 'Точно?' : 'Распустить', 'danger'));
    if (!hint && app.v.targets.length) hint = `Целей в досягаемости: ${app.v.targets.length} — отмечены красным.`;
    if (!hint && u.mv <= 0) hint = 'Ходы закончились — отряд продолжит в следующем ходу.';
    if (!hint && d.cls !== 'civ' && u.mv > 0) hint = app.touch ? 'Коснитесь клетки, чтобы проложить путь. Долгое касание — сразу идти.' : 'Клик — идти, ПКМ — сразу идти/атаковать.';
  }
  return `<div class="uc">
    <div class="uc-head">
      <span class="badge-tok ${d.cls === 'civ' ? 'sq' : ''} ${lightColor(col) ? 'light' : ''}" style="--c:${col}">${svg(d.icon)}</span>
      <div style="min-width:0">
        <div class="uc-title">${esc(d.name)} ${stars}${d.unique ? '<span class="chip gold">уникальный</span>' : ''}</div>
        <div class="uc-meta">${meta.join('')}<span>${CLASS_NAMES[d.cls]}</span>${mine ? '' : `<span style="color:${col}">${esc(g.players[u.owner].name)}</span>`}</div>
      </div>
      <button class="uc-close" data-act="deselect" aria-label="Закрыть">${svg('close')}</button>
    </div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
    ${acts.length ? `<div class="actions">${acts.join('')}</div>` : ''}
  </div>`;
}

// ───────── Информация о клетке ─────────
export function tileCard(app: App, i: number): string {
  const g = app.g!;
  const t = g.tiles[i];
  const p = g.players[app.v.human];
  const T = TERRAIN[t.t];
  const y = tileYield(g, i, t.owner >= 0 ? g.players[t.owner] : p);
  const name = t.f ? `${FEATURES[t.f].name} (${T.name.toLowerCase()})` : T.name;
  const vis = visibleOf(g, app.v.human)[i];
  const lines: string[] = [];
  if (t.r) lines.push(`Ресурс: <b>${RESOURCES[t.r].name}</b>`);
  if (t.imp) lines.push(`Улучшение: ${IMPROVEMENTS[t.imp].name}`);
  else {
    const imp = improvementFor(t);
    if (imp && t.dev > 0) lines.push(`Освоение: ${IMPROVEMENTS[imp].name} ${t.dev}/${devNeed(g)}`);
    else if (imp && t.owner === p.id) lines.push(`Можно освоить: ${IMPROVEMENTS[imp].name} (клетка развивается, пока её обрабатывают)`);
  }
  const def = tileDefense(g, i);
  if (T.pass) lines.push(`Ход: ${t.f ? 2 : T.move} · Оборона ${def ? '+' + def + '%' : '0%'}`);
  else lines.push(T.water ? 'Вода — непроходимо для сухопутных отрядов' : 'Горы — непроходимы');
  if (t.owner >= 0) lines.push(`Владелец: <span style="color:${g.players[t.owner].color}">${esc(g.players[t.owner].name)}</span>`);
  const city = cityAt(g, i);
  let extra = '';
  if (city && city.owner !== app.v.human) {
    const st = cityStrength(g, city);
    extra += `<div class="hint">г. <b>${esc(city.name)}</b> · население ${city.pop} · сила ${st.total.toFixed(1)} · прочность ${city.hp}/${cityMaxHp(city)}</div>`;
  }
  if (vis) for (const u of g.units.filter((x) => x.at === i && x.owner !== app.v.human)) {
    const d = UNITS[u.type];
    extra += `<div class="hint"><span style="color:${g.players[u.owner].color}">${esc(g.players[u.owner].name)}</span>: ${d.name}${d.cls !== 'civ' ? ` · сила ${d.s}${d.rs ? '/' + d.rs : ''}` : ''} · ${u.hp} HP${atWar(g, app.v.human, u.owner) ? ' · <span style="color:var(--war)">война</span>' : ''}</div>`;
  }
  return `<div class="uc">
    <div class="uc-head">
      <div style="min-width:0;flex:1"><div class="uc-title">${name}</div>${yld(y.f, y.p, y.g)}</div>
      <button class="uc-close" data-act="deselect" aria-label="Закрыть">${svg('close')}</button>
    </div>
    <div class="hint">${lines.join('<br>')}</div>${extra}
  </div>`;
}

// ───────── Прогноз боя ─────────
function modsList(b: Prediction['a']) {
  return `<div class="mods"><span>База ${b.base}</span>${b.mods.map((m) => `<span class="${m.pct >= 0 ? 'pos' : 'neg'}">${m.label} ${m.pct >= 0 ? '+' : '−'}${Math.abs(m.pct)}%</span>`).join('')}</div>`;
}
export function combatCard(app: App, u: Unit, tile: number): string {
  const g = app.g!;
  const pr = predict(g, u, tile);
  if (!pr) return '';
  const d = UNITS[u.type];
  const aLeft = Math.max(0, u.hp - pr.toAtt);
  const dLeftPct = Math.max(0, ((pr.defHp - pr.toDef) / pr.defMax) * 100);
  const dLossPct = Math.min((pr.defHp / pr.defMax) * 100, (pr.toDef / pr.defMax) * 100);
  return `<div class="uc">
    <div class="battle">
      <div class="side"><div class="nm">${esc(d.name)}${pr.ranged ? ' (выстрел)' : ''}</div><div class="str">${pr.a.total.toFixed(1)}</div>
        <div class="hpbar"><i style="width:${aLeft}%"></i><i class="loss" style="width:${Math.min(u.hp, pr.toAtt)}%"></i></div>
        <div class="hint">${pr.toAtt ? `−${pr.toAtt} HP` : 'без потерь'}</div></div>
      <div class="vs">против</div>
      <div class="side r"><div class="nm">${esc(pr.name)}</div><div class="str">${pr.civOnly ? '—' : pr.d.total.toFixed(1)}</div>
        <div class="hpbar"><i style="width:${dLeftPct}%"></i><i class="loss" style="width:${dLossPct}%"></i></div>
        <div class="hint">−${Math.min(pr.toDef, pr.defHp)} ${pr.city ? 'прочности' : 'HP'}</div></div>
    </div>
    <div class="verdict ${pr.tone}">${pr.verdict}</div>
    ${pr.civOnly ? '' : `<details class="bd"><summary>Почему так</summary><div class="bd-grid"><div><h4>Атака</h4>${modsList(pr.a)}</div><div><h4>Оборона</h4>${modsList(pr.d)}</div></div></details>`}
    <div class="row-btns"><button class="btn" data-act="cancelCombat">Отмена</button><button class="btn primary" data-act="attack">${svg('swords')}Атаковать</button></div>
  </div>`;
}

// ───────── Город ─────────
export function cityPanel(app: App, c: City): string {
  const g = app.g!;
  const p = g.players[c.owner];
  const y = cityYields(g, c);
  const need = growthNeed(g, c.pop);
  const growT = y.surplus > 0 ? Math.ceil((need - c.food) / y.surplus) : -1;
  const bn = borderNeed(g, c.claims);
  const bT = Math.ceil(Math.max(0, bn - c.cult) / Math.max(1, y.cult));
  const cur = c.queue[0];
  const cost = cur ? itemCost(g, c.owner, cur) : 0;
  const prodT = cur ? Math.max(1, Math.ceil(Math.max(0, cost - c.prod) / Math.max(1, y.prod))) : 0;
  const all = playerCities(g, c.owner);
  const idx = all.indexOf(c);
  const tile = (k: string, cls: string, icon: string, v: number, lbl: string) => `<div class="ytile"><span class="y ${cls}">${svg(icon)}</span><b class="y ${cls}">${v}</b><small>${lbl}</small></div>`;

  const queue = c.queue.map((it, k) => {
    const nm = it.kind === 'unit' ? UNITS[it.id].name : BUILDINGS[it.id].name;
    const icon = it.kind === 'unit' ? UNITS[it.id].icon : BUILDINGS[it.id].icon;
    const ic = itemCost(g, c.owner, it);
    let sub = `${ic} произв.`;
    if (k === 0) sub = `${Math.min(c.prod, ic)}/${ic} · ${turnsStr(prodT)}`;
    const bc = buyCost(g, c, it);
    const buy = k === 0 && canBuy(it) ? `<button class="buy" data-act="buy" ${p.gold < bc ? 'disabled' : ''} title="Купить сейчас">${svg('coin')}${bc}</button>` : '';
    return `<div class="qi ${k === 0 ? 'cur' : ''}">${svg(icon)}<div class="nm"><div>${esc(nm)}</div><div>${sub}</div>${k === 0 ? `<div class="bar" style="margin-top:4px"><i style="width:${Math.min(100, (c.prod / ic) * 100)}%;background:var(--prod)"></i></div>` : ''}</div>${buy}<button class="mini" data-act="unqueue" data-k="${k}" aria-label="Убрать">${svg('close')}</button></div>`;
  }).join('') || `<div class="qi">${svg('hammer')}<div class="nm"><div>Ничего не строится</div><div>Накоплено ${c.prod} произв. — выберите проект ниже</div></div></div>`;

  const row = (kind: 'unit' | 'bld', id: string) => {
    const it = { kind, id } as const;
    const can = canBuild(g, c, it);
    if (!can.ok && can.why === 'Уже построено') return '';
    const isU = kind === 'unit';
    const nm = isU ? UNITS[id].name : BUILDINGS[id].name;
    const icon = isU ? UNITS[id].icon : BUILDINGS[id].icon;
    const ic = isU ? unitCost(g, c.owner, id) : buildingCost(g, c.owner, id);
    let desc = '';
    if (isU) {
      const d = UNITS[id];
      desc = d.cls === 'civ' ? 'Основывают новый город (−1 житель)' : `${CLASS_NAMES[d.cls]} · сила ${d.s}${d.rs ? ` · выстрел ${d.rs}` : ''} · ход ${d.mv}${d.unique ? ' · уникальный' : ''}`;
    } else desc = BUILDINGS[id].desc + (BUILDINGS[id].maint ? ` · содержание ${BUILDINGS[id].maint}` : '');
    const t = Math.max(1, Math.ceil(Math.max(0, ic - c.prod * (c.queue.length ? 0 : 1)) / Math.max(1, y.prod)));
    const wonder = !isU && (BUILDINGS[id].wonder || BUILDINGS[id].project);
    return `<div style="display:flex;gap:4px;align-items:center"><button class="bi ${wonder ? 'wonder' : ''}" data-act="build" data-kind="${kind}" data-id="${id}" ${can.ok ? '' : 'disabled'}>${svg(icon)}<div class="nm"><div>${esc(nm)}</div><div>${can.ok ? esc(desc) : esc(can.why || '')}</div></div><div class="cost"><b>${ic}</b><br>${turnsStr(t)}</div></button><button class="mini" data-act="enqueue" data-kind="${kind}" data-id="${id}" ${can.ok ? '' : 'disabled'} aria-label="В очередь" title="Добавить в очередь">${svg('plus')}</button></div>`;
  };
  const units = availableUnits(g, p).map((d) => row('unit', d.id)).join('');
  const blds = Object.values(BUILDINGS).filter((b) => !b.wonder && !b.project && (!b.tech || p.techs.includes(b.tech))).map((b) => row('bld', b.id)).join('');
  const wonders = Object.values(BUILDINGS).filter((b) => (b.wonder || b.project) && (!b.tech || p.techs.includes(b.tech))).map((b) => row('bld', b.id)).join('');
  const built = c.blds.map((b) => `<span class="chip ${BUILDINGS[b].wonder ? 'gold' : ''}">${svg(BUILDINGS[b].icon)}${esc(BUILDINGS[b].name)}</span>`).join('') || '<span class="hint">Пока ничего — начните с монумента или амбара.</span>';
  const st = cityStrength(g, c);
  const focusBtn = (f: string, label: string, icon: string) => `<button class="${c.focus === f ? 'on' : ''}" data-act="focus" data-f="${f}">${svg(icon)}${label}</button>`;
  const bd = (k: 'f' | 'p' | 'g' | 's' | 'c', title: string) => `<div><h4>${title}</h4>${y.lines[k].map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;

  return `
  <span class="grab"></span>
  <div class="sheet-head">
    <span class="badge-tok ${lightColor(p.color) ? 'light' : ''}" style="--c:${p.color}"><b style="font-size:18px">${c.pop}</b></span>
    <div style="flex:1;min-width:0"><h2>${esc(c.name)}${c.capital ? ` <span style="color:var(--gold);font-size:18px">${svg('star')}</span>` : ''}</h2><div class="sub">Население ${c.pop} · сила ${st.total.toFixed(1)} · прочность ${c.hp}/${cityMaxHp(c)}</div></div>
    ${all.length > 1 ? `<button class="mini" data-act="cityNav" data-d="-1" aria-label="Предыдущий город">‹</button><span class="hint">${idx + 1}/${all.length}</span><button class="mini" data-act="cityNav" data-d="1" aria-label="Следующий город">›</button>` : ''}
    <button class="uc-close" data-act="closeSheet" aria-label="Закрыть">${svg('close')}</button>
  </div>
  <div class="ytiles">
    ${tile('f', 'f', 'wheat', y.surplus, 'еда')}${tile('p', 'p', 'hammer', y.prod, 'произв.')}${tile('g', 'g', 'coin', y.gold, 'золото')}${tile('s', 's', 'flask', y.sci, 'наука')}${tile('c', 'c', 'star', y.cult, 'культура')}
  </div>
  <details class="bd"><summary>Откуда эти числа</summary><div class="bd-grid">${bd('f', 'Еда')}${bd('p', 'Производство')}${bd('g', 'Золото')}${bd('s', 'Наука')}${bd('c', 'Культура')}</div></details>
  <div class="sec">
    <div class="prog"><div class="row"><span>Рост: ${c.food}/${need}</span><span>${growT > 0 ? `через ${turnsStr(growT)}` : y.surplus < 0 ? '<span style="color:var(--bad)">голод</span>' : 'нет роста'}</span></div><div class="bar"><i style="width:${Math.min(100, (c.food / need) * 100)}%;background:var(--food)"></i></div></div>
    <div class="prog"><div class="row"><span>Граница: ${c.cult}/${bn}</span><span>расширится через ${turnsStr(Math.max(1, bT))}</span></div><div class="bar"><i style="width:${Math.min(100, (c.cult / bn) * 100)}%;background:var(--cult)"></i></div></div>
  </div>
  <div class="sec"><h3>Фокус жителей</h3>
    <div class="seg">${focusBtn('bal', 'Баланс', 'star')}${focusBtn('food', 'Рост', 'wheat')}${focusBtn('prod', 'Произв.', 'hammer')}${focusBtn('gold', 'Золото', 'coin')}</div>
    <div class="hint">Жители сами выбирают клетки по фокусу. Обрабатываемые клетки постепенно осваиваются: появляются фермы, шахты и лесопилки${y.spec ? `. Учёных в городе: ${y.spec}` : ''}.</div>
  </div>
  <div class="sec"><h3>Производство</h3><div class="queue">${queue}</div></div>
  <div class="sec"><h3>Юниты</h3><div class="blist">${units}</div></div>
  <div class="sec"><h3>Здания</h3><div class="blist">${blds || '<span class="hint">Откройте технологии, чтобы строить здания.</span>'}</div></div>
  ${wonders ? `<div class="sec"><h3>Чудеса света</h3><div class="blist">${wonders}</div></div>` : ''}
  <div class="sec"><h3>Построено</h3><div class="chips">${built}</div></div>`;
}

// ───────── Технологии ─────────
export function techTree(app: App): string {
  const g = app.g!;
  const p = g.players[app.v.human];
  const sci = Math.max(1, playerScience(g, p.id));
  const cols = ERA_NAMES.map((era, e) => {
    const cards = TECH_LIST.filter((t) => t.era === e).map((t) => {
      const known = p.techs.includes(t.id);
      const avail = !known && t.req.every((r) => p.techs.includes(r));
      const isCur = p.cur === t.id;
      const qi = p.rq.indexOf(t.id);
      const cost = techCost(g, p, t.id);
      const prog = p.prog[t.id] || 0;
      const turns = Math.max(1, Math.ceil(Math.max(0, cost - prog) / sci));
      const cls = known ? 'known' : isCur ? 'cur' : qi >= 0 ? 'queued' : avail ? '' : 'locked';
      const unl = [...unlocksOf(t.id), ...(t.desc ? [t.desc] : [])];
      const uu = Object.values(UNITS).find((u) => u.unique === p.nation && u.tech === t.id);
      if (uu) unl.push(`${uu.name} (уник.)`);
      return `<button class="tech ${cls}" data-act="research" data-id="${t.id}" ${known ? 'disabled style="opacity:1;cursor:default"' : ''}>
        ${qi >= 0 ? `<span class="q">${qi + 2}</span>` : ''}
        <span class="tn">${esc(t.name)}</span>
        <span class="tt">${known ? 'Изучено' : `${svg('flask')} ${cost} · ${turnsStr(turns)}`}${!known && !avail ? ` · нужно: ${t.req.filter((r) => !p.techs.includes(r)).map((r) => TECHS[r].name).join(', ')}` : ''}</span>
        ${unl.length ? `<span class="un">${esc(unl.join(' · '))}</span>` : ''}
        ${isCur || prog ? `<span class="bar"><i style="width:${Math.min(100, (prog / cost) * 100)}%;background:var(--sci)"></i></span>` : ''}
      </button>`;
    }).join('');
    return `<div class="era"><h3>${era}</h3>${cards}</div>`;
  }).join('');
  return `<div class="dialog wide" role="dialog" aria-label="Технологии">
    <div class="dlg-head"><div style="flex:1"><div class="eyebrow">Наука ${sign(sci)} за ход</div><h2>Древо знаний</h2></div>
      <span class="hint" style="max-width:340px">Нажмите на любую технологию — путь к ней выстроится автоматически. Технологии, известные соседям, на 10% дешевле.</span>
      <button class="uc-close" data-act="closeModal" aria-label="Закрыть">${svg('close')}</button></div>
    <div class="tree">${cols}</div>
  </div>`;
}

// ───────── Дипломатия ─────────
export function diploPanel(app: App): string {
  const g = app.g!;
  const me = g.players[app.v.human];
  const myPow = militaryPower(g, me.id);
  const rows = g.players.filter((q) => q.id !== me.id).map((q) => {
    if (!me.rel[q.id].met) return `<div class="dip-row"><span class="badge-tok" style="--c:#3a4456">?</span><div><b>Неизвестная держава</b><div class="why">Вы ещё не встречались</div></div></div>`;
    if (!q.alive) return `<div class="dip-row" style="opacity:.55"><span class="badge-tok" style="--c:${q.color}">✝</span><div><b>${esc(q.name)}</b><div class="why">Держава пала</div></div></div>`;
    const war = me.rel[q.id].war;
    const rel = relationScore(g, q.id, me.id);
    const pow = militaryPower(g, q.id);
    const cmp = pow > myPow * 1.3 ? 'армия сильнее вашей' : pow < myPow * 0.77 ? 'армия слабее вашей' : 'армии равны';
    const confirm = app.confirmWar === q.id;
    return `<div class="dip-row">
      <span class="badge-tok ${lightColor(q.color) ? 'light' : ''}" style="--c:${q.color}">${svg('crown')}</span>
      <div style="min-width:0"><b style="font-family:var(--font-display);font-size:20px;font-weight:400">${esc(q.name)}</b> <span class="st ${war ? 'war' : 'peace'}">${war ? 'Война' : 'Мир'}</span>
        <div class="why">${NATIONS[q.nation].ability} · ${playerCities(g, q.id).length} ${plural(playerCities(g, q.id).length, 'город', 'города', 'городов')} · ${cmp} · эпоха: ${ERA_NAMES[q.era]}</div>
        <div class="why">Отношение ${rel.score >= 0 ? '+' : ''}${rel.score}: ${rel.reasons.join('; ')}</div></div>
      <div class="btns">${war
        ? `<button class="btn" data-act="proposePeace" data-id="${q.id}">${svg('dove')}Предложить мир</button>`
        : `<button class="btn danger" data-act="declareWar" data-id="${q.id}">${svg('swords')}${confirm ? 'Да, объявить' : 'Объявить войну'}</button>`}</div>
    </div>`;
  }).join('');
  return `<div class="dialog" style="width:min(720px,100%);padding:0" role="dialog" aria-label="Дипломатия">
    <div class="dlg-head"><div style="flex:1"><div class="eyebrow">Держава «${esc(me.name)}»</div><h2>Дипломатия</h2></div><button class="uc-close" data-act="closeModal" aria-label="Закрыть">${svg('close')}</button></div>
    <div class="dip">${rows}<div class="hint">ИИ объясняет своё отношение — никаких скрытых «обид». Мир можно предложить спустя несколько ходов войны.</div></div>
  </div>`;
}

// ───────── Диалоги выбора ─────────
export function choiceDialog(app: App, ch: Choice): string {
  const g = app.g!;
  const p = g.players[app.v.human];
  if (ch.kind === 'charter') {
    return `<div class="dialog" role="dialog" aria-label="Хартия эпохи">
      <div class="eyebrow">Новая эпоха · ${ERA_NAMES[ch.era]}</div>
      <h2>Хартия эпохи</h2>
      <p>Держава вступила в новую эпоху. Выберите хартию — постоянный бонус, который определит ваш путь. Выбор нельзя отменить.</p>
      <div class="choices">${ch.options.map((id) => `<button class="choice" data-act="pickCharter" data-id="${id}">${svg(CHARTERS[id].ai === 'war' ? 'swords' : CHARTERS[id].ai === 'sci' ? 'flask' : CHARTERS[id].ai === 'eco' ? 'coin' : 'wheat')}<div><b>${CHARTERS[id].name}</b><span>${CHARTERS[id].desc}</span></div></button>`).join('')}</div>
      ${p.charters.length ? `<div class="hint">Уже приняты: ${p.charters.map((c) => CHARTERS[c].name).join(', ')}</div>` : ''}
    </div>`;
  }
  if (ch.kind === 'event') {
    const e = eventById(ch.id);
    const c = g.cities.find((x) => x.id === ch.city);
    if (!e || !c) return '';
    return `<div class="dialog" role="dialog" aria-label="${esc(e.title)}">
      <div class="eyebrow">Летопись · ${yearOf(g)}</div>
      <h2>${esc(e.title)}</h2>
      <p>${esc(e.text(c, ch.amt))}</p>
      <div class="choices">${e.choices.map((o, k) => {
        const can = !o.can || o.can(g, p, c, ch.amt);
        return `<button class="choice" data-act="pickEvent" data-k="${k}" ${can ? '' : 'disabled'}>${svg(k === 0 ? 'check' : 'skip')}<div><b>${esc(o.label(ch.amt))}</b>${can ? '' : '<span>Не хватает золота</span>'}</div></button>`;
      }).join('')}</div>
    </div>`;
  }
  const from = g.players[ch.from];
  return `<div class="dialog" role="dialog" aria-label="Предложение мира">
    <div class="eyebrow">Посланник</div>
    <h2>${esc(from.name)} предлагает мир</h2>
    <p>Война длится уже ${turnsStr(g.turn - p.rel[from.id].since)}. Их послы готовы подписать мирный договор прямо сейчас.</p>
    <div class="row-btns"><button class="btn" data-act="peaceAnswer" data-ok="0">Продолжить войну</button><button class="btn primary" data-act="peaceAnswer" data-ok="1">${svg('dove')}Заключить мир</button></div>
  </div>`;
}

export function econDialog(app: App): string {
  const g = app.g!;
  const p = g.players[app.v.human];
  const inc = goldIncome(g, p.id);
  const mil = g.units.filter((u) => u.owner === p.id && isMil(u)).length;
  return `<div class="dialog" role="dialog" aria-label="Казна">
    <div class="eyebrow">Казна</div><h2>${p.gold} золота</h2>
    <div class="prog"><div class="row"><span>Доход городов</span><span>+${inc.gross}</span></div>
    <div class="row"><span>Содержание армии (${mil} отр., бесплатно ${3 + playerCities(g, p.id).length})</span><span>−${inc.units}</span></div>
    <div class="row"><span>Содержание зданий</span><span>−${inc.blds}</span></div>
    <div class="row"><b>Итого за ход</b><b>${sign(inc.net)}</b></div></div>
    <p class="hint">Золото тратится на покупку юнитов и зданий в городах и на события «Летописи». Если казна уйдёт в минус, самый дешёвый отряд будет распущен.</p>
    <div class="row-btns"><button class="btn primary" data-act="closeModal">Понятно</button></div>
  </div>`;
}

export function menuDialog(app: App): string {
  return `<div class="dialog" role="dialog" aria-label="Меню">
    <div class="eyebrow">Партия · ход ${app.g!.turn}</div><h2>Меню</h2>
    <div class="choices">
      <button class="choice" data-act="closeModal">${svg('play')}<div><b>Продолжить</b><span>Вернуться к игре</span></div></button>
      <button class="choice" data-act="log">${svg('book')}<div><b>Журнал событий</b><span>Все сообщения этой партии</span></div></button>
      <button class="choice" data-act="cycleTheme">${svg('globe')}<div><b>Облик карты: ${esc(app.themeName())}</b><span>Классика · Пергамент · Сумерки</span></div></button>
      <button class="choice" data-act="toggleAnim">${svg('gear')}<div><b>Анимации: ${app.prefs.anim ? 'вкл' : 'выкл'}</b><span>Выключите, чтобы ходы шли быстрее</span></div></button>
      <button class="choice" data-act="help">${svg('book')}<div><b>Как играть</b><span>Жесты, клавиши и цели</span></div></button>
      <button class="choice" data-act="toMenu">${svg('save')}<div><b>Сохранить и выйти</b><span>Партия сохраняется автоматически каждый ход</span></div></button>
    </div>
  </div>`;
}

export function logDialog(app: App): string {
  const items = app.log.slice(-80).reverse().map((l) => `<div class="qi">${svg(l.kind === 'tech' ? 'flask' : l.kind === 'war' ? 'swords' : l.kind === 'city' ? 'castle' : 'book')}<div class="nm"><div>${esc(l.text)}</div><div>Ход ${l.turn}</div></div></div>`).join('');
  return `<div class="dialog" role="dialog" aria-label="Журнал">
    <div style="display:flex;align-items:center"><h2 style="flex:1">Журнал событий</h2><button class="uc-close" data-act="closeModal" aria-label="Закрыть">${svg('close')}</button></div>
    <div class="queue">${items || '<span class="hint">Пока пусто.</span>'}</div>
  </div>`;
}

export { CHARTERS };
export type { Player };
