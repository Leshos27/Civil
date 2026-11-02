// Точка входа. Поддерживает «горячее» обновление в просмотрщике артефактов:
// при выходе новой версии страницы текущая партия переносится без потерь.
import { app } from './ui/app';

interface Hot { snapshot?: (fn: () => unknown) => void; ready?: (start: (data: unknown) => void) => void; data?: unknown }
const hot: Hot | undefined = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

function start(data: unknown) {
  const d = (data || {}) as { save?: string };
  app.init(d.save || null);
}

try {
  hot?.snapshot?.(() => ({ save: app.g && !app.demo && !app.g.winner ? JSON.stringify(app.g) : null }));
} catch { /* необязательно */ }

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
