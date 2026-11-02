// «Летопись» — нарративные события с выбором. Дают сессиям на телефоне маленькие
// истории и решения, а в будущем — сезонный контент LiveOps без обновления клиента.
import { UNITS } from './data';
import { rint, rnd } from './rng';
import { availableUnits, cityById, cityYields, growthNeed, playerCities, techCost } from './rules';
import type { Choice, City, Game, Player } from './types';
import { addUnit, addXp, findSpawn, notify } from './world';

interface EventChoice { label: (amt: number) => string; apply: (g: Game, p: Player, c: City, amt: number) => string; can?: (g: Game, p: Player, c: City, amt: number) => boolean }
export interface EventDef { id: string; title: string; text: (c: City, amt: number) => string; when: (g: Game, p: Player, c: City) => boolean; base: number; choices: EventChoice[] }

const best = (g: Game, p: Player) => availableUnits(g, p).filter((d) => d.cls === 'melee' || d.cls === 'gun').sort((a, b) => b.s - a.s)[0];

export const EVENTS: EventDef[] = [
  {
    id: 'scholars', title: 'Странствующие мудрецы', base: 30,
    text: (c, a) => `В город ${c.name} прибыли учёные из дальних земель. За покровительство (${a} золота) они поделятся знаниями.`,
    when: (g, p) => !!p.cur,
    choices: [
      { label: (a) => `Принять (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; const add = Math.round(techCost(g, p, p.cur!) * 0.4); p.prog[p.cur!] = (p.prog[p.cur!] || 0) + add; return `+${add} к исследованию`; } },
      { label: () => 'Отказать', apply: () => 'Мудрецы ушли дальше' },
    ],
  },
  {
    id: 'vein', title: 'Богатая жила', base: 40,
    text: (c, a) => `Рудокопы близ города ${c.name} нашли богатую жилу. Чеканить монету или отдать металл мастерам?`,
    when: () => true,
    choices: [
      { label: (a) => `Чеканить монету (+${a} золота)`, apply: (g, p, c, a) => { p.gold += a; return `+${a} золота`; } },
      { label: (a) => `Мастерам (+${Math.round(a * 0.8)} производства)`, apply: (g, p, c, a) => { c.prod += Math.round(a * 0.8); return `${c.name}: +${Math.round(a * 0.8)} производства`; } },
    ],
  },
  {
    id: 'drought', title: 'Засуха', base: 25,
    text: (c, a) => `Над городом ${c.name} второй месяц нет дождей. Открыть казённые амбары?`,
    when: (g, p, c) => c.pop >= 2,
    choices: [
      { label: (a) => `Открыть амбары (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; return 'Народ благодарен'; } },
      { label: () => 'Пусть терпят', apply: (g, p, c) => { c.food = 0; return `${c.name}: запасы еды потеряны`; } },
    ],
  },
  {
    id: 'mercs', title: 'Наёмники', base: 45,
    text: (c, a) => `У ворот города ${c.name} стоит отряд наёмников. Они готовы служить за ${a} золота.`,
    when: (g, p) => !!best(g, p),
    choices: [
      {
        label: (a) => `Нанять (−${a} золота)`, can: (g, p, c, a) => p.gold >= a,
        apply: (g, p, c, a) => {
          const d = best(g, p);
          const at = findSpawn(g, c, d);
          if (at < 0) return 'Негде разместить отряд';
          p.gold -= a;
          const u = addUnit(g, p.id, d.id, at);
          addXp(u, 10);
          return `Нанят отряд «${d.name}»`;
        },
      },
      { label: () => 'Прогнать', apply: () => 'Наёмники ушли к соседям' },
    ],
  },
  {
    id: 'harvest', title: 'Праздник урожая', base: 20,
    text: (c) => `Небывалый урожай в окрестностях города ${c.name}. Устроить пир для всех?`,
    when: () => true,
    choices: [
      { label: (a) => `Устроить пир (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; c.food += Math.round(growthNeed(g, c.pop) * 0.6); return `${c.name}: город скоро вырастет`; } },
      { label: (a) => `Продать излишки (+${Math.round(a * 0.7)} золота)`, apply: (g, p, c, a) => { p.gold += Math.round(a * 0.7); return `+${Math.round(a * 0.7)} золота`; } },
    ],
  },
  {
    id: 'inventor', title: 'Великий изобретатель', base: 40,
    text: (c, a) => `Изобретатель из города ${c.name} просит ${a} золота на мастерскую. Он обещает ускорить наши исследования.`,
    when: (g, p) => !!p.cur,
    choices: [
      { label: (a) => `Финансировать (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; const add = Math.round(techCost(g, p, p.cur!) * 0.6); p.prog[p.cur!] = (p.prog[p.cur!] || 0) + add; return `+${add} к исследованию`; } },
      { label: () => 'Пусть ищет другого покровителя', apply: (g, p) => { const add = Math.round(techCost(g, p, p.cur!) * 0.1); p.prog[p.cur!] = (p.prog[p.cur!] || 0) + add; return `+${add} к исследованию`; } },
    ],
  },
  {
    id: 'pilgrims', title: 'Паломники', base: 25,
    text: (c) => `В город ${c.name} стекаются паломники. Построить святилище или взять с них пошлину?`,
    when: () => true,
    choices: [
      { label: () => 'Святилище (+границы)', apply: (g, p, c, a) => { c.cult += a; return `${c.name}: культура растёт`; } },
      { label: (a) => `Пошлина (+${a} золота)`, apply: (g, p, c, a) => { p.gold += a; return `+${a} золота`; } },
    ],
  },
  {
    id: 'plague', title: 'Поветрие', base: 35,
    text: (c, a) => `В городе ${c.name} вспыхнула болезнь. Карантин обойдётся в ${a} золота.`,
    when: (g, p, c) => c.pop >= 4,
    choices: [
      { label: (a) => `Карантин (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; return 'Болезнь остановлена'; } },
      { label: () => 'Положиться на удачу', apply: (g, p, c) => { if (rnd(g) < 0.6) { c.pop--; return `${c.name}: население −1`; } return 'Повезло: болезнь отступила'; } },
    ],
  },
  {
    id: 'veterans', title: 'Старые ветераны', base: 30,
    text: (c, a) => `Ветераны прошлых войн предлагают обучать новобранцев за ${a} золота.`,
    when: (g, p) => g.units.some((u) => u.owner === p.id && UNITS[u.type].cls !== 'civ'),
    choices: [
      { label: (a) => `Нанять наставников (−${a} золота)`, can: (g, p, c, a) => p.gold >= a, apply: (g, p, c, a) => { p.gold -= a; for (const u of g.units) if (u.owner === p.id && UNITS[u.type].cls !== 'civ') addXp(u, 10); return 'Все отряды получили +10 опыта'; } },
      { label: () => 'Не нужно', apply: () => 'Ветераны разошлись по домам' },
    ],
  },
];
const BY_ID: Record<string, EventDef> = {};
for (const e of EVENTS) BY_ID[e.id] = e;
export const eventById = (id: string) => BY_ID[id];

export function maybeTriggerEvent(g: Game, p: Player) {
  if (g.turn < 8 || g.turn - p.lastEvent < 9 || rnd(g) > 0.13) return;
  const cities = playerCities(g, p.id);
  if (!cities.length) return;
  const c = cities[rint(g, cities.length)];
  const pool = EVENTS.filter((e) => e.when(g, p, c));
  if (!pool.length) return;
  const e = pool[rint(g, pool.length)];
  const amt = Math.round(e.base * (1 + p.era * 0.7));
  p.lastEvent = g.turn;
  p.pending.push({ kind: 'event', id: e.id, city: c.id, amt });
}

export function resolveEvent(g: Game, p: Player, ch: Choice, idx: number): string {
  if (ch.kind !== 'event') return '';
  const e = BY_ID[ch.id];
  const c = cityById(g, ch.city);
  if (!e || !c || c.owner !== p.id) return '';
  let opt = e.choices[idx] || e.choices[1];
  if (opt.can && !opt.can(g, p, c, ch.amt)) opt = e.choices[1];
  const res = opt.apply(g, p, c, ch.amt);
  if (p.human && res) notify(g, p.id, `${e.title}: ${res}`, 'info', c.at);
  return res;
}

export function eventCityYieldsTouch(g: Game, c: City) {
  return cityYields(g, c);
}
