// Гексагональная сетка: «pointy-top», смещение нечётных рядов вправо (odd-r).
// Индекс клетки = row * W + col. Направления соседей совпадают с рёбрами гекса:
// 0 — восток, 1 — юго-восток, 2 — юго-запад, 3 — запад, 4 — северо-запад, 5 — северо-восток.

export const SQ3 = Math.sqrt(3);

const EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

const nbCache = new Map<string, number[][]>();

/** Соседи каждой клетки (ровно 6 элементов, -1 — за краем карты) */
export function neighborsOf(W: number, H: number): number[][] {
  const key = W + 'x' + H;
  let nb = nbCache.get(key);
  if (nb) return nb;
  nb = [];
  for (let i = 0; i < W * H; i++) {
    const row = Math.floor(i / W), col = i % W;
    const offs = row & 1 ? ODD : EVEN;
    const list: number[] = [];
    for (const [dc, dr] of offs) {
      const c = col + dc, r = row + dr;
      list.push(c < 0 || c >= W || r < 0 || r >= H ? -1 : r * W + c);
    }
    nb.push(list);
  }
  nbCache.set(key, nb);
  return nb;
}

export function axial(i: number, W: number): { q: number; r: number } {
  const row = Math.floor(i / W), col = i % W;
  return { q: col - ((row - (row & 1)) >> 1), r: row };
}

export function hexDist(a: number, b: number, W: number): number {
  const A = axial(a, W), B = axial(b, W);
  const dq = A.q - B.q, dr = A.r - B.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Все клетки в радиусе rad (включая центр) */
export function inRadius(i: number, rad: number, W: number, H: number): number[] {
  const { q, r } = axial(i, W);
  const out: number[] = [];
  for (let dq = -rad; dq <= rad; dq++) {
    for (let dr = Math.max(-rad, -dq - rad); dr <= Math.min(rad, -dq + rad); dr++) {
      const qq = q + dq, rr = r + dr;
      if (rr < 0 || rr >= H) continue;
      const col = qq + ((rr - (rr & 1)) >> 1);
      if (col < 0 || col >= W) continue;
      out.push(rr * W + col);
    }
  }
  return out;
}

/** Центр клетки в мировых координатах (размер гекса = радиус описанной окружности) */
export function center(i: number, W: number, size: number): { x: number; y: number } {
  const row = Math.floor(i / W), col = i % W;
  return { x: size * SQ3 * (col + 0.5 * (row & 1)) + (size * SQ3) / 2, y: size * 1.5 * row + size };
}

/** Клетка по мировым координатам или -1 */
export function pickTile(x: number, y: number, size: number, W: number, H: number): number {
  const px = x - (size * SQ3) / 2, py = y - size;
  const q = ((SQ3 / 3) * px - py / 3) / size;
  const r = ((2 / 3) * py) / size;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry - (-q - r));
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dz > dy) rz = -rx - ry;
  if (rz < 0 || rz >= H) return -1;
  const col = rx + ((rz - (rz & 1)) >> 1);
  if (col < 0 || col >= W) return -1;
  return rz * W + col;
}

export function mapPixelSize(W: number, H: number, size: number): { w: number; h: number } {
  return { w: size * SQ3 * (W + 0.5), h: size * 1.5 * (H - 1) + size * 2 };
}
