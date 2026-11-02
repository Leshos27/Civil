// Создание новой партии.
import { NATIONS, NATION_IDS, TERRAIN } from './data';
import { generateMap } from './mapgen';
import { Rng, hashStr } from './rng';
import { DIFF, MAPS, SPEED_INFO, nbOf } from './rules';
import type { Game, Player, Settings } from './types';
import { addUnit, refreshVisibility } from './world';

export function defaultSettings(): Settings {
  return { size: 'small', players: 4, difficulty: 'normal', speed: 'quick', seed: (Date.now() % 1e9) | 0, nation: 'rus', daily: false, turnLimit: SPEED_INFO.quick.limit };
}

/** «Испытание дня»: одинаковые условия для всех игроков мира в этот день */
export function dailySettings(date = new Date()): Settings {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  const seed = hashStr('epochs-daily-' + key) | 0;
  const rng = new Rng(seed);
  return { size: 'small', players: 4, difficulty: 'normal', speed: 'blitz', seed, nation: rng.pick(NATION_IDS), daily: true, turnLimit: 60 };
}

export function createGame(s: Settings): Game {
  const M = MAPS[s.size];
  const nPlayers = Math.min(s.players, M.max);
  const map = generateMap(M.W, M.H, s.seed, nPlayers);
  const g: Game = {
    v: 1, seed: s.seed, rng: (s.seed ^ 0x9e3779b9) | 0, turn: 1, W: M.W, H: M.H, tiles: map.tiles, units: [], cities: [],
    players: [], nextId: 1, settings: { ...s, players: nPlayers }, wonders: {}, winner: null, notes: [], fx: [],
  };
  const rng = new Rng(s.seed + 17);
  const others = rng.shuffle(NATION_IDS.filter((n) => n !== s.nation));
  for (let k = 0; k < nPlayers; k++) {
    const nation = k === 0 ? s.nation : others[k - 1];
    const N = NATIONS[nation];
    const flavor = { mongols: [0.25, 0, 0], aztec: [0.2, 0, 0], norse: [0.2, 0, 0], china: [-0.1, 0, 0.25], greece: [-0.05, 0, 0.2], rus: [0, 0.2, 0], egypt: [0, 0.1, 0.1], rome: [0.1, 0.1, 0] }[nation] || [0, 0, 0];
    const p: Player = {
      id: k, nation, name: N.name, color: N.color, human: k === 0, alive: true, gold: 10, techs: ['agriculture'],
      cur: null, rq: [], prog: {}, bank: 0, charters: [], era: 0, explored: new Array(M.W * M.H).fill(0), rel: [],
      pers: { aggr: clamp(rng.range(0.15, 0.75) + flavor[0]), exp: clamp(rng.range(0.3, 0.9) + flavor[1]), sci: clamp(rng.range(0.2, 0.8) + flavor[2]) },
      pending: [], lastEvent: 0, kills: 0, losses: 0,
    };
    g.players.push(p);
  }
  for (const p of g.players) for (const q of g.players) p.rel[q.id] = { met: p.id === q.id, war: false, since: 1, grudge: 0, offered: -99 };

  const NB = nbOf(g);
  g.players.forEach((p, k) => {
    const at = map.starts[k];
    addUnit(g, p.id, 'settler', at);
    addUnit(g, p.id, 'warrior', at);
    const free = NB[at].filter((n) => n >= 0 && TERRAIN[g.tiles[n].t].pass);
    if (free[0] !== undefined) addUnit(g, p.id, 'scout', free[0]);
    if (!p.human) {
      const extra = DIFF[s.difficulty].extra;
      for (let e = 0; e < extra; e++) if (free[1 + e] !== undefined) addUnit(g, p.id, 'warrior', free[1 + e]);
      if (s.difficulty === 'deity' && free[3] !== undefined) addUnit(g, p.id, 'settler', free[3]);
    }
  });
  for (const p of g.players) refreshVisibility(g, p.id);
  g.notes = [];
  return g;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
