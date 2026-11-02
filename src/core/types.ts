// Состояние партии — только простые JSON-совместимые структуры,
// чтобы сохранение/загрузка/синхронизация были тривиальными.

export type Focus = 'bal' | 'food' | 'prod' | 'gold';
export type Speed = 'blitz' | 'quick' | 'standard';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'deity';
export type MapSize = 'small' | 'standard' | 'large';

export interface Tile {
  t: string;            // базовый рельеф
  f: string | null;     // покров: лес / джунгли
  r: string | null;     // ресурс
  owner: number;        // игрок-владелец (-1 — ничья)
  city: number;         // id города, которому принадлежит клетка (-1)
  dev: number;          // прогресс освоения
  imp: string | null;   // готовое улучшение
}

export interface Unit {
  id: number;
  owner: number;
  type: string;
  at: number;
  hp: number;
  mv: number;           // оставшиеся очки хода
  xp: number;
  lvl: number;
  fort: number;         // 1 — укреплён
  sleep: boolean;
  acted: boolean;       // действовал в этом ходу (не лечится)
  path: number[] | null;// приказ на многоходовое движение
  target?: number;      // цель ИИ
  role?: string;        // роль ИИ: garrison / army / explore
}

export interface BuildItem {
  kind: 'unit' | 'bld';
  id: string;
}

export interface City {
  id: number;
  owner: number;
  name: string;
  at: number;
  pop: number;
  food: number;
  prod: number;
  queue: BuildItem[];
  blds: string[];
  hp: number;
  focus: Focus;
  cult: number;
  claims: number;
  worked: number[];
  capital: boolean;
  origCap: number;      // чьей изначальной столицей был (-1)
  founded: number;
  hit: number;          // ход, когда город последний раз атаковали
  founder: number;
}

export interface Relation {
  met: boolean;
  war: boolean;
  since: number;        // ход начала текущего состояния
  grudge: number;       // обида (напр. за объявление войны)
  offered: number;      // ход последнего предложения мира
}

export interface Personality {
  aggr: number;
  exp: number;
  sci: number;
}

export type Choice =
  | { kind: 'charter'; options: string[]; era: number }
  | { kind: 'event'; id: string; city: number; amt: number }
  | { kind: 'peace'; from: number };

export interface Player {
  id: number;
  nation: string;
  name: string;
  color: string;
  human: boolean;
  alive: boolean;
  gold: number;
  techs: string[];
  cur: string | null;   // текущее исследование
  rq: string[];         // очередь исследований
  prog: Record<string, number>;
  bank: number;         // наука, накопленная без цели
  charters: string[];
  era: number;
  explored: number[];   // 0/1 по клеткам
  rel: Relation[];
  pers: Personality;
  pending: Choice[];
  lastEvent: number;
  kills: number;
  losses: number;
  noSites?: boolean;
}

export interface Settings {
  size: MapSize;
  players: number;
  difficulty: Difficulty;
  speed: Speed;
  seed: number;
  nation: string;
  daily: boolean;
  turnLimit: number;
}

export type NoteKind = 'info' | 'good' | 'bad' | 'war' | 'tech' | 'city';

export interface Note {
  pid: number;
  text: string;
  kind: NoteKind;
  at?: number;
}

export interface Fx {
  at: number;
  text: string;
  color: string;
}

export interface Winner {
  pid: number;
  type: 'domination' | 'science' | 'score';
}

export interface Game {
  v: number;
  seed: number;
  rng: number;
  turn: number;
  W: number;
  H: number;
  tiles: Tile[];
  units: Unit[];
  cities: City[];
  players: Player[];
  nextId: number;
  settings: Settings;
  wonders: Record<string, number>; // id чуда -> id города
  winner: Winner | null;
  notes: Note[];
  fx: Fx[];
}
