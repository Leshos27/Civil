// Единый ввод: касания (тап, долгий тап, перетаскивание, щипок), мышь (клик, ПКМ, колесо, наведение).

export interface InputHandlers {
  tap(x: number, y: number, mouse: boolean): void;
  order(x: number, y: number): void;           // ПКМ или долгий тап — прямой приказ
  pan(dx: number, dy: number): void;
  zoom(k: number, x: number, y: number): void;
  hover(x: number, y: number): void;
}

export function attachInput(el: HTMLElement, h: InputHandlers) {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number; t: number; mouse: boolean; button: number } | null = null;
  let moved = false;
  let pinchD = 0;
  let mid = { x: 0, y: 0 };
  let longTimer = 0;
  let longFired = false;
  const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, t: performance.now(), mouse: e.pointerType === 'mouse', button: e.button };
      moved = false;
      longFired = false;
      clearTimeout(longTimer);
      if (e.pointerType !== 'mouse') {
        longTimer = window.setTimeout(() => {
          if (!moved && start && pts.size === 1) { longFired = true; h.order(start.x, start.y); navigator.vibrate?.(15); }
        }, 480);
      }
    } else if (pts.size === 2) {
      moved = true;
      clearTimeout(longTimer);
      const [a, b] = [...pts.values()];
      pinchD = d(a, b);
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) {
      if (e.pointerType === 'mouse') h.hover(e.clientX, e.clientY);
      return;
    }
    const prev = pts.get(e.pointerId)!;
    const cur = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, cur);
    if (pts.size === 1) {
      if (!moved && start && d(start, cur) > 8) { moved = true; clearTimeout(longTimer); }
      if (moved) h.pan(cur.x - prev.x, cur.y - prev.y);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const nd = d(a, b);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchD > 0) h.zoom(nd / pinchD, m.x, m.y);
      h.pan(m.x - mid.x, m.y - mid.y);
      pinchD = nd;
      mid = m;
    }
  });

  const up = (e: PointerEvent) => {
    clearTimeout(longTimer);
    if (pts.size === 1 && start && !moved && !longFired && e.type === 'pointerup' && performance.now() - start.t < 700) {
      if (start.mouse && start.button === 2) h.order(e.clientX, e.clientY);
      else h.tap(e.clientX, e.clientY, start.mouse);
    }
    pts.delete(e.pointerId);
    if (pts.size === 0) start = null;
    else if (pts.size === 1) { moved = true; pinchD = 0; }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') h.hover(-1, -1); });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    h.zoom(k, e.clientX, e.clientY);
  }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
