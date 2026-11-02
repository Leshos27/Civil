// Единый набор векторных иконок 24×24: используется и в DOM (SVG), и на карте (Canvas Path2D).
// s — контур (stroke), f — заливка (fill).

export const ICONS: Record<string, { s?: string; f?: string }> = {
  // юниты
  flag: { s: 'M6 21V3', f: 'M7 4h11l-3 4 3 4H7z' },
  eye: { s: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', f: 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z' },
  club: { s: 'M4.5 19.5L15 9', f: 'M11.5 6L15.5 2c2.6.9 5.1 3.4 6.5 6.5L18 12.5c-1.2-2.6-3.7-5.3-6.5-6.5z' },
  bow: { s: 'M7 3c7 3 7 15 0 18M7 3v18M3 12h16M16 9l3 3-3 3' },
  spear: { s: 'M4 20L16 8', f: 'M14 6l7-3-3 7z' },
  horseshoe: { s: 'M6.5 4v7.5a5.5 5.5 0 0 0 11 0V4M5 4h3M16 4h3', f: 'M8 9h1.5v1.5H8zM14.5 9H16v1.5h-1.5z' },
  sword: { s: 'M20 4L9 15M6 12l6 6M7.5 16.5L4 20', f: 'M20 4l-1 4-2-2z' },
  catapult: { s: 'M4 19h16M7 19l5-8 5 8M12 11l-6-6M6 5l-2 2', f: 'M18 4a2 2 0 1 1 0 4a2 2 0 1 1 0-4z' },
  pike: { s: 'M12 22V7M8 10h8', f: 'M12 1l3.5 6h-7z' },
  helmet: { f: 'M5 21V11a7 7 0 0 1 14 0v10h-5v-5h-4v5z', s: 'M12 4v-2' },
  crossbow: { s: 'M3 9c5-5 13-5 18 0M3 9l9 4 9-4M12 5v16' },
  rifle: { s: 'M3 18L19 6M19 6l3-2M8 14l2 3', f: 'M2 17l3-1 1 3-3 1z' },
  cannon: { f: 'M3 9.5l13-4.5 1.5 4.5-13 4.5z', s: 'M13 16a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0z' },
  helmet2: { f: 'M3 15a9 8 0 0 1 18 0z', s: 'M1.5 15h21M7 19h10' },
  tank: { f: 'M3 13h18l-2 6H5zM8 13V9h7v4z', s: 'M15 10.5h7' },
  // ресурсы и доходы
  wheat: { s: 'M12 22V8', f: 'M12 8c-2.5-1-2.5-5 0-6.5 2.5 1.5 2.5 5.5 0 6.5zM12 13c-3 0-5-2-5-4.5 3 0 5 2 5 4.5zM12 13c3 0 5-2 5-4.5-3 0-5 2-5 4.5zM12 18c-3 0-5-2-5-4.5 3 0 5 2 5 4.5zM12 18c3 0 5-2 5-4.5-3 0-5 2-5 4.5z' },
  hammer: { s: 'M14 10L4 20', f: 'M11.5 6.5l3.5-3.5 6 6-3.5 3.5z' },
  coin: { f: 'M12 2.5a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19z', s: 'M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4' },
  flask: { s: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3', f: 'M7.3 15h9.4l1.8 3.3a1 1 0 0 1-.9 1.5H6.4a1 1 0 0 1-.9-1.5z' },
  star: { f: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z' },
  shield: { f: 'M12 2.5l8 3v6c0 5.2-3.4 8.6-8 10-4.6-1.4-8-4.8-8-10v-6z' },
  pop: { f: 'M12 3a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z' },
  heart: { f: 'M12 21s-8.5-5.2-8.5-11.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8.5 2.8C20.5 15.8 12 21 12 21z' },
  boot: { s: 'M5 12h14M13 6l6 6-6 6' },
  cattle: { s: 'M4 5c0 3 2 4.5 4.5 4.5M20 5c0 3-2 4.5-4.5 4.5', f: 'M8 8.5h8v6.5a4 4 0 0 1-8 0z' },
  fish: { f: 'M2 12c3.5-5 10-6.5 15-2l4-3v10l-4-3c-5 4.5-11.5 3-15-2z' },
  deer: { s: 'M8 21v-7M16 21v-7M8 14c-3 0-5-3-5-7M5 9.5L3 8M8 14c0-4 1-7 3-9M16 14c3 0 5-3 5-7M19 9.5l2-1.5M16 14c0-4-1-7-3-9' },
  stone: { f: 'M3 18l3-9 6-4 7 5-1.5 8z' },
  ingot: { f: 'M2.5 17l3.5-8h12l3.5 8z' },
  gem: { f: 'M6 4h12l4 5-10 12L2 9z' },
  leaf: { f: 'M4 20C4 10 10 4 20 4c0 9-6 16-16 16z', s: 'M4 20L13 11' },
  paw: { f: 'M12 12c3 0 6 3 6 6 0 2-2 3-6 3s-6-1-6-3c0-3 3-6 6-6zM5 7a2 2.5 0 1 1 0 5a2 2.5 0 1 1 0-5zM19 7a2 2.5 0 1 1 0 5a2 2.5 0 1 1 0-5zM9 2.5a2 2.5 0 1 1 0 5a2 2.5 0 1 1 0-5zM15 2.5a2 2.5 0 1 1 0 5a2 2.5 0 1 1 0-5z' },
  drop: { f: 'M12 2.5c4 6 6.5 9.5 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3 2.5-6.5 6.5-12.5z' },
  // улучшения
  farm: { s: 'M3 19h18M5 17l5-10M10 17l5-10M15 17l5-10' },
  pick: { s: 'M5 20L15 10', f: 'M5 7c5-4 11-4 15 0-1 1-2 1-3 0-3-2-7-2-9 0-1 1-2 1-3 0z' },
  fence: { s: 'M5 7v13M12 7v13M19 7v13M3 11h18M3 16h18' },
  log: { f: 'M6 8h12a4 4 0 0 1 0 8H6z', s: 'M6 8a4 4 0 0 0 0 8a4 4 0 0 0 0-8z' },
  boat: { f: 'M3 15h18l-3.5 5h-11z', s: 'M12 15V3', },
  // интерфейс
  menu: { s: 'M4 6h16M4 12h16M4 18h16' },
  globe: { s: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM3 12h18M12 3c3.5 3.5 3.5 14.5 0 18M12 3c-3.5 3.5-3.5 14.5 0 18' },
  house: { s: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5' },
  zz: { s: 'M5 6h6l-6 7h6M14 12h5l-5 6h5' },
  skip: { s: 'M5 5l7 7-7 7M13 5l7 7-7 7' },
  target: { s: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM12 1v5M12 18v5M1 12h5M18 12h5', f: 'M12 10a2 2 0 1 1 0 4a2 2 0 1 1 0-4z' },
  hourglass: { s: 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9' },
  close: { s: 'M6 6l12 12M18 6L6 18' },
  castle: { f: 'M3 21V9h3V6h3v3h2V6h2v3h2V6h3v3h3v12h-7v-5h-4v5z' },
  wonder: { s: 'M3 21h18M5 21V11M9.5 21V11M14.5 21V11M19 21V11', f: 'M2 10h20L12 3z' },
  rocket: { f: 'M12 2c3 3 4.5 7 4.5 11L12 17.5 7.5 13C7.5 9 9 5 12 2z', s: 'M7.5 13L4.5 16v3l3.5-2M16.5 13l3 3v3l-3.5-2M10 21l2-3 2 3' },
  anchor: { s: 'M12 7v14M8 10.5h8M4.5 14a7.5 7.5 0 0 0 15 0M12 3a2 2 0 1 1 0 4a2 2 0 1 1 0-4z' },
  bolt: { f: 'M13 2L4 14h7l-2 8 9-12h-7z' },
  swords: { s: 'M4 4l12 12M20 4L8 16M14 18l4-4M6 14l4 4M17 17l3 3M7 17l-3 3' },
  dove: { f: 'M3 14c4 0 6-3 7-6 1-3 3-5 6-5 2 0 3 1 4 2l2 .5-2 1.5c0 5-3 11-11 11-3 0-5-1-6-4z' },
  crown: { f: 'M3 18L2 7l5 4 5-7 5 7 5-4-1 11z', s: 'M3 21h18' },
  gear: { s: 'M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' },
  cart: { s: 'M3 4h3l2.5 11h10L21 7H7.5M10 20a1 1 0 1 1 0-.1M17 20a1 1 0 1 1 0-.1' },
  book: { s: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z' },
  play: { f: 'M7 4l13 8-13 8z' },
  calendar: { s: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5' },
  save: { s: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7' },
  lock: { s: 'M7 11V8a5 5 0 0 1 10 0v3', f: 'M5 11h14v10H5z' },
  check: { s: 'M4 12l5 5L20 6' },
  plus: { s: 'M12 5v14M5 12h14' },
  minus: { s: 'M5 12h14' },
  up: { s: 'M12 19V5M6 11l6-6 6 6' },
  trash: { s: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14' },
};

export function svg(name: string, cls = ''): string {
  const ic = ICONS[name];
  if (!ic) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ic.f ? `<path d="${ic.f}" fill="currentColor"/>` : ''}${ic.s ? `<path d="${ic.s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg>`;
}

const cache = new Map<string, { s?: Path2D; f?: Path2D }>();
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, color: string, lw = 2) {
  let p = cache.get(name);
  if (!p) {
    const ic = ICONS[name] || {};
    p = { s: ic.s ? new Path2D(ic.s) : undefined, f: ic.f ? new Path2D(ic.f) : undefined };
    cache.set(name, p);
  }
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  const k = size / 24;
  ctx.scale(k, k);
  if (p.f) { ctx.fillStyle = color; ctx.fill(p.f); }
  if (p.s) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(p.s);
  }
  ctx.restore();
}
