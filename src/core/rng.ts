// Детерминированный ГСЧ (mulberry32). Состояние хранится в самом объекте игры,
// поэтому партия полностью воспроизводима по сиду — основа для «Испытания дня»,
// реплеев и серверной проверки ходов в асинхронном мультиплеере.

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Rng {
  rng: number;
  constructor(seed: number) {
    this.rng = seed | 0;
  }
  next(): number {
    return mulberry(this);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Случайное число из состояния игры */
export const rnd = (g: { rng: number }) => mulberry(g);
export const rint = (g: { rng: number }, n: number) => Math.floor(mulberry(g) * n);
export function rpick<T>(g: { rng: number }, arr: T[]): T {
  return arr[rint(g, arr.length)];
}
